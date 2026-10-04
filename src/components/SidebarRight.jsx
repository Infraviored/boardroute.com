import React from 'react';
import { BoardCard, BoardSettingsStyles } from './BoardSettings.jsx';
import { netColor, generatePrunedSVG } from '../engine/render-utils.js';
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

  // Auto-open on a new selection.
  const selKey = selectedComp?.id ?? null;
  const prevSel = React.useRef({ comp: selKey, net: selectedNet });
  React.useEffect(() => {
    const openComp = Boolean(selKey && selKey !== prevSel.current.comp && !open.comp);
    const openNets = Boolean(selectedNet && selectedNet !== prevSel.current.net && !open.nets);
    prevSel.current = { comp: selKey, net: selectedNet };
    if (openComp || openNets) {
      setOpen(prev => ({ ...prev, ...(openComp ? { comp: true } : {}), ...(openNets ? { nets: true } : {}) }));
    }
  }, [selKey, selectedNet, open.comp, open.nets]);

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
            <><BoardCard view={boardView} setView={setBoardView} components={components} wires={wires} /><BoardSettingsStyles /></>
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

      `}} />
    </aside>
  );
}

