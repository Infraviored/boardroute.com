import React from 'react';
import { computeBoardFrame, holeLabel, normalizeBoardView } from '../engine/render-utils.js';
import { AlertTriangle } from 'lucide-react';

// Physical board size and hole-coordinate settings. Shared by the right sidebar and the
// export dialog (both edit the same useBoardView state).
const ORIGINS = [['tl', 'Top-left'], ['tr', 'Top-right'], ['bl', 'Bottom-left'], ['br', 'Bottom-right']];

function Seg({ value, options, onChange, disabled = false }) {
  return (
    <div className={`bv-seg ${disabled ? 'disabled' : ''}`} role="radiogroup">
      {options.map(([val, label]) => (
        <button key={String(val)} type="button" role="radio" aria-checked={value === val}
          className={value === val ? 'active' : ''} disabled={disabled} onClick={() => onChange(val)}>{label}</button>
      ))}
    </div>
  );
}

function Switch({ checked, onChange, label, disabled = false }) {
  return (
    <label className={`bv-switch ${disabled ? 'disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="bv-track" aria-hidden="true"><span className="bv-thumb" /></span>
      <span className="bv-switch-label">{label}</span>
    </label>
  );
}

/** "Board" settings: physical board size and how its holes are labelled. */
export function BoardCard({ view, setView, components, wires }) {
  const set = (patch) => setView(prev => normalizeBoardView({ ...prev, ...patch }));
  const frame = computeBoardFrame(components, wires, view);
  const sized = !!(view.boardCols || view.boardRows);
  const labelsOff = !view.showCoords;
  const startAt = frame ? holeLabel(frame, view, frame.layout.minC, frame.layout.minR) : null;

  return (
    <div className="lbody board-card">
      <Switch checked={view.showCoords} onChange={(v) => set({ showCoords: v })} label="Show hole coordinates" />
      <Switch checked={view.pinCoords} onChange={(v) => set({ pinCoords: v })} label="Coordinates on every pin" disabled={labelsOff} />

      <div className="bv-row">
        <span className="bv-label">Board size</span>
        <div className="bv-size">
          <input type="number" min="1" max="500" inputMode="numeric" placeholder="auto" aria-label="Board columns"
            value={view.boardCols ?? ''} onChange={(e) => set({ boardCols: e.target.value })} />
          <span className="bv-x">×</span>
          <input type="number" min="1" max="500" inputMode="numeric" placeholder="auto" aria-label="Board rows"
            value={view.boardRows ?? ''} onChange={(e) => set({ boardRows: e.target.value })} />
        </div>
      </div>
      {sized && (
        <div className="bv-row">
          <span className="bv-label">Margin</span>
          <div className="bv-size">
            <input type="number" min="0" max="50" inputMode="numeric" aria-label="Margin in holes"
              value={view.margin} onChange={(e) => set({ margin: e.target.value === '' ? 0 : e.target.value })} />
            <span className="bv-unit">holes</span>
            <button type="button" className="bv-mini" onClick={() => set({ boardCols: null, boardRows: null })}>Auto</button>
          </div>
        </div>
      )}

      {frame && (sized && !frame.fits ? (
        <div className="bv-note warn" role="alert">
          <AlertTriangle size={14} />
          <span>
            Layout doesn't fit: it needs {frame.need.cols} × {frame.need.rows} holes
            {view.margin > 0 ? ' (incl. margin)' : ''}, the board has {frame.cols} × {frame.rows}.
          </span>
        </div>
      ) : (
        <div className="bv-note">
          {sized
            ? <span>Layout {frame.footprint.cols} × {frame.footprint.rows} fits{startAt && view.showCoords ? <>; its top-left corner is hole <b>{startAt}</b></> : null}.</span>
            : <span>Auto: board = layout footprint ({frame.footprint.cols} × {frame.footprint.rows} holes).</span>}
        </div>
      ))}

      <div className={`bv-group ${labelsOff ? 'disabled' : ''}`}>
        <div className="bv-row">
          <span className="bv-label">Columns</span>
          <Seg value={view.colStyle} disabled={labelsOff} onChange={(v) => set({ colStyle: v })} options={[['num', '1 2 3'], ['alpha', 'A B C']]} />
        </div>
        <div className="bv-row">
          <span className="bv-label">Rows</span>
          <Seg value={view.rowStyle} disabled={labelsOff} onChange={(v) => set({ rowStyle: v })} options={[['num', '1 2 3'], ['alpha', 'A B C']]} />
        </div>
        <div className="bv-row">
          <span className="bv-label">Numbers from</span>
          <Seg value={view.start} disabled={labelsOff || (view.colStyle === 'alpha' && view.rowStyle === 'alpha')}
            onChange={(v) => set({ start: v })} options={[[1, '1'], [0, '0']]} />
        </div>
        <div className="bv-row">
          <span className="bv-label">Origin</span>
          <div className="bv-origin" role="radiogroup" aria-label="Corner where counting starts">
            {ORIGINS.map(([o, name]) => (
              <button key={o} type="button" role="radio" aria-checked={view.origin === o} title={name} aria-label={name}
                disabled={labelsOff} className={`bv-corner ${o} ${view.origin === o ? 'active' : ''}`} onClick={() => set({ origin: o })} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function BoardSettingsStyles() {
  return <style dangerouslySetInnerHTML={{ __html: `
        .board-card { gap: 8px; }
        .bv-switch {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          font-size: var(--fs-sm);
          color: var(--txt0);
          user-select: none;
        }
        .bv-switch input { position: absolute; opacity: 0; width: 1px; height: 1px; }
        .bv-track {
          width: 30px; height: 17px; flex-shrink: 0;
          border-radius: 9px;
          background: var(--bg4);
          border: 1px solid var(--border2);
          position: relative;
          transition: background 0.2s, border-color 0.2s;
        }
        .bv-thumb {
          position: absolute; top: 2px; left: 2px;
          width: 11px; height: 11px; border-radius: 50%;
          background: var(--txt1);
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), background 0.2s;
        }
        .bv-switch input:checked + .bv-track { background: var(--blu); border-color: var(--blu-bright); }
        .bv-switch input:checked + .bv-track .bv-thumb { transform: translateX(13px); background: #fff; }
        .bv-switch input:focus-visible + .bv-track { outline: 2px solid var(--blu-bright); outline-offset: 2px; }
        .bv-switch.disabled { opacity: 0.4; cursor: default; }

        .bv-group { display: flex; flex-direction: column; gap: 8px; }
        .bv-group.disabled { opacity: 0.45; }
        .bv-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-width: 0;
        }
        .bv-label {
          font-size: var(--fs-xs);
          color: var(--txt1);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          white-space: nowrap;
        }
        .bv-size { display: flex; align-items: center; gap: 4px; min-width: 0; }
        .bv-size input {
          width: 52px;
          padding: 4px 6px;
          background: var(--bg3);
          border: 1px solid var(--border);
          border-radius: 6px;
          color: var(--txt0);
          font-family: 'Outfit', sans-serif;
          font-size: var(--fs-sm);
          font-weight: 700;
          text-align: center;
          -moz-appearance: textfield;
        }
        .bv-size input::-webkit-outer-spin-button,
        .bv-size input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .bv-size input::placeholder { color: var(--txt2); font-weight: 600; }
        .bv-size input:focus { outline: none; border-color: var(--blu-bright); }
        .bv-x, .bv-unit { font-size: var(--fs-xs); color: var(--txt1); }
        .bv-mini {
          margin-left: 4px;
          padding: 3px 8px;
          background: var(--bg4);
          border: 1px solid var(--border);
          border-radius: 6px;
          color: var(--txt1);
          font-size: var(--fs-xs);
          font-weight: 700;
          cursor: pointer;
        }
        .bv-mini:hover { color: var(--txt0); border-color: var(--border2); }

        .bv-seg {
          display: flex;
          background: var(--bg3);
          padding: 2px;
          border-radius: 7px;
          border: 1px solid var(--border);
        }
        .bv-seg button {
          padding: 3px 8px;
          border: none;
          background: transparent;
          color: var(--txt1);
          font-family: 'Outfit', sans-serif;
          font-size: var(--fs-xs);
          font-weight: 700;
          border-radius: 5px;
          cursor: pointer;
          white-space: nowrap;
        }
        .bv-seg button.active { background: var(--blu); color: #fff; }
        .bv-seg button:disabled { cursor: default; }
        .bv-seg.disabled button.active { background: var(--bg4); color: var(--txt1); }

        .bv-origin { display: grid; grid-template-columns: repeat(2, 22px); gap: 4px; }
        .bv-corner {
          width: 22px; height: 18px;
          background: var(--bg3);
          border: 1px solid var(--border);
          border-radius: 4px;
          position: relative;
          cursor: pointer;
        }
        .bv-corner::after {
          content: '';
          position: absolute;
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--txt2);
        }
        .bv-corner.tl::after { top: 2px; left: 2px; }
        .bv-corner.tr::after { top: 2px; right: 2px; }
        .bv-corner.bl::after { bottom: 2px; left: 2px; }
        .bv-corner.br::after { bottom: 2px; right: 2px; }
        .bv-corner:hover:not(:disabled) { border-color: var(--border2); }
        .bv-corner.active { border-color: var(--blu-bright); }
        .bv-corner.active::after { background: var(--blu-bright); }
        .bv-corner:disabled { cursor: default; }

        .bv-note {
          font-size: var(--fs-xs);
          line-height: 1.45;
          color: var(--txt1);
          display: flex;
          gap: 6px;
          align-items: flex-start;
        }
        .bv-note b { color: var(--blu-bright); font-weight: 800; }
        .bv-note.warn {
          color: #ff7b72;
          background: rgba(248, 81, 73, 0.1);
          border: 1px solid rgba(248, 81, 73, 0.45);
          border-radius: 6px;
          padding: 6px 8px;
        }
        .bv-note.warn svg { flex-shrink: 0; margin-top: 1px; }
  ` }} />;
}
