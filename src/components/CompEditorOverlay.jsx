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
import { SP, netColor, boostColor } from '../engine/render-utils.js';

export function CompEditorOverlay({ component, isOpen, onClose, onSave }) {
    const [data, setData] = useState(() => {
        if (!component) return null;
        const copy = JSON.parse(JSON.stringify(component));
        // Ensure w/h exist
        if (!copy.w || !copy.h) {
            let mw = 1, mh = 1;
            copy.pins.forEach(p => {
                mw = Math.max(mw, (p.dCol || 0) + 1);
                mh = Math.max(mh, (p.dRow || 0) + 1);
            });
            copy.w = mw;
            copy.h = mh;
        }
        // Ensure pins have dCol/dRow
        copy.pins = copy.pins.map(p => ({
            ...p,
            dCol: p.dCol || 0,
            dRow: p.dRow || 0,
            net: p.net || ''
        }));
        return copy;
    });
    const [selectedPinIdx, setSelectedPinIdx] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const svgRef = useRef(null);

    // Sync state when component prop changes
    useEffect(() => {
        if (component && isOpen) {
            const copy = JSON.parse(JSON.stringify(component));
            if (!copy.w || !copy.h) {
                let mw = 1, mh = 1;
                copy.pins.forEach(p => {
                    mw = Math.max(mw, (p.dCol || 0) + 1);
                    mh = Math.max(mh, (p.dRow || 0) + 1);
                });
                copy.w = mw;
                copy.h = mh;
            }
            copy.pins = copy.pins.map(p => ({
                ...p,
                dCol: p.dCol || 0,
                dRow: p.dRow || 0,
                net: p.net || ''
            }));
            setData(copy);
        }
    }, [component, isOpen]);

    if (!isOpen || !data) return null;

    const handleUpdate = (field, val) => setData(prev => ({ ...prev, [field]: val }));

    const handleDimensionChange = (field, val) => {
        const num = Math.max(1, parseInt(val) || 1);
        setData(prev => {
            const nextW = field === 'w' ? num : prev.w;
            const nextH = field === 'h' ? num : prev.h;

            // Refuse if area is too small for existing pins
            if (nextW * nextH < prev.pins.length) {
                console.warn("Component footprint area too small for current pin count");
                return prev;
            }

            const next = { ...prev, [field]: num };

            // When shrinking, we must pack pins into the new bounds without overlap
            // A simple approach: for each pin, if out of bounds, find the nearest empty spot
            const pins = [...next.pins];
            const isOccupied = (c, r, ignoreIdx) => pins.some((p, i) => i !== ignoreIdx && p.dCol === c && p.dRow === r);

            for (let i = 0; i < pins.length; i++) {
                let p = { ...pins[i] };
                if (p.dCol >= nextW || p.dRow >= nextH) {
                    p.dCol = Math.min(p.dCol, nextW - 1);
                    p.dRow = Math.min(p.dRow, nextH - 1);
                    
                    // If target restricted spot is occupied, spiral out to find first vacant spot
                    if (isOccupied(p.dCol, p.dRow, i)) {
                        let found = false;
                        for (let r = nextH - 1; r >= 0 && !found; r--) {
                            for (let c = nextW - 1; c >= 0 && !found; c--) {
                                if (!isOccupied(c, r, i)) {
                                    p.dCol = c; p.dRow = r; found = true;
                                }
                            }
                        }
                    }
                    pins[i] = p;
                }
            }
            next.pins = pins;
            return next;
        });
    };

    const addPin = () => {
        const next = { ...data, pins: [...data.pins] };
        
        // Find first vacant spot
        let dCol = 0, dRow = 0, found = false;
        for (let r = 0; r < next.h && !found; r++) {
            for (let c = 0; c < next.w && !found; c++) {
                if (!next.pins.some(p => p.dCol === c && p.dRow === r)) {
                    dCol = c; dRow = r; found = true;
                }
            }
        }
        
        if (!found) {
            alert("No space left in current footprint to add a pin. Please increase dimensions.");
            return;
        }

        next.pins = [...next.pins, { lbl: `P${next.pins.length + 1}`, net: '', dCol, dRow }];
        setData(next);
        setSelectedPinIdx(next.pins.length - 1);
    };

    const removePin = (idx) => {
        const next = { ...data, pins: [...data.pins] };
        next.pins.splice(idx, 1);
        setData(next);
        if (selectedPinIdx === idx) setSelectedPinIdx(null);
        else if (selectedPinIdx > idx) setSelectedPinIdx(selectedPinIdx - 1);
    };

    const updatePin = (idx, field, val) => {
        const next = { ...data, pins: [...data.pins] };
        next.pins[idx] = { ...next.pins[idx], [field]: val };
        setData(next);
    };

    const unbindPin = (idx) => {
        const next = { ...data, pins: [...data.pins] };
        next.pins[idx] = { ...next.pins[idx], net: '' };
        setData(next);
    };

    const handlePointerDown = (e, idx) => {
        setSelectedPinIdx(idx);
        setIsDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
        e.stopPropagation();
    };

    const handlePointerMove = (e) => {
        if (!isDragging || selectedPinIdx === null) return;
        // Map the pointer into viewBox (user) coordinates. The viewBox has a 1.5-hole margin and
        // preserveAspectRatio="meet" letterboxes it, so a plain rect-ratio scale is wrong.
        const ctm = svgRef.current?.getScreenCTM();
        if (!ctm) return;
        const { x: viewBoxX, y: viewBoxY } = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());

        const col = Math.floor(viewBoxX / SP);
        const row = Math.floor(viewBoxY / SP);

        // Clamp to component bounds
        const clampedCol = Math.max(0, Math.min(col, data.w - 1));
        const clampedRow = Math.max(0, Math.min(row, data.h - 1));

        const targetPinIdx = data.pins.findIndex((p, i) => i !== selectedPinIdx && p.dCol === clampedCol && p.dRow === clampedRow);

        if (data.pins[selectedPinIdx].dCol !== clampedCol || data.pins[selectedPinIdx].dRow !== clampedRow) {
            const next = { ...data, pins: [...data.pins] };
            if (targetPinIdx !== -1) {
                // FLIP: Swap coordinates
                const oldCol = next.pins[selectedPinIdx].dCol;
                const oldRow = next.pins[selectedPinIdx].dRow;
                next.pins[selectedPinIdx] = { ...next.pins[selectedPinIdx], dCol: clampedCol, dRow: clampedRow };
                next.pins[targetPinIdx] = { ...next.pins[targetPinIdx], dCol: oldCol, dRow: oldRow };
            } else {
                next.pins[selectedPinIdx] = { ...next.pins[selectedPinIdx], dCol: clampedCol, dRow: clampedRow };
            }
            setData(next);
        }
    };

    const handlePointerUp = () => {
        setIsDragging(false);
    };

    const mainColor = boostColor(data.color || '#333333');

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
                            <div className="dimension-row">
                                <div className="field-group">
                                    <label>Width (Cols)</label>
                                    <input type="number" min="1" value={data.w} onChange={e => handleDimensionChange('w', e.target.value)} />
                                </div>
                                <div className="dim-times">×</div>
                                <div className="field-group">
                                    <label>Height (Rows)</label>
                                    <input type="number" min="1" value={data.h} onChange={e => handleDimensionChange('h', e.target.value)} />
                                </div>
                            </div>
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
                    <div className="editor-canvas-area" onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
                        <div className="canvas-viewport">
                            <svg 
                                ref={svgRef}
                                width="100%" 
                                height="100%"
                                viewBox={`${-SP * 1.5} ${-SP * 1.5} ${data.w * SP + SP * 3} ${data.h * SP + SP * 3}`}
                                preserveAspectRatio="xMidYMid meet"
                                className="comp-edit-svg"
                            >
                                <defs>
                                    <pattern id="grid-pattern" width={SP} height={SP} patternUnits="userSpaceOnUse" patternTransform={`translate(${-SP * 1.5}, ${-SP * 1.5})`}>
                                        <circle cx={SP/2} cy={SP/2} r={1.5} fill="rgba(255,255,255,0.15)" />
                                    </pattern>
                                </defs>
                                
                                <rect 
                                    x={SP * 0.08} 
                                    y={SP * 0.08} 
                                    width={data.w * SP - SP * 0.16} 
                                    height={data.h * SP - SP * 0.16} 
                                    rx={6}
                                    fill="var(--bg4)"
                                    fillOpacity={0.8}
                                    stroke={mainColor}
                                    strokeWidth={2}
                                    className="comp-body-rect"
                                />

                                <rect x={-SP * 1.5} y={-SP * 1.5} width={data.w * SP + SP * 3} height={data.h * SP + SP * 3} fill="url(#grid-pattern)" style={{ pointerEvents: 'none' }} />

                                {data.pins.map((p, i) => {
                                    const isActive = selectedPinIdx === i;
                                    const cx = p.dCol * SP + SP / 2;
                                    const cy = p.dRow * SP + SP / 2;
                                    const color = netColor(p.net);

                                    return (
                                        <g 
                                            key={i} 
                                            className={`edit-pin-g ${isActive ? 'active' : ''}`}
                                            onPointerDown={(e) => handlePointerDown(e, i)}
                                            style={{ cursor: isDragging && isActive ? 'grabbing' : 'grab' }}
                                        >
                                            <circle 
                                                cx={cx} cy={cy} r={SP * 0.3} 
                                                fill={color} fillOpacity={0.9}
                                                stroke={isActive ? "#fff" : "rgba(255,255,255,0.3)"}
                                                strokeWidth={isActive ? 2 : 1}
                                            />
                                            <text 
                                                x={cx} y={cy} dy=".35em" fill="#fff"
                                                fontSize={9} fontWeight="900" textAnchor="middle"
                                                paintOrder="stroke" stroke="#000" strokeWidth="2"
                                                style={{ pointerEvents: 'none', userSelect: 'none' }}
                                            >
                                                {p.lbl}
                                            </text>
                                        </g>
                                    );
                                })}

                                {selectedPinIdx !== null && (
                                    <rect 
                                        x={data.pins[selectedPinIdx].dCol * SP + 2} 
                                        y={data.pins[selectedPinIdx].dRow * SP + 2} 
                                        width={SP - 4} height={SP - 4} fill="none" 
                                        stroke={mainColor} strokeWidth={2} rx={4}
                                        strokeDasharray="4 2" className="selection-bracket"
                                    />
                                )}
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
                    <div className="footer-actions">
                        <button className="btn ghost" onClick={onClose}>Discard Changes</button>
                        <button className="btn grn" onClick={() => {
                            const seen = new Set();
                            for (const p of data.pins) {
                                const key = `${p.dCol},${p.dRow}`;
                                if (seen.has(key)) { alert(`Overlap detected at ${key}`); return; }
                                seen.add(key);
                            }
                            onSave(data);
                        }}>Save Footprint</button>
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

                .dimension-row { display: flex; align-items: center; gap: 10px; }
                .dim-times { font-weight: 800; color: var(--txt2); font-size: var(--fs-sm); }

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

                .editor-canvas-area { flex: 1; display: flex; flex-direction: column; background: #080a0c; overflow: hidden; }
                .canvas-viewport { flex: 1; display: flex; align-items: center; justify-content: center; padding: 40px; }
                .comp-edit-svg { filter: drop-shadow(0 20px 60px rgba(0,0,0,0.6)); overflow: visible; max-width: 95%; max-height: 95%; }

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
                    .editor-canvas-area { flex: none; height: 240px; }
                    .canvas-viewport { padding: 16px; }
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
