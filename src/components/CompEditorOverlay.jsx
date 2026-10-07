import React, { useState, useRef, useEffect } from 'react';
import { 
    Plus, 
    Trash2, 
    Move, 
    Layout, 
    Hash, 
    Type, 
    Palette, 
    Maximize,
    ChevronRight,
    Search,
    Link2Off,
    Edit3
} from 'lucide-react';
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

export function CompEditorOverlay({ component, isOpen, onClose, onSave }) {
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
    const unbindPin = (idx) => updatePin(idx, 'net', '');

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
        <div className="overlay-bg">
            <div className="modal component-editor-modal">
                <div className="modal-header">
                    <div className="header-title">
                        <Edit3 size={18} className="icon-accent" />
                        <h3>Editing <strong>{data.id}</strong></h3>
                    </div>
                    <button className="close-btn" onClick={onClose}>✕</button>
                </div>                <div className="editor-layout">
                    {/* Left Panel: Config Stack */}
                    <div className="editor-side-panel left scroll-container">
                        <section className="settings-section">
                            <div className="section-header">
                                <Hash size={16} />
                                <h4>Identity</h4>
                            </div>
                            <div className="grid-2">
                                <div className="field-group">
                                    <label>ID</label>
                                    <input type="text" value={data.id} onChange={e => handleUpdate('id', e.target.value)} />
                                </div>
                                <div className="field-group">
                                    <label>Value</label>
                                    <input type="text" value={data.value} onChange={e => handleUpdate('value', e.target.value)} />
                                </div>
                            </div>
                            <div className="field-group">
                                <label>Model Name</label>
                                <input type="text" value={data.name} onChange={e => handleUpdate('name', e.target.value)} />
                            </div>
                        </section>

                        <section className="settings-section">
                            <div className="section-header">
                                <Maximize size={16} />
                                <h4>Footprint</h4>
                            </div>
                            <div className="foot-size">{foot.w} × {foot.h} holes <span>({(foot.w * 2.54).toFixed(1)} × {(foot.h * 2.54).toFixed(1)} mm)</span></div>
                            <div className="body-mode">
                                <button className={!data.body ? 'active' : ''} onClick={() => setData(d => ({ ...d, body: null }))}>Body = pins</button>
                                <button className={data.body ? 'active' : ''} onClick={() => setData(d => ({ ...d, body: d.body || { x: pinBox.x - 1, y: pinBox.y - 1, w: pinBox.w + 2, h: pinBox.h + 2 } }))}>Larger body</button>
                            </div>
                            <p className="dim-hint">{data.body
                                ? 'Drag the edges of the dashed outline to match the housing (relay, electrolytic, dev board). No other part or jumper may sit inside it; wires on the solder side still pass under.'
                                : 'The body spans exactly the pins: move a pin outward and the part grows with it (a resistor bent to 10 mm, a wider DIP).'}</p>
                        </section>

                        <section className="settings-section">
                            <div className="section-header">
                                <Palette size={16} />
                                <h4>Aesthetics</h4>
                            </div>
                            <div className="field-group">
                                <label>Body Color</label>
                                <div className="color-picker-row">
                                    <input type="color" value={data.color || '#333333'} onChange={e => handleUpdate('color', e.target.value)} />
                                    <input type="text" value={data.color || ''} onChange={e => handleUpdate('color', e.target.value)} placeholder="#Hex" />
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* Center: Canvas Area (Smart Zoom) */}
                    <div className="editor-canvas-area" onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}>
                        <div className="canvas-viewport">
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
                        </div>
                    </div>


                    {/* Right Panel: Mapping (The largest part of the side-menu structure) */}
                    <div className="editor-side-panel right mapping-panel">
                        <section className="settings-section pins-section">
                            <div className="section-header mapping-header">
                                <Type size={16} />
                                <h4>Pin Mapping ({data.pins.length})</h4>
                                <button className="add-pin-btn" onClick={addPin} title="Add Pin">
                                    <Plus size={18} />
                                </button>
                            </div>
                            <div className="pin-table scroll-container">
                                {data.pins.map((p, i) => (
                                    <div 
                                        key={i} 
                                        className={`pin-row ${selectedPinIdx === i ? 'selected' : ''}`}
                                        onClick={() => setSelectedPinIdx(i)}
                                    >
                                        <input 
                                            className="pin-label-input" 
                                            type="text" 
                                            value={p.lbl} 
                                            onChange={e => updatePin(i, 'lbl', e.target.value)} 
                                            placeholder="Pad"
                                        />
                                        <div className="pin-net-container">
                                            <input 
                                                className="pin-net-input" 
                                                type="text" 
                                                value={p.net || ''} 
                                                onChange={e => updatePin(i, 'net', e.target.value)} 
                                                placeholder="Unassigned"
                                            />
                                            {p.net && (
                                                <button className="pin-unbind-btn" onClick={(e) => { e.stopPropagation(); unbindPin(i); }}>
                                                    <Link2Off size={14} />
                                                </button>
                                            )}
                                        </div>
                                        <button className="pin-remove-btn" onClick={(e) => { e.stopPropagation(); removePin(i); }}>
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>
                </div>

                <div className="modal-footer">
                    <div className="footer-hint">Drag pins · arrow keys move the selected pin · Delete removes it</div>
                    <div className="footer-actions">
                        <button className="btn ghost" onClick={onClose}>Discard Changes</button>
                        <button className="btn grn" onClick={save}>Save Footprint</button>
                    </div>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                .component-editor-modal { 
                    max-width: 1440px; 
                    width: 98vw; 
                    height: 85vh; 
                    display: flex; 
                    flex-direction: column; 
                    background: var(--bg2);
                    padding: 0;
                    border: 1px solid var(--border2);
                    box-shadow: 0 40px 100px rgba(0,0,0,0.9);
                }

                .modal-header {
                    padding: 16px 24px;
                    border-bottom: 1px solid var(--border);
                    background: var(--bg3);
                    display: flex; justify-content: space-between; align-items: center;
                }
                .header-title { display: flex; align-items: center; gap: 12px; }
                .header-title h3 { font-size: var(--fs-lg); color: var(--txt1); }

                .editor-layout {
                    flex: 1;
                    display: grid;
                    grid-template-columns: 320px 1fr 480px;
                    overflow: hidden;
                    background: #05070a;
                }

                .editor-side-panel {
                    background: var(--bg2);
                    display: flex; flex-direction: column;
                    padding: 0 24px 24px 24px;
                    gap: 0;
                }
                .editor-side-panel.left { border-right: 1px solid var(--border); }
                .editor-side-panel.right { border-left: 1px solid var(--border); }

                .settings-section { 
                    display: flex; flex-direction: column; gap: 20px; 
                    padding: 24px 0;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                }
                .settings-section:last-child { border-bottom: none; }

                .section-header { 
                    display: flex; align-items: center; gap: 8px; 
                    color: var(--txt2); margin-bottom: 12px;
                }
                .section-header h4 { font-size: var(--fs-sm); font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; }

                .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }

                .field-group { display: flex; flex-direction: column; gap: 6px; flex: 1; }
                .field-group label { font-size: var(--fs-xs); color: var(--txt2); font-weight: 700; text-transform: uppercase; }
                .field-group input { font-size: var(--fs-md) !important; height: 38px; padding: 0 12px; }

                .foot-size { font-family: 'Outfit', sans-serif; font-weight: 700; color: var(--txt0); font-size: 1.05em; }
                .foot-size span { color: var(--txt2); font-weight: 500; font-size: .85em; }
                .body-mode { display: flex; gap: 2px; background: var(--bg0); border: 1px solid var(--border); border-radius: 8px; padding: 2px; margin-top: 10px; }
                .body-mode button { flex: 1; background: none; border: 0; color: var(--txt1); font: inherit; font-size: var(--fs-sm); font-weight: 600; padding: 6px; border-radius: 6px; cursor: pointer; }
                .body-mode button.active { background: var(--blu); color: #fff; }
                .footer-hint { font-size: var(--fs-xs); color: var(--txt2); margin-right: auto; align-self: center; }
                .dim-times { font-weight: 800; color: var(--txt2); font-size: var(--fs-sm); }
                .dim-hint { margin: 8px 0 0; font-size: var(--fs-xs); color: var(--txt1); line-height: 1.4; }

                .color-picker-row { display: flex; gap: 10px; align-items: center; }
                .color-picker-row input[type="color"] { 
                    width: 38px; height: 38px; padding: 0; border: 1px solid var(--border); border-radius: 6px; background: none; 
                }

                .mapping-panel { padding-top: 0 !important; }
                .pins-section { flex: 1; display: flex; flex-direction: column; min-height: 0; padding-top: 0; }
                .mapping-header { padding: 24px 0 16px 0; }

                .pin-table {
                    flex: 1;
                    overflow-y: auto;
                    border: 1px solid var(--border);
                    border-radius: 8px;
                    background: rgba(0,0,0,0.3);
                }

                .pin-row {
                    display: flex; align-items: center; gap: 12px; padding: 10px 18px;
                    border-bottom: 1px solid var(--border); cursor: pointer; transition: 0.1s;
                }
                .pin-row:hover { background: rgba(255,255,255,0.02); }
                .pin-row.selected { background: rgba(31, 111, 235, 0.1); border-left: 2px solid var(--blu-bright); padding-left: 16px; }

                .pin-label-input { width: 70px !important; font-size: var(--fs-md) !important; font-weight: 800; border-radius: 4px; height: 32px; }
                .pin-net-container { flex: 1; position: relative; display: flex; align-items: center; }
                .pin-net-input { color: var(--blu-bright) !important; font-size: var(--fs-md) !important; border-radius: 4px; height: 32px; }
                
                .add-pin-btn {
                    margin-left: auto;
                    background: rgba(88, 166, 255, 0.15);
                    border: 1px solid rgba(88, 166, 255, 0.3);
                    color: var(--blu-bright);
                    width: 34px; height: 34px; border-radius: 6px;
                    display: flex; align-items: center; justify-content: center;
                    cursor: pointer; transition: 0.2s;
                }
                .add-pin-btn:hover { background: var(--blu); color: #fff; transform: translateY(-1px); }

                .pin-unbind-btn {
                    position: absolute; right: 10px; background: none; border: none; color: var(--txt2); opacity: 0.5; cursor: pointer; display: flex; align-items: center;
                }
                .pin-unbind-btn:hover { color: var(--org); opacity: 1; }
                
                .pin-remove-btn { 
                    background: none; border: none; color: var(--txt2); opacity: 0.4; cursor: pointer;
                    padding: 8px; border-radius: 6px; display: flex; align-items: center;
                }
                .pin-remove-btn:hover { color: var(--red); background: rgba(248, 81, 73, 0.1); opacity: 1; }

                .editor-canvas-area { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; background: #080a0c; overflow: hidden; }
                .canvas-viewport { flex: 1; min-height: 0; position: relative; }
                .canvas-viewport > svg { position: absolute; inset: 24px; width: calc(100% - 48px); height: calc(100% - 48px); }
                .comp-edit-svg { width: 100%; height: 100%; touch-action: none; user-select: none; }

                .modal-footer {
                    padding: 16px 24px;
                    background: var(--bg3);
                    border-top: 1px solid var(--border);
                    display: flex; justify-content: flex-end;
                }
                .footer-actions { display: flex; gap: 12px; }
                .footer-actions .btn { font-size: var(--fs-md); padding: 12px 24px; min-width: 140px; }

                @media (max-width: 1100px) {
                    .editor-layout { grid-template-columns: 260px 1fr 340px; }
                }
                /* Phone: stack identity, canvas and pin mapping in one scrolling column. */
                @media (max-width: 760px) {
                    .component-editor-modal { width: 100vw; height: 100dvh; border-radius: 0; border: none; }
                    .editor-layout { display: flex; flex-direction: column; overflow-y: auto; }
                    .editor-side-panel { padding: 0 16px 16px 16px; flex: none; overflow: visible; }
                    .editor-side-panel.left, .editor-side-panel.right { border: none; border-bottom: 1px solid var(--border); }
                    .settings-section { padding: 16px 0; gap: 12px; }
                    .editor-canvas-area { flex: none; height: 42dvh; order: -1; position: sticky; top: 0; z-index: 2; }
                    .canvas-viewport > svg { inset: 10px; width: calc(100% - 20px); height: calc(100% - 20px); }
                    .footer-hint { display: none; }
                    .pin-table { flex: none; }
                    .pin-row { padding: 8px 10px; gap: 8px; }
                    .pin-label-input { width: 56px !important; }
                    .pin-net-input { min-width: 0; }
                    .modal-header, .modal-footer { padding: 12px 16px; }
                    .footer-actions { width: 100%; }
                    .footer-actions .btn { flex: 1; min-width: 0; padding: 12px; }
                }

                @keyframes selection-pulse { from { opacity: 0.4; } to { opacity: 1; } }
                .selection-bracket { animation: selection-pulse 0.8s infinite alternate; }
                `
            }} />
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
