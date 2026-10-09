import React, { useState, useEffect, useRef } from 'react';
import { Camera, Minus, Plus, FlipHorizontal2, RotateCcw, Loader2, Ruler } from 'lucide-react';
import { bodyHoles } from '../engine/photo-footprint.js';

const MAX_SIDE = 1600; // photos are scaled down to this before detection

// Footprint from a photo: runs the detection in a worker, shows the straightened photo with the
// hole grid and the found pins on top, and lets the user fix what the detection got wrong
// (drag = move the grid, click = toggle a pin, +/- = pitch, or measure: click the first and last
// pin of a row and say how many pins that is) before the pins go to the editor.
// Grid: hole (c, r) sits at origin + pitch·R(angle)·(c, r) in the straightened photo.
const holeAt = (g, c, r) => {
    const cs = Math.cos(g.angle || 0), sn = Math.sin(g.angle || 0);
    return [g.phaseX + g.pitch * (c * cs - r * sn), g.phaseY + g.pitch * (c * sn + r * cs)];
};
const holeOf = (g, x, y) => {
    const cs = Math.cos(g.angle || 0), sn = Math.sin(g.angle || 0), dx = (x - g.phaseX) / g.pitch, dy = (y - g.phaseY) / g.pitch;
    return [Math.round(dx * cs + dy * sn), Math.round(-dx * sn + dy * cs)];
};
export function PhotoFootprintOverlay({ file, onCancel, onApply }) {
    const [state, setState] = useState({ status: 'loading' }); // loading | ready | error
    const [grid, setGrid] = useState(null); // { pitch, phaseX, phaseY }
    const [pins, setPins] = useState([]);   // [[col, row]]
    const [mirror, setMirror] = useState(false);
    const [drag, setDrag] = useState(null);
    const [measure, setMeasure] = useState(null); // null | { a } waiting for 2nd click | { a, b, n } asking for the pin count
    const svgRef = useRef(null);

    useEffect(() => {
        let alive = true;
        const worker = new Worker(new URL('../engine/photo.worker.js', import.meta.url), { type: 'module' });
        (async () => {
            try {
                const bmp = await createImageBitmap(file);
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
                    setState({ status: 'ready', url: c.toDataURL('image/jpeg', 0.88), W: res.image.width, H: res.image.height, bodyPx: res.bodyPx, found,
                        reason: found ? null : res.ok ? 'Not sure where the pins are.' : res.reason, auto: { ...g, pins: autoPins } });
                };
                worker.postMessage({ data: img.data, width: img.width, height: img.height }, [img.data.buffer]);
            } catch (err) {
                if (alive) setState({ status: 'error', reason: 'Could not read this image (' + (err?.message || err) + ')' });
            }
        })();
        return () => { alive = false; worker.terminate(); };
    }, [file]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onCancel]);

    const toImage = (e) => {
        const ctm = svgRef.current?.getScreenCTM();
        if (!ctm) return null;
        return new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    };

    const onPointerDown = (e) => {
        const p = toImage(e);
        if (!p || !grid) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        setDrag({ x: p.x, y: p.y, sx: e.clientX, sy: e.clientY, g: grid, moved: false });
    };
    const onPointerMove = (e) => {
        if (!drag) return;
        const moved = drag.moved || Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4;
        if (!moved) return;
        const p = toImage(e);
        if (!p) return;
        setDrag({ ...drag, moved: true });
        setGrid({ ...drag.g, phaseX: drag.g.phaseX + p.x - drag.x, phaseY: drag.g.phaseY + p.y - drag.y });
        if (measure) setMeasure(null);
    };
    const onPointerUp = (e) => {
        if (!drag) return;
        if (!drag.moved) {
            const p = toImage(e);
            if (p && measure && !measure.b) {
                if (!measure.a) setMeasure({ a: [p.x, p.y] });
                else {
                    const b = [p.x, p.y], d = Math.hypot(b[0] - measure.a[0], b[1] - measure.a[1]);
                    const n = Math.max(2, Math.round(d / grid.pitch) + 1);
                    setMeasure({ ...measure, b, n });
                    applyMeasure(measure.a, b, n);
                }
            } else if (p && !measure) {
                const [c, r] = holeOf(grid, p.x, p.y);
                setPins(prev => prev.some(([a, b]) => a === c && b === r) ? prev.filter(([a, b]) => a !== c || b !== r) : [...prev, [c, r]]);
            }
        }
        setDrag(null);
    };

    // change the pitch, keeping the middle of the pins where it is
    const scale = (f) => setGrid(g => {
        const mc = pins.length ? pins.reduce((s, p) => s + p[0], 0) / pins.length : 0;
        const mr = pins.length ? pins.reduce((s, p) => s + p[1], 0) / pins.length : 0;
        const [x, y] = holeAt(g, mc, mr), g2 = { ...g, pitch: g.pitch * f };
        const [x2, y2] = holeAt(g2, mc, mr);
        return { ...g2, phaseX: g.phaseX + x - x2, phaseY: g.phaseY + y - y2 };
    });

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
    const rows = new Set(pins.map(p => p[1])).size;

    const apply = () => {
        if (!pins.length) return;
        let ps = pins.map(([c, r]) => [c - body.x, r - body.y]);
        let b = { x: 0, y: 0, w: body.w, h: body.h };
        // an underside photo shows the footprint mirrored
        if (mirror) ps = ps.map(([c, r]) => [b.w - 1 - c, r]);
        ps.sort((p, q) => p[1] - q[1] || p[0] - q[0]);
        onApply({ pins: ps, body: b });
    };

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
        <div className="overlay-bg pf-bg" onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
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
                    <div className="pf-view">
                        {state.status === 'loading' && <div className="pf-msg"><Loader2 size={22} className="spin" /> Finding pins…</div>}
                        {state.status === 'error' && <div className="pf-msg err">{state.reason}<Tips /></div>}
                        {ready && measure && !measure.b && <div className="pf-banner">{measure.a ? 'Now click the centre of the last pin of that row' : 'Click the centre of the first pin of a row'}</div>}
                        {ready && (
                            <svg ref={svgRef} viewBox={`0 0 ${state.W} ${state.H}`} preserveAspectRatio="xMidYMid meet"
                                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
                                style={{ cursor: drag?.moved ? 'grabbing' : 'crosshair' }}>
                                <image href={state.url} x="0" y="0" width={state.W} height={state.H} />
                                <rect x={grid.phaseX + (body.x - 0.5) * grid.pitch} y={grid.phaseY + (body.y - 0.5) * grid.pitch}
                                    width={body.w * grid.pitch} height={body.h * grid.pitch}
                                    transform={`rotate(${(grid.angle || 0) * 180 / Math.PI} ${grid.phaseX} ${grid.phaseY})`}
                                    fill="none" stroke="#58a6ff" strokeWidth={Math.max(2, grid.pitch / 18)} strokeDasharray={`${grid.pitch / 4} ${grid.pitch / 6}`} />
                                {holes.map(([c, r, x, y]) => (
                                    <circle key={c + ',' + r} cx={x} cy={y} r={grid.pitch * 0.07}
                                        fill="rgba(255,255,255,.55)" stroke="rgba(0,0,0,.5)" strokeWidth={grid.pitch / 40} />
                                ))}
                                {pins.map(([c, r]) => { const [x, y] = holeAt(grid, c, r); return (
                                    <circle key={'p' + c + ',' + r} cx={x} cy={y} r={grid.pitch * 0.36}
                                        fill="rgba(63,185,80,.18)" stroke="#3fb950" strokeWidth={Math.max(2, grid.pitch / 14)} />
                                ); })}
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
                                {ready && !state.found ? <b className="pf-warn">{state.reason || 'No pins found.'} Measure with two pins, mark them by hand or try another photo. </b> : null}
                                Every pin needs a green ring. <b>Click</b> a hole to add or remove a pin, <b>drag</b> to move the grid onto the pins.
                            </p>
                        </section>
                        <section>
                            <div className="ce-label">Scale from two pins</div>
                            {!measure && <button className="ce-btn pf-wide" disabled={!ready} onClick={() => setMeasure({})}><Ruler size={14} /> Click first and last pin of a row</button>}
                            {measure && !measure.b && <button className="ce-btn pf-wide" onClick={() => setMeasure(null)}>Cancel measuring</button>}
                            {measure?.b && (
                                <div className="pf-row">
                                    <span className="pf-lbl">Pins in that row</span>
                                    <button className="ce-btn" onClick={() => { const n = Math.max(2, measure.n - 1); setMeasure({ ...measure, n }); applyMeasure(measure.a, measure.b, n); }}><Minus size={14} /></button>
                                    <input className="pf-n" type="number" min="2" max="80" value={measure.n} aria-label="Pins in that row"
                                        onChange={e => { const n = Math.max(2, Math.min(80, Math.round(+e.target.value) || 2)); setMeasure({ ...measure, n }); applyMeasure(measure.a, measure.b, n); }} />
                                    <button className="ce-btn" onClick={() => { const n = measure.n + 1; setMeasure({ ...measure, n }); applyMeasure(measure.a, measure.b, n); }}><Plus size={14} /></button>
                                    <button className="ce-btn" onClick={() => setMeasure(null)}>Done</button>
                                </div>
                            )}
                            <p className="ce-hint">Most reliable: the pins of a header are 2.54 mm apart, so two clicked pins and their count give the exact scale and angle.</p>
                        </section>
                        <section>
                            <div className="ce-label">Grid spacing</div>
                            <div className="pf-row">
                                <button className="ce-btn" onClick={() => scale(1 / 1.005)} disabled={!ready} title="Smaller grid"><Minus size={14} /></button>
                                <span className="pf-val">{ready ? grid.pitch.toFixed(1) : '–'} px</span>
                                <button className="ce-btn" onClick={() => scale(1.005)} disabled={!ready} title="Larger grid"><Plus size={14} /></button>
                            </div>
                            <p className="ce-hint">Pins are 2.54 mm apart, so the grid spacing is the photo's scale. Adjust it until the rings sit on the pins at both ends of a row.</p>
                        </section>
                        <section>
                            <label className="pf-check"><input type="checkbox" checked={mirror} onChange={e => setMirror(e.target.checked)} /> <FlipHorizontal2 size={14} /> Photo shows the underside</label>
                            <p className="ce-hint">The solder side is the mirror image of the top; this flips it back.</p>
                            <div className="pf-row">
                                <button className="ce-btn" disabled={!ready} onClick={() => { setMeasure(null); setGrid({ angle: 0, pitch: state.auto.pitch, phaseX: state.auto.phaseX, phaseY: state.auto.phaseY }); setPins(state.auto.pins); }}><RotateCcw size={13} /> Undo my changes</button>
                                <button className="ce-btn" disabled={!ready || !pins.length} onClick={() => setPins([])}>Clear pins</button>
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
                .pf-side { border-left: 1px solid var(--border); display: flex; flex-direction: column; min-height: 0; overflow-y: auto; background: var(--bg2); }
                .pf-side section { padding: 12px 14px; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px; }
                .pf-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
                .pf-row .ce-btn { display: inline-flex; align-items: center; gap: 5px; padding: 0 10px; }
                .pf-val { font-family: ui-monospace, Consolas, monospace; font-size: var(--fs-sm); color: var(--txt0); min-width: 70px; text-align: center; }
                .pf-banner { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 1; background: #f0883e; color: #111; font-weight: 700; font-size: var(--fs-sm); padding: 6px 12px; border-radius: 8px; pointer-events: none; }
                .pf-wide { width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
                .pf-lbl { font-size: var(--fs-xs); color: var(--txt1); margin-right: auto; }
                .pf-n { width: 52px; height: 30px; text-align: center; background: var(--bg0); border: 1px solid var(--border); border-radius: 7px; color: var(--txt0); font: inherit; font-size: 13px; font-weight: 700; }
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
