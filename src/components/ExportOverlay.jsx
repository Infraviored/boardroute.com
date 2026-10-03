import React, { useState } from 'react';
import { X, Download, Settings, Layers } from 'lucide-react';
import { generateBoardSVG, generateCombinedSVG } from '../engine/render-utils.js';

export function ExportOverlay({ isOpen, onClose, components, wires, bestSnapshot, boardView = null }) {
    const [format, setFormat] = useState('svg'); // 'svg' | 'png'
    const [side, setSide] = useState('top'); // 'top' | 'bottom' | 'both'


    if (!isOpen) return null;

    const handleExport = async () => {
        const source = bestSnapshot || { components, wires };

        if (format === 'svg' && side === 'both') {
            const svg = generateCombinedSVG(source.components, source.wires, { padding: 3, view: boardView });
            downloadFile(svg, `pcb_combined.svg`, 'image/svg+xml');
            return;
        }

        if (format === 'png' && side === 'both') {
            const svg = generateCombinedSVG(source.components, source.wires, { padding: 3, view: boardView });
            const pngBlob = await svgToPng(svg);
            if (pngBlob) downloadFile(pngBlob, `pcb_combined.png`, 'image/png');
            return;
        }

        const exportOne = async (exportSide) => {
            const svg = generateBoardSVG(source.components, source.wires, {
                padding: 3,
                view: boardView,

                side: exportSide
            });

            if (!svg) return;

            if (format === 'svg') {
                downloadFile(svg, `pcb_${exportSide}.svg`, 'image/svg+xml');
            } else {
                const pngBlob = await svgToPng(svg);
                if (pngBlob) {
                    downloadFile(pngBlob, `pcb_${exportSide}.png`, 'image/png');
                }
            }
        };

        await exportOne(side);

        // onClose(); // Keep open to allow multiple exports if needed
    };

    const downloadFile = (content, fileName, type) => {
        const timestamp = Date.now();
        const parts = fileName.split('.');
        const ext = parts.pop();
        const base = parts.join('.');
        const stampedName = `${base}_${timestamp}.${ext}`;

        const blob = content instanceof Blob ? content : new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = stampedName;
        a.click();
        URL.revokeObjectURL(url);
    };

    const svgToPng = (svgString) => {
        return new Promise((resolve) => {
            if (!svgString || !svgString.trim()) {
                resolve(null);
                return;
            }
            // Ensure SVG has explicit dimensions and is properly encoded
            const parser = new DOMParser();
            const doc = parser.parseFromString(svgString, 'image/svg+xml');
            const svgEl = doc.querySelector('svg');
            if (!svgEl) {
                resolve(null);
                return;
            }
            const width = parseFloat(svgEl.getAttribute('width'));
            const height = parseFloat(svgEl.getAttribute('height'));
            if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
                resolve(null);
                return;
            }

            const img = new Image();
            // Use b64 for better compatibility in some browsers with canvas
            const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(svgBlob);

            img.onload = () => {
                const canvas = document.createElement('canvas');
                const scale = 4; // High DPI (4x original SP size)
                canvas.width = width * scale;
                canvas.height = height * scale;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#050706'; // Ensure background is filled
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.scale(scale, scale);
                ctx.drawImage(img, 0, 0);

                canvas.toBlob((blob) => {
                    URL.revokeObjectURL(url);
                    resolve(blob);
                }, 'image/png');
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                resolve(null);
            };

            img.src = url;
        });
    };

    return (
        <div className="overlay-bg" onClick={onClose}>
            <div className="modal export-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div className="header-title-group">
                        <Download size={20} className="header-icon" />
                        <h3>Export Board</h3>
                    </div>
                    <button className="close-btn" onClick={onClose}><X size={20} /></button>
                </div>

                <div className="export-options">
                    <div className="option-group">
                        <label><Settings size={14} /> Format</label>
                        <div className="toggle-group">
                            <button className={format === 'svg' ? 'active' : ''} onClick={() => setFormat('svg')}>SVG</button>
                            <button className={format === 'png' ? 'active' : ''} onClick={() => setFormat('png')}>PNG</button>
                        </div>
                    </div>

                    <div className="option-group">
                        <label><Layers size={14} /> Side</label>
                        <div className="toggle-group">
                            <button className={side === 'top' ? 'active' : ''} onClick={() => setSide('top')}>Top</button>
                            <button className={side === 'bottom' ? 'active' : ''} onClick={() => setSide('bottom')}>Bottom</button>
                            <button className={side === 'both' ? 'active' : ''} onClick={() => setSide('both')}>Both</button>
                        </div>
                    </div>

                    <div className="export-coords-note">
                        {boardView?.showCoords
                            ? `Includes hole coordinates${boardView.pinCoords ? ' on every pin' : ''}; the bottom view is mirrored like the flipped board.`
                            : 'Hole coordinates are off. Turn them on in the Board card to include them.'}
                        {(boardView?.boardCols || boardView?.boardRows) ? ' The board outline is included.' : ''}
                    </div>
                </div>

                <button className="btn blu export-action-btn" onClick={handleExport}>
                    <Download size={16} /> Download
                </button>

                <style dangerouslySetInnerHTML={{
                    __html: `
          .export-modal {
            max-width: 380px;
            background: rgba(13, 17, 23, 0.9);
            backdrop-filter: blur(20px);
            border: 1px solid var(--border2);
            padding: 24px;
          }
          .header-title-group {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .header-icon {
            color: var(--blu-bright);
          }
          .export-options {
            display: flex;
            flex-direction: column;
            gap: 20px;
            margin: 10px 0;
          }
          .option-group label {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 8px;
            color: var(--txt1);
            font-weight: 600;
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .toggle-group {
            display: flex;
            background: var(--bg3);
            padding: 3px;
            border-radius: 10px;
            border: 1px solid var(--border);
          }
          .toggle-group button {
            flex: 1;
            padding: 8px;
            border: none;
            background: transparent;
            color: var(--txt1);
            font-size: 0.75rem;
            font-weight: 700;
            border-radius: 7px;
            cursor: pointer;
            transition: all 0.2s;
          }
          .toggle-group button.active {
            background: var(--blu);
            color: #fff;
            box-shadow: 0 4px 12px rgba(31, 111, 235, 0.3);
          }
          .checkbox-label {
            display: flex;
            align-items: center;
            gap: 10px;
            cursor: pointer;
            font-size: 0.8rem;
            color: var(--txt0);
          }
          .checkbox-label input {
            width: 16px;
            height: 16px;
            cursor: pointer;
          }
          .export-coords-note {
            font-size: 0.75rem;
            line-height: 1.45;
            color: var(--txt1);
          }
          .export-action-btn {
            margin-top: 10px;
            height: 44px;
            border-radius: 12px;
          }
        `}} />
            </div>
        </div>
    );
}
