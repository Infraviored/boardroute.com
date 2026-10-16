import React, { useState, useEffect, useRef } from 'react';
import { Camera, Minus, Plus, FlipHorizontal2, Loader2, Ruler, Rows3, ClipboardPaste, Link2, ImageUp, Undo2, ScanText, Crop, RotateCcw, RotateCw, ArrowRight, Sparkles } from 'lucide-react';
import { readLabels } from './ocr-labels.js';

const MAX_SIDE = 2400; // photos are scaled down to this (enough for pins and printed labels)

// Footprint from a photo, in two steps, both done by the user (automatic cut-outs and pin
// detection failed too often on real photos: a part lying on perfboard, a wooden table, ...):
//   1. Frame: the whole photo with a frame the user moves, resizes and turns onto the part's
//      outline. "Next" turns the photo so the frame is upright.
//   2. Pins: scale from two pins of a row and their count (or the part's width in mm), then
//      click pins; "find similar" looks for more holes that look like the pins marked so far.
//      The outline, the part's picture (photo cut to the frame) and OCR of the pin names
//      work on that grid.
// Grid: hole (c, r) sits at origin + pitch·R(angle)·(c, r) in the turned photo.
const holeAt = (g, c, r) => {
    const cs = Math.cos(g.angle || 0), sn = Math.sin(g.angle || 0);
    return [g.phaseX + g.pitch * (c * cs - r * sn), g.phaseY + g.pitch * (c * sn + r * cs)];
};
// grid coordinates of an image point (not rounded) and the nearest hole
const gridOf = (g, x, y) => {
    const cs = Math.cos(g.angle || 0), sn = Math.sin(g.angle || 0), dx = (x - g.phaseX) / g.pitch, dy = (y - g.phaseY) / g.pitch;
    return [dx * cs + dy * sn, -dx * sn + dy * cs];
};
const holeOf = (g, x, y) => gridOf(g, x, y).map(Math.round);
// a point in the frame's own coordinates (origin at its centre, x along its width) and back
const toFrame = (f, x, y) => { const cs = Math.cos(f.a), sn = Math.sin(f.a), dx = x - f.cx, dy = y - f.cy; return [dx * cs + dy * sn, -dx * sn + dy * cs]; };
const fromFrame = (f, u, v) => { const cs = Math.cos(f.a), sn = Math.sin(f.a); return [f.cx + u * cs - v * sn, f.cy + u * sn + v * cs]; };
const startFrame = (W, H) => ({ cx: W / 2, cy: H / 2, w: W * 0.6, h: H * 0.6, a: 0 });

export function PhotoFootprintOverlay({ file = null, onCancel, onApply, hidden = false }) {
    const [src, setSrc] = useState(file); // the photo (Blob); null = ask for one
    // pick | loading | crop (frame the part on the whole photo) | ready (turned photo, pins) | error
    const [state, setState] = useState({ status: file ? 'loading' : 'pick' });
    const [frame, setFrame] = useState(null);   // { cx, cy, w, h, a } on the whole photo (px, radians)
    const [grid, setGrid] = useState(null);     // { pitch, phaseX, phaseY, angle }; null = no scale yet
    const [pins, setPins] = useState([]);       // [[col, row]]
    const [mirror, setMirror] = useState(false);
    const [box, setBox] = useState(null);       // outline changed by hand: { x0, y0, x1, y1 } in holes; null = the frame
    const [keepPhoto, setKeepPhoto] = useState(true); // the cut-out photo becomes the part's picture
    const [labels, setLabels] = useState({});   // pin names read by OCR: { "col,row": text }
    const [ocr, setOcr] = useState(null);       // null | { done, total } while reading | { read, of, error? } after
    const [textDir, setTextDir] = useState('auto'); // reading direction: 'auto' | 0 | 1 | 3 quarter turns
    const [mm, setMm] = useState('');           // the part's width in mm (scale for parts without a pin row)
    const [found, setFound] = useState(null);   // result note of "find similar"
    const [drag, setDrag] = useState(null);
    // null | { kind: 'scale' | 'row' | 'ocr', a?, b?, n? }: 'scale' sets the grid from two pins and a
    // count, 'row' adds the pins between two clicked holes, 'ocr' is the box over a row of labels
    const [measure, setMeasure] = useState(null);
    const [url, setUrl] = useState('');
    const [over, setOver] = useState(false);    // a file dragged over the dialog
    const [hist, setHist] = useState([]);       // undo: earlier { grid, pins, box, labels }
    const snap = () => setHist(h => [...h.slice(-49), { grid, pins, box, labels }]);
    const undo = () => setHist(h => {
        if (!h.length) return h;
        const last = h[h.length - 1];
        setGrid(last.grid); setPins(last.pins); setBox(last.box); setLabels(last.labels || {}); setMeasure(null);
        return h.slice(0, -1);
    });
    const svgRef = useRef(null);
    const photoRef = useRef(null);   // the whole photo (canvas)
    const pixRef = useRef(null);     // the turned photo's pixels (ImageData) for pin search and counting

    const load = (blob) => {
        if (!blob || !/^image\//.test(blob.type || 'image/')) return;
        setMeasure(null); setMirror(false); setHist([]); setBox(null); setLabels({}); setOcr(null); setGrid(null); setPins([]); setFound(null);
        setState({ status: 'loading' }); setSrc(blob);
    };

    // paste an image anywhere while the dialog is open
    useEffect(() => {
        if (hidden) return;
        const onPaste = (e) => {
            const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
            if (item) { e.preventDefault(); load(item.getAsFile()); }
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, [hidden]);

    const pasteButton = async () => {
        try {
            for (const item of await navigator.clipboard.read()) {
                const type = item.types.find(t => t.startsWith('image/'));
                if (type) return load(await item.getType(type));
            }
            setState({ status: 'pick', reason: 'No image in the clipboard. Copy an image first (right-click → Copy image).' });
        } catch {
            setState({ status: 'pick', reason: 'The browser blocked reading the clipboard. Press Ctrl+V (⌘V) instead.' });
        }
    };

    const loadUrl = async () => {
        const u = url.trim();
        if (!u) return;
        setState({ status: 'loading' });
        try {
            const r = await fetch(u, { mode: 'cors' });
            const blob = await r.blob();
            if (!r.ok || !blob.type.startsWith('image/')) throw new Error();
            load(blob);
        } catch {
            setState({ status: 'pick', reason: 'That site does not let other pages load its images. Open the image, right-click → Copy image, and paste it here with Ctrl+V.' });
        }
    };

    // the photo: scaled down, shown whole with a frame to put on the part
    useEffect(() => {
        if (!src) return;
        let alive = true;
        (async () => {
            try {
                const bmp = await createImageBitmap(src);
                const f = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(bmp.width * f); canvas.height = Math.round(bmp.height * f);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
                if (!alive) return;
                photoRef.current = canvas;
                const W = canvas.width, H = canvas.height;
                setFrame(startFrame(W, H));
                setCropView(null);
                setState({ status: 'crop', photo: canvas.toDataURL('image/jpeg', 0.9), PW: W, PH: H, bg: borderColour(ctx.getImageData(0, 0, W, H)) });
            } catch (err) {
                if (alive) setState({ status: 'error', reason: 'Could not read this image (' + (err?.message || err) + ')' });
            }
        })();
        return () => { alive = false; };
    }, [src]);

    // Step 1 -> 2: the whole photo turned so the frame is upright (the surroundings stay visible:
    // a perfboard or ruler next to the part can still serve as the scale). Same frame as last
    // time: grid and pins are kept.
    const next = () => {
        const canvas = photoRef.current;
        if (!canvas || !frame) return;
        const W = canvas.width, H = canvas.height;
        const corners = [[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => toFrame(frame, x, y));
        const u0 = Math.min(...corners.map(p => p[0])), v0 = Math.min(...corners.map(p => p[1]));
        const OW = Math.ceil(Math.max(...corners.map(p => p[0])) - u0), OH = Math.ceil(Math.max(...corners.map(p => p[1])) - v0);
        const out = document.createElement('canvas');
        out.width = OW; out.height = OH;
        const ctx = out.getContext('2d');
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, OW, OH);
        ctx.translate(-u0, -v0);
        ctx.rotate(-frame.a);
        ctx.translate(-frame.cx, -frame.cy);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(canvas, 0, 0);
        pixRef.current = out.getContext('2d').getImageData(0, 0, OW, OH);
        const framePx = { x0: -frame.w / 2 - u0, y0: -frame.h / 2 - v0, x1: frame.w / 2 - u0, y1: frame.h / 2 - v0 };
        const same = state.usedFrame && JSON.stringify(state.usedFrame) === JSON.stringify(frame);
        if (!same) { setGrid(null); setPins([]); setBox(null); setLabels({}); setHist([]); setFound(null); setMeasure({ kind: 'scale' }); }
        setState(s => ({ ...s, status: 'ready', usedFrame: frame, url: out.toDataURL('image/jpeg', 0.92), W: OW, H: OH, framePx }));
    };
    const backToFrame = () => { setMeasure(null); setDrag(null); setState(s => ({ ...s, status: 'crop' })); };

    useEffect(() => {
        if (hidden) return;
        const onKey = (e) => {
            if (e.key === 'Escape') { e.stopPropagation(); if (measure) setMeasure(null); else onCancel(); }
            else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); e.stopPropagation(); undo(); }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    });

    const toImage = (e) => {
        const ctm = svgRef.current?.getScreenCTM();
        if (!ctm) return null;
        return new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    };

    // --- step 1: the frame ---------------------------------------------------------------------
    const cropping = state.status === 'crop' && frame;
    // The view follows the frame: after every change it glides so the frame fills about 60 % of
    // it (zooms in on a small part, out when the frame is dragged larger), so the frame can be
    // placed precisely and its handles never pile up, also with fingers on a phone.
    const [cropView, setCropView] = useState(null); // [x, y, w, h] in photo px
    const [svgSize, setSvgSize] = useState({ w: 1, h: 1 });
    const viewAnim = useRef(null);
    useEffect(() => {
        const svg = svgRef.current;
        if (state.status !== 'crop' || !svg) return;
        const measure = () => { const r = svg.getBoundingClientRect(); setSvgSize({ w: r.width || 1, h: r.height || 1 }); };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(svg);
        return () => ro.disconnect();
    }, [state.status, state.photo]);
    const fitView = (f) => {
        const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => fromFrame(f, u * f.w / 2, v * f.h / 2));
        cs.push(fromFrame(f, 0, -f.h / 2 - 0.3 * Math.max(f.w, f.h))); // room for the turn handle
        const x0 = Math.min(...cs.map(c => c[0])), x1 = Math.max(...cs.map(c => c[0]));
        const y0 = Math.min(...cs.map(c => c[1])), y1 = Math.max(...cs.map(c => c[1]));
        const aspect = svgSize.w / svgSize.h, big = Math.max(state.PW, state.PH) * 1.3;
        let w = Math.max((x1 - x0) / 0.6, 80), h = Math.max((y1 - y0) / 0.6, 80);
        if (w / h < aspect) w = h * aspect; else h = w / aspect;
        if (w > big * aspect && h > big) { const k = Math.max(big / h, big * aspect / w); w *= k; h *= k; }
        return [(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2, w, h];
    };
    const glideTo = (target) => {
        cancelAnimationFrame(viewAnim.current);
        const from = cropView || target, t0 = performance.now();
        const step = (t) => {
            const k = Math.min(1, (t - t0) / 260), e = 1 - (1 - k) ** 3;
            setCropView(from.map((v, i) => v + (target[i] - v) * e));
            if (k < 1) viewAnim.current = requestAnimationFrame(step);
        };
        viewAnim.current = requestAnimationFrame(step);
    };
    useEffect(() => () => cancelAnimationFrame(viewAnim.current), []);
    const view1 = cropView || (cropping ? [0, 0, state.PW, state.PH] : null);
    const zoom = view1 ? Math.min(svgSize.w / view1[2], svgSize.h / view1[3]) : 1; // screen px per photo px
    const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    const hs = cropping ? (touch ? 26 : 14) / zoom : 0; // handle size in photo px
    const onFrameDown = (e) => {
        const p = toImage(e);
        if (!p) return;
        cancelAnimationFrame(viewAnim.current);
        e.currentTarget.setPointerCapture?.(e.pointerId);
        const h = e.target.getAttribute?.('data-h');
        setDrag({ h: h || 'move', x: p.x, y: p.y, f: frame });
    };
    const onFrameMove = (e) => {
        if (!drag) return;
        const p = toImage(e);
        if (!p) return;
        const f = drag.f;
        if (drag.h === 'move') { setFrame({ ...f, cx: f.cx + p.x - drag.x, cy: f.cy + p.y - drag.y }); return; }
        if (drag.h === 'rot') {
            let a = Math.atan2(p.y - f.cy, p.x - f.cx) + Math.PI / 2;
            const q = Math.round(a / (Math.PI / 2)) * Math.PI / 2;
            if (Math.abs(a - q) < 0.025) a = q; // snaps to straight
            setFrame({ ...f, a });
            return;
        }
        // an edge or a corner: the opposite side stays where it is
        const sx = drag.h.includes('r') ? 1 : drag.h.includes('l') ? -1 : 0;
        const sy = drag.h.includes('b') ? 1 : drag.h.includes('t') ? -1 : 0;
        const [u, v] = toFrame(f, p.x, p.y), min = hs * 2;
        let w = f.w, h = f.h, cu = 0, cv = 0;
        if (sx) { const fixed = -sx * f.w / 2; w = Math.max(min, sx * (u - fixed)); cu = fixed + sx * w / 2; }
        if (sy) { const fixed = -sy * f.h / 2; h = Math.max(min, sy * (v - fixed)); cv = fixed + sy * h / 2; }
        const [cx, cy] = fromFrame(f, cu, cv);
        setFrame({ ...f, cx, cy, w, h });
    };
    const onFrameUp = () => { if (drag) glideTo(fitView(frame)); setDrag(null); };
    const changeFrame = (f) => { setFrame(f); glideTo(fitView(f)); };
    const turnFrame = (q) => changeFrame({ ...frame, a: frame.a + q * Math.PI / 2 });
    const deg = frame ? Math.round(((frame.a * 180 / Math.PI) % 360 + 540) % 360 - 180) : 0;

    // --- step 2: scale and pins ----------------------------------------------------------------
    const onPointerDown = (e) => {
        const p = toImage(e);
        if (!p) return;
        if (measure?.kind === 'ocr') {
            // drawing the box over a row of labels
            e.currentTarget.setPointerCapture?.(e.pointerId);
            setMeasure({ kind: 'ocr', a: [p.x, p.y], b: [p.x, p.y] });
            setDrag({ ocr: true });
            return;
        }
        const edge = e.target.getAttribute?.('data-edge');
        if (edge && grid) {
            // a handle of the outline: drag that edge
            e.currentTarget.setPointerCapture?.(e.pointerId);
            snap();
            setBox({ x0: body.x, y0: body.y, x1: body.x + body.w - 1, y1: body.y + body.h - 1 });
            setDrag({ edge });
            return;
        }
        e.currentTarget.setPointerCapture?.(e.pointerId);
        setDrag({ x: p.x, y: p.y, sx: e.clientX, sy: e.clientY, g: grid, moved: false });
    };
    const onPointerMove = (e) => {
        if (!drag) return;
        if (drag.ocr) {
            const p = toImage(e);
            if (p) setMeasure(m => ({ ...m, b: [p.x, p.y] }));
            return;
        }
        if (drag.edge) {
            const p = toImage(e);
            if (!p) return;
            const [u, v] = gridOf(grid, p.x, p.y);
            // edges sit between holes; the outline never gets smaller than the pins
            const pc = pins.map(q => q[0]), pr = pins.map(q => q[1]);
            setBox(b => {
                const n = { ...b };
                if (drag.edge === 'l') n.x0 = Math.min(Math.round(u + 0.5), pc.length ? Math.min(...pc) : b.x1);
                if (drag.edge === 'r') n.x1 = Math.max(Math.round(u - 0.5), pc.length ? Math.max(...pc) : b.x0);
                if (drag.edge === 't') n.y0 = Math.min(Math.round(v + 0.5), pr.length ? Math.min(...pr) : b.y1);
                if (drag.edge === 'b') n.y1 = Math.max(Math.round(v - 0.5), pr.length ? Math.max(...pr) : b.y0);
                return n.x0 <= n.x1 && n.y0 <= n.y1 ? n : b;
            });
            return;
        }
        if (!grid || measure) return; // the grid can only be moved once there is one
        const moved = drag.moved || Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4;
        if (!moved) return;
        const p = toImage(e);
        if (!p) return;
        if (!drag.moved) snap();
        setDrag({ ...drag, moved: true });
        setGrid({ ...drag.g, phaseX: drag.g.phaseX + p.x - drag.x, phaseY: drag.g.phaseY + p.y - drag.y });
    };
    const onPointerUp = (e) => {
        if (!drag) return;
        if (drag.edge) { setDrag(null); return; }
        if (drag.ocr) { setDrag(null); runOcr(measure.a, measure.b); return; }
        if (!drag.moved) {
            const p = toImage(e);
            if (p && measure && !measure.b) {
                if (!measure.a) setMeasure({ ...measure, a: [p.x, p.y] });
                else if (measure.kind === 'row') { snap(); addRow(measure.a, [p.x, p.y]); setMeasure(null); }
                else {
                    snap();
                    const b = [p.x, p.y];
                    const n = guessCount(pixRef.current, measure.a, b);
                    setMeasure({ ...measure, b, n });
                    applyMeasure(measure.a, b, n, true);
                }
            } else if (p && !measure && grid) {
                const [c, r] = holeOf(grid, p.x, p.y);
                snap();
                setPins(prev => prev.some(([a, b]) => a === c && b === r) ? prev.filter(([a, b]) => a !== c || b !== r) : [...prev, [c, r]]);
            }
        }
        setDrag(null);
    };

    // Another row on the current grid: both clicks snap to holes, every hole on the straight
    // line between them becomes a pin.
    const addRow = (a, b) => {
        const [c0, r0] = holeOf(grid, ...a), [c1, r1] = holeOf(grid, ...b);
        const n = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0));
        const add = [];
        for (let i = 0; i <= n; i++) add.push([Math.round(c0 + (c1 - c0) * i / (n || 1)), Math.round(r0 + (r1 - r0) * i / (n || 1))]);
        setPins(prev => {
            const have = new Set(prev.map(q => q.join()));
            return [...prev, ...add.filter(q => !have.has(q.join()))];
        });
    };

    const setCount = (n) => { n = Math.max(2, Math.min(80, n)); setMeasure(m => ({ ...m, n, text: null })); applyMeasure(measure.a, measure.b, n, true); };
    // typing: keep the text as typed ("1" on the way to "14") and apply once it is a valid count
    const typeCount = (text) => {
        setMeasure(m => ({ ...m, text }));
        const n = parseInt(text, 10);
        if (n >= 2 && n <= 80) { setMeasure(m => ({ ...m, n, text })); applyMeasure(measure.a, measure.b, n, true); }
    };

    // the part's width in mm: scale for parts whose pins are not 2.54 mm apart (modules with
    // pads at the corners); the grid starts at the frame's corner
    const applyMm = () => {
        const v = parseFloat(String(mm).replace(',', '.'));
        if (!(v > 1 && v < 500)) return;
        snap();
        const fp = state.framePx, pitch = (fp.x1 - fp.x0) / (v / 2.54);
        setGrid({ angle: 0, pitch, phaseX: fp.x0 + pitch / 2, phaseY: fp.y0 + pitch / 2 });
        setPins([]); setBox(null); setLabels({}); setMeasure(null); setFound(null);
    };

    // OCR: the drawn box, cut into one cell per pin of the row next to it (the row runs along
    // the box's long side; for each column the pin nearest to the box gets the label)
    async function runOcr(a, b) {
        const [ua, va] = gridOf(grid, ...a), [ub, vb] = gridOf(grid, ...b);
        const u0 = Math.min(ua, ub), u1 = Math.max(ua, ub), v0 = Math.min(va, vb), v1 = Math.max(va, vb);
        setMeasure(null);
        if (u1 - u0 < 0.4 && v1 - v0 < 0.4) return;
        const along = u1 - u0 >= v1 - v0; // row runs horizontally
        const cells = [];
        const [lo, hi, mid] = along ? [u0, u1, (v0 + v1) / 2] : [v0, v1, (u0 + u1) / 2];
        for (let i = Math.ceil(lo - 0.3); i <= Math.floor(hi + 0.3); i++) {
            const inLine = pins.filter(p => (along ? p[0] : p[1]) === i);
            if (!inLine.length) continue;
            const pin = inLine.reduce((best, p) => (Math.abs((along ? p[1] : p[0]) - mid) < Math.abs((along ? best[1] : best[0]) - mid) ? p : best));
            // a bit wider than one pitch: this pin's label stays whole, neighbours' letters touch the
            // edge and are dropped (and a little taller than drawn: letters the box only grazes stay whole)
            cells.push(along ? { key: pin.join(), c0: i - 0.65, c1: i + 0.65, r0: v0 - 0.05, r1: v1 + 0.05 } : { key: pin.join(), c0: u0 - 0.05, c1: u1 + 0.05, r0: i - 0.65, r1: i + 0.65 });
        }
        if (!cells.length) { setOcr({ read: 0, of: 0, error: 'No pins next to that box.' }); return; }
        setOcr({ done: 0, total: cells.length });
        try {
            const res = await readLabels(state.url, grid, cells, { turn: textDir, progress: (done, total) => setOcr({ done, total }) });
            snap();
            setLabels(prev => ({ ...prev, ...res.labels }));
            setOcr({ read: Object.keys(res.labels).length, of: cells.length });
        } catch (err) {
            console.error(err);
            setOcr({ read: 0, of: cells.length, error: 'Text recognition could not be loaded.' });
        }
    }

    // Two clicked pins n pins apart define the grid exactly: spacing, angle and position.
    // The row between them becomes pins, and holes that look like them are added.
    function applyMeasure(a, b, n, search) {
        const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
        let ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        // the row may run along x or y: keep the angle within ±45°, the row then is a column
        const quarter = Math.round(ang / (Math.PI / 2));
        ang -= quarter * Math.PI / 2;
        const g = { pitch: d / (n - 1), angle: ang, phaseX: a[0], phaseY: a[1] };
        const steps = [[1, 0], [0, 1], [-1, 0], [0, -1]][((quarter % 4) + 4) % 4];
        const row = Array.from({ length: n }, (_, i) => [steps[0] * i, steps[1] * i]);
        setGrid(g);
        setBox(null);
        setLabels({});
        if (search) {
            // the measured row may be a scale next to the part (perfboard, ruler): only what is
            // inside the frame is pins
            const inside = frameHoles(g, state.framePx), set = new Set(inside.map(q => q.join()));
            const res = findSimilar(pixRef.current, g, row.filter(q => set.has(q.join())), inside, row);
            setPins(res.pins);
            setFound(res.added ? `${res.added} more pin${res.added === 1 ? '' : 's'} found that look like this row. Click wrong ones away.` : null);
        } else setPins(row);
    }

    const moreLikeThese = () => {
        if (!grid || !pins.length) return;
        snap();
        const res = findSimilar(pixRef.current, grid, pins, frameHoles(grid, state.framePx));
        setPins(res.pins);
        setFound(res.added ? `Added ${res.added} pin${res.added === 1 ? '' : 's'} that look like the marked ones.` : 'Nothing else looks like the marked pins.');
    };

    const ready = state.status === 'ready';
    const scaled = ready && grid;
    // body: the frame in holes (edges within 0.2 pitch of a hole count as covering it), around all
    // pins; an outline dragged by hand wins
    let body = null;
    if (scaled) {
        const fp = state.framePx;
        const cs = [[fp.x0, fp.y0], [fp.x1, fp.y0], [fp.x0, fp.y1], [fp.x1, fp.y1]].map(([x, y]) => gridOf(grid, x, y));
        let x0 = Math.floor(Math.min(...cs.map(c => c[0])) - 0.2) + 1, x1 = Math.ceil(Math.max(...cs.map(c => c[0])) + 0.2) - 1;
        let y0 = Math.floor(Math.min(...cs.map(c => c[1])) - 0.2) + 1, y1 = Math.ceil(Math.max(...cs.map(c => c[1])) + 0.2) - 1;
        if (box) ({ x0, y0, x1, y1 } = box);
        if (x1 < x0) x1 = x0;
        if (y1 < y0) y1 = y0;
        for (const [c, r] of pins) { x0 = Math.min(x0, c); x1 = Math.max(x1, c); y0 = Math.min(y0, r); y1 = Math.max(y1, r); }
        body = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    }
    const rows = new Set(pins.map(p => p[1])).size;

    const apply = async () => {
        if (!pins.length || !body) return;
        let ps = pins.map(([c, r]) => [c - body.x, r - body.y, labels[c + ',' + r]]);
        const b = { x: 0, y: 0, w: body.w, h: body.h };
        // an underside photo shows the footprint mirrored
        if (mirror) ps = ps.map(([c, r, l]) => [b.w - 1 - c, r, l]);
        ps.sort((p, q) => p[1] - q[1] || p[0] - q[0]);
        let image = null;
        if (keepPhoto) {
            try { image = { src: await cutOut(state, grid, body, mirror), x: 0, y: 0, w: body.w, h: body.h }; } catch (err) { console.error(err); }
        }
        onApply({ pins: ps, body: b, image });
    };

    // outline corners and edge handles in image coordinates (the grid may be turned)
    const outline = scaled ? [[body.x - 0.5, body.y - 0.5], [body.x + body.w - 0.5, body.y - 0.5], [body.x + body.w - 0.5, body.y + body.h - 0.5], [body.x - 0.5, body.y + body.h - 0.5]].map(([c, r]) => holeAt(grid, c, r)) : null;
    const handles = scaled ? [['l', body.x - 0.5, body.y + (body.h - 1) / 2], ['r', body.x + body.w - 0.5, body.y + (body.h - 1) / 2],
        ['t', body.x + (body.w - 1) / 2, body.y - 0.5], ['b', body.x + (body.w - 1) / 2, body.y + body.h - 0.5]].map(([e, c, r]) => [e, ...holeAt(grid, c, r)]) : null;

    // grid holes on and a little around the part
    let holes = null;
    if (scaled) {
        holes = [];
        for (let r = body.y - 2; r <= body.y + body.h + 1; r++) for (let c = body.x - 2; c <= body.x + body.w + 1; c++) {
            const [x, y] = holeAt(grid, c, r);
            if (x > 0 && y > 0 && x < state.W && y < state.H) holes.push([c, r, x, y]);
        }
        if (holes.length > 20000) holes = [];
    }
    const unit = ready ? (grid ? grid.pitch : Math.max(state.framePx.x1 - state.framePx.x0, state.framePx.y1 - state.framePx.y0) / 12) : 0;
    // the view of step 2: the frame with some of the surroundings (for a scale next to the part)
    const view = ready ? (() => {
        const fp = state.framePx, m = Math.max(fp.x1 - fp.x0, fp.y1 - fp.y0) * 0.35;
        const x0 = Math.max(0, fp.x0 - m), y0 = Math.max(0, fp.y0 - m);
        return [x0, y0, Math.min(state.W, fp.x1 + m) - x0, Math.min(state.H, fp.y1 + m) - y0];
    })() : null;

    // frame drawing (step 1)
    const fc = cropping ? [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => fromFrame(frame, u * frame.w / 2, v * frame.h / 2)) : null;
    const fHandles = cropping ? [['tl', -1, -1], ['t', 0, -1], ['tr', 1, -1], ['r', 1, 0], ['br', 1, 1], ['b', 0, 1], ['bl', -1, 1], ['l', -1, 0]]
        .map(([h, u, v]) => [h, ...fromFrame(frame, u * frame.w / 2, v * frame.h / 2)]) : null;
    const rotH = cropping ? fromFrame(frame, 0, -frame.h / 2 - hs * 3) : null;
    const rotBase = cropping ? fromFrame(frame, 0, -frame.h / 2) : null;
    const cursorFor = (h) => {
        // resize cursors follow the frame's turn (in 45° steps)
        const base = { t: 0, tr: 45, r: 90, br: 135, b: 180, bl: 225, l: 270, tl: 315 }[h];
        const k = Math.round(((base + deg) % 360 + 360) % 360 / 45) % 4;
        return ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'][k];
    };

    return (
        <div className="overlay-bg pf-bg" style={hidden ? { display: 'none' } : undefined} onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
            <div className="modal pf-modal" role="dialog" aria-label="Footprint from a photo">
                <header className="ce-head">
                    <Camera size={16} className="icon-accent" />
                    <h3>Footprint from a photo</h3>
                    {cropping && <span className="ce-size">Step 1 of 2 · frame the part</span>}
                    {ready && !scaled && <span className="ce-size">Step 2 of 2 · scale</span>}
                    {scaled && <span className="ce-size">{pins.length} pins{rows ? ` in ${rows} row${rows === 1 ? '' : 's'}` : ''} · {body.w} × {body.h} holes · {(body.w * 2.54).toFixed(1)} × {(body.h * 2.54).toFixed(1)} mm</span>}
                    <div className="ce-head-actions">
                        <button className="ce-btn" onClick={onCancel}>Cancel</button>
                        {cropping
                            ? <button className="ce-btn primary" onClick={next}>Next <ArrowRight size={13} /></button>
                            : <button className="ce-btn primary" onClick={apply} disabled={!scaled || !pins.length}>Use footprint</button>}
                    </div>
                </header>

                <div className="pf-body">
                    <div className={'pf-view' + (over ? ' over' : '')}
                        onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
                        onDrop={e => { e.preventDefault(); setOver(false); load(e.dataTransfer.files?.[0]); }}>
                        {state.status === 'pick' && (
                            <div className="pf-pick">
                                <ImageUp size={34} />
                                <b>Add a photo of the part</b>
                                <span>From straight above. Drop it here, paste it (Ctrl+V) or:</span>
                                <div className="pf-row pf-center">
                                    <label className="ce-btn primary pf-file"><Camera size={14} /> Choose or take a photo
                                        <input type="file" accept="image/*" hidden onChange={e => { load(e.target.files?.[0]); e.target.value = ''; }} />
                                    </label>
                                    <button className="ce-btn" onClick={pasteButton}><ClipboardPaste size={14} /> Paste</button>
                                </div>
                                <form className="pf-url" onSubmit={e => { e.preventDefault(); loadUrl(); }}>
                                    <Link2 size={14} />
                                    <input value={url} onChange={e => setUrl(e.target.value)} placeholder="…or an image URL" aria-label="Image URL" />
                                    <button className="ce-btn" type="submit" disabled={!url.trim()}>Load</button>
                                </form>
                                {state.reason && <div className="pf-warn">{state.reason}</div>}
                            </div>
                        )}
                        {state.status === 'loading' && <div className="pf-msg"><Loader2 size={22} className="spin" /> Loading the photo…</div>}
                        {state.status === 'error' && <div className="pf-msg err">{state.reason}<Tips /></div>}

                        {cropping && (
                            <svg ref={svgRef} viewBox={view1.join(' ')} preserveAspectRatio="xMidYMid meet"
                                onPointerDown={onFrameDown} onPointerMove={onFrameMove} onPointerUp={onFrameUp} onPointerCancel={onFrameUp}
                                style={{ cursor: drag?.h === 'move' ? 'grabbing' : 'grab' }}>
                                <image href={state.photo} x="0" y="0" width={state.PW} height={state.PH} />
                                <path fillRule="evenodd" fill="rgba(0,0,0,.55)" style={{ pointerEvents: 'none' }}
                                    d={`M0 0H${state.PW}V${state.PH}H0Z M${fc.map(p => p.join(' ')).join(' L')}Z`} />
                                <polygon points={fc.map(p => p.join(',')).join(' ')} fill="transparent" stroke="#58a6ff" strokeWidth={2 / zoom} />
                                <line x1={rotBase[0]} y1={rotBase[1]} x2={rotH[0]} y2={rotH[1]} stroke="#58a6ff" strokeWidth={1.5 / zoom} style={{ pointerEvents: 'none' }} />
                                {fHandles.map(([h, x, y]) => (
                                    <rect key={h} data-h={h} x={x - hs / 2} y={y - hs / 2} width={hs} height={hs} rx={hs / 5}
                                        transform={`rotate(${deg} ${x} ${y})`} fill="#fff" stroke="#58a6ff" strokeWidth={2 / zoom} style={{ cursor: cursorFor(h) }} />
                                ))}
                                <circle data-h="rot" cx={rotH[0]} cy={rotH[1]} r={hs * 0.7} fill="#58a6ff" stroke="#fff" strokeWidth={2 / zoom} style={{ cursor: 'alias' }}>
                                    <title>Drag to turn the frame</title>
                                </circle>
                            </svg>
                        )}

                        {ready && measure && measure.kind !== 'ocr' && !measure.b && <div className="pf-banner">{measure.a ? 'Now click the last pin of that row' : 'Click the first pin of a row'}</div>}
                        {ready && measure?.kind === 'ocr' && !drag && <div className="pf-banner">Drag a box over the labels next to one row of pins</div>}
                        {ocr && 'total' in ocr && <div className="pf-banner"><Loader2 size={13} className="spin" /> Reading labels… {ocr.done}/{ocr.total}</div>}
                        {ready && (
                            <svg ref={svgRef} viewBox={view.join(' ')} preserveAspectRatio="xMidYMid meet"
                                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
                                style={{ cursor: drag?.moved ? 'grabbing' : 'crosshair' }}>
                                <image href={state.url} x="0" y="0" width={state.W} height={state.H} />
                                {/* outside the frame dimmed: still there for a scale, but not the part */}
                                <path fillRule="evenodd" fill="rgba(0,0,0,.45)" style={{ pointerEvents: 'none' }}
                                    d={`M0 0H${state.W}V${state.H}H0Z M${state.framePx.x0} ${state.framePx.y0}H${state.framePx.x1}V${state.framePx.y1}H${state.framePx.x0}Z`} />
                                {scaled && <polygon points={outline.map(p => p.join(',')).join(' ')}
                                    fill="none" stroke="#58a6ff" strokeWidth={Math.max(2, unit / 18)} strokeDasharray={`${unit / 4} ${unit / 6}`} />}
                                {scaled && holes.map(([c, r, x, y]) => (
                                    <circle key={c + ',' + r} cx={x} cy={y} r={unit * 0.07}
                                        fill="rgba(255,255,255,.55)" stroke="rgba(0,0,0,.5)" strokeWidth={unit / 40} />
                                ))}
                                {scaled && pins.map(([c, r]) => { const [x, y] = holeAt(grid, c, r); return (
                                    <circle key={'p' + c + ',' + r} cx={x} cy={y} r={unit * 0.36}
                                        fill="rgba(63,185,80,.18)" stroke="#3fb950" strokeWidth={Math.max(2, unit / 14)} />
                                ); })}
                                {scaled && !measure && handles.map(([e, x, y]) => (
                                    <rect key={e} data-edge={e} x={x - unit * 0.22} y={y - unit * 0.22} width={unit * 0.44} height={unit * 0.44} rx={unit * 0.08}
                                        fill="#fff" stroke="#58a6ff" strokeWidth={Math.max(2, unit / 16)} style={{ cursor: e === 'l' || e === 'r' ? 'ew-resize' : 'ns-resize' }}>
                                        <title>Drag to change the part's outline</title>
                                    </rect>
                                ))}
                                {scaled && pins.map(([c, r]) => { const t = labels[c + ',' + r]; if (!t) return null; const [x, y] = holeAt(grid, c, r); return (
                                    <text key={'l' + c + ',' + r} x={x} y={y} dy=".35em" textAnchor="middle" fontSize={unit * Math.min(0.42, 1.1 / Math.max(2, t.length))} fontWeight="800"
                                        fill="#ffd33d" stroke="#000" strokeWidth={unit / 22} paintOrder="stroke" style={{ pointerEvents: 'none' }}>{t}</text>
                                ); })}
                                {measure?.kind === 'ocr' && measure.a && measure.b && (
                                    <rect x={Math.min(measure.a[0], measure.b[0])} y={Math.min(measure.a[1], measure.b[1])} width={Math.abs(measure.b[0] - measure.a[0])} height={Math.abs(measure.b[1] - measure.a[1])}
                                        fill="rgba(255,211,61,.15)" stroke="#ffd33d" strokeWidth={Math.max(2, unit / 16)} strokeDasharray={`${unit / 5} ${unit / 8}`} />
                                )}
                                {measure?.kind !== 'ocr' && measure?.a && <circle cx={measure.a[0]} cy={measure.a[1]} r={Math.max(4, unit * 0.18)} fill="#f0883e" stroke="#fff" strokeWidth={unit / 30} />}
                                {measure?.kind !== 'ocr' && measure?.b && <>
                                    <line x1={measure.a[0]} y1={measure.a[1]} x2={measure.b[0]} y2={measure.b[1]} stroke="#f0883e" strokeWidth={Math.max(2, unit / 16)} />
                                    <circle cx={measure.b[0]} cy={measure.b[1]} r={Math.max(4, unit * 0.18)} fill="#f0883e" stroke="#fff" strokeWidth={unit / 30} />
                                </>}
                            </svg>
                        )}
                    </div>

                    <aside className="pf-side">
                        {cropping && <>
                            <section>
                                <div className="ce-label">1 · Frame the part</div>
                                <p className="ce-hint">Put the blue frame on the part's outline: <b>drag</b> inside it to move it, the <b>white squares</b> to size it, the <b>round handle</b> to turn it. The top of the frame becomes the top of the part.</p>
                                <div className="pf-row">
                                    <button className="ce-btn" onClick={() => turnFrame(-1)} title="Turn the frame 90° left"><RotateCcw size={13} /> 90°</button>
                                    <button className="ce-btn" onClick={() => turnFrame(1)} title="Turn the frame 90° right"><RotateCw size={13} /> 90°</button>
                                    <button className="ce-btn" onClick={() => changeFrame(startFrame(state.PW, state.PH))}>Reset</button>
                                </div>
                                <span className="pf-lbl">Turn: {deg}°</span>
                                <input className="pf-range" type="range" min="-180" max="180" step="0.5" value={deg} aria-label="Turn the frame"
                                    onChange={e => changeFrame({ ...frame, a: +e.target.value * Math.PI / 180 })} />
                            </section>
                            <section>
                                <button className="ce-btn primary pf-wide" onClick={next}>Next: pins <ArrowRight size={13} /></button>
                                <button className="ce-btn pf-wide" onClick={() => { setMeasure(null); setState({ status: 'pick' }); }}><ImageUp size={13} /> Other photo</button>
                            </section>
                            <section className="pf-tips"><Tips /></section>
                        </>}

                        {ready && <>
                            <section>
                                <div className="ce-label">2 · Scale</div>
                                {measure?.kind !== 'scale' && <button className="ce-btn pf-wide" disabled={!!measure} onClick={() => setMeasure({ kind: 'scale' })}><Ruler size={14} /> Click first and last pin of a row</button>}
                                {measure?.kind === 'scale' && !measure.b && <button className="ce-btn pf-wide" onClick={() => setMeasure(null)}>Cancel</button>}
                                {measure?.kind === 'scale' && measure.b && (
                                    <>
                                        <span className="pf-lbl">How many pins are in that row?</span>
                                        <div className="pf-count">
                                            <button className="ce-btn" onClick={() => setCount(measure.n - 1)} aria-label="One pin less"><Minus size={14} /></button>
                                            <input className="pf-n" type="text" inputMode="numeric" value={measure.text ?? String(measure.n)} aria-label="Pins in that row"
                                                onChange={e => typeCount(e.target.value.replace(/\D/g, '').slice(0, 2))} onBlur={() => setMeasure(m => m && ({ ...m, text: null }))}
                                                onKeyDown={e => { if (e.key === 'ArrowUp') { e.preventDefault(); setCount(measure.n + 1); } if (e.key === 'ArrowDown') { e.preventDefault(); setCount(measure.n - 1); } }} />
                                            <button className="ce-btn" onClick={() => setCount(measure.n + 1)} aria-label="One pin more"><Plus size={14} /></button>
                                            <button className="ce-btn primary" onClick={() => setMeasure(null)}>Done</button>
                                        </div>
                                    </>
                                )}
                                <p className="ce-hint">Pins in a row are 2.54 mm apart, so two pins and their count set the scale. Any row works, also holes of a perfboard next to the part.</p>
                                <form className="pf-row" onSubmit={e => { e.preventDefault(); applyMm(); }}>
                                    <span className="pf-lbl">…or the part is</span>
                                    <input className="pf-mm" value={mm} onChange={e => setMm(e.target.value)} inputMode="decimal" placeholder="17.5" aria-label="Width of the part in mm" />
                                    <span className="pf-lbl">mm wide</span>
                                    <button className="ce-btn" type="submit" disabled={!mm}>Set</button>
                                </form>
                            </section>
                            <section>
                                <div className="ce-label">3 · Pins</div>
                                <p className="ce-hint">{scaled ? <><b>Click</b> a hole to add or remove a pin, <b>drag</b> to move the grid onto the pins.</> : 'Set the scale first.'}</p>
                                <button className="ce-btn pf-wide" disabled={!scaled || !pins.length || !!measure} onClick={moreLikeThese}><Sparkles size={14} /> Find pins like the marked ones</button>
                                {measure?.kind !== 'row'
                                    ? <button className="ce-btn pf-wide" disabled={!scaled || !!measure} onClick={() => setMeasure({ kind: 'row' })}><Rows3 size={14} /> Mark a row (first and last pin)</button>
                                    : <button className="ce-btn pf-wide" onClick={() => setMeasure(null)}>Cancel</button>}
                                {found && <p className="ce-hint pf-note">{found}</p>}
                            </section>
                            <section>
                                <div className="ce-label">4 · Outline</div>
                                <p className="ce-hint">The frame, in holes. Drag the white handles of the dashed outline to change it.</p>
                                <label className="pf-check"><input type="checkbox" checked={keepPhoto} onChange={e => setKeepPhoto(e.target.checked)} /> Use the photo as the part's picture</label>
                            </section>
                            <section>
                                <div className="ce-label">5 · Pin names (optional)</div>
                                {measure?.kind !== 'ocr'
                                    ? <button className="ce-btn pf-wide" disabled={!scaled || !pins.length || !!measure || (ocr && 'total' in ocr)} onClick={() => setMeasure({ kind: 'ocr' })}><ScanText size={14} /> Read labels next to a row</button>
                                    : <button className="ce-btn pf-wide" onClick={() => setMeasure(null)}>Cancel</button>}
                                <div className="pf-row">
                                    <span className="pf-lbl">Text runs</span>
                                    <select className="pf-select" value={String(textDir)} onChange={e => setTextDir(e.target.value === 'auto' ? 'auto' : +e.target.value)}>
                                        <option value="auto">find out</option>
                                        <option value="0">left to right</option>
                                        <option value="3">bottom to top</option>
                                        <option value="1">top to bottom</option>
                                        <option value="2">upside down</option>
                                    </select>
                                    {Object.keys(labels).length > 0 && <button className="ce-btn" onClick={() => { snap(); setLabels({}); setOcr(null); }}>Clear names</button>}
                                </div>
                                <p className="ce-hint">{ocr && 'read' in ocr
                                    ? (ocr.error || `Read ${ocr.read} of ${ocr.of} labels. Wrong ones can be fixed in the editor; or draw the box again, tighter around the text.`)
                                    : 'Draw a box over the printed names beside a header; each pin gets the text next to it.'}</p>
                            </section>
                            <section>
                                <label className="pf-check"><input type="checkbox" checked={mirror} onChange={e => setMirror(e.target.checked)} /> <FlipHorizontal2 size={14} /> Photo shows the underside</label>
                                <div className="pf-row">
                                    <button className="ce-btn" disabled={!hist.length} onClick={undo} title="Ctrl+Z"><Undo2 size={13} /> Undo</button>
                                    <button className="ce-btn" disabled={!pins.length} onClick={() => { snap(); setPins([]); setFound(null); }}>Clear pins</button>
                                    <button className="ce-btn" onClick={backToFrame} title="Back to step 1"><Crop size={13} /> Frame</button>
                                    <button className="ce-btn" onClick={() => { setMeasure(null); setState({ status: 'pick' }); }}><ImageUp size={13} /> Other photo</button>
                                </div>
                            </section>
                        </>}
                        {!cropping && !ready && <section className="pf-tips"><Tips /></section>}
                    </aside>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                .pf-bg { z-index: 1100; }
                .pf-modal { max-width: 1120px; width: calc(100% - 32px); height: min(760px, calc(100vh - 32px)); padding: 0; gap: 0; overflow: hidden; }
                .pf-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 290px; }
                .pf-view { position: relative; min-width: 0; min-height: 0; background: #080a0c; display: grid; place-items: center; }
                .pf-view > svg { position: absolute; inset: 12px; width: calc(100% - 24px); height: calc(100% - 24px); touch-action: none; user-select: none; }
                .pf-msg { color: var(--txt1); font-size: var(--fs-sm); display: flex; flex-direction: column; align-items: center; gap: 10px; max-width: 420px; text-align: center; padding: 16px; }
                .pf-msg.err { color: var(--red); }
                .pf-msg.err .pf-tiplist { color: var(--txt1); text-align: left; }
                .pf-side { border-left: 1px solid var(--border); display: flex; flex-direction: column; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--bg2); }
                .pf-side section { padding: 12px 14px; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px; }
                .pf-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
                .pf-row .ce-btn { display: inline-flex; align-items: center; gap: 5px; padding: 0 10px; }
                .pf-modal .ce-head-actions .ce-btn { display: inline-flex; align-items: center; gap: 5px; }
                .pf-view.over { outline: 2px dashed var(--blu-bright); outline-offset: -8px; }
                .pf-pick { display: flex; flex-direction: column; align-items: center; gap: 10px; max-width: 440px; padding: 24px; text-align: center; color: var(--txt1); font-size: var(--fs-sm); }
                .pf-pick > svg { color: var(--txt2); }
                .pf-pick b { color: var(--txt0); font-size: var(--fs-md); }
                .pf-center { justify-content: center; }
                .pf-file { display: inline-flex; align-items: center; gap: 6px; line-height: 30px; cursor: pointer; }
                .pf-url { display: flex; align-items: center; gap: 6px; width: 100%; color: var(--txt2); }
                .pf-url input, .pf-mm { flex: 1; min-width: 0; height: 30px; padding: 0 8px; background: var(--bg0); border: 1px solid var(--border); border-radius: 7px; color: var(--txt0); font: inherit; font-size: 13px; }
                .pf-mm { flex: 0 0 58px; text-align: center; }
                .pf-range { width: 100%; accent-color: var(--blu-bright, #58a6ff); }
                .pf-select { height: 28px; background: var(--bg0); border: 1px solid var(--border); border-radius: 7px; color: var(--txt0); font: inherit; font-size: 13px; padding: 0 6px; }
                .pf-banner svg { vertical-align: -2px; }
                .pf-count { display: flex; align-items: center; gap: 6px; min-width: 0; }
                .pf-count .ce-btn { display: inline-flex; align-items: center; padding: 0 10px; }
                .pf-count .primary { margin-left: auto; }
                .pf-banner { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 1; background: #f0883e; color: #111; font-weight: 700; font-size: var(--fs-sm); padding: 6px 12px; border-radius: 8px; pointer-events: none; }
                .pf-wide { width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
                .pf-lbl { font-size: var(--fs-xs); color: var(--txt1); }
                .pf-note { color: var(--grn, #3fb950); }
                .pf-count .pf-n { width: 64px; flex: 0 0 64px; height: 30px; padding: 0 4px; text-align: center; background: var(--bg0); border: 1px solid var(--border); border-radius: 7px; color: var(--txt0); font-family: inherit; font-size: 14px; font-weight: 700; -moz-appearance: textfield; }
                .pf-modal .ce-btn { white-space: nowrap; }
                .pf-check { display: flex; align-items: center; gap: 6px; font-size: var(--fs-sm); color: var(--txt0); cursor: pointer; }
                .pf-warn { color: var(--orange, #d29922); }
                .pf-tips { border-bottom: 0 !important; }
                .pf-tiplist { margin: 0; padding-left: 16px; font-size: var(--fs-xs); color: var(--txt2); line-height: 1.5; }
                .ce-btn:disabled { opacity: .5; cursor: default; }
                .spin { animation: pfspin 1s linear infinite; }
                @keyframes pfspin { to { transform: rotate(360deg); } }
                @media (max-width: 760px) {
                    .pf-modal { width: 100vw; height: 100dvh; max-height: none; border-radius: 0; border: 0; }
                    .pf-body { display: flex; flex-direction: column; overflow-y: auto; }
                    .pf-view { flex: none; height: 55dvh; position: sticky; top: 0; z-index: 2; }
                    .pf-side { border-left: 0; overflow: visible; }
                    .ce-size { display: none; }
                    .pf-modal .ce-head h3 { font-size: var(--fs-sm); }
                }
            ` }} />
        </div>
    );
}

// every hole whose centre lies inside the frame (where pins are searched)
function frameHoles(g, fp) {
    const cs = [[fp.x0, fp.y0], [fp.x1, fp.y0], [fp.x0, fp.y1], [fp.x1, fp.y1]].map(([x, y]) => gridOf(g, x, y));
    const c0 = Math.floor(Math.min(...cs.map(c => c[0]))), c1 = Math.ceil(Math.max(...cs.map(c => c[0])));
    const r0 = Math.floor(Math.min(...cs.map(c => c[1]))), r1 = Math.ceil(Math.max(...cs.map(c => c[1])));
    const out = [];
    if ((c1 - c0 + 1) * (r1 - r0 + 1) > 20000) return out;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const [x, y] = holeAt(g, c, r);
        if (x >= fp.x0 && x <= fp.x1 && y >= fp.y0 && y <= fp.y1) out.push([c, r]);
    }
    return out;
}

// The look of a hole: a square of 0.8 pitch around it, sampled 12×12 in colour, zero mean and
// unit length (so brightness and contrast don't matter). null if it leaves the photo.
const N = 12;
function patch(pix, g, c, r) {
    const { data, width: W, height: H } = pix, v = new Float32Array(N * N * 3);
    let k = 0, sum = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const [x, y] = holeAt(g, c + ((i + 0.5) / N - 0.5) * 0.8, r + ((j + 0.5) / N - 0.5) * 0.8);
        const xi = Math.round(x), yi = Math.round(y);
        if (xi < 0 || yi < 0 || xi >= W || yi >= H) return null;
        const o = (yi * W + xi) * 4;
        for (let ch = 0; ch < 3; ch++) { v[k] = data[o + ch]; sum += v[k++]; }
    }
    const mean = sum / v.length;
    let norm = 0;
    for (let i = 0; i < v.length; i++) { v[i] -= mean; norm += v[i] * v[i]; }
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < v.length; i++) v[i] /= norm;
    return v;
}

// Holes in the frame that look like the given pins: correlation with the pins' average look.
// The bar comes from the pins themselves (how alike they are among each other), never below 0.5.
function findSimilar(pix, g, pins, candidates, examples = pins) {
    if (!pix) return { pins, added: 0 };
    const ps = examples.map(([c, r]) => patch(pix, g, c, r)).filter(Boolean);
    if (!ps.length) return { pins, added: 0 };
    const T = new Float32Array(ps[0].length);
    for (const p of ps) for (let i = 0; i < T.length; i++) T[i] += p[i];
    const tn = Math.sqrt(T.reduce((s, x) => s + x * x, 0)) || 1;
    const score = (p) => { let s = 0; for (let i = 0; i < T.length; i++) s += p[i] * T[i]; return s / tn; };
    const own = ps.map(score).sort((a, b) => a - b);
    const bar = Math.max(0.5, own[Math.floor(own.length / 4)] - 0.15);
    const have = new Set(pins.map(p => p.join()));
    const add = [];
    for (const [c, r] of candidates) {
        if (have.has(c + ',' + r)) continue;
        const p = patch(pix, g, c, r);
        if (p && score(p) >= bar) add.push([c, r]);
    }
    // a carpet of matches (plain board, perfboard behind the part) is not pins
    if (add.length > Math.max(40, candidates.length * 0.6)) return { pins, added: 0 };
    return { pins: [...pins, ...add], added: add.length };
}

// How many pins between two clicked pins: the profile along the line repeats every pitch. For
// each count, the profile's autocorrelation at one, two, three pitches (pins over pins); a wrong
// count lands pins on gaps. Whole multiples of the pitch match too, so a count with a third
// or half the pitch wins when it is nearly as good.
function guessCount(pix, a, b) {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!pix || d < 8) return 2;
    const { data, width: W, height: H } = pix;
    const L = Math.ceil(d), ux = (b[0] - a[0]) / d, uy = (b[1] - a[1]) / d;
    const prof = new Float32Array(L + 1);
    let mean = 0;
    for (let i = 0; i <= L; i++) {
        let s = 0, n = 0;
        for (let o = -2; o <= 2; o++) {
            const x = Math.round(a[0] + ux * i - uy * o), y = Math.round(a[1] + uy * i + ux * o);
            if (x < 0 || y < 0 || x >= W || y >= H) continue;
            const q = (y * W + x) * 4;
            s += 0.299 * data[q] + 0.587 * data[q + 1] + 0.114 * data[q + 2]; n++;
        }
        prof[i] = n ? s / n : 0;
        mean += prof[i];
    }
    mean /= L + 1;
    let v0 = 0;
    for (let i = 0; i <= L; i++) { prof[i] -= mean; v0 += prof[i] * prof[i]; }
    if (!v0) return 2;
    const ac = (lag) => {
        const k = Math.round(lag);
        let s = 0;
        for (let i = 0; i + k <= L; i++) s += prof[i] * prof[i + k];
        return s / v0 * (L + 1) / (L + 1 - k);
    };
    const score = new Map();
    for (let n = 3; n <= 80 && d / (n - 1) >= 4; n++) {
        const P = d / (n - 1);
        let s = 0, m = 0;
        for (let j = 1; j <= 3 && j * P <= d / 2 + 1; j++) { s += ac(j * P); m++; }
        score.set(n, m ? s / m : -1);
    }
    let best = 2, bestScore = 0.05;
    for (const [n, s] of score) if (s > bestScore) { bestScore = s; best = n; }
    for (const k of [3, 2]) {
        const m = (best - 1) * k + 1;
        if (score.has(m) && score.get(m) >= bestScore * 0.8) best = m;
    }
    return best;
}

// median colour of the image border (the background around the part)
function borderColour(img) {
    const { width: W, height: H, data } = img;
    const ch = [[], [], []];
    const take = (x, y) => { const i = (y * W + x) * 4; for (let k = 0; k < 3; k++) ch[k].push(data[i + k]); };
    for (let x = 0; x < W; x += 2) { take(x, 0); take(x, 1); take(x, H - 1); take(x, H - 2); }
    for (let y = 0; y < H; y += 2) { take(0, y); take(1, y); take(W - 1, y); take(W - 2, y); }
    return ch.map(a => a.sort((p, q) => p - q)[a.length >> 1]);
}

// The part as a picture: the turned photo cut to the outline (turned with the grid, mirrored
// for underside photos), the background that reaches in from the edge made transparent
// (white silkscreen inside the part stays). WebP keeps it small enough for local storage.
async function cutOut(state, grid, body, mirror) {
    const img = new Image();
    img.src = state.url;
    await img.decode();
    const S = Math.max(8, Math.min(40, Math.floor(640 / Math.max(body.w, body.h)))); // px per hole
    const W = body.w * S, H = body.h * S;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    if (mirror) ctx.setTransform(-1, 0, 0, 1, W, 0);
    // output pixel -> image: P = holeAt(corner) + pitch/S · R(angle) · out; draw with the inverse
    const k = S / grid.pitch, cs = Math.cos(grid.angle || 0), sn = Math.sin(grid.angle || 0);
    const [tx, ty] = holeAt(grid, body.x - 0.5, body.y - 0.5);
    const a = k * cs, b = -k * sn, cc = k * sn, d = k * cs;
    ctx.transform(a, b, cc, d, -(a * tx + cc * ty), -(b * tx + d * ty));
    ctx.drawImage(img, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const px = ctx.getImageData(0, 0, W, H), dt = px.data, bg = state.bg || [255, 255, 255];
    const far = (i) => Math.hypot(dt[i * 4] - bg[0], dt[i * 4 + 1] - bg[1], dt[i * 4 + 2] - bg[2]);
    const T = 48;
    const seen = new Uint8Array(W * H), stack = [];
    for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
    for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
    while (stack.length) {
        const i = stack.pop();
        if (seen[i] || far(i) > T) continue;
        seen[i] = 1;
        dt[i * 4 + 3] = 0;
        const x = i % W, y = (i / W) | 0;
        if (x > 0) stack.push(i - 1);
        if (x < W - 1) stack.push(i + 1);
        if (y > 0) stack.push(i - W);
        if (y < H - 1) stack.push(i + W);
    }
    // soften the cut: pixels next to the removed background become half transparent
    for (let i = 0; i < W * H; i++) {
        if (seen[i]) continue;
        const x = i % W, y = (i / W) | 0;
        if ((x > 0 && seen[i - 1]) || (x < W - 1 && seen[i + 1]) || (y > 0 && seen[i - W]) || (y < H - 1 && seen[i + W])) dt[i * 4 + 3] = 140;
    }
    ctx.putImageData(px, 0, 0);
    return c.toDataURL('image/webp', 0.85);
}

function Tips() {
    return (
        <>
            <div className="ce-label">Good photos</div>
            <ul className="pf-tiplist">
                <li>Straight from above, not at an angle.</li>
                <li>The whole part in the picture, pins in focus.</li>
                <li>Something with 2.54 mm pitch in view (a pin header, perfboard) sets the scale; otherwise type the part's width.</li>
                <li>Modules with pin headers: the side where the pins or holes are clearest (often the underside).</li>
            </ul>
        </>
    );
}
