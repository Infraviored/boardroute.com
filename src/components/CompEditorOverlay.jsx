import React, { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, Edit3 } from 'lucide-react';
import { SP, netColor, boostColor, compColor } from '../engine/render-utils.js';

// Footprint editor.
// Model: pins sit on integer holes (any coordinates while editing, normalised on save) and the
// body is either "auto" (exactly the box around the pins: a resistor grows when a pin is moved
// out) or a custom rectangle (relay, electrolytic, dev board) that is extended automatically
// whenever a pin is dragged outside it. The view always frames the whole part.
function fromComponent(component) {
    if (!component) return null;
    const c = JSON.parse(JSON.stringify(component));
    const pins = (c.pins || []).map(p => ({ lbl: p.lbl ?? '', net: p.net || '', dCol: p.dCol || 0, dRow: p.dRow || 0 }));
    const pb = boxOf(pins);
    // a body larger than the pins' box is a custom body
    const w = c.w || pb.w, h = c.h || pb.h;
    const custom = pins.length && (w > pb.x + pb.w || h > pb.y + pb.h || pb.x > 0 || pb.y > 0);
    return { id: c.id, name: c.name || '', value: c.value || '', color: c.color || null, routeUnder: c.routeUnder, pins,
        body: custom ? { x: 0, y: 0, w, h } : null };
}

function boxOf(pins) {
    if (!pins.length) return { x: 0, y: 0, w: 1, h: 1 };
    const xs = pins.map(p => p.dCol), ys = pins.map(p => p.dRow);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x + 1, h: Math.max(...ys) - y + 1 };
}
const union = (a, b) => {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

export function CompEditorOverlay({ component, isOpen, onClose, onSave, netNames = [], mode = 'edit' }) {
    const [data, setData] = useState(() => fromComponent(component));
    const [selectedPinIdx, setSelectedPinIdx] = useState(null);
    const [drag, setDrag] = useState(null); // { kind: 'pin', idx } | { kind: 'edge', edge: 'l'|'r'|'t'|'b' }
    const [frozenView, setFrozenView] = useState(null); // view box held still while dragging
    const svgRef = useRef(null);

    // Reset when the dialog (re)opens or gets another part (state adjusted during render).
    const [openedFor, setOpenedFor] = useState({ component, isOpen });
    if (openedFor.component !== component || openedFor.isOpen !== isOpen) {
        setOpenedFor({ component, isOpen });
        if (component && isOpen) { setData(fromComponent(component)); setSelectedPinIdx(null); }
    }

    // Keyboard: arrows move the selected pin, Delete removes it (not while typing).
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e) => {
            const tag = document.activeElement?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            if (e.key === 'Escape') { onClose(); return; }
            if (selectedPinIdx === null) return;
            const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
            if (d) { e.preventDefault(); setData(prev => movePin(prev, selectedPinIdx, prev.pins[selectedPinIdx].dCol + d[0], prev.pins[selectedPinIdx].dRow + d[1])); }
            else if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                setData(prev => ({ ...prev, pins: prev.pins.filter((_, i) => i !== selectedPinIdx) }));
                setSelectedPinIdx(null);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    if (!isOpen || !data) return null;

    const pinBox = boxOf(data.pins);
    const bodyBox = data.body ? data.body : pinBox;
    const foot = union(pinBox, bodyBox);
    // Frame the part with 2 holes of room; while dragging keep the frame still so the grid
    // doesn't slide under the pointer, and refit when the drag ends.
    const liveView = { x: foot.x - 2, y: foot.y - 2, w: foot.w + 4, h: foot.h + 4 };
    const view = frozenView || liveView;

    const handleUpdate = (field, val) => setData(prev => ({ ...prev, [field]: val }));

    const addPin = () => {
        // next free hole along the right edge of the footprint, then below
        const taken = new Set(data.pins.map(p => `${p.dCol},${p.dRow}`));
        let spot = null;
        for (let r = foot.y; r < foot.y + foot.h && !spot; r++) for (let c = foot.x; c < foot.x + foot.w && !spot; c++) if (!taken.has(`${c},${r}`)) spot = [c, r];
        if (!spot) spot = [foot.x + foot.w, foot.y];
        const pins = [...data.pins, { lbl: `${data.pins.length + 1}`, net: '', dCol: spot[0], dRow: spot[1] }];
        setData({ ...data, pins });
        setSelectedPinIdx(pins.length - 1);
    };

    const removePin = (idx) => {
        setData(prev => ({ ...prev, pins: prev.pins.filter((_, i) => i !== idx) }));
        setSelectedPinIdx(sel => (sel === idx ? null : sel > idx ? sel - 1 : sel));
    };

    const updatePin = (idx, field, val) => setData(prev => ({ ...prev, pins: prev.pins.map((p, i) => (i === idx ? { ...p, [field]: val } : p)) }));

    const toGrid = (e) => {
        const ctm = svgRef.current?.getScreenCTM();
        if (!ctm) return null;
        const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
        return { col: Math.floor(pt.x / SP), row: Math.floor(pt.y / SP), x: pt.x / SP, y: pt.y / SP };
    };

    const startDrag = (e, d) => {
        e.stopPropagation();
        if (d.kind === 'pin') setSelectedPinIdx(d.idx);
        setDrag(d);
        setFrozenView(view); // same frame while dragging (no zoom jump); refit on release
        e.currentTarget.setPointerCapture?.(e.pointerId);
    };

    const handlePointerMove = (e) => {
        if (!drag) return;
        const g = toGrid(e);
        if (!g) return;
        if (drag.kind === 'pin') setData(prev => movePin(prev, drag.idx, g.col, g.row));
        else setData(prev => moveEdge(prev, drag.edge, g));
    };

    const handlePointerUp = () => { setDrag(null); setFrozenView(null); };

    const save = () => {
        const seen = new Set();
        for (const p of data.pins) {
            const key = `${p.dCol},${p.dRow}`;
            if (seen.has(key)) { alert(`Two pins in the same hole (${key})`); return; }
            seen.add(key);
        }
        // normalise: footprint box starts at 0,0; w/h cover pins and body
        onSave({
            ...component, // keeps position and anything the editor doesn't touch
            id: data.id, name: data.name, value: data.value, color: data.color, routeUnder: data.routeUnder,
            w: foot.w, h: foot.h,
            pins: data.pins.map(p => ({ ...p, dCol: p.dCol - foot.x, dRow: p.dRow - foot.y })),
        });
    };

    const mainColor = boostColor(compColor(data));

    return (
        <div className="overlay-bg" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="modal ce-modal" role="dialog" aria-label={`Edit ${data.id}`}>
                <header className="ce-head">
                    <Edit3 size={16} className="icon-accent" />
                    <h3>{mode === 'add' ? 'Add part' : 'Edit part'}</h3>
                    <span className="ce-id" style={{ borderColor: mainColor, color: mainColor }}>{data.id || '?'}</span>
                    <span className="ce-size">{foot.w} × {foot.h} holes · {(foot.w * 2.54).toFixed(1)} × {(foot.h * 2.54).toFixed(1)} mm</span>
                    <div className="ce-head-actions">
                        <button className="ce-btn" onClick={onClose}>{mode === 'add' ? 'Back to library' : 'Cancel'}</button>
                        <button className="ce-btn primary" onClick={save}>{mode === 'add' ? 'Add to circuit' : 'Save'}</button>
                    </div>
                </header>

                <div className="ce-body">
                    <div className="ce-canvas" onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}>
                            <svg
                            ref={svgRef}
                            width="100%"
                            height="100%"
                            viewBox={`${view.x * SP} ${view.y * SP} ${view.w * SP} ${view.h * SP}`}
                            preserveAspectRatio="xMidYMid meet"
                            className="comp-edit-svg"
                            onPointerDown={() => setSelectedPinIdx(null)}
                        >
                            {/* hole grid */}
                            {Array.from({ length: view.w * view.h }, (_, i) => {
                                const c = view.x + (i % view.w), r = view.y + Math.floor(i / view.w);
                                return <circle key={i} cx={c * SP + SP / 2} cy={r * SP + SP / 2} r={SP * 0.16} fill="none" stroke="rgba(184,115,51,0.35)" strokeWidth={2} />;
                            })}

                            {/* body */}
                            <rect
                                x={bodyBox.x * SP + 3} y={bodyBox.y * SP + 3}
                                width={bodyBox.w * SP - 6} height={bodyBox.h * SP - 6} rx={6}
                                fill={mainColor} fillOpacity={0.12}
                                stroke={mainColor} strokeWidth={2.5}
                                strokeDasharray={data.body ? '7 5' : undefined}
                            />
                            <text x={(bodyBox.x + bodyBox.w / 2) * SP} y={(bodyBox.y + bodyBox.h / 2) * SP} dy=".35em" textAnchor="middle"
                                fontSize={Math.min(14, bodyBox.w * SP / Math.max(3, (data.id || '').length + 1))} fontWeight="800" fill="rgba(255,255,255,0.35)" style={{ pointerEvents: 'none' }}>{data.id}</text>

                            {/* edge handles for a custom body */}
                            {data.body && [['l', bodyBox.x, bodyBox.y + bodyBox.h / 2, 'ew-resize'], ['r', bodyBox.x + bodyBox.w, bodyBox.y + bodyBox.h / 2, 'ew-resize'],
                                ['t', bodyBox.x + bodyBox.w / 2, bodyBox.y, 'ns-resize'], ['b', bodyBox.x + bodyBox.w / 2, bodyBox.y + bodyBox.h, 'ns-resize']].map(([edge, x, y, cursor]) => (
                                <rect key={edge} x={x * SP - 7} y={y * SP - 7} width={14} height={14} rx={3}
                                    fill="#fff" stroke={mainColor} strokeWidth={2} style={{ cursor }}
                                    onPointerDown={(e) => startDrag(e, { kind: 'edge', edge })} />
                            ))}

                            {data.pins.map((p, i) => {
                                const isActive = selectedPinIdx === i;
                                const cx = p.dCol * SP + SP / 2;
                                const cy = p.dRow * SP + SP / 2;
                                const color = netColor(p.net);
                                return (
                                    <g key={i} className={`edit-pin-g ${isActive ? 'active' : ''}`}
                                        onPointerDown={(e) => startDrag(e, { kind: 'pin', idx: i })}
                                        style={{ cursor: drag?.kind === 'pin' && isActive ? 'grabbing' : 'grab' }}>
                                        {isActive && <rect x={p.dCol * SP + 2} y={p.dRow * SP + 2} width={SP - 4} height={SP - 4} rx={5} fill="none" stroke="#fff" strokeWidth={1.5} strokeDasharray="4 2" />}
                                        <circle cx={cx} cy={cy} r={SP * 0.32} fill={color} stroke={isActive ? '#fff' : 'rgba(0,0,0,0.5)'} strokeWidth={isActive ? 2 : 1} />
                                        <text x={cx} y={cy} dy=".35em" fill="#fff" fontSize={9} fontWeight="900" textAnchor="middle"
                                            paintOrder="stroke" stroke="#000" strokeWidth="2" style={{ pointerEvents: 'none', userSelect: 'none' }}>{p.lbl}</text>
                                    </g>
                                );
                            })}
                        </svg>
                        <div className="ce-canvas-hint">Drag pins{data.body ? ' and the outline handles' : ''} · arrows move the selected pin · Del removes it</div>
                    </div>

                    <aside className="ce-side">
                        <section>
                            <div className="ce-row3">
                                <label>ID<input value={data.id} onChange={e => handleUpdate('id', e.target.value)} /></label>
                                <label>Value<input value={data.value} onChange={e => handleUpdate('value', e.target.value)} /></label>
                                <label className="ce-color" title="Body colour">Colour
                                    <input type="color" value={toHex(data.color || compColor(data))} onChange={e => handleUpdate('color', e.target.value)} />
                                </label>
                            </div>
                            <label>Name<input value={data.name} onChange={e => handleUpdate('name', e.target.value)} /></label>
                        </section>

                        <section>
                            <div className="ce-label">Body</div>
                            <div className="ce-seg">
                                <button className={!data.body ? 'active' : ''} onClick={() => setData(d => ({ ...d, body: null }))}>Spans the pins</button>
                                <button className={data.body ? 'active' : ''} onClick={() => setData(d => ({ ...d, body: d.body || { x: pinBox.x - 1, y: pinBox.y - 1, w: pinBox.w + 2, h: pinBox.h + 2 } }))}>Larger housing</button>
                            </div>
                            <p className="ce-hint">{data.body
                                ? 'Drag the outline to the housing size. Other parts and jumpers stay out; wires still pass underneath.'
                                : 'Move a pin outward and the part grows with it.'}</p>
                        </section>

                        <section className="ce-pins">
                            <div className="ce-label">Pins <span>{data.pins.length}</span>
                                <button className="ce-add" onClick={addPin} title="Add a pin"><Plus size={14} /> Add</button>
                            </div>
                            <datalist id="ce-nets">{netNames.map(n => <option key={n} value={n} />)}</datalist>
                            <div className="ce-pin-list">
                                {data.pins.map((p, i) => (
                                    <div key={i} className={`ce-pin ${selectedPinIdx === i ? 'sel' : ''}`} onClick={() => setSelectedPinIdx(i)}>
                                        <span className="ce-dot" style={{ background: netColor(p.net) }} />
                                        <input className="ce-lbl" value={p.lbl} onChange={e => updatePin(i, 'lbl', e.target.value)} placeholder="Pin" aria-label="Pin label" />
                                        <input className="ce-net" list="ce-nets" value={p.net || ''} onChange={e => updatePin(i, 'net', e.target.value)} placeholder="not connected" aria-label="Net" />
                                        <button className="ce-icon" onClick={(e) => { e.stopPropagation(); removePin(i); }} title="Remove pin"><Trash2 size={13} /></button>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </aside>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                .ce-modal { max-width: 1120px; width: calc(100% - 32px); height: min(720px, calc(100vh - 32px)); padding: 0; gap: 0; overflow: hidden; }
                .ce-head { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--border); }
                .ce-head h3 { font-size: var(--fs-md); font-weight: 600; color: var(--txt0); }
                .ce-id { font-family: 'Outfit', sans-serif; font-weight: 800; font-size: var(--fs-sm); padding: 1px 8px; border: 1px solid; border-radius: 6px; }
                .ce-size { font-size: var(--fs-xs); color: var(--txt2); font-family: ui-monospace, Consolas, monospace; }
                .ce-head-actions { margin-left: auto; display: flex; gap: 6px; }
                .ce-btn { height: 30px; padding: 0 14px; border-radius: 7px; border: 1px solid var(--border2); background: var(--bg4); color: var(--txt0); font: inherit; font-size: var(--fs-sm); font-weight: 600; cursor: pointer; }
                .ce-btn:hover { border-color: var(--txt2); }
                .ce-btn.primary { background: var(--grn); border-color: var(--grn-bright); color: #fff; }
                .ce-btn.primary:hover { background: #2a9a40; }
                .ce-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 300px; }
                .ce-canvas { position: relative; min-width: 0; min-height: 0; background: #080a0c; }
                .ce-canvas > svg { position: absolute; inset: 16px 16px 34px; width: calc(100% - 32px); height: calc(100% - 50px); touch-action: none; user-select: none; }
                .ce-canvas-hint { position: absolute; left: 0; right: 0; bottom: 10px; text-align: center; font-size: var(--fs-xs); color: var(--txt2); pointer-events: none; }
                .ce-side { border-left: 1px solid var(--border); display: flex; flex-direction: column; min-height: 0; background: var(--bg2); }
                .ce-side section { padding: 12px 14px; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px; }
                .ce-side label { display: flex; flex-direction: column; gap: 3px; font-size: var(--fs-xs); font-weight: 600; color: var(--txt2); min-width: 0; }
                .ce-side input:not([type=color]) { height: 28px; padding: 0 8px; background: var(--bg0); border: 1px solid var(--border); border-radius: 6px; color: var(--txt0); font-family: inherit; font-size: 13px; font-weight: 500; min-width: 0; width: 100%; }
                .ce-side input:focus { outline: none; border-color: var(--blu-bright); }
                .ce-row3 { display: grid; grid-template-columns: 1fr 1fr 44px; gap: 8px; }
                .ce-color input { width: 44px; height: 28px; padding: 0; border: 1px solid var(--border); border-radius: 6px; background: none; cursor: pointer; }
                .ce-label { display: flex; align-items: center; gap: 6px; font-size: var(--fs-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--txt2); }
                .ce-label span { color: var(--txt1); }
                .ce-seg { display: flex; gap: 2px; background: var(--bg0); border: 1px solid var(--border); border-radius: 7px; padding: 2px; }
                .ce-seg button { flex: 1; background: none; border: 0; color: var(--txt1); font: inherit; font-size: var(--fs-xs); font-weight: 600; padding: 5px; border-radius: 5px; cursor: pointer; }
                .ce-seg button.active { background: var(--blu); color: #fff; }
                .ce-hint { font-size: var(--fs-xs); color: var(--txt2); line-height: 1.4; margin: 0; }
                .ce-pins { flex: 1; min-height: 0; border-bottom: 0 !important; }
                .ce-add { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 8px; border-radius: 6px; border: 1px solid var(--border2); background: var(--bg4); color: var(--txt0); font: inherit; font-size: var(--fs-xs); font-weight: 600; text-transform: none; letter-spacing: 0; cursor: pointer; }
                .ce-pin-list { overflow-y: auto; min-height: 0; display: flex; flex-direction: column; gap: 2px; margin: 0 -6px; padding: 0 6px; }
                .ce-pin { display: grid; grid-template-columns: 10px 48px 1fr 24px; align-items: center; gap: 6px; padding: 3px 4px; border-radius: 6px; border: 1px solid transparent; }
                .ce-pin.sel { background: rgba(31,111,235,.12); border-color: rgba(88,166,255,.35); }
                .ce-dot { width: 10px; height: 10px; border-radius: 50%; }
                .ce-pin input { height: 26px !important; }
                .ce-icon { width: 24px; height: 24px; display: grid; place-items: center; border: 0; background: none; color: var(--txt2); border-radius: 5px; cursor: pointer; }
                .ce-icon:hover { color: var(--red); background: rgba(248,81,73,.1); }
                @media (max-width: 760px) {
                    .ce-modal { width: 100vw; height: 100dvh; max-height: none; border-radius: 0; border: 0; }
                    .ce-size { display: none; }
                    .ce-body { display: flex; flex-direction: column; overflow-y: auto; }
                    .ce-canvas { flex: none; height: 42dvh; position: sticky; top: 0; z-index: 2; }
                    .ce-side { border-left: 0; }
                    .ce-pins { flex: none; }
                    .ce-pin-list { overflow: visible; }
                }
            ` }} />
        </div>
    );
}

// Move pin idx to (col,row); a pin already there swaps places. A custom body grows to keep the
// pin inside; the auto body follows by definition.
function movePin(d, idx, col, row) {
    const p = d.pins[idx];
    if (!p || (p.dCol === col && p.dRow === row)) return d;
    const pins = d.pins.map(q => ({ ...q }));
    const other = pins.findIndex((q, i) => i !== idx && q.dCol === col && q.dRow === row);
    if (other !== -1) { pins[other].dCol = p.dCol; pins[other].dRow = p.dRow; }
    pins[idx].dCol = col; pins[idx].dRow = row;
    const body = d.body ? union(d.body, { x: col, y: row, w: 1, h: 1 }) : null;
    return { ...d, pins, body };
}

// Drag one edge of the body; the body never shrinks past the pins (they stay on the part).
function moveEdge(d, edge, g) {
    const pb = boxOf(d.pins);
    const b = { ...(d.body || pb) };
    const right = b.x + b.w, bottom = b.y + b.h;
    if (edge === 'l') { const x = Math.min(Math.round(g.x), pb.x); b.w = right - x; b.x = x; }
    if (edge === 'r') { const r = Math.max(Math.round(g.x), pb.x + pb.w); b.w = r - b.x; }
    if (edge === 't') { const y = Math.min(Math.round(g.y), pb.y); b.h = bottom - y; b.y = y; }
    if (edge === 'b') { const r = Math.max(Math.round(g.y), pb.y + pb.h); b.h = r - b.y; }
    if (b.w < 1 || b.h < 1) return d;
    const isAuto = b.x === pb.x && b.y === pb.y && b.w === pb.w && b.h === pb.h;
    return { ...d, body: isAuto ? null : b };
}

// <input type=color> needs #rrggbb; part colours may be hsl(...) from compColor.
function toHex(c) {
    if (/^#[0-9a-f]{6}$/i.test(c)) return c;
    const m = /hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/i.exec(c || '');
    if (!m) return '#5a6270';
    const h = +m[1], sat = m[2] / 100, l = m[3] / 100;
    const k = (n) => (n + h / 30) % 12, a = sat * Math.min(l, 1 - l);
    const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
    return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('');
}
