import React, { useState, useEffect, useMemo } from 'react';
import { X, Download, Printer } from 'lucide-react';
import { generateBoardSVG, generateCombinedSVG } from '../engine/render-utils.js';
import { scoreState } from '../engine/metrics.js';
import { BoardCard, BoardSettingsStyles } from './BoardSettings.jsx';

// Export with a live preview: the picture on the left is the exact SVG that gets downloaded or
// printed, so every option (side, board size, hole coordinates) is visible before exporting.
export function ExportOverlay({ isOpen, onClose, components, wires, bestSnapshot, boardView = null, setBoardView = null }) {
    const [format, setFormat] = useState('svg'); // 'svg' | 'png'
    const [side, setSide] = useState('top');     // 'top' | 'bottom' | 'both'

    const source = bestSnapshot || { components, wires };
    const svg = useMemo(() => {
        if (!isOpen || !source.components?.length) return '';
        return side === 'both'
            ? generateCombinedSVG(source.components, source.wires, { padding: 3, view: boardView })
            : generateBoardSVG(source.components, source.wires, { padding: 3, view: boardView, side });
    }, [isOpen, source.components, source.wires, side, boardView]);

    const previewUrl = useMemo(() => (svg ? URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })) : ''), [svg]);
    useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const fp = source.components?.length ? scoreState(source.components, source.wires) : null;
    const mm = (n) => (n * 2.54).toFixed(1);
    const baseName = `boardroute_${side}`;

    const download = async () => {
        if (!svg) return;
        if (format === 'svg') return saveFile(new Blob([svg], { type: 'image/svg+xml' }), `${baseName}.svg`);
        const png = await svgToPng(svg);
        if (png) saveFile(png, `${baseName}.png`);
    };

    const print = () => {
        const w = window.open('', '_blank');
        if (!w) return;
        w.document.write(`<!doctype html><title>boardroute ${side}</title><style>@page{margin:10mm}body{margin:0;display:flex;justify-content:center}img{max-width:100%;max-height:100vh}</style><img src="${previewUrl}" onload="setTimeout(()=>{print()},100)">`);
        w.document.close();
    };

    return (
        <div className="overlay-bg" onClick={onClose}>
            <div className="modal export-modal" onClick={e => e.stopPropagation()} role="dialog" aria-label="Export board">
                <div className="ex-preview">
                    {previewUrl ? <img src={previewUrl} alt={`Preview of the ${side} export`} /> : <div className="ex-empty">Nothing on the board yet</div>}
                </div>

                <div className="ex-side">
                    <div className="modal-header">
                        <h3>Export</h3>
                        <button className="close-btn" onClick={onClose} aria-label="Close"><X size={20} /></button>
                    </div>

                    <div className="ex-group">
                        <div className="ex-label">View</div>
                        <div className="ex-seg">
                            <button className={side === 'top' ? 'active' : ''} onClick={() => setSide('top')}>Top</button>
                            <button className={side === 'bottom' ? 'active' : ''} onClick={() => setSide('bottom')} title="Solder side, mirrored like the board turned over">Solder side</button>
                            <button className={side === 'both' ? 'active' : ''} onClick={() => setSide('both')}>Both</button>
                        </div>
                    </div>

                    {fp && <div className="ex-size">Layout {fp.width} × {fp.height} holes · {mm(fp.width)} × {mm(fp.height)} mm at 2.54 mm pitch</div>}

                    {boardView && setBoardView && (
                        <div className="ex-group">
                            <div className="ex-label">Board &amp; coordinates</div>
                            <BoardCard view={boardView} setView={setBoardView} components={source.components} wires={source.wires} />
                        </div>
                    )}

                    <div className="ex-group">
                        <div className="ex-label">Format</div>
                        <div className="ex-seg">
                            <button className={format === 'svg' ? 'active' : ''} onClick={() => setFormat('svg')}>SVG (vector)</button>
                            <button className={format === 'png' ? 'active' : ''} onClick={() => setFormat('png')}>PNG (image)</button>
                        </div>
                    </div>

                    <div className="ex-actions">
                        <button className="ex-btn primary" onClick={download} disabled={!svg}><Download size={16} /> Download</button>
                        <button className="ex-btn" onClick={print} disabled={!svg}><Printer size={16} /> Print</button>
                    </div>
                </div>
            </div>

            <BoardSettingsStyles />
            <style dangerouslySetInnerHTML={{
                __html: `
        .export-modal { max-width: 1200px; width: calc(100% - 32px); height: calc(100vh - 32px); max-height: 900px; padding: 0; gap: 0; flex-direction: row; overflow: hidden; }
        .ex-preview { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: center; padding: 24px; background: repeating-conic-gradient(#0b0e12 0% 25%, #080a0d 0% 50%) 50% / 24px 24px; }
        .ex-preview img { width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 10px 30px rgba(0,0,0,.6)); }
        .ex-empty { color: var(--txt2); font-size: var(--fs-sm); }
        .ex-side { width: 320px; flex-shrink: 0; display: flex; flex-direction: column; gap: 16px; padding: 20px; border-left: 1px solid var(--border); overflow-y: auto; background: var(--bg2); }
        .ex-group { display: flex; flex-direction: column; gap: 8px; }
        .ex-label { font-size: var(--fs-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--txt2); }
        .ex-seg { display: flex; background: var(--bg0); border: 1px solid var(--border); border-radius: 8px; padding: 2px; gap: 2px; }
        .ex-seg button { flex: 1; background: none; border: 0; color: var(--txt1); font: inherit; font-size: var(--fs-sm); font-weight: 600; padding: 7px 6px; border-radius: 6px; cursor: pointer; }
        .ex-seg button.active { background: var(--blu); color: #fff; }
        .ex-size { font-size: var(--fs-xs); color: var(--txt1); font-family: ui-monospace, Consolas, monospace; }
        .ex-group .board-card { padding: 0; }
        .ex-actions { display: flex; gap: 8px; margin-top: auto; padding: 12px 0 0; position: sticky; bottom: -20px; background: var(--bg2); padding-bottom: 4px; }
        .ex-btn { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; border-radius: 8px; border: 1px solid var(--border2); background: var(--bg4); color: var(--txt0); font: inherit; font-weight: 600; cursor: pointer; }
        .ex-btn.primary { background: var(--blu); border-color: var(--blu-bright); }
        .ex-btn:disabled { opacity: .5; cursor: default; }
        @media (max-width: 760px) {
          .export-modal { flex-direction: column; height: calc(100dvh - 16px); width: calc(100% - 16px); }
          .ex-preview { flex: 0 0 42%; padding: 12px; }
          .ex-side { width: auto; border-left: 0; border-top: 1px solid var(--border); padding: 16px; }
        }
      `}} />
        </div>
    );
}

function saveFile(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Rasterise at 4× for a sharp image.
function svgToPng(svgString) {
    return new Promise((resolve) => {
        const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
        const el = doc.querySelector('svg');
        const width = parseFloat(el?.getAttribute('width')), height = parseFloat(el?.getAttribute('height'));
        if (!(width > 0 && height > 0)) return resolve(null);
        const img = new Image();
        const url = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' }));
        img.onload = () => {
            const scale = 4;
            const canvas = document.createElement('canvas');
            canvas.width = width * scale; canvas.height = height * scale;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#050706';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.scale(scale, scale);
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((blob) => { URL.revokeObjectURL(url); resolve(blob); }, 'image/png');
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
        img.src = url;
    });
}
