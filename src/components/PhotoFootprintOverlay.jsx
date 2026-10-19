import React, { useState, useEffect, useRef } from 'react';
import { Camera, Minus, Plus, FlipHorizontal2, Loader2, Ruler, Rows3, ClipboardPaste, Link2, ImageUp, Undo2, ScanText, RotateCcw, RotateCw, ArrowRight, Sparkles, ZoomIn, ZoomOut, Maximize2, Move } from 'lucide-react';
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
// Grid: hole (c, r) sits at origin + R(angle)·(pitch·c, pitch·ky·r) in the turned photo; ky
// (default 1) stretches the rows apart: a photo taken slightly at an angle, fitted by hand.
const holeAt = (g, c, r) => {
    const cs = Math.cos(g.angle || 0), sn = Math.sin(g.angle || 0), u = g.pitch * c, v = g.pitch * (g.ky || 1) * r;
    return [g.phaseX + u * cs - v * sn, g.phaseY + u * sn + v * cs];
};
// grid coordinates of an image point (not rounded) and the nearest hole
const gridOf = (g, x, y) => {
    const cs = Math.cos(g.angle || 0), sn = Math.sin(g.angle || 0), dx = x - g.phaseX, dy = y - g.phaseY;
    return [(dx * cs + dy * sn) / g.pitch, (-dx * sn + dy * cs) / (g.pitch * (g.ky || 1))];
};
const holeOf = (g, x, y) => gridOf(g, x, y).map(Math.round);
// g moved so that grid point (c, r) lands on image point P
const pinGrid = (g, c, r, P) => { const [x, y] = holeAt({ ...g, phaseX: 0, phaseY: 0 }, c, r); return { ...g, phaseX: P[0] - x, phaseY: P[1] - y }; };
// the grid turned by da / scaled by k around image point P (P keeps its grid position)
const turnGrid = (g, da, P) => {
    let a = (g.angle || 0) + da;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    const [u, v] = gridOf(g, ...P);
    return pinGrid({ ...g, angle: a }, u, v, P);
};
const scaleGrid = (g, k, P) => ({ ...g, pitch: g.pitch * k, phaseX: P[0] - k * (P[0] - g.phaseX), phaseY: P[1] - k * (P[1] - g.phaseY) });
const samePin = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
// every hole from a to b along a row, a column or a 45° diagonal; null when that isn't straight
const lineHoles = (a, b) => {
    const dc = b[0] - a[0], dr = b[1] - a[1];
    if (dc && dr && Math.abs(dc) !== Math.abs(dr)) return null;
    const n = Math.max(Math.abs(dc), Math.abs(dr));
    return Array.from({ length: n + 1 }, (_, i) => [a[0] + Math.sign(dc) * i, a[1] + Math.sign(dr) * i]);
};
// a point in the frame's own coordinates (origin at its centre, x along its width) and back
const toFrame = (f, x, y) => { const cs = Math.cos(f.a), sn = Math.sin(f.a), dx = x - f.cx, dy = y - f.cy; return [dx * cs + dy * sn, -dx * sn + dy * cs]; };
const fromFrame = (f, u, v) => { const cs = Math.cos(f.a), sn = Math.sin(f.a); return [f.cx + u * cs - v * sn, f.cy + u * sn + v * cs]; };
// aspect: width / height the frame keeps (picture mode: the footprint's), 0 = free
const startFrame = (W, H, aspect = 0) => {
    if (!aspect) return { cx: W / 2, cy: H / 2, w: W * 0.6, h: H * 0.6, a: 0 };
    let w = W * 0.6, h = w / aspect;
    if (h > H * 0.6) { h = H * 0.6; w = h * aspect; }
    return { cx: W / 2, cy: H / 2, w, h, a: 0 };
};

// mode 'picture': only a picture for an existing footprint ({ w, h, pins: [[col, row]] }): the
// frame keeps the footprint's shape, step 2 lines the photo up under the fixed pins, and onApply
// gets { image } alone.
export function PhotoFootprintOverlay({ file = null, onCancel, onApply, hidden = false, partName = '', mode = 'footprint', footprint = null }) {
    const picture = mode === 'picture' && footprint?.w > 0 && footprint?.h > 0;
    const aspect = picture ? footprint.w / footprint.h : 0;
    const aspectRef = useRef(aspect); // for the photo loader (a new photo starts with the current shape)
    aspectRef.current = aspect;
    // the footprint's pins as seen on the photo (an underside photo shows them mirrored), with
    // their names shown in the rings
    const footPins = (m) => footprint.pins.map(([c, r]) => [m ? footprint.w - 1 - c : c, r]);
    const footLabels = (m) => Object.fromEntries(footprint.pins.filter(q => q[2]).map(([c, r, l]) => [(m ? footprint.w - 1 - c : c) + ',' + r, l]));
    const [src, setSrc] = useState(file); // the photo (Blob); null = ask for one
    // pick | loading | crop (frame the part on the whole photo) | ready (turned photo, pins) | error
    const [state, setState] = useState({ status: file ? 'loading' : 'pick' });
    const [frame, setFrame] = useState(null);   // { cx, cy, w, h, a } on the whole photo (px, radians)
    const [grid, setGrid] = useState(null);     // { pitch, phaseX, phaseY, angle }; null = no scale yet
    const [zv, setZv] = useState(null);         // zoomed view [x, y, w, h] in photo px; null = whole frame
    const [pins, setPins] = useState([]);       // [[col, row]]
    const [sel, setSel] = useState(null);       // the selected pin [col, row]: a row starts here, Del removes it
    const [rowMode, setRowMode] = useState(false); // touch's Shift: a tap draws a row from the selected pin
    const [mirror, setMirror] = useState(false);
    const [box, setBox] = useState(null);       // outline changed by hand: { x0, y0, x1, y1 } in holes; null = the frame
    const [keepPhoto, setKeepPhoto] = useState(true); // the cut-out photo becomes the part's picture
    const [labels, setLabels] = useState({});   // pin names read by OCR: { "col,row": text }
    const [ocr, setOcr] = useState(null);       // null | { done, total } while reading | { read, of, error? } after
    const [textDir, setTextDir] = useState('auto'); // reading direction: 'auto' | 0 | 1 | 3 quarter turns
    const [mm, setMm] = useState('');           // the part's width in mm (scale for parts without a pin row)
    const [found, setFound] = useState(null);   // result note of "find similar"
    const [drag, setDrag] = useState(null);
    // null | { kind: 'scale' | 'ocr' | 'grid', a?, b?, n? }: 'scale' sets the grid from two pins and a
    // count, 'ocr' is the box over a row of labels, 'grid' is alignment mode
    const [measure, setMeasure] = useState(null);
    const [url, setUrl] = useState('');
    const [over, setOver] = useState(false);    // a file dragged over the dialog
    const [hist, setHist] = useState([]);       // undo: earlier { grid, pins, box, labels, zv }
    const snap = () => setHist(h => [...h.slice(-49), { grid, pins, box, labels, zv, mirror }]);
    const undo = () => setHist(h => {
        if (!h.length) return h;
        const last = h[h.length - 1];
        setGrid(last.grid); setPins(last.pins); setBox(last.box); setLabels(last.labels || {}); setSel(null); setZv(last.zv || null); setMirror(!!last.mirror);
        if (!picture) setMeasure(null);
        return h.slice(0, -1);
    });
    const svgRef = useRef(null);
    const photoRef = useRef(null);   // the whole photo (canvas)
    const pixRef = useRef(null);     // the turned photo's pixels (ImageData) for pin search and counting
    const onKeyRef = useRef(null);
    const ocrRun = useRef(0);        // the latest label reading; older ones are dropped
    const live = useRef({});         // the current grid and photo, for async work started earlier
    live.current = { grid, url: state.url };

    const load = (blob) => {
        if (!blob || !/^image\//.test(blob.type || 'image/')) return;
        setMeasure(null); setMirror(false); setHist([]); setBox(null); setLabels({}); setOcr(null); setGrid(null); setPins([]); setFound(null); setSel(null); setRowMode(false);
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
                setFrame(startFrame(W, H, aspectRef.current));
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
        if (picture) {
            // the frame is the footprint: one hole per footprint cell, the pins fixed, align mode
            if (!same || !grid) {
                const pitch = (framePx.x1 - framePx.x0) / footprint.w;
                setGrid({ angle: 0, pitch, phaseX: framePx.x0 + pitch / 2, phaseY: framePx.y0 + pitch / 2 });
                setPins(footPins(mirror)); setLabels(footLabels(mirror)); setHist([]); setZv(null);
                setMeasure({ kind: 'grid', pitch0: pitch });
            }
        } else if (!same) { setGrid(null); setPins([]); setBox(null); setLabels({}); setOcr(null); setHist([]); setFound(null); setMeasure({ kind: 'scale' }); }
        setZv(null); setSel(null); setRowMode(false);
        setState(s => ({ ...s, status: 'ready', usedFrame: frame, url: out.toDataURL('image/jpeg', 0.92), W: OW, H: OH, framePx }));
    };
    const backToFrame = () => { if (!picture) setMeasure(null); setDrag(null); setSel(null); setRowMode(false); setState(s => ({ ...s, status: 'crop' })); };

    onKeyRef.current = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); if (measure && !picture) setMeasure(null); else onCancel(); }
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); e.stopPropagation(); undo(); }
        else if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) { /* typing */ }
        else if (state.status === 'ready' && (e.key === 'Delete' || e.key === 'Backspace') && sel && pins.some(q => samePin(q, sel))) { e.preventDefault(); e.stopPropagation(); snap(); removePin(sel); }
        else if (state.status === 'ready' && (e.key === '[' || e.key === ']') && grid) {
            // turn the grid a little: 0.25° (Shift: 1°)
            e.preventDefault(); e.stopPropagation();
            if (!e.repeat) snap();
            setGrid(g => turnGrid(g, (e.key === ']' ? 1 : -1) * (e.shiftKey ? 1 : 0.25) * Math.PI / 180, pinsCentre()));
        }
    };
    useEffect(() => {
        if (hidden) return;
        const onKey = (e) => onKeyRef.current?.(e);
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [hidden]);

    const toImage = (e) => {
        const ctm = svgRef.current?.getScreenCTM();
        if (!ctm) return null;
        return new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    };

    // --- step 1: the frame ---------------------------------------------------------------------
    const cropping = state.status === 'crop' && frame;
    // The view follows the frame: after every change it glides so the frame fills about 80 % of
    // it (zooms in on a small part, out when the frame is dragged larger), so the frame can be
    // placed precisely and its handles never pile up, also with fingers on a phone.
    const [cropView, setCropView] = useState(null); // [x, y, w, h] in photo px
    const [svgSize, setSvgSize] = useState({ w: 1, h: 1 });
    const viewAnim = useRef(null);
    useEffect(() => {
        const svg = svgRef.current;
        if ((state.status !== 'crop' && state.status !== 'ready') || !svg) return;
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
        let w = Math.max((x1 - x0) / 0.82, 40), h = Math.max((y1 - y0) / 0.82, 40);
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
        // inside the frame moves the frame, outside moves the photo under it
        const [u, v] = toFrame(frame, p.x, p.y), inside = Math.abs(u) <= frame.w / 2 && Math.abs(v) <= frame.h / 2;
        const h = e.target.getAttribute?.('data-h') || (inside ? 'move' : 'pan');
        setDrag({ h, x: p.x, y: p.y, f: frame, sx: e.clientX, sy: e.clientY, v: view1, z: zoom });
    };
    const onFrameMove = (e) => {
        if (!drag) return;
        const p = toImage(e);
        if (!p) return;
        const f = drag.f;
        if (drag.h === 'move') { setFrame({ ...f, cx: f.cx + p.x - drag.x, cy: f.cy + p.y - drag.y }); return; }
        if (drag.h === 'pan') {
            // the photo follows the pointer and the frame stays put on screen: both move the other
            // way in photo coordinates
            const dx = (e.clientX - drag.sx) / drag.z, dy = (e.clientY - drag.sy) / drag.z;
            setFrame({ ...f, cx: f.cx - dx, cy: f.cy - dy });
            setCropView([drag.v[0] - dx, drag.v[1] - dy, drag.v[2], drag.v[3]]);
            return;
        }
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
        if (aspect) {
            // the footprint's shape: the other side follows (a corner takes the larger of both)
            if (sx && sy) { if (w / h > aspect) h = w / aspect; else w = h * aspect; }
            else if (sx) h = w / aspect;
            else w = h * aspect;
            cu = sx ? -sx * f.w / 2 + sx * w / 2 : 0;
            cv = sy ? -sy * f.h / 2 + sy * h / 2 : 0;
        }
        const [cx, cy] = fromFrame(f, cu, cv);
        setFrame({ ...f, cx, cy, w, h });
    };
    const onFrameUp = () => { if (drag) glideTo(fitView(frame)); setDrag(null); };
    const changeFrame = (f) => { setFrame(f); glideTo(fitView(f)); };
    const turnFrame = (q) => changeFrame({ ...frame, a: frame.a + q * Math.PI / 2 });
    const deg = frame ? Math.round(((frame.a * 180 / Math.PI) % 360 + 540) % 360 - 180) : 0;

    // --- step 2: scale and pins ----------------------------------------------------------------
    // The photo can be zoomed (two fingers, mouse wheel, the +/− buttons) for precise work on
    // small pins. One finger or the mouse on the photo pans it; on a pin or a measuring point it
    // moves that; a tap adds or removes a pin.
    const ptrs = useRef(new Map());      // pointers down: id -> [clientX, clientY]
    const pinch = useRef(null);          // { v, d, m } at the start of a two-finger gesture
    const swallow = useRef(false);       // after a pinch: the last finger lifting is no tap
    const wheelRef = useRef(null);
    // view v scaled by k (clamped between the whole frame and 10× in), the photo point under
    // client point `from` moved to client point `to`
    const viewFor = (v, k, from, to) => {
        const r = svgRef.current.getBoundingClientRect(), base = view;
        const z = Math.min(r.width / v[2], r.height / v[3]);
        const ox = r.left + (r.width - v[2] * z) / 2, oy = r.top + (r.height - v[3] * z) / 2;
        const px = v[0] + (from[0] - ox) / z, py = v[1] + (from[1] - oy) / z;
        const w = Math.min(base[2], Math.max(base[2] / 10, v[2] / k)), h = w * v[3] / v[2], z2 = z * v[2] / w;
        let x = px - (to[0] - ox) / z2, y = py - (to[1] - oy) / z2;
        if (w >= base[2] * 0.999) return null;
        // the centre stays on the frame's view
        x = Math.min(base[0] + base[2] - w / 2, Math.max(base[0] - w / 2, x));
        y = Math.min(base[1] + base[3] - h / 2, Math.max(base[1] - h / 2, y));
        return [x, y, w, h];
    };
    const zoomBy = (k) => {
        const r = svgRef.current?.getBoundingClientRect();
        if (r) { const c = [r.left + r.width / 2, r.top + r.height / 2]; setZv(viewFor(view2, k, c, c)); }
    };
    wheelRef.current = (e) => { const c = [e.clientX, e.clientY]; setZv(viewFor(view2, Math.exp(-e.deltaY * 0.002), c, c)); };
    useEffect(() => {
        const svg = svgRef.current;
        if (state.status !== 'ready' || !svg) return;
        const onWheel = (e) => { e.preventDefault(); wheelRef.current?.(e); };
        svg.addEventListener('wheel', onWheel, { passive: false });
        return () => svg.removeEventListener('wheel', onWheel);
    }, [state.status]);

    const onPointerDown = (e) => {
        ptrs.current.set(e.pointerId, [e.clientX, e.clientY]);
        e.currentTarget.setPointerCapture?.(e.pointerId);
        if (ptrs.current.size === 2) {
            // a second finger: zoom and pan; whatever the first finger started is dropped
            const [a, b] = [...ptrs.current.values()];
            pinch.current = { v: view2, d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
            if (measure?.kind === 'grid' && grid) {
                // aligning: twisting the two fingers turns the grid around the point between them
                const ctm = svgRef.current?.getScreenCTM(), P = ctm && new DOMPoint(...pinch.current.m).matrixTransform(ctm.inverse());
                if (P) Object.assign(pinch.current, { ang: Math.atan2(b[1] - a[1], b[0] - a[0]), g: grid, P: [P.x, P.y], snapped: false });
            }
            if (drag?.m && drag.moved) {
                if (drag.origMeasure) setMeasure(drag.origMeasure);
                if (drag.origGrid) setGrid(drag.origGrid);
                if (drag.origPins) setPins(drag.origPins);
                setHist(h => h.slice(0, -1));
            } else if (drag?.pin && drag.moved) {
                if (drag.origPins) setPins(drag.origPins);
                if (drag.origLabels) setLabels(drag.origLabels);
                setHist(h => h.slice(0, -1));
            }
            setDrag(null);
            return;
        }
        if (ptrs.current.size > 2) return;
        const p = toImage(e);
        if (!p) return;
        const start = { sx: e.clientX, sy: e.clientY, moved: false };
        if (measure?.kind === 'ocr') {
            // drawing the box over a row of labels
            setMeasure({ kind: 'ocr', a: [p.x, p.y], b: [p.x, p.y] });
            setDrag({ ocr: true });
            return;
        }
        const t = e.target.getAttribute?.bind(e.target) || (() => null);
        if (picture && grid) {
            // the box with the pins works like the frame of step 1: inside moves it, the round
            // handle turns it, edges stretch it, corners size it; outside moves the photo
            const [u, v] = gridOf(grid, p.x, p.y);
            const inside = u >= -0.5 && u <= footprint.w - 0.5 && v >= -0.5 && v <= footprint.h - 0.5;
            setDrag({ ...start, box: t('data-bh') || (inside ? 'move' : 'pan'), g: grid, p0: [p.x, p.y], v: view2, z: z2 });
            return;
        }
        if (t('data-edge') && grid) {
            // a handle of the outline: drag that edge
            snap();
            setBox({ x0: body.x, y0: body.y, x1: body.x + body.w - 1, y1: body.y + body.h - 1 });
            setDrag({ edge: t('data-edge') });
            return;
        }
        if (t('data-m')) { setDrag({ ...start, m: t('data-m'), origMeasure: measure, origGrid: grid, origPins: pins }); return; }
        if (t('data-pin') && (!measure || (measure.kind === 'scale' && measure.b))) { setDrag({ ...start, pin: t('data-pin').split(',').map(Number), origPins: pins, origLabels: labels }); return; }
        if (measure?.kind === 'grid') { setDrag({ ...start, grid: true, g: grid, v: view2, z: z2 }); return; }
        setDrag({ ...start, pan: true, v: view2 });
    };
    const onPointerMove = (e) => {
        if (!ptrs.current.has(e.pointerId)) return;
        ptrs.current.set(e.pointerId, [e.clientX, e.clientY]);
        if (pinch.current) {
            if (ptrs.current.size < 2) return;
            const [a, b] = [...ptrs.current.values()], pc = pinch.current;
            setZv(viewFor(pc.v, Math.hypot(a[0] - b[0], a[1] - b[1]) / pc.d, pc.m, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]));
            if (pc.g) {
                let da = Math.atan2(b[1] - a[1], b[0] - a[0]) - pc.ang;
                da = Math.atan2(Math.sin(da), Math.cos(da));
                if (pc.snapped || Math.abs(da) > 0.003) {
                    if (!pc.snapped) { snap(); pc.snapped = true; }
                    setGrid(turnGrid(pc.g, da, pc.P));
                }
            }
            return;
        }
        if (!drag) return;
        const p = toImage(e);
        if (!p) return;
        if (drag.ocr) { setMeasure(m => ({ ...m, b: [p.x, p.y] })); return; }
        if (drag.box) {
            if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) <= 2) return;
            if (!drag.moved) { if (drag.box !== 'pan') snap(); setDrag({ ...drag, moved: true }); }
            const g = drag.g, W = footprint.w, H = footprint.h;
            if (drag.box === 'pan') {
                const dx = (e.clientX - drag.sx) / drag.z, dy = (e.clientY - drag.sy) / drag.z;
                setZv([drag.v[0] - dx, drag.v[1] - dy, drag.v[2], drag.v[3]]);
            } else if (drag.box === 'move') {
                setGrid({ ...g, phaseX: g.phaseX + p.x - drag.p0[0], phaseY: g.phaseY + p.y - drag.p0[1] });
            } else if (drag.box === 'rot') {
                const C = holeAt(g, (W - 1) / 2, (H - 1) / 2);
                let a = (g.angle || 0) + Math.atan2(p.y - C[1], p.x - C[0]) - Math.atan2(drag.p0[1] - C[1], drag.p0[0] - C[0]);
                const q = Math.round(a / (Math.PI / 2)) * Math.PI / 2;
                if (Math.abs(a - q) < 0.02) a = q; // snaps to straight
                setGrid(turnGrid(g, a - (g.angle || 0), C));
            } else {
                // an edge stretches along its axis, a corner sizes both ways; the opposite side stays
                const h = drag.box, [u, v] = gridOf(g, p.x, p.y);
                const au = h.includes('l') ? W - 0.5 : -0.5, av = h.includes('t') ? H - 0.5 : -0.5;
                const su = h.includes('l') || h.includes('r') ? Math.max(0.2, Math.abs(u - au) / W) : 1;
                const sv = h.includes('t') || h.includes('b') ? Math.max(0.2, Math.abs(v - av) / H) : 1;
                const corner = su !== 1 && sv !== 1, s = corner ? (su + sv) / 2 : 1;
                const n = corner ? { ...g, pitch: g.pitch * s } : { ...g, pitch: g.pitch * su, ky: (g.ky || 1) * sv / su };
                const cu = su !== 1 ? au : (W - 1) / 2, cv = sv !== 1 ? av : (H - 1) / 2;
                setGrid(pinGrid(n, cu, cv, holeAt(g, cu, cv)));
            }
            return;
        }
        if (drag.edge) {
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
        if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) <= 4) return;
        const first = !drag.moved;
        if (drag.pan) { setZv(viewFor(drag.v, 1, [drag.sx, drag.sy], [e.clientX, e.clientY])); if (first) setDrag({ ...drag, moved: true }); return; }
        if (first && !drag.pan) snap();
        if (drag.m) {
            // a measuring point: the scale follows it
            const m = { ...measure, [drag.m]: [p.x, p.y] };
            setMeasure(m);
            if (m.a && m.b) applyMeasure(m.a, m.b, m.n, false);
            if (first) setDrag({ ...drag, moved: true });
            return;
        }
        if (drag.pin) {
            // a pin: to the hole under the finger (not onto another pin)
            const to = holeOf(grid, p.x, p.y), from = drag.cur || drag.pin;
            if (to[0] !== from[0] || to[1] !== from[1]) {
                if (!pins.some(q => q[0] === to[0] && q[1] === to[1])) {
                    setPins(prev => prev.map(q => (q[0] === from[0] && q[1] === from[1] ? to : q)));
                    if (samePin(sel, from)) setSel(to);
                    setLabels(l => { const k0 = from.join(), k1 = to.join(); if (!(k0 in l)) return l; const n = { ...l, [k1]: l[k0] }; delete n[k0]; return n; });
                    setDrag({ ...drag, moved: true, cur: to });
                    return;
                }
            }
            if (first) setDrag({ ...drag, moved: true });
            return;
        }
        if (drag.grid) {
            // the photo follows the finger, pins and outline stay where they are on screen: the
            // grid moves the other way on the photo and the view with it
            const dx = (e.clientX - drag.sx) / drag.z, dy = (e.clientY - drag.sy) / drag.z;
            setDrag({ ...drag, moved: true });
            setGrid({ ...drag.g, phaseX: drag.g.phaseX - dx, phaseY: drag.g.phaseY - dy });
            setZv([drag.v[0] - dx, drag.v[1] - dy, drag.v[2], drag.v[3]]);
        }
    };
    const onPointerCancel = (e) => {
        ptrs.current.delete(e.pointerId);
        if (ptrs.current.size < 2) pinch.current = null;
        if (ptrs.current.size === 0) swallow.current = false;
        setDrag(null);
    };
    const onPointerUp = (e) => {
        ptrs.current.delete(e.pointerId);
        if (pinch.current) {
            if (ptrs.current.size < 2) { pinch.current = null; swallow.current = ptrs.current.size > 0; }
            return;
        }
        if (swallow.current) { swallow.current = ptrs.current.size > 0; return; }
        if (!drag) return;
        setDrag(null);
        if (drag.edge || drag.box) return;
        if (drag.ocr) { runOcr(measure.a, measure.b); return; }
        if (drag.moved) {
            if (drag.m && measure.a && measure.b) applyMeasure(measure.a, measure.b, measure.n, true);
            return;
        }
        // a tap
        const p = toImage(e);
        if (p && measure && !measure.b && measure.kind !== 'grid') {
            if (!measure.a) setMeasure({ ...measure, a: [p.x, p.y] });
            else if (Math.hypot(p.x - measure.a[0], p.y - measure.a[1]) < 4) { /* too close to the first pin: keep waiting */ }
            else {
                snap();
                const b = [p.x, p.y];
                const fp = state.framePx, F = Math.max(fp.x1 - fp.x0, fp.y1 - fp.y0);
                // at most 40 holes across the frame
                const n = guessCount(pixRef.current, measure.a, b, Math.floor(Math.hypot(b[0] - measure.a[0], b[1] - measure.a[1]) / (F / 40)) + 1);
                setMeasure({ ...measure, b, n });
                applyMeasure(measure.a, b, n, true);
            }
        } else if (p && grid && (!measure || (measure.kind === 'scale' && measure.b))) {
            // a tap on the photo also ends measuring
            if (measure) setMeasure(null);
            const h = holeOf(grid, p.x, p.y);
            const has = pins.some(q => samePin(q, h));
            const line = (e.shiftKey || rowMode) && sel && !samePin(sel, h) ? lineHoles(sel, h) : null;
            if (line) {
                snap();
                setPins(prev => { const have = new Set(prev.map(q => q.join())); return [...prev, ...line.filter(q => !have.has(q.join()))]; });
                setSel(h);
            } else if (has && samePin(sel, h)) { snap(); removePin(h); }
            else if (has) setSel(h);
            else { snap(); setPins(prev => [...prev, h]); setSel(h); }
        }
    };
    const removePin = (h) => {
        setPins(prev => prev.filter(q => !samePin(q, h)));
        setLabels(l => { const k = h.join(); if (!(k in l)) return l; const n = { ...l }; delete n[k]; return n; });
        setSel(null);
    };
    // the point the grid turns around: the middle of the pins (else of the frame)
    const pinsCentre = () => {
        if (!grid || !pins.length) { const fp = state.framePx; return [(fp.x0 + fp.x1) / 2, (fp.y0 + fp.y1) / 2]; }
        const pts = pins.map(([c, r]) => holeAt(grid, c, r));
        return [pts.reduce((a, q) => a + q[0], 0) / pts.length, pts.reduce((a, q) => a + q[1], 0) / pts.length];
    };
    // picture mode: the middle of the box (what the 90° buttons and the slider turn around)
    const boxCentre = () => holeAt(grid, (footprint.w - 1) / 2, (footprint.h - 1) / 2);
    const startAlign = () => { snap(); setRowMode(false); setMeasure({ kind: 'grid', pitch0: grid.pitch }); };


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
        setPins([]); setBox(null); setLabels({}); setMeasure(null); setFound(null); setSel(null); setRowMode(false);
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
        // reading takes seconds (the model loads on first use): if the grid or the photo changed
        // meanwhile, the names belong to holes that are not these any more
        const run = ++ocrRun.current, g0 = grid, url0 = state.url;
        const stale = () => run !== ocrRun.current || live.current.grid !== g0 || live.current.url !== url0;
        try {
            const res = await readLabels(state.url, grid, cells, { turn: textDir, progress: (done, total) => { if (!stale()) setOcr({ done, total }); } });
            if (stale()) { if (run === ocrRun.current) setOcr(null); return; }
            snap();
            setLabels(prev => ({ ...prev, ...res.labels }));
            setOcr({ read: Object.keys(res.labels).length, of: cells.length });
        } catch (err) {
            console.error(err);
            if (!stale()) setOcr({ read: 0, of: cells.length, error: 'Text recognition could not be loaded.' });
        }
    }

    // Two clicked pins n pins apart define the grid exactly: spacing, angle and position.
    // The row between them becomes pins, and holes that look like them are added.
    function applyMeasure(a, b, n, search) {
        const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (d < 4) return;
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
        setSel(null);
        setRowMode(false);
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
        setFound(res.added ? `Added ${res.added} pin${res.added === 1 ? '' : 's'} that look like the marked ones.` : res.unlike ? 'The marked pins don\'t look alike, so there is nothing to search for. Tap the others by hand.' : 'Nothing else looks like the marked pins.');
    };

    const ready = state.status === 'ready';
    const scaled = ready && grid;
    // body: the frame in holes (edges within 0.2 pitch of a hole count as covering it), around all
    // pins; an outline dragged by hand wins
    let body = null;
    if (scaled && picture) body = { x: 0, y: 0, w: footprint.w, h: footprint.h };
    else if (scaled) {
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
        if (picture) {
            if (!body) return;
            try { onApply({ image: { src: await cutOut(state, grid, body, mirror), x: 0, y: 0, w: body.w, h: body.h } }); } catch (err) { console.error(err); }
            return;
        }
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

    // grid lines through the holes of the part: easier to see whether the photo sits right
    const gridLines = [];
    if (scaled) {
        for (let c = body.x; c < body.x + body.w; c++) gridLines.push([holeAt(grid, c, body.y - 0.5), holeAt(grid, c, body.y + body.h - 0.5)]);
        for (let r = body.y; r < body.y + body.h; r++) gridLines.push([holeAt(grid, body.x - 0.5, r), holeAt(grid, body.x + body.w - 0.5, r)]);
    }
    // picture mode: the box's handles (as the frame's in step 1) and the turn handle above it
    let boxHandles = null, boxRot = null;
    if (picture && scaled) {
        const W = footprint.w, H = footprint.h;
        boxHandles = [['tl', -0.5, -0.5], ['t', (W - 1) / 2, -0.5], ['tr', W - 0.5, -0.5], ['r', W - 0.5, (H - 1) / 2], ['br', W - 0.5, H - 0.5], ['b', (W - 1) / 2, H - 0.5], ['bl', -0.5, H - 0.5], ['l', -0.5, (H - 1) / 2]]
            .map(([h, c, r]) => [h, ...holeAt(grid, c, r)]);
        const T = holeAt(grid, (W - 1) / 2, -0.5), C = holeAt(grid, (W - 1) / 2, (H - 1) / 2), d = Math.hypot(T[0] - C[0], T[1] - C[1]) || 1;
        boxRot = { base: T, dir: [(T[0] - C[0]) / d, (T[1] - C[1]) / d] };
    }

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
    const view2 = ready ? (zv || view) : null;
    const z2 = view2 ? Math.min(svgSize.w / view2[2], svgSize.h / view2[3]) : 1; // screen px per photo px

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
            <div className="modal pf-modal" role="dialog" aria-label={picture ? 'Picture from a photo' : 'Footprint from a photo'}>
                <header className="ce-head pf-head">
                    <Camera size={16} className="icon-accent" />
                    <div className="pf-titles">
                        <h3>{partName || (picture ? 'Picture from a photo' : 'Footprint from a photo')}</h3>
                        {partName && <span className="pf-kind">{picture ? 'picture from a photo' : 'footprint from a photo'}</span>}
                    </div>
                    {(cropping || ready) && (
                        <ol className="pf-steps" aria-label="Steps">
                            <li className={cropping ? 'on' : 'done'}>
                                <button onClick={backToFrame} disabled={cropping} title={ready ? 'Back to the frame' : undefined}><b>1</b> Frame</button>
                            </li>
                            <li className={ready ? 'on' : ''}><span><b>2</b> {picture ? 'Line up' : 'Pins'}</span></li>
                        </ol>
                    )}
                    <div className="ce-head-actions">
                        <button className="ce-btn" onClick={onCancel}>Cancel</button>
                        {cropping
                            ? <button className="ce-btn primary" onClick={next}>Next <ArrowRight size={13} /></button>
                            : <button className="ce-btn primary" onClick={apply} disabled={!scaled || (!picture && !pins.length)}>{picture ? 'Use picture' : 'Use footprint'}</button>}
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
                                style={{ cursor: drag ? 'grabbing' : 'grab' }}>
                                <image href={state.photo} x="0" y="0" width={state.PW} height={state.PH} />
                                <path fillRule="evenodd" fill="rgba(0,0,0,.55)" style={{ pointerEvents: 'none' }}
                                    d={`M0 0H${state.PW}V${state.PH}H0Z M${fc.map(p => p.join(' ')).join(' L')}Z`} />
                                <polygon points={fc.map(p => p.join(',')).join(' ')} fill="transparent" stroke="#58a6ff" strokeWidth={2 / zoom} style={{ cursor: drag ? 'grabbing' : 'move' }} />
                                {picture && (() => {
                                    // the footprint's grid and pins (with names) in the frame: where the pins will be
                                    const cw = frame.w / footprint.w, ch = frame.h / footprint.h, at = (c, r) => fromFrame(frame, (c + 0.5) * cw - frame.w / 2, (r + 0.5) * ch - frame.h / 2);
                                    const lines = [];
                                    for (let c = 0; c < footprint.w; c++) lines.push([at(c, -0.5), at(c, footprint.h - 0.5)]);
                                    for (let r = 0; r < footprint.h; r++) lines.push([at(-0.5, r), at(footprint.w - 0.5, r)]);
                                    return <g style={{ pointerEvents: 'none' }}>
                                        {lines.map(([a, b], i) => <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="rgba(255,255,255,.22)" strokeWidth={1 / zoom} />)}
                                        {footprint.pins.map(([c, r, l]) => { const [x, y] = at(c, r); return <g key={c + ',' + r}>
                                            <circle cx={x} cy={y} r={Math.min(cw, ch) * 0.34} fill="rgba(63,185,80,.15)" stroke="#3fb950" strokeWidth={1.5 / zoom} />
                                            {l && <text x={x} y={y} dy=".35em" textAnchor="middle" fontSize={Math.min(cw, ch) * Math.min(0.42, 1.1 / Math.max(2, l.length))} fontWeight="800" fill="#ffd33d" stroke="#000" strokeWidth={Math.min(cw, ch) / 22} paintOrder="stroke" transform={`rotate(${deg} ${x} ${y})`}>{l}</text>}
                                        </g>; })}
                                    </g>;
                                })()}
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

                        {ready && measure?.kind === 'scale' && !measure.b && <div className="pf-banner">{measure.a ? 'Now tap the last pin of that row' : 'Tap the first pin of a row'}</div>}
                        {cropping && !drag && <div className="pf-banner soft">Drag inside the frame to move it · outside to move the photo</div>}
                        {ready && measure?.kind === 'grid' && !drag && <div className="pf-banner soft">{picture ? 'Put the box on the part: the rings on its pins' : 'Drag to move'} · {touch ? 'twist two fingers to turn' : (picture ? 'round handle turns' : '[ ] or the slider to turn')}</div>}
                        {ready && rowMode && !measure && <div className="pf-banner">{sel ? 'Tap where the row ends' : 'Tap the row\'s first pin'}</div>}
                        {ready && (
                            <div className="pf-zoom">
                                <button onClick={() => zoomBy(1.6)} aria-label="Zoom in" title="Zoom in (or pinch, or mouse wheel)"><ZoomIn size={16} /></button>
                                <button onClick={() => zoomBy(1 / 1.6)} disabled={!zv} aria-label="Zoom out" title="Zoom out"><ZoomOut size={16} /></button>
                                <button onClick={() => setZv(null)} disabled={!zv} aria-label="Whole part" title="Whole part"><Maximize2 size={15} /></button>
                            </div>
                        )}
                        {ready && measure?.kind === 'ocr' && !drag && <div className="pf-banner">Drag a box over the labels next to one row of pins</div>}
                        {ocr && 'total' in ocr && <div className="pf-banner"><Loader2 size={13} className="spin" /> Reading labels… {ocr.done}/{ocr.total}</div>}
                        {ready && (
                            <svg ref={svgRef} viewBox={view2.join(' ')} preserveAspectRatio="xMidYMid meet"
                                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
                                style={{ cursor: drag?.moved ? 'grabbing' : 'crosshair' }}>
                                <image href={state.url} x="0" y="0" width={state.W} height={state.H} />
                                {/* outside the frame dimmed: still there for a scale, but not the part */}
                                <path fillRule="evenodd" fill="rgba(0,0,0,.45)" style={{ pointerEvents: 'none' }}
                                    d={picture && scaled ? `M0 0H${state.W}V${state.H}H0Z M${outline.map(p => p.join(' ')).join(' L')}Z`
                                        : `M0 0H${state.W}V${state.H}H0Z M${state.framePx.x0} ${state.framePx.y0}H${state.framePx.x1}V${state.framePx.y1}H${state.framePx.x0}Z`} />
                                {scaled && gridLines.map(([a, b], i) => <line key={'g' + i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="rgba(255,255,255,.22)" strokeWidth={1 / z2} style={{ pointerEvents: 'none' }} />)}
                                {scaled && <polygon points={outline.map(p => p.join(',')).join(' ')}
                                    fill={picture ? 'transparent' : 'none'} stroke="#58a6ff" strokeWidth={2 / z2} strokeDasharray={picture ? undefined : `${unit / 4} ${unit / 6}`}
                                    style={picture ? { cursor: drag ? 'grabbing' : 'move' } : undefined} />}
                                {scaled && holes.map(([c, r, x, y]) => (
                                    <circle key={c + ',' + r} cx={x} cy={y} r={unit * 0.07}
                                        fill="rgba(255,255,255,.55)" stroke="rgba(0,0,0,.5)" strokeWidth={unit / 40} />
                                ))}
                                {scaled && pins.map(([c, r]) => { const [x, y] = holeAt(grid, c, r); const on = drag?.cur?.[0] === c && drag.cur[1] === r; const picked = samePin(sel, [c, r]); return (
                                    <g key={'p' + c + ',' + r}>
                                        <circle cx={x} cy={y} r={unit * 0.36} fill={on || picked ? 'rgba(240,136,62,.35)' : 'rgba(63,185,80,.18)'} stroke={picked ? '#f0883e' : '#3fb950'} strokeWidth={(picked ? 3.5 : 2.5) / z2} style={{ pointerEvents: 'none' }} />
                                        {/* the grab area: a little larger than the ring, still clear of the neighbours */}
                                        <circle data-pin={c + ',' + r} cx={x} cy={y} r={unit * 0.46} fill="transparent" style={{ cursor: measure ? 'crosshair' : 'move' }} />
                                    </g>
                                ); })}
                                {scaled && !measure && handles.map(([e, x, y]) => (
                                    <rect key={e} data-edge={e} x={x - unit * 0.22} y={y - unit * 0.22} width={unit * 0.44} height={unit * 0.44} rx={unit * 0.08}
                                        fill="#fff" stroke="#58a6ff" strokeWidth={2 / z2} style={{ cursor: e === 'l' || e === 'r' ? 'ew-resize' : 'ns-resize' }}>
                                        <title>Drag to change the part's outline</title>
                                    </rect>
                                ))}
                                {scaled && pins.map(([c, r]) => { const t = labels[c + ',' + r]; if (!t) return null; const [x, y] = holeAt(grid, c, r); return (
                                    <text key={'l' + c + ',' + r} x={x} y={y} dy=".35em" textAnchor="middle" fontSize={unit * Math.min(0.42, 1.1 / Math.max(2, t.length))} fontWeight="800"
                                        fill="#ffd33d" stroke="#000" strokeWidth={unit / 22} paintOrder="stroke" style={{ pointerEvents: 'none' }}>{t}</text>
                                ); })}
                                {boxHandles && (() => {
                                    const hz = (touch ? 26 : 14) / z2, a = (grid.angle || 0) * 180 / Math.PI;
                                    const R = [boxRot.base[0] + boxRot.dir[0] * hz * 3, boxRot.base[1] + boxRot.dir[1] * hz * 3];
                                    const cur = (h) => ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'][Math.round(((({ t: 0, tr: 45, r: 90, br: 135, b: 180, bl: 225, l: 270, tl: 315 })[h] + a) % 360 + 360) % 360 / 45) % 4];
                                    return <g>
                                        <line x1={boxRot.base[0]} y1={boxRot.base[1]} x2={R[0]} y2={R[1]} stroke="#58a6ff" strokeWidth={1.5 / z2} style={{ pointerEvents: 'none' }} />
                                        {boxHandles.map(([h, x, y]) => (
                                            <rect key={h} data-bh={h} x={x - hz / 2} y={y - hz / 2} width={hz} height={hz} rx={hz / 5} transform={`rotate(${a} ${x} ${y})`}
                                                fill="#fff" stroke="#58a6ff" strokeWidth={2 / z2} style={{ cursor: cur(h) }}>
                                                <title>{h.length === 2 ? 'Drag to size the box' : 'Drag to stretch the box this way'}</title>
                                            </rect>
                                        ))}
                                        <circle data-bh="rot" cx={R[0]} cy={R[1]} r={hz * 0.7} fill="#58a6ff" stroke="#fff" strokeWidth={2 / z2} style={{ cursor: 'alias' }}><title>Drag to turn</title></circle>
                                    </g>;
                                })()}
                                {measure?.kind === 'ocr' && measure.a && measure.b && (
                                    <rect x={Math.min(measure.a[0], measure.b[0])} y={Math.min(measure.a[1], measure.b[1])} width={Math.abs(measure.b[0] - measure.a[0])} height={Math.abs(measure.b[1] - measure.a[1])}
                                        fill="rgba(255,211,61,.15)" stroke="#ffd33d" strokeWidth={Math.max(2, unit / 16)} strokeDasharray={`${unit / 5} ${unit / 8}`} />
                                )}
                                {measure?.a && measure?.b && measure.kind !== 'ocr' && <line x1={measure.a[0]} y1={measure.a[1]} x2={measure.b[0]} y2={measure.b[1]} stroke="#f0883e" strokeWidth={2 / z2} style={{ pointerEvents: 'none' }} />}
                                {measure?.kind === 'scale' && ['a', 'b'].map(k => measure[k] && (
                                    <g key={k}>
                                        {/* a cross hair, so the point can be put exactly on a pin's centre */}
                                        <circle cx={measure[k][0]} cy={measure[k][1]} r={7 / z2} fill="none" stroke="#f0883e" strokeWidth={2.5 / z2} style={{ pointerEvents: 'none' }} />
                                        <path d={`M${measure[k][0] - 12 / z2} ${measure[k][1]}h${24 / z2}M${measure[k][0]} ${measure[k][1] - 12 / z2}v${24 / z2}`} stroke="#fff" strokeWidth={1.2 / z2} style={{ pointerEvents: 'none' }} />
                                        {measure.kind === 'scale' && <circle data-m={k} cx={measure[k][0]} cy={measure[k][1]} r={(touch ? 22 : 12) / z2} fill="transparent" style={{ cursor: 'move' }}><title>Drag to put it exactly on the pin</title></circle>}
                                    </g>
                                ))}
                            </svg>
                        )}
                    </div>

                    <aside className="pf-side">
                        {cropping && <>
                            <section>
                                <div className="pf-title">Frame the part</div>
                                <p className="ce-hint">{picture
                                    ? `Put the frame on the part's outline. It keeps the part's shape (${footprint.w} × ${footprint.h} holes); the green rings show where its pins will be.`
                                    : 'Put the frame on the part\'s outline.'} Its top becomes the part's top.</p>
                                <ul className="pf-keys">
                                    <li><b>Drag inside</b> moves the frame</li>
                                    <li><b>Drag outside</b> moves the photo</li>
                                    <li><b>Squares</b> size it, the <b>round handle</b> turns it</li>
                                </ul>
                            </section>
                            <section>
                                <div className="pf-title">Turn <span className="pf-val">{deg}°</span></div>
                                <div className="pf-turn">
                                    <button className="ce-btn" onClick={() => turnFrame(-1)} title="Turn 90° left" aria-label="Turn 90° left"><RotateCcw size={14} /></button>
                                    <input className="pf-range" type="range" min="-180" max="180" step="0.5" value={deg} aria-label="Turn the frame"
                                        onChange={e => changeFrame({ ...frame, a: +e.target.value * Math.PI / 180 })} />
                                    <button className="ce-btn" onClick={() => turnFrame(1)} title="Turn 90° right" aria-label="Turn 90° right"><RotateCw size={14} /></button>
                                </div>
                                <button className="ce-btn pf-wide" onClick={() => changeFrame(startFrame(state.PW, state.PH, aspect))}>Reset frame</button>
                            </section>
                            <div className="pf-grow" />
                            <section className="pf-foot">
                                <button className="ce-btn pf-wide" onClick={() => { setMeasure(null); setState({ status: 'pick' }); }}><ImageUp size={14} /> Other photo</button>
                                <details className="pf-tips"><summary>Tips for good photos</summary><Tips title={false} /></details>
                            </section>
                        </>}

                        {ready && picture && <>
                            <section>
                                <div className="pf-title">Put the box on the part</div>
                                <p className="ce-hint">The box is the part, the rings its pins with their names. Line them up with the pins on the photo.</p>
                                <ul className="pf-keys">
                                    <li><b>Drag inside</b> moves the box, <b>outside</b> the photo</li>
                                    <li><b>Round handle</b> turns it, <b>corners</b> size it</li>
                                    <li><b>Edges</b> stretch it one way</li>
                                </ul>
                            </section>
                            {grid && <section>
                                <div className="pf-title">Turn <span className="pf-val">{((grid.angle || 0) * 180 / Math.PI).toFixed(1)}°</span></div>
                                <div className="pf-turn">
                                    <button className="ce-btn" onClick={() => { snap(); setGrid(g => turnGrid(g, -Math.PI / 2, boxCentre())); }} title="Turn 90° left" aria-label="Turn 90° left"><RotateCcw size={14} /></button>
                                    <input className="pf-range" type="range" min="-180" max="180" step="0.1" value={((grid.angle || 0) * 180 / Math.PI).toFixed(1)} aria-label="Turn the box"
                                        onChange={e => setGrid(g => turnGrid(g, +e.target.value * Math.PI / 180 - (g.angle || 0), boxCentre()))} />
                                    <button className="ce-btn" onClick={() => { snap(); setGrid(g => turnGrid(g, Math.PI / 2, boxCentre())); }} title="Turn 90° right" aria-label="Turn 90° right"><RotateCw size={14} /></button>
                                </div>
                                <label className="pf-check"><input type="checkbox" checked={mirror} onChange={e => { snap(); setMirror(e.target.checked); setPins(footPins(e.target.checked)); setLabels(footLabels(e.target.checked)); }} /> <FlipHorizontal2 size={14} /> Mirrored (photo of the underside)</label>
                                {(grid.ky || 1) !== 1 && <button className="ce-btn pf-wide" onClick={() => { snap(); setGrid(g => pinGrid({ ...g, ky: 1 }, (footprint.w - 1) / 2, (footprint.h - 1) / 2, boxCentre())); }}>Undo stretch</button>}
                            </section>}
                            <div className="pf-grow" />
                            <section className="pf-foot">
                                <div className="pf-row">
                                    <button className="ce-btn" disabled={!hist.length} onClick={undo} title="Ctrl+Z"><Undo2 size={14} /> Undo</button>
                                    <button className="ce-btn" onClick={() => { setSel(null); setState({ status: 'pick' }); }}><ImageUp size={14} /> Other photo</button>
                                </div>
                            </section>
                        </>}

                        {ready && !picture && <>
                            <section>
                                <div className="pf-title"><b className="pf-num">1</b> Scale</div>
                                {measure?.kind === 'scale' && measure.b ? (
                                    <div className="pf-count">
                                        <span className="pf-lbl">Pins in that row</span>
                                        <button className="ce-btn" onClick={() => setCount(measure.n - 1)} aria-label="One pin less"><Minus size={14} /></button>
                                        <input className="pf-n" type="text" inputMode="numeric" value={measure.text ?? String(measure.n)} aria-label="Pins in that row"
                                            onChange={e => typeCount(e.target.value.replace(/\D/g, '').slice(0, 2))} onBlur={() => setMeasure(m => m && ({ ...m, text: null }))}
                                            onKeyDown={e => { if (e.key === 'ArrowUp') { e.preventDefault(); setCount(measure.n + 1); } if (e.key === 'ArrowDown') { e.preventDefault(); setCount(measure.n - 1); } }} />
                                        <button className="ce-btn" onClick={() => setCount(measure.n + 1)} aria-label="One pin more"><Plus size={14} /></button>
                                        <button className="ce-btn primary" onClick={() => setMeasure(null)}>Done</button>
                                    </div>
                                ) : measure?.kind === 'scale'
                                    ? <button className="ce-btn pf-wide" onClick={() => setMeasure(null)}>Cancel measuring</button>
                                    : <button className="ce-btn pf-wide" disabled={!!measure} onClick={() => { setSel(null); setRowMode(false); setMeasure({ kind: 'scale' }); }}><Ruler size={14} /> {grid ? 'Measure again' : 'Tap first and last pin of a row'}</button>}
                                {!(measure?.kind === 'scale' && measure.b) && (
                                    <form className="pf-row" onSubmit={e => { e.preventDefault(); applyMm(); }}>
                                        <span className="pf-lbl">or the part is</span>
                                        <input className="pf-mm" value={mm} onChange={e => setMm(e.target.value)} inputMode="decimal" placeholder="17.5" aria-label="Width of the part in mm" />
                                        <span className="pf-lbl">mm wide</span>
                                        <button className="ce-btn" type="submit" disabled={!mm}>Set</button>
                                    </form>
                                )}
                                <p className="ce-hint">{measure?.kind === 'scale' && measure.b ? 'Drag the orange points onto the pin centres to fine-tune.' : 'Any row 2.54 mm apart works, also perfboard holes next to the part.'}</p>
                            </section>
                            <section>
                                <div className="pf-title"><b className="pf-num">2</b> Pins {scaled && <span className="pf-val">{pins.length}{rows ? ` in ${rows} row${rows === 1 ? '' : 's'}` : ''}</span>}</div>
                                <p className="ce-hint">{!scaled ? 'Set the scale first.'
                                    : measure?.kind === 'grid' ? 'Line the grid up with the holes: drag, and turn or size it below.'
                                        : `Tap: add a pin · tap a pin: select, again${touch ? '' : ' or Del'}: remove · ${touch ? 'Row' : 'Shift+tap'}: a straight row from the selected pin.`}</p>
                                <div className="pf-tools">
                                    <button className="ce-btn" disabled={!scaled || !pins.length || !!measure} onClick={moreLikeThese} title="Find pins like the marked ones"><Sparkles size={14} /> Find similar</button>
                                    <button className={`ce-btn ${rowMode ? 'primary' : ''}`} disabled={!scaled || measure?.kind === 'grid'} onClick={() => setRowMode(m => !m)}
                                        aria-pressed={rowMode} title="Tap to draw a straight row from the selected pin (Shift+click does the same)"><Rows3 size={14} /> Row</button>
                                    {measure?.kind === 'grid'
                                        ? <button className="ce-btn primary" onClick={() => setMeasure(null)}>Done</button>
                                        : <button className="ce-btn" disabled={!scaled || (!!measure && measure.kind !== 'scale')} onClick={startAlign} title="Move and turn the grid onto the holes"><Move size={14} /> Align</button>}
                                </div>
                                {measure?.kind === 'grid' && grid && <>
                                    <span className="pf-lbl">Turn {((grid.angle || 0) * 180 / Math.PI).toFixed(1)}°</span>
                                    <input className="pf-range" type="range" min="-180" max="180" step="0.1" value={((grid.angle || 0) * 180 / Math.PI).toFixed(1)} aria-label="Turn the grid"
                                        onChange={e => setGrid(g => turnGrid(g, +e.target.value * Math.PI / 180 - (g.angle || 0), pinsCentre()))} />
                                    <span className="pf-lbl">Size {Math.round(grid.pitch / measure.pitch0 * 1000) / 10} %</span>
                                    <input className="pf-range" type="range" min="0.9" max="1.1" step="0.002" value={grid.pitch / measure.pitch0} aria-label="Size of the grid"
                                        onChange={e => setGrid(g => scaleGrid(g, (+e.target.value * measure.pitch0) / g.pitch, pinsCentre()))} />
                                </>}
                                {found && <p className="ce-hint pf-note">{found}</p>}
                            </section>
                            <section>
                                <div className="pf-title"><b className="pf-num">3</b> Outline and names {scaled && <span className="pf-val">{body.w} × {body.h} holes · {(body.w * 2.54).toFixed(1)} × {(body.h * 2.54).toFixed(1)} mm</span>}</div>
                                <label className="pf-check"><input type="checkbox" checked={keepPhoto} onChange={e => setKeepPhoto(e.target.checked)} /> Photo as the part's picture</label>
                                <label className="pf-check"><input type="checkbox" checked={mirror} onChange={e => setMirror(e.target.checked)} /> <FlipHorizontal2 size={14} /> Photo shows the underside</label>
                                <div className="pf-row">
                                    {measure?.kind !== 'ocr'
                                        ? <button className="ce-btn" disabled={!scaled || !pins.length || !!measure || (ocr && 'total' in ocr)} onClick={() => setMeasure({ kind: 'ocr' })}><ScanText size={14} /> Read pin names</button>
                                        : <button className="ce-btn" onClick={() => setMeasure(null)}>Cancel</button>}
                                    <select className="pf-select" value={String(textDir)} onChange={e => setTextDir(e.target.value === 'auto' ? 'auto' : +e.target.value)} aria-label="Text direction">
                                        <option value="auto">text: auto</option>
                                        <option value="0">left to right</option>
                                        <option value="3">bottom to top</option>
                                        <option value="1">top to bottom</option>
                                        <option value="2">upside down</option>
                                    </select>
                                    {Object.keys(labels).length > 0 && <button className="ce-btn" onClick={() => { snap(); setLabels({}); setOcr(null); }}>Clear names</button>}
                                </div>
                                <p className="ce-hint">{ocr && 'read' in ocr
                                    ? (ocr.error || `Read ${ocr.read} of ${ocr.of} labels. Fix wrong ones in the editor, or draw the box tighter.`)
                                    : 'Drag the outline\'s white handles to resize it. Names: draw a box over the printed labels beside a row.'}</p>
                            </section>
                            <div className="pf-grow" />
                            <section className="pf-foot">
                                <div className="pf-row">
                                    <button className="ce-btn" disabled={!hist.length} onClick={undo} title="Ctrl+Z"><Undo2 size={14} /> Undo</button>
                                    <button className="ce-btn" disabled={!pins.length} onClick={() => { snap(); setPins([]); setFound(null); setSel(null); setRowMode(false); }}>Clear pins</button>
                                    <button className="ce-btn" onClick={() => { setMeasure(null); setSel(null); setRowMode(false); setState({ status: 'pick' }); }}><ImageUp size={14} /> Other photo</button>
                                </div>
                            </section>
                        </>}
                        {!cropping && !ready && <section className="pf-tips-open"><Tips /></section>}
                    </aside>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                .pf-bg { z-index: 1100; }
                .pf-modal { max-width: 1120px; width: calc(100% - 32px); height: min(760px, calc(100vh - 32px)); padding: 0; gap: 0; overflow: hidden; border-radius: var(--radius-xl); }
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
                .pf-view.over { outline: 2px dashed var(--ui-accent-hover); outline-offset: -8px; }
                .pf-pick { display: flex; flex-direction: column; align-items: center; gap: 10px; max-width: 440px; padding: 24px; text-align: center; color: var(--txt1); font-size: var(--fs-sm); }
                .pf-pick > svg { color: var(--txt2); }
                .pf-pick b { color: var(--txt0); font-size: var(--fs-md); }
                .pf-center { justify-content: center; }
                .pf-file { display: inline-flex; align-items: center; gap: 6px; line-height: 30px; cursor: pointer; }
                .pf-url { display: flex; align-items: center; gap: 6px; width: 100%; color: var(--txt2); }
                .pf-url input, .pf-mm { flex: 1; min-width: 0; height: 30px; padding: 0 8px; background: var(--bg0); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--txt0); font: inherit; font-size: 13px; }
                .pf-mm { flex: 0 0 58px; text-align: center; }
                .pf-range { width: 100%; accent-color: var(--ui-accent-hover, #58a6ff); }
                .pf-select { height: 28px; background: var(--bg0); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--txt0); font: inherit; font-size: 13px; padding: 0 6px; }
                .pf-banner svg { vertical-align: -2px; }
                .pf-count { display: flex; align-items: center; gap: 6px; min-width: 0; }
                .pf-count .ce-btn { display: inline-flex; align-items: center; padding: 0 10px; }
                .pf-count .primary { margin-left: auto; }
                .pf-tools { display: grid; grid-template-columns: 1fr auto 1fr; gap: 6px; }
                .pf-tools .ce-btn { display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: 0 8px; min-width: 0; white-space: nowrap; }
                .pf-zoom { position: absolute; right: 18px; bottom: 18px; z-index: 1; display: flex; flex-direction: column; gap: 6px; }
                .pf-zoom button { width: 36px; height: 36px; display: grid; place-items: center; border-radius: var(--radius-md); border: 1px solid var(--border2); background: rgba(13,17,23,.85); color: var(--txt0); cursor: pointer; }
                .pf-zoom button:hover:not(:disabled) { background: var(--ui-neutral-hover); }
                .pf-zoom button:disabled { opacity: .4; cursor: default; }
                .pf-banner { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 1; background: #f0883e; color: #111; font-weight: 700; font-size: var(--fs-sm); padding: 6px 12px; border-radius: 8px; pointer-events: none; }
                .pf-wide { width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
                .pf-lbl { font-size: var(--fs-xs); color: var(--txt1); }
                .pf-note { color: var(--grn, #3fb950); }
                .pf-count .pf-n { width: 64px; flex: 0 0 64px; height: 30px; padding: 0 4px; text-align: center; background: var(--bg0); border: 1px solid var(--border); border-radius: 7px; color: var(--txt0); font-family: inherit; font-size: 14px; font-weight: 700; -moz-appearance: textfield; }
                .pf-modal .ce-btn { white-space: nowrap; }
                .pf-check { display: flex; align-items: center; gap: 6px; font-size: var(--fs-sm); color: var(--txt0); cursor: pointer; }
                .pf-warn { color: var(--orange, #d29922); }
                .pf-tips-open { border-bottom: 0 !important; }
                .pf-tiplist { margin: 0; padding-left: 16px; font-size: var(--fs-xs); color: var(--txt2); line-height: 1.5; }
                .pf-head { gap: 14px; }
                .pf-titles { display: flex; flex-direction: column; min-width: 0; line-height: 1.15; }
                .pf-titles h3 { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .pf-kind { font-size: var(--fs-xs); color: var(--txt2); }
                .pf-steps { display: flex; align-items: center; gap: 4px; margin: 0 auto; padding: 0; list-style: none; }
                .pf-steps li { display: flex; align-items: center; }
                .pf-steps li + li::before { content: ''; width: 22px; height: 1px; background: var(--border2); margin-right: 4px; }
                .pf-steps button, .pf-steps span { display: inline-flex; align-items: center; gap: 7px; height: 28px; padding: 0 12px 0 4px; border-radius: 14px; border: 1px solid transparent; background: none; color: var(--txt2); font: inherit; font-size: var(--fs-sm); font-weight: 600; }
                .pf-steps b { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; background: var(--bg3, #21262d); color: var(--txt1); }
                .pf-steps .on button, .pf-steps .on span { color: var(--txt0); border-color: var(--border2); background: var(--bg2); }
                .pf-steps .on b { background: var(--ui-accent); color: #fff; }
                .pf-steps .done button { cursor: pointer; color: var(--txt1); }
                .pf-steps .done button:hover { color: var(--txt0); background: var(--ui-neutral-hover); }
                .pf-steps .done b { background: rgba(63,185,80,.2); color: var(--grn, #3fb950); }
                .pf-steps button:disabled { cursor: default; }
                .pf-title { display: flex; align-items: center; gap: 8px; font-size: var(--fs-sm); font-weight: 700; color: var(--txt0); }
                .pf-num { width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; font-size: 10px; background: var(--bg3, #21262d); color: var(--txt1); flex: none; }
                .pf-val { margin-left: auto; font-size: var(--fs-xs); font-weight: 500; color: var(--txt2); font-variant-numeric: tabular-nums; text-align: right; }
                .pf-keys { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; font-size: var(--fs-xs); color: var(--txt1); }
                .pf-keys li::before { content: '·'; margin-right: 6px; color: var(--txt2); }
                .pf-keys b { color: var(--txt0); font-weight: 600; }
                .pf-turn { display: flex; align-items: center; gap: 8px; }
                .pf-turn .ce-btn { flex: none; width: 34px; padding: 0; display: grid; place-items: center; }
                .pf-grow { flex: 1; }
                .pf-side section.pf-foot { border-bottom: 0; border-top: 1px solid var(--border); }
                .pf-foot .pf-row .ce-btn { flex: 1; justify-content: center; }
                .pf-tips summary { cursor: pointer; font-size: var(--fs-xs); color: var(--txt2); padding: 2px 0; }
                .pf-tips summary:hover { color: var(--txt1); }
                .pf-tips[open] summary { margin-bottom: 6px; }
                .pf-banner.soft { top: auto; bottom: 14px; max-width: calc(100% - 120px); background: rgba(13,17,23,.82); color: var(--txt1); font-weight: 500; border: 1px solid var(--border2); backdrop-filter: blur(4px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .ce-btn:disabled { opacity: .5; cursor: default; }
                .spin { animation: pfspin 1s linear infinite; }
                @keyframes pfspin { to { transform: rotate(360deg); } }
                @media (max-width: 768px) {
                    .pf-modal { width: 100vw; height: 100dvh; max-height: none; border-radius: 0; border: 0; }
                    .pf-body { display: flex; flex-direction: column; overflow-y: auto; }
                    .pf-view { flex: none; height: 58dvh; position: sticky; top: 0; z-index: 2; }
                    .pf-view > svg { inset: 4px; width: calc(100% - 8px); height: calc(100% - 8px); }
                    .pf-zoom { right: 10px; bottom: 10px; }
                    .pf-zoom button { width: 42px; height: 42px; }
                    .pf-side { border-left: 0; overflow: visible; }
                    .pf-side section { padding: 10px 12px; gap: 8px; }
                    .pf-side .ce-btn { min-height: 40px; }
                    .pf-count .pf-n, .pf-mm, .pf-select { height: 40px; }
                    .pf-tips { display: none !important; }
                    .ce-size, .pf-kind { display: none; }
                    .pf-head { gap: 8px; }
                    .pf-steps button, .pf-steps span { padding: 0 3px; font-size: 0; gap: 0; height: 26px; }
                    .pf-steps li + li::before { width: 10px; }
                    .pf-banner.soft { white-space: normal; width: max-content; max-width: 90%; text-align: center; font-size: var(--fs-xs); }
                    .pf-modal .ce-head { padding: 8px 10px; gap: 8px; }
                    .pf-modal .ce-head > svg { display: none; }
                    .pf-modal .ce-head h3 { font-size: var(--fs-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
                    .pf-modal .ce-head-actions { flex: none; }
                    .pf-modal .ce-head .ce-btn { min-height: 36px; padding: 0 12px; }
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
    // pins that don't look like each other (scored against the others only) give no look to
    // search for: anything would match by chance. Real header pins score ~0.6, a row of
    // mixed board spots ~0.2.
    if (ps.length >= 3) {
        const loo = ps.map(p => {
            let s = 0, n = 0;
            for (let i = 0; i < T.length; i++) { const t = T[i] - p[i]; s += p[i] * t; n += t * t; }
            return s / (Math.sqrt(n) || 1);
        }).sort((a, b) => a - b);
        if (loo[Math.floor(loo.length / 2)] < 0.45) return { pins, added: 0, unlike: true };
    }
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

// How many pins between two clicked pins. First by look: for each count the in-between
// positions must look like the two clicked pins (patch correlation, as findSimilar). A count
// with half the true pitch puts every other position on a gap and loses; one with double the
// pitch matches just as well, so the largest count that is nearly as good as the best wins.
// maxN keeps the pitch plausible for the frame (a part is not 100 holes wide). When nothing
// in between looks like a pin (a module with pads only at the corners), the profile decides.
function guessCount(pix, a, b, maxN = 80) {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!pix || d < 8) return 2;
    const top = Math.max(3, Math.min(80, maxN, Math.floor(d / 6) + 1));
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const scores = [];
    for (let n = 3; n <= top; n++) {
        const g = { pitch: d / (n - 1), angle, phaseX: a[0], phaseY: a[1] };
        const p0 = patch(pix, g, 0, 0), p1 = patch(pix, g, n - 1, 0);
        if (!p0 || !p1) continue;
        const T = p0.map((v, i) => v + p1[i]), tn = Math.sqrt(T.reduce((s, x) => s + x * x, 0)) || 1;
        let s = 0, m = 0;
        for (let i = 1; i < n - 1; i++) {
            const p = patch(pix, g, i, 0);
            if (!p) continue;
            let c = 0;
            for (let k = 0; k < T.length; k++) c += p[k] * T[k];
            s += c / tn; m++;
        }
        if (m) scores.push([n, s / m]);
    }
    const best = Math.max(0, ...scores.map(q => q[1]));
    if (best >= 0.45) {
        let n = 2;
        for (const [k, s] of scores) if (s >= best * 0.85) n = Math.max(n, k);
        return n;
    }
    // a perfboard or header in the photo repeats at the pitch everywhere
    const P = backgroundPitch(pix, angle, d / (top - 1), d / 2);
    if (P) return Math.max(2, Math.min(top, Math.round(d / P) + 1));
    return Math.min(top, profileCount(pix, a, b));
}

// The pitch of whatever repeats along this direction across the whole photo (perfboard holes,
// a pin header): mean autocorrelation of many parallel lines, the shortest lag that peaks
// nearly as high as the strongest peak (whole multiples peak too). null if nothing repeats.
function backgroundPitch(pix, angle, minLag, maxLag) {
    const { data, width: W, height: H } = pix;
    const ux = Math.cos(angle), uy = Math.sin(angle), S = Math.min(W, H), L = Math.floor(S * 0.9);
    const lo = Math.max(4, Math.floor(minLag)), hi = Math.min(Math.floor(maxLag), Math.floor(L / 3));
    if (hi <= lo + 2) return null;
    const ac = new Float64Array(hi + 2);
    let v0 = 0;
    const prof = new Float32Array(L);
    for (let k = 0; k < 40; k++) {
        const off = (k / 39 - 0.5) * 0.9 * S;
        const x0 = W / 2 - ux * L / 2 - uy * off, y0 = H / 2 - uy * L / 2 + ux * off;
        let mean = 0;
        for (let i = 0; i < L; i++) {
            const x = Math.round(x0 + ux * i), y = Math.round(y0 + uy * i);
            const q = (Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4;
            prof[i] = 0.299 * data[q] + 0.587 * data[q + 1] + 0.114 * data[q + 2];
            mean += prof[i];
        }
        mean /= L;
        for (let i = 0; i < L; i++) { prof[i] -= mean; v0 += prof[i] * prof[i] / L; }
        for (let lag = lo - 1; lag <= hi + 1; lag++) {
            let s = 0;
            for (let i = 0; i + lag < L; i++) s += prof[i] * prof[i + lag];
            ac[lag] += s / (L - lag);
        }
    }
    if (!v0) return null;
    const peaks = [];
    for (let lag = lo; lag <= hi; lag++) {
        const v = ac[lag] / v0;
        if (v > 0.2 && ac[lag] >= ac[lag - 1] && ac[lag] >= ac[lag + 1]) peaks.push([lag, v]);
    }
    if (!peaks.length) return null;
    const top = Math.max(...peaks.map(q => q[1]));
    const [lag] = peaks.find(q => q[1] >= top * 0.75);
    // refine to sub-pixel with a parabola through the peak
    const y0 = ac[lag - 1], y1 = ac[lag], y2 = ac[lag + 1], den = y0 - 2 * y1 + y2;
    return lag + (den ? 0.5 * (y0 - y2) / den : 0);
}

// The profile along the line repeats every pitch: for each count, its autocorrelation at one,
// two, three pitches (pins over pins); a wrong count lands pins on gaps.
function profileCount(pix, a, b) {
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
    // output pixel -> image: P = holeAt(corner) + R(angle) · (pitch/S · x, pitch·ky/S · y); draw
    // with the inverse
    const k = S / grid.pitch, ky = k / (grid.ky || 1), cs = Math.cos(grid.angle || 0), sn = Math.sin(grid.angle || 0);
    const [tx, ty] = holeAt(grid, body.x - 0.5, body.y - 0.5);
    const a = k * cs, b = -ky * sn, cc = k * sn, d = ky * cs;
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

function Tips({ title = true }) {
    return (
        <>
            {title && <div className="ce-label">Good photos</div>}
            <ul className="pf-tiplist">
                <li>Straight from above, not at an angle.</li>
                <li>The whole part in the picture, pins in focus.</li>
                <li>Something with 2.54 mm pitch in view (a pin header, perfboard) sets the scale; otherwise type the part's width.</li>
                <li>Modules with pin headers: the side where the pins or holes are clearest (often the underside).</li>
            </ul>
        </>
    );
}
