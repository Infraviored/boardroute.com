import React from 'react';
import { netColor, generatePrunedSVG } from '../engine/render-utils.js';
import {
  Settings2,
  Tag,
  Hash,
  MapPin,
  FlipHorizontal,
  ChevronDown,
  Activity,
  MousePointer2,
  Share2
} from 'lucide-react';

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
  bestSnapshot = null
}) {
  const [expanded, setExpanded] = React.useState(() => {
    const defaultExpanded = { bottom: true, stats: true, selected: true, nets: true };
    const saved = localStorage.getItem('sidebar_rsb_expanded');
    if (!saved) return defaultExpanded;
    try {
      return JSON.parse(saved);
    } catch {
      return defaultExpanded;
    }
  });

  React.useEffect(() => {
    localStorage.setItem('sidebar_rsb_expanded', JSON.stringify(expanded));
  }, [expanded]);

  const toggle = (sec) => setExpanded(prev => ({ ...prev, [sec]: !prev[sec] }));

  React.useEffect(() => {
    setExpanded(prev => ({ ...prev, selected: !!selectedComp }));
  }, [selectedComp]);

  const preview = React.useMemo(() => {
    if (!expanded.bottom) return null;
    const comps = bestSnapshot?.components || components;
    const wrs = bestSnapshot?.wires || wires;
    return generatePrunedSVG({
      components: comps,
      wires: wrs,
      side: 'bottom',
      padding: 5
    });
  }, [expanded.bottom, components, wires, bestSnapshot]);

  return (
    <aside id="rsb">
      {/* Bottom Side Section */}
      <section className="sidebar-section">
        <div className={`section-header clickable ${expanded.bottom ? 'open' : ''}`} onClick={() => toggle('bottom')}>
          <FlipHorizontal size={18} />
          <h2>Bottom Side</h2>
          <ChevronDown size={14} className="toggle-icon-right" />
        </div>

        {expanded.bottom && (
          <div className="lbody">
            {preview ? (
              <div className="bottom-preview-container">
                <div className="bottom-preview-svg">
                  <svg viewBox={`0 0 ${preview.W} ${preview.H}`} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '8px' }}>
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

      <div className="section-divider"></div>

      {/* Stats Section */}
      <section className="sidebar-section">
        <div className={`section-header clickable ${expanded.stats ? 'open' : ''}`} onClick={() => toggle('stats')}>
          <Activity size={18} />
          <h2>Board Stats</h2>
          <ChevronDown size={14} className="toggle-icon-right" />
        </div>

        {expanded.stats && (
          <div className="sgrid">
            <div className="scard">
              <span className="sl">Components</span>
              <span className="sv">{stats.components}</span>
            </div>
            <div className="scard">
              <span className="sl">Nets</span>
              <span className="sv" style={{ color: 'var(--blu-bright)' }}>{stats.nets}</span>
            </div>
            <div className="scard">
              <span className="sl">Wire length</span>
              <span className="sv">{stats.wireLength || '—'}</span>
            </div>
            <div className="scard">
              <span className="sl">Footprint</span>
              <span className="sv">{stats.footprint || '—'}</span>
            </div>
            {stats.jumpers > 0 && (
              <div className="scard w2">
                <span className="sl">Jumper wires</span>
                <span className="sv" style={{ color: 'var(--blu-bright)' }}>{stats.jumpers}</span>
              </div>
            )}
            <div className="scard w2">
              <span className="sl">Completion</span>
              <div className="progress-container-sleek">
                <div className="progress-bar-sleek" style={{ width: `${stats.completion || 0}%`, background: stats.completion >= 100 ? 'var(--grn-bright)' : 'var(--blu-bright)' }}></div>
                <div className="progress-text-sleek">{stats.completion !== null ? `${stats.completion}%` : '—'}</div>
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="section-divider"></div>

      {/* Selected Component Section */}
      <section className="sidebar-section">
        <div
          className={`section-header ${selectedComp ? 'clickable' : ''} ${expanded.selected && selectedComp ? 'open' : ''}`}
          onClick={() => selectedComp && toggle('selected')}
        >
          <MousePointer2 size={18} />
          <h2>Component</h2>
          <ChevronDown size={14} className="toggle-icon-right" />
        </div>

        {expanded.selected && selectedComp && (
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
        )}
      </section>

      <div className="section-divider"></div>

      {/* Nets Section */}
      <section className="sidebar-section scroll-container" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div className={`section-header clickable ${expanded.nets ? 'open' : ''}`} onClick={() => toggle('nets')}>
          <Share2 size={18} />
          <h2>Network</h2>
          <ChevronDown size={14} className="toggle-icon-right" />
        </div>

        {expanded.nets && (
          <div id="netPanel">
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

        .sgrid {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 0 12px 12px 16px;
        }
        .scard {
          background: var(--bg3);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 6px 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: 0.2s;
          min-width: 0;
          overflow: hidden;
        }
        .scard:hover {
          background: var(--bg4);
          border-color: var(--border2);
        }
        .sv {
          font-family: 'Outfit', sans-serif;
          font-size: var(--fs-md);
          font-weight: 800;
          color: var(--txt0);
          letter-spacing: -0.01em;
          white-space: nowrap;
        }
        .sl {
          font-size: var(--fs-xs);
          color: var(--txt1);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          white-space: nowrap;
        }

        .progress-container-sleek {
          width: 80px;
          height: 18px;
          background: var(--bg0);
          border-radius: 4px;
          position: relative;
          overflow: hidden;
          border: 1px solid var(--border);
        }
        .progress-bar-sleek {
          height: 100%;
          transition: width 0.3s ease;
          opacity: 0.8;
        }
        .progress-text-sleek {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: var(--fs-xs);
          font-weight: 900;
          color: #fff;
          text-shadow: 0 1px 2px rgba(0,0,0,0.5);
        }

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
