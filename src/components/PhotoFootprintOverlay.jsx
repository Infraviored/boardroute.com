import React, { useState, useEffect, useRef } from 'react';
import { Camera, Minus, Plus, FlipHorizontal2, RotateCcw, Loader2, Ruler, Rows3, ClipboardPaste, Link2, ImageUp, Undo2 } from 'lucide-react';
import { bodyHoles } from '../engine/photo-footprint.js';

const MAX_SIDE = 1600; // photos are scaled down to this before detection

// Footprint from a photo: runs the detection in a worker, shows the straightened photo with the
// hole grid and the found pins on top, and lets the user fix what the detection got wrong
// (drag = move the grid, click = toggle a pin; measure: click the first and last pin of a row
// and say how many pins that is; mark another row: two clicks on the grid) before the pins go to
// the editor. The photo comes from a file/camera, the clipboard (Ctrl+V), drag & drop or a URL.
// Grid: hole (c, r) sits at origin + pitch·R(angle)·(c, r) in the straightened photo.
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
export function PhotoFootprintOverlay({ file = null, onCancel, onApply, hidden = false }) {
    const [src, setSrc] = useState(file); // the photo (Blob); null = ask for one
    const [state, setState] = useState({ status: file ? 'loading' : 'pick' }); // pick | loading | ready | error
    const [grid, setGrid] = useState(null); // { pitch, phaseX, phaseY }
    const [pins, setPins] = useState([]);   // [[col, row]]
    const [mirror, setMirror] = useState(false);
    const [box, setBox] = useState(null);       // body set by hand: { x0, y0, x1, y1 } in holes; null = from the photo
    const [keepPhoto, setKeepPhoto] = useState(true); // the cut-out photo becomes the part's picture
    const [drag, setDrag] = useState(null);
    // null | { kind: 'scale' | 'row', a?, b?, n? }: 'scale' sets the grid from two pins and a
    // count, 'row' adds the pins between two clicked holes on the current grid
    const [measure, setMeasure] = useState(null);
    const [url, setUrl] = useState('');
    const [over, setOver] = useState(false); // a file dragged over the dialog
    const [hist, setHist] = useState([]);    // undo: earlier { grid, pins }
    const snap = () => setHist(h => [...h.slice(-49), { grid, pins, box }]);
    const undo = () => setHist(h => {
        if (!h.length) return h;
        const last = h[h.length - 1];
        setGrid(last.grid); setPins(last.pins); setBox(last.box); setMeasure(null);
        return h.slice(0, -1);
    });
    const svgRef = useRef(null);

    const load = (blob) => {
        if (!blob || !/^image\//.test(blob.type || 'image/')) return;
        setMeasure(null); setMirror(false); setHist([]); setBox(null); setState({ status: 'loading' }); setSrc(blob);
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

    useEffect(() => {
        if (!src) return;
        let alive = true;
        const worker = new Worker(new URL('../engine/photo.worker.js', import.meta.url), { type: 'module' });
        (async () => {
            try {
                const bmp = await createImageBitmap(src);
                const f = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(bmp.width * f); canvas.height = Math.round(bmp.height * f);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
                const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
                worker.onmessage = (e) => {
                    if (!alive) return;
                    if (!e.data.ok) { setState({ status: 'error', reason: e.data.error }); return; }
                    const res = e.data.res;
                    if (!res.image) { setState({ status: 'error', reason: res.reason }); return; }
                    // the straightened part as a picture for the overlay
                    const c = document.createElement('canvas');
                    c.width = res.image.width; c.height = res.image.height;
                    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(res.image.data), res.image.width, res.image.height), 0, 0);
                    const pitch = res.pitch || Math.max(res.image.width, res.image.height) / 20;
                    const g = { angle: 0, pitch, phaseX: res.phaseX ?? res.bodyPx.x0 + pitch / 2, phaseY: res.phaseY ?? res.bodyPx.y0 + pitch / 2 };
                    // a believable result has at least one header-like line; otherwise start empty
                    // and let the user measure instead of cleaning up scattered rings
                    const found = res.ok && plausible(res.pins);
                    const autoPins = found ? res.pins : [];
                    setGrid(g);
                    setPins(autoPins);
                    setState({ status: 'ready', url: c.toDataURL('image/jpeg', 0.92), W: res.image.width, H: res.image.height, bodyPx: res.bodyPx, found, bg: borderColour(res.image),
                        reason: found ? null : res.ok ? 'Not sure where the pins are.' : res.reason, auto: { ...g, pins: autoPins } });
                };
                worker.postMessage({ data: img.data, width: img.width, height: img.height }, [img.data.buffer]);
            } catch (err) {
                if (alive) setState({ status: 'error', reason: 'Could not read this image (' + (err?.message || err) + ')' });
            }
        })();
        return () => { alive = false; worker.terminate(); };
    }, [src]);

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

    const onPointerDown = (e) => {
        const p = toImage(e);
        if (!p || !grid) return;
        const edge = e.target.getAttribute?.('data-edge');
        if (edge) {
            // a handle of the body outline: drag that edge
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
        if (drag.edge) {
            const p = toImage(e);
            if (!p) return;
            const [u, v] = gridOf(grid, p.x, p.y);
            // edges sit between holes; the body never gets smaller than the pins
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
        const moved = drag.moved || Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4;
        if (!moved) return;
        const p = toImage(e);
        if (!p) return;
        if (!drag.moved) snap();
        setDrag({ ...drag, moved: true });
        setGrid({ ...drag.g, phaseX: drag.g.phaseX + p.x - drag.x, phaseY: drag.g.phaseY + p.y - drag.y });
        if (measure) setMeasure(null);
    };
    const onPointerUp = (e) => {
        if (!drag) return;
        if (drag.edge) { setDrag(null); return; }
        if (!drag.moved) {
            const p = toImage(e);
            if (p && measure && !measure.b) {
                if (!measure.a) setMeasure({ ...measure, a: [p.x, p.y] });
                else if (measure.kind === 'row') { snap(); addRow(measure.a, [p.x, p.y]); setMeasure(null); }
                else {
                    snap();
                    const b = [p.x, p.y], d = Math.hypot(b[0] - measure.a[0], b[1] - measure.a[1]);
                    const n = Math.max(2, Math.round(d / grid.pitch) + 1);
                    setMeasure({ ...measure, b, n });
                    applyMeasure(measure.a, b, n);
                }
            } else if (p && !measure) {
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

    const setCount = (n) => { n = Math.max(2, Math.min(80, n)); setMeasure(m => ({ ...m, n, text: null })); applyMeasure(measure.a, measure.b, n); };
    // typing: keep the text as typed ("1" on the way to "14") and apply once it is a valid count
    const typeCount = (text) => {
        setMeasure(m => ({ ...m, text }));
        const n = parseInt(text, 10);
        if (n >= 2 && n <= 80) { setMeasure(m => ({ ...m, n, text })); applyMeasure(measure.a, measure.b, n); }
    };

    // Two clicked pins n pins apart define the grid exactly: spacing, angle and position.
    // The row between them becomes pins (it almost always is a header).
    function applyMeasure(a, b, n) {
        const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
        let ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        // the row may run along x or y: keep the angle within ±45°, the row then is a column
        const quarter = Math.round(ang / (Math.PI / 2));
        ang -= quarter * Math.PI / 2;
        const g = { pitch: d / (n - 1), angle: ang, phaseX: a[0], phaseY: a[1] };
        setGrid(g);
        setBox(null);
        const steps = [[1, 0], [0, 1], [-1, 0], [0, -1]][((quarter % 4) + 4) % 4];
        setPins(Array.from({ length: n }, (_, i) => [steps[0] * i, steps[1] * i]));
    }

    const ready = state.status === 'ready' && grid;
    // body: the part's outline in grid coordinates (exact when the grid is not turned)
    const body = ready ? bodyHoles(state.bodyPx, grid.pitch, grid.phaseX, grid.phaseY, pins) : null;
    if (body && grid.angle) {
        const cs = [[state.bodyPx.x0, state.bodyPx.y0], [state.bodyPx.x1, state.bodyPx.y0], [state.bodyPx.x0, state.bodyPx.y1], [state.bodyPx.x1, state.bodyPx.y1]]
            .map(([x, y]) => { const cs_ = Math.cos(grid.angle), sn = Math.sin(grid.angle), dx = (x - grid.phaseX) / grid.pitch, dy = (y - grid.phaseY) / grid.pitch; return [dx * cs_ + dy * sn, -dx * sn + dy * cs_]; });
        let x0 = Math.ceil(Math.min(...cs.map(c => c[0])) - 0.2), x1 = Math.floor(Math.max(...cs.map(c => c[0])) + 0.2);
        let y0 = Math.ceil(Math.min(...cs.map(c => c[1])) - 0.2), y1 = Math.floor(Math.max(...cs.map(c => c[1])) + 0.2);
        for (const [c, r] of pins) { x0 = Math.min(x0, c); x1 = Math.max(x1, c); y0 = Math.min(y0, r); y1 = Math.max(y1, r); }
        Object.assign(body, { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
    }
    // a body drawn by hand wins (still around all pins)
    if (body && box) {
        let { x0, y0, x1, y1 } = box;
        for (const [c, r] of pins) { x0 = Math.min(x0, c); x1 = Math.max(x1, c); y0 = Math.min(y0, r); y1 = Math.max(y1, r); }
        Object.assign(body, { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
    }
    const rows = new Set(pins.map(p => p[1])).size;

    const apply = async () => {
        if (!pins.length) return;
        let ps = pins.map(([c, r]) => [c - body.x, r - body.y]);
        let b = { x: 0, y: 0, w: body.w, h: body.h };
        // an underside photo shows the footprint mirrored
        if (mirror) ps = ps.map(([c, r]) => [b.w - 1 - c, r]);
        ps.sort((p, q) => p[1] - q[1] || p[0] - q[0]);
        let image = null;
        if (keepPhoto) {
            try { image = { src: await cutOut(state, grid, body, mirror), x: 0, y: 0, w: body.w, h: body.h }; } catch (err) { console.error(err); }
        }
        onApply({ pins: ps, body: b, image });
    };

    // body outline corners and edge handles in image coordinates (the grid may be turned)
    const outline = ready ? [[body.x - 0.5, body.y - 0.5], [body.x + body.w - 0.5, body.y - 0.5], [body.x + body.w - 0.5, body.y + body.h - 0.5], [body.x - 0.5, body.y + body.h - 0.5]].map(([c, r]) => holeAt(grid, c, r)) : null;
    const handles = ready ? [['l', body.x - 0.5, body.y + (body.h - 1) / 2], ['r', body.x + body.w - 0.5, body.y + (body.h - 1) / 2],
        ['t', body.x + (body.w - 1) / 2, body.y - 0.5], ['b', body.x + (body.w - 1) / 2, body.y + body.h - 0.5]].map(([e, c, r]) => [e, ...holeAt(grid, c, r)]) : null;

    // every grid hole that lands on the photo
    let holes = null;
    if (ready) {
        const corners = [[0, 0], [state.W, 0], [0, state.H], [state.W, state.H]].map(([x, y]) => holeOf(grid, x, y));
        const c0 = Math.min(...corners.map(c => c[0])) - 1, c1 = Math.max(...corners.map(c => c[0])) + 1;
        const r0 = Math.min(...corners.map(c => c[1])) - 1, r1 = Math.max(...corners.map(c => c[1])) + 1;
        holes = [];
        if ((c1 - c0) * (r1 - r0) < 20000) {
            for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
                const [x, y] = holeAt(grid, c, r);
                if (x > -grid.pitch && y > -grid.pitch && x < state.W + grid.pitch && y < state.H + grid.pitch) holes.push([c, r, x, y]);
            }
        }
    }

    return (
        <div className="overlay-bg pf-bg" style={hidden ? { display: 'none' } : undefined} onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
            <div className="modal pf-modal" role="dialog" aria-label="Footprint from a photo">
                <header className="ce-head">
                    <Camera size={16} className="icon-accent" />
                    <h3>Footprint from a photo</h3>
                    {ready && <span className="ce-size">{pins.length} pins{rows ? ` in ${rows} row${rows === 1 ? '' : 's'}` : ''} · {body.w} × {body.h} holes · {(body.w * 2.54).toFixed(1)} × {(body.h * 2.54).toFixed(1)} mm</span>}
                    <div className="ce-head-actions">
                        <button className="ce-btn" onClick={onCancel}>Cancel</button>
                        <button className="ce-btn primary" onClick={apply} disabled={!ready || !pins.length}>Use footprint</button>
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
                                <span>Straight from above, on white paper. Drop it here, paste it (Ctrl+V) or:</span>
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
                        {state.status === 'loading' && <div className="pf-msg"><Loader2 size={22} className="spin" /> Finding pins…</div>}
                        {state.status === 'error' && <div className="pf-msg err">{state.reason}<Tips /></div>}
                        {ready && measure && !measure.b && <div className="pf-banner">{measure.a ? 'Now click the last pin of that row' : 'Click the first pin of a row'}</div>}
                        {ready && (
                            <svg ref={svgRef} viewBox={`0 0 ${state.W} ${state.H}`} preserveAspectRatio="xMidYMid meet"
                                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
                                style={{ cursor: drag?.moved ? 'grabbing' : 'crosshair' }}>
                                <image href={state.url} x="0" y="0" width={state.W} height={state.H} />
                                <polygon points={outline.map(p => p.join(',')).join(' ')}
                                    fill="none" stroke="#58a6ff" strokeWidth={Math.max(2, grid.pitch / 18)} strokeDasharray={`${grid.pitch / 4} ${grid.pitch / 6}`} />
                                {holes.map(([c, r, x, y]) => (
                                    <circle key={c + ',' + r} cx={x} cy={y} r={grid.pitch * 0.07}
                                        fill="rgba(255,255,255,.55)" stroke="rgba(0,0,0,.5)" strokeWidth={grid.pitch / 40} />
                                ))}
                                {pins.map(([c, r]) => { const [x, y] = holeAt(grid, c, r); return (
                                    <circle key={'p' + c + ',' + r} cx={x} cy={y} r={grid.pitch * 0.36}
                                        fill="rgba(63,185,80,.18)" stroke="#3fb950" strokeWidth={Math.max(2, grid.pitch / 14)} />
                                ); })}
                                {!measure && handles.map(([e, x, y]) => (
                                    <rect key={e} data-edge={e} x={x - grid.pitch * 0.22} y={y - grid.pitch * 0.22} width={grid.pitch * 0.44} height={grid.pitch * 0.44} rx={grid.pitch * 0.08}
                                        fill="#fff" stroke="#58a6ff" strokeWidth={Math.max(2, grid.pitch / 16)} style={{ cursor: e === 'l' || e === 'r' ? 'ew-resize' : 'ns-resize' }}>
                                        <title>Drag to change the part's outline</title>
                                    </rect>
                                ))}
                                {measure?.a && <circle cx={measure.a[0]} cy={measure.a[1]} r={Math.max(6, grid.pitch * 0.18)} fill="#f0883e" stroke="#fff" strokeWidth={2} />}
                                {measure?.b && <>
                                    <line x1={measure.a[0]} y1={measure.a[1]} x2={measure.b[0]} y2={measure.b[1]} stroke="#f0883e" strokeWidth={Math.max(2, grid.pitch / 16)} />
                                    <circle cx={measure.b[0]} cy={measure.b[1]} r={Math.max(6, grid.pitch * 0.18)} fill="#f0883e" stroke="#fff" strokeWidth={2} />
                                </>}
                            </svg>
                        )}
                    </div>

                    <aside className="pf-side">
                        <section>
                            <div className="ce-label">Check the result</div>
                            <p className="ce-hint">
                                {ready && !state.found ? <b className="pf-warn">{state.reason || 'No pins found.'} Measure one row below. </b> : null}
                                Every pin needs a green ring. <b>Drag</b> the photo to move the grid onto the pins.
                            </p>
                        </section>
                        <section>
                            <div className="ce-label">1 · Scale from one row</div>
                            {measure?.kind !== 'scale' && <button className="ce-btn pf-wide" disabled={!ready || !!measure} onClick={() => setMeasure({ kind: 'scale' })}><Ruler size={14} /> Click first and last pin of a row</button>}
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
                            <p className="ce-hint">Header pins are 2.54 mm apart: two clicked pins and their count set the grid exactly.</p>
                        </section>
                        <section>
                            <div className="ce-label">2 · More rows</div>
                            {measure?.kind !== 'row' && <button className="ce-btn pf-wide" disabled={!ready || !!measure} onClick={() => setMeasure({ kind: 'row' })}><Rows3 size={14} /> Mark another row</button>}
                            {measure?.kind === 'row' && <button className="ce-btn pf-wide" onClick={() => setMeasure(null)}>Cancel</button>}
                            <p className="ce-hint">Click its first and last pin; every hole between becomes a pin. Single pins: click a hole.</p>
                        </section>
                        <section>
                            <div className="ce-label">3 · Outline</div>
                            <p className="ce-hint">Drag the white handles of the blue outline to the edges of the part.</p>
                            <label className="pf-check"><input type="checkbox" checked={keepPhoto} onChange={e => setKeepPhoto(e.target.checked)} /> Use the photo as the part's picture</label>
                            <p className="ce-hint">Cut to the outline, the background made transparent.</p>
                        </section>
                        <section>
                            <label className="pf-check"><input type="checkbox" checked={mirror} onChange={e => setMirror(e.target.checked)} /> <FlipHorizontal2 size={14} /> Photo shows the underside</label>
                            <p className="ce-hint">The solder side is the mirror image of the top; this flips it back.</p>
                            <div className="pf-row">
                                <button className="ce-btn" disabled={!hist.length} onClick={undo} title="Ctrl+Z"><Undo2 size={13} /> Undo</button>
                                <button className="ce-btn" disabled={!ready} onClick={() => { snap(); setMeasure(null); setBox(null); setGrid({ angle: 0, pitch: state.auto.pitch, phaseX: state.auto.phaseX, phaseY: state.auto.phaseY }); setPins(state.auto.pins); }} title="Back to what was found automatically"><RotateCcw size={13} /> Reset</button>
                                <button className="ce-btn" disabled={!ready || !pins.length} onClick={() => { snap(); setPins([]); }}>Clear pins</button>
                                <button className="ce-btn" disabled={state.status === 'loading'} onClick={() => { setMeasure(null); setState({ status: 'pick' }); }}><ImageUp size={13} /> Other photo</button>
                            </div>
                        </section>
                        <section className="pf-tips"><Tips /></section>
                    </aside>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                .pf-bg { z-index: 1100; }
                .pf-modal { max-width: 1120px; width: calc(100% - 32px); height: min(720px, calc(100vh - 32px)); padding: 0; gap: 0; overflow: hidden; }
                .pf-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 280px; }
                .pf-view { position: relative; min-width: 0; min-height: 0; background: #080a0c; display: grid; place-items: center; }
                .pf-view > svg { position: absolute; inset: 12px; width: calc(100% - 24px); height: calc(100% - 24px); touch-action: none; user-select: none; }
                .pf-msg { color: var(--txt1); font-size: var(--fs-sm); display: flex; flex-direction: column; align-items: center; gap: 10px; max-width: 420px; text-align: center; padding: 16px; }
                .pf-msg.err { color: var(--red); }
                .pf-msg.err .pf-tiplist { color: var(--txt1); text-align: left; }
                .pf-side { border-left: 1px solid var(--border); display: flex; flex-direction: column; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--bg2); }
                .pf-side section { padding: 12px 14px; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px; }
                .pf-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
                .pf-row .ce-btn { display: inline-flex; align-items: center; gap: 5px; padding: 0 10px; }
                .pf-view.over { outline: 2px dashed var(--blu-bright); outline-offset: -8px; }
                .pf-pick { display: flex; flex-direction: column; align-items: center; gap: 10px; max-width: 440px; padding: 24px; text-align: center; color: var(--txt1); font-size: var(--fs-sm); }
                .pf-pick > svg { color: var(--txt2); }
                .pf-pick b { color: var(--txt0); font-size: var(--fs-md); }
                .pf-center { justify-content: center; }
                .pf-file { display: inline-flex; align-items: center; gap: 6px; line-height: 30px; cursor: pointer; }
                .pf-url { display: flex; align-items: center; gap: 6px; width: 100%; color: var(--txt2); }
                .pf-url input { flex: 1; min-width: 0; height: 30px; padding: 0 8px; background: var(--bg0); border: 1px solid var(--border); border-radius: 7px; color: var(--txt0); font: inherit; font-size: 13px; }
                .pf-count { display: flex; align-items: center; gap: 6px; min-width: 0; }
                .pf-count .ce-btn { display: inline-flex; align-items: center; padding: 0 10px; }
                .pf-count .primary { margin-left: auto; }
                .pf-banner { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 1; background: #f0883e; color: #111; font-weight: 700; font-size: var(--fs-sm); padding: 6px 12px; border-radius: 8px; pointer-events: none; }
                .pf-wide { width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
                .pf-lbl { font-size: var(--fs-xs); color: var(--txt1); }
                .pf-count .pf-n { width: 64px; flex: 0 0 64px; height: 30px; padding: 0 4px; text-align: center; background: var(--bg0); border: 1px solid var(--border); border-radius: 7px; color: var(--txt0); font-family: inherit; font-size: 14px; font-weight: 700; -moz-appearance: textfield; }
                .pf-count .pf-n::-webkit-inner-spin-button, .pf-count .pf-n::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
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
                    .pf-view { flex: none; height: 50dvh; position: sticky; top: 0; z-index: 2; }
                    .pf-side { border-left: 0; overflow: visible; }
                    .ce-size { display: none; }
                    .pf-modal .ce-head h3 { font-size: var(--fs-sm); }
                }
            ` }} />
        </div>
    );
}

// at least one row or column of 4+ pins, and not a carpet of rings
function plausible(pins) {
    if (!pins?.length || pins.length > 120) return false;
    const count = new Map();
    for (const [c, r] of pins) { count.set('r' + r, (count.get('r' + r) || 0) + 1); count.set('c' + c, (count.get('c' + c) || 0) + 1); }
    const lines = [...count.values()].filter(n => n >= 4);
    return lines.length > 0 && lines.length <= 8;
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

// The part as a picture: the straightened photo cut to the body outline (turned with the grid,
// mirrored for underside photos), the background that reaches in from the edge made transparent
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
                <li>On plain white paper, with a little room around the part.</li>
                <li>The whole part in the picture, pins in focus.</li>
                <li>Modules with pin headers: the side where the pins or holes are clearest (often the underside).</li>
            </ul>
        </>
    );
}
