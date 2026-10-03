import React from 'react';
import { netColor, generatePrunedSVG, computeBoardFrame, holeLabel, normalizeBoardView } from '../engine/render-utils.js';
import {
  Settings2,
  Tag,
  Hash,
  MapPin,
  FlipHorizontal,
  ChevronDown,
  MousePointer2,
  Share2,
  Ruler,
  AlertTriangle
} from 'lucide-react';

const SECTIONS_KEY = 'pcb_rsb_sections';

export function SidebarRight({
  stats,
  selectedComp,
  nets,
  hoveredNet,
  setHoveredNet,
  selectedNet,
  setSelectedNet,
  activeNets = [],
  components = [],
  wires = [],
  bestSnapshot = null,
  boardView = null,
  setBoardView = null
}) {
  // Which accordion sections are open. Component and Network also open on their own when
  // something gets selected; Board and Bottom side start collapsed.
  const [open, setOpen] = React.useState(() => {
    const defaults = { comp: true, nets: true, board: false, bottom: false };
    try {
      const saved = JSON.parse(localStorage.getItem(SECTIONS_KEY) || 'null');
      return saved && typeof saved === 'object' ? { ...defaults, ...saved } : defaults;
    } catch {
      return defaults;
    }
  });

  React.useEffect(() => {
    try { localStorage.setItem(SECTIONS_KEY, JSON.stringify(open)); } catch { /* storage unavailable */ }
  }, [open]);

  const toggle = (sec) => setOpen(prev => ({ ...prev, [sec]: !prev[sec] }));

  // Auto-open on a new selection (adjusting state during render, not in an effect).
  const selKey = selectedComp?.id ?? null;
  const [prevSel, setPrevSel] = React.useState({ comp: selKey, net: selectedNet });
  if (prevSel.comp !== selKey || prevSel.net !== selectedNet) {
    const openComp = selKey && selKey !== prevSel.comp;
    const openNets = selectedNet && selectedNet !== prevSel.net;
    setPrevSel({ comp: selKey, net: selectedNet });
    if ((openComp && !open.comp) || (openNets && !open.nets)) {
      setOpen(prev => ({ ...prev, ...(openComp ? { comp: true } : {}), ...(openNets ? { nets: true } : {}) }));
    }
  }

  const preview = React.useMemo(() => {
    if (!open.bottom) return null;
    const comps = bestSnapshot?.components || components;
    const wrs = bestSnapshot?.wires || wires;
    return generatePrunedSVG({
      components: comps,
      wires: wrs,
      side: 'bottom',
      padding: 5,
      // Axis labels + board outline only: per-pin labels are unreadable at preview size.
      view: boardView ? { ...boardView, pinCoords: false } : null
    });
  }, [open.bottom, components, wires, bestSnapshot, boardView]);

  const netCount = Object.keys(nets).length;
  const done = stats.completion >= 100;

  return (
    <aside id="rsb">
      {/* Board stats: always visible, one compact block */}
      <div className="rs-stats" aria-label="Board stats">
        <div className="rs-stat-grid">
          <div className="rs-stat"><span className="rs-v">{stats.components}</span><span className="rs-l">parts</span></div>
          <div className="rs-stat"><span className="rs-v" style={{ color: 'var(--blu-bright)' }}>{stats.nets}</span><span className="rs-l">nets</span></div>
          <div className="rs-stat"><span className="rs-v">{stats.footprint || '—'}</span><span className="rs-l">holes</span></div>
          <div className="rs-stat"><span className="rs-v">{stats.wireLength || '—'}</span><span className="rs-l">wire</span></div>
        </div>
        <div className="rs-progress" title="Share of connections that are wired">
          <div className="rs-progress-bar" style={{ width: `${stats.completion || 0}%`, background: done ? 'var(--grn-bright)' : 'var(--blu-bright)' }} />
        </div>
        <div className="rs-progress-row">
          <span>{stats.completion !== null ? (done ? 'All connections wired' : `${stats.completion}% wired`) : 'Not wired yet'}</span>
          {stats.jumpers > 0 && <span className="rs-jumpers">{stats.jumpers} jumper{stats.jumpers === 1 ? '' : 's'}</span>}
        </div>
      </div>

      {/* Selected component */}
      <section className={`rs-sec ${open.comp ? 'open' : ''}`}>
        <button type="button" className="rs-head" onClick={() => toggle('comp')} aria-expanded={!!open.comp}>
          <MousePointer2 size={15} />
          <span className="rs-title">Component</span>
          {selectedComp
            ? <span className="rs-chip">{selectedComp.id}</span>
            : <span className="rs-chip muted">none</span>}
          <ChevronDown size={14} className="rs-chev" />
        </button>

        {open.comp && (selectedComp ? (
          <div id="selInfo">
            <div className="prop-list">
              <div className="prop-item">
                <Tag size={12} className="prop-icon" />
                <div className="prop-label">ID</div>
                <div className="prop-value">{selectedComp.id}</div>
              </div>
              <div className="prop-item">
                <Settings2 size={12} className="prop-icon" />
                <div className="prop-label">Name</div>
                <div className="prop-value">{selectedComp.name}</div>
              </div>
              <div className="prop-item">
                <Hash size={12} className="prop-icon" />
                <div className="prop-label">Value</div>
                <div className="prop-value">{selectedComp.value}</div>
              </div>
              <div className="prop-item">
                <MapPin size={12} className="prop-icon" />
                <div className="prop-label">Origin</div>
                <div className="prop-value">({selectedComp.ox}, {selectedComp.oy})</div>
              </div>

              <div className="pin-list-header">Pins ({selectedComp.pins.length})</div>
              <div className="pin-list">
                {selectedComp.pins.map((p, i) => (
                  <div className="pin-row" key={i}>
                    <span className="pin-label" style={{ borderLeft: `2px solid ${netColor(p.net)}` }}>{p.lbl}</span>
                    <span className="pin-net">{p.net || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="rs-hint">Click a part on the board or in the Parts list.</div>
        ))}
      </section>

      {/* Nets */}
      <section className={`rs-sec ${open.nets ? 'open' : ''}`}>
        <button type="button" className="rs-head" onClick={() => toggle('nets')} aria-expanded={!!open.nets}>
          <Share2 size={15} />
          <span className="rs-title">Network</span>
          {selectedNet
            ? <span className="rs-chip" style={{ '--chip-color': netColor(selectedNet) }}>{selectedNet}</span>
            : <span className="rs-chip muted">{netCount}</span>}
          <ChevronDown size={14} className="rs-chev" />
        </button>

        {open.nets && (
          <div id="netPanel">
            {netCount === 0 && <div className="rs-hint">No nets yet.</div>}
            {Object.entries(nets).map(([name, pins]) => {
              const isMarked = activeNets.includes(name);
              return (
                <div
                  key={name}
                  className={`net-row ${hoveredNet === name ? 'hov' : ''} ${isMarked ? 'sel' : ''}`}
                  style={{ '--net-color': netColor(name) }}
                  onMouseEnter={() => setHoveredNet(name)}
                  onMouseLeave={() => setHoveredNet(null)}
                  onClick={() => setSelectedNet(selectedNet === name ? null : name)}
                >
                  <div className="net-dot" style={{ background: netColor(name) }}></div>
                  <span className="net-name">{name}</span>
                  <span className="net-count">{pins.length}P</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Physical board + hole coordinates */}
      {boardView && setBoardView && (
        <section className={`rs-sec ${open.board ? 'open' : ''}`}>
          <button type="button" className="rs-head" onClick={() => toggle('board')} aria-expanded={!!open.board}>
            <Ruler size={15} />
            <span className="rs-title">Board &amp; coordinates</span>
            <ChevronDown size={14} className="rs-chev" />
          </button>
          {open.board && (
            <BoardCard view={boardView} setView={setBoardView} components={components} wires={wires} />
          )}
        </section>
      )}

      {/* Bottom side preview */}
      <section className={`rs-sec ${open.bottom ? 'open' : ''}`}>
        <button type="button" className="rs-head" onClick={() => toggle('bottom')} aria-expanded={!!open.bottom}>
          <FlipHorizontal size={15} />
          <span className="rs-title">Bottom side preview</span>
          <ChevronDown size={14} className="rs-chev" />
        </button>

        {open.bottom && (
          <div className="lbody">
            {preview ? (
              <div className="bottom-preview-container">
                <div className="bottom-preview-svg">
                  <svg viewBox={`0 0 ${preview.W} ${preview.H}`} style={{ width: '100%', height: 'auto', maxHeight: '220px', display: 'block', borderRadius: '8px' }}>
                    <g dangerouslySetInnerHTML={{ __html: preview.inner }} />
                  </svg>
                </div>
              </div>
            ) : (
              <div className="empty-state">No preview available</div>
            )}
          </div>
        )}
      </section>

      <style dangerouslySetInnerHTML={{
        __html: `
        #rsb {
          width: var(--rsb-width);
          background: var(--bg2);
          border-left: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          z-index: 10;
          min-width: 0;
          overflow-y: auto;
        }
        .sidebar-section {
          display: flex;
          flex-direction: column;
          padding: 4px 0;
        }
        .section-header {
           padding: 12px 12px 8px 16px;
           display: flex;
           align-items: center;
           gap: 10px;
           color: var(--txt0);
           user-select: none;
           cursor: default;
        }
        .section-header.clickable {
          cursor: pointer;
        }
        .section-header.clickable:hover {
          background: rgba(255,255,255,0.02);
        }
        .section-header h2 {
           font-size: var(--fs-lg);
           font-weight: 700;
           margin: 0;
           letter-spacing: -0.01em;
           color: var(--txt0);
        }
        .section-header svg:not(.toggle-icon-right) {
           color: var(--txt1);
           opacity: 0.6;
        }
        .toggle-icon-right {
          margin-left: auto;
          color: var(--txt1);
          opacity: 0.3;
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s;
          transform: rotate(90deg);
        }
        .section-header.clickable:hover .toggle-icon-right {
          opacity: 0.7;
        }
        .section-header.open .toggle-icon-right {
          transform: rotate(0deg);
          opacity: 0.8;
          color: var(--blu-bright);
        }
        .section-divider {
           height: 1px;
           background: linear-gradient(90deg, transparent, var(--border2), transparent);
           margin: 4px 12px 4px 16px;
           opacity: 0.3;
        }
        .lbody {
          padding: 0 12px 12px 16px;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .empty-state {
          padding: 20px;
          text-align: center;
          font-size: var(--fs-sm);
          color: var(--txt2);
          background: rgba(255,255,255,0.01);
          border-radius: 8px;
          border: 1px dashed var(--border);
        }

        /* --- Always-visible stats --- */
        .rs-stats {
          padding: 12px 12px 10px 14px;
          border-bottom: 1px solid var(--border);
          background: linear-gradient(180deg, rgba(255,255,255,0.015), transparent);
          flex-shrink: 0;
        }
        .rs-stat-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 4px;
        }
        .rs-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1px;
          padding: 5px 2px;
          background: var(--bg3);
          border: 1px solid var(--border);
          border-radius: 6px;
          min-width: 0;
        }
        .rs-v {
          font-family: 'Outfit', sans-serif;
          font-size: var(--fs-md);
          font-weight: 800;
          color: var(--txt0);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
        }
        .rs-l {
          font-size: 0.66em;
          color: var(--txt1);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .rs-progress {
          margin-top: 8px;
          height: 4px;
          border-radius: 2px;
          background: var(--bg0);
          overflow: hidden;
        }
        .rs-progress-bar { height: 100%; transition: width 0.3s ease; }
        .rs-progress-row {
          margin-top: 5px;
          display: flex;
          justify-content: space-between;
          gap: 8px;
          font-size: var(--fs-xs);
          color: var(--txt1);
          font-weight: 600;
        }
        .rs-jumpers { color: var(--blu-bright); }

        /* --- Accordion sections --- */
        .rs-sec { border-bottom: 1px solid var(--border); flex-shrink: 0; }
        .rs-head {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 10px 12px 10px 14px;
          background: none;
          border: none;
          color: var(--txt0);
          cursor: pointer;
          text-align: left;
          font: inherit;
        }
        .rs-head:hover { background: rgba(255,255,255,0.025); }
        .rs-head:focus-visible { outline: 2px solid var(--blu-bright); outline-offset: -2px; }
        .rs-head > svg:first-child { color: var(--txt1); opacity: 0.7; flex-shrink: 0; }
        .rs-sec.open .rs-head > svg:first-child { color: var(--blu-bright); opacity: 0.9; }
        .rs-title {
          font-family: 'Outfit', sans-serif;
          font-size: var(--fs-md);
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
        }
        .rs-chip {
          --chip-color: var(--blu-bright);
          margin-left: auto;
          font-family: 'Consolas', monospace;
          font-size: var(--fs-xs);
          font-weight: 700;
          color: var(--chip-color);
          background: color-mix(in srgb, var(--chip-color), transparent 88%);
          border: 1px solid color-mix(in srgb, var(--chip-color), transparent 65%);
          border-radius: 5px;
          padding: 1px 6px;
          max-width: 90px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex-shrink: 1;
        }
        .rs-chip.muted { color: var(--txt2); background: none; border-color: var(--border); font-family: inherit; }
        .rs-chev {
          flex-shrink: 0;
          color: var(--txt1);
          opacity: 0.4;
          transform: rotate(-90deg);
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s;
        }
        .rs-title + .rs-chev { margin-left: auto; }
        .rs-sec.open .rs-chev { transform: none; opacity: 0.8; color: var(--blu-bright); }
        .rs-hint {
          padding: 0 14px 12px;
          font-size: var(--fs-sm);
          color: var(--txt1);
        }
        #netPanel .rs-hint { padding: 0 2px; }

        .bottom-preview-container {
          padding-top: 4px;
        }
        .bottom-preview-svg {
          background: rgba(0,0,0,0.2);
          border-radius: 12px;
          padding: 8px;
          border: 1px solid var(--border);
          box-shadow: inset 0 2px 8px rgba(0,0,0,0.2);
        }

        .prop-list {
          padding: 8px 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .prop-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 0;
          border-bottom: 1px solid var(--border);
          min-width: 0;
          overflow: hidden;
        }
        .prop-icon { color: var(--txt2); flex-shrink: 0; }
        .prop-label { font-size: var(--fs-xs); color: var(--txt1); font-weight: 600; width: 45px; flex-shrink: 0; }
        .prop-value { 
          font-size: var(--fs-md); 
          color: var(--txt0); 
          font-family: 'Consolas', monospace; 
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }


        .pin-list-header {
           font-size: var(--fs-xs);
           font-weight: 800;
           color: var(--txt1);
           margin-top: 12px;
           margin-bottom: 4px;
           text-transform: uppercase;
        }
        .pin-list {
           display: grid;
           grid-template-columns: 1fr;
           gap: 2px;
           max-height: 200px;
           overflow-y: auto;
        }
        .pin-row {
           display: flex;
           justify-content: space-between;
           padding: 4px 8px;
           background: rgba(255,255,255,0.02);
           border-radius: 4px;
           font-size: var(--fs-sm);
        }
        .pin-label { color: var(--txt1); padding-left: 6px; }
        .pin-net { color: var(--txt0); font-family: 'Consolas', monospace; }

        #netPanel {
          padding: 8px 12px 16px 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .net-row {
          display: flex;
          align-items: center;
          padding: 6px 10px;
          gap: 10px;
          border: 1px solid var(--border);
          border-left: 3px solid var(--net-color);
          background: var(--bg3);
          border-radius: 6px;
          transition: all 0.2s;
          cursor: pointer;
          user-select: none;
        }
        .net-row:hover { 
          background: var(--bg4); 
          border-color: var(--border2);
          border-left-color: var(--net-color);
        }
        .net-row.sel {
           background: var(--bg4);
           border-color: var(--net-color);
           box-shadow: 0 0 0 1px var(--net-color), 0 0 12px color-mix(in srgb, var(--net-color), transparent 60%);
        }
        .net-dot { display: none; }
        .net-name { 
          flex: 1; 
          font-size: var(--fs-md); 
          color: var(--txt0); 
          font-family: 'Consolas', monospace; 
          font-weight: 600; 
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .net-count { 
          font-size: var(--fs-xs); 
          font-weight: 800; 
          color: var(--txt2); 
          background: var(--bg2);
          padding: 1px 5px;
          border-radius: 4px;
          border: 1px solid var(--border);
          flex-shrink: 0;
        }

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
      `}} />
    </aside>
  );
}

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
function BoardCard({ view, setView, components, wires }) {
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
