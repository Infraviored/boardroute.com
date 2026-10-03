import React from 'react';
import { boostColor, compColor } from '../engine/render-utils.js';
import {
  Plus,
  Library,
  Cpu,
  Pencil,
  Info,
  CircuitBoard,
  Shapes
} from 'lucide-react';

export function SidebarLeft({
  jsonInput,
  setJsonInput,
  components,
  selectedId,
  onSelectComponent,
  onOpenLibrary,
  onAddNewComponent,
  onEditComponent,
  onOpenPrompt,
  onOpenExamples
}) {

  return (
    <aside id="lsb">
      {/* Circuit Definition Section */}
      <section className="sidebar-section">
        <div className="section-header">
          <CircuitBoard size={18} />
          <h2>Circuit Definition</h2>
        </div>
        <div className="lbody">
          <div className="circuit-actions">
            <button className="prompt-help-btn examples-btn" onClick={onOpenExamples} title="Load one of the example circuits">
              <Shapes size={14} />
              Examples
            </button>
            <button className="prompt-help-btn" onClick={onOpenPrompt}>
              <Info size={14} />
              Get it from your AI
            </button>
          </div>

          <div className="textarea-container">
            <textarea
              placeholder="Paste JSON or generate with an LLM..."
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              spellCheck="false"
            />
          </div>
        </div>
      </section>

      <div className="section-divider"></div>

      {/* Components Section */}
      <section className="sidebar-section scroll-container" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="section-header">
          <Cpu size={18} />
          <h2>Components</h2>
        </div>

        <div className="header-actions-row">
          <button className="tplbtn" onClick={onOpenLibrary} style={{ flex: 1 }}>
            <Library size={13} /> Library
          </button>
          <button className="tplbtn grn-bg" onClick={onAddNewComponent} style={{ flex: 1 }}>
            <Plus size={13} /> New
          </button>
        </div>

        <div className="lbody comp-list">
          {components.length === 0 ? (
            <div className="empty-state">
              <Cpu size={32} style={{ opacity: 0.2, marginBottom: '8px' }} />
              <div>No components loaded.</div>
            </div>
          ) : (
            components.map(c => {
              const boosted = boostColor(compColor(c));
              return (
                <div
                  key={c.id}
                  className={`comp-card ${selectedId === c.id ? 'sel' : ''}`}
                  onClick={() => onSelectComponent(c.id)}
                  style={{
                    '--comp-color': boosted,
                  }}
                >
                  <div className="comp-id-tag">{c.id}</div>
                  <div className="comp-info">
                    <div className="comp-name">{c.name}</div>
                    <div className="comp-value">{c.value}</div>
                  </div>
                  <div className="comp-actions">
                    <div className="comp-pins-tag">{c.pins.length}P</div>
                    <button
                      className="edit-mini-btn"
                      onClick={(e) => { e.stopPropagation(); onEditComponent(c.id); }}
                      title="Edit Component"
                    >
                      <Pencil size={11} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <style dangerouslySetInnerHTML={{
        __html: `
        #lsb {
          width: var(--lsb-width);
          background: var(--bg2);
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          z-index: 10;
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
        }
        .section-header h2 {
           font-size: var(--fs-lg);
           font-weight: 700;
           margin: 0;
           letter-spacing: -0.01em;
           color: var(--txt0);
        }
        .section-header svg {
           color: var(--blu-bright);
           opacity: 0.8;
        }
        .section-divider {
           height: 1px;
           background: linear-gradient(90deg, transparent, var(--border2), transparent);
           margin: 4px 12px 4px 16px;
           opacity: 0.3;
        }
        .header-actions-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          padding: 0 12px 8px 16px;
        }
        .lbody {
          padding: 0 12px 12px 16px;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .circuit-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
        .circuit-actions .examples-btn { flex: 1 0 auto; color: var(--grn-bright); background: rgba(63, 185, 80, 0.1); border-color: rgba(63, 185, 80, 0.25); }
        .circuit-actions .examples-btn:hover { background: rgba(63, 185, 80, 0.18); border-color: var(--grn-bright); }
        .prompt-help-btn {
          flex: 1 0 auto;
          width: auto;
          box-sizing: border-box;
          background: rgba(31, 111, 235, 0.1);
          border: 1px solid rgba(31, 111, 235, 0.2);
          color: var(--blu-bright);
          padding: 8px 12px;
          border-radius: 8px;
          font-size: var(--fs-sm);
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: 0.2s;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .prompt-help-btn:hover {
          background: rgba(31, 111, 235, 0.18);
          border-color: var(--blu-bright);
        }
        .textarea-container {
           position: relative;
           width: 100%;
           box-sizing: border-box;
           border-radius: 8px;
           overflow: hidden;
           border: 1px solid var(--border2);
           background: var(--bg3);
           display: flex; /* Ensures textarea fills it better */
        }
        textarea {
           border: none !important;
           background: transparent !important;
           min-height: 120px;
           width: 100%;
           font-size: var(--fs-sm);
           padding: 10px;
           line-height: 1.5;
           color: var(--txt1);
        }
        .tplbtn {
          padding: 6px 10px;
          border-radius: 8px;
          cursor: pointer;
          font-size: var(--fs-xs);
          font-weight: 600;
          background: var(--bg3);
          border: 1px solid var(--border);
          color: var(--txt1);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: 0.2s;
          flex: 1;
          min-width: 80px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .tplbtn:hover { 
          background: var(--bg4);
          border-color: var(--blu-bright);
          color: var(--txt0);
        }
        
        .comp-list {
          gap: 6px;
        }
        .empty-state {
          padding: 30px 20px;
          text-align: center;
          font-size: var(--fs-sm);
          color: var(--txt2);
          display: flex;
          flex-direction: column;
          align-items: center;
          background: rgba(255,255,255,0.01);
          border-radius: 10px;
          border: 1px dashed var(--border);
        }

        .comp-card {
           background: var(--bg3);
           border: 1px solid var(--border);
           border-left: 3px solid var(--comp-color);
           border-radius: 8px;
           padding: 6px 8px;
           display: flex;
           align-items: center;
           gap: 8px;
           cursor: pointer;
           transition: all 0.2s;
           min-width: 0;
           overflow: hidden;
        }
        .comp-card:hover {
           background: var(--bg4);
           border-color: var(--border2);
           border-left-color: var(--comp-color);
        }
        .comp-card.sel {
           background: var(--bg4);
           border-color: var(--comp-color);
           box-shadow: 0 0 0 1px var(--comp-color), 0 0 15px color-mix(in srgb, var(--comp-color), transparent 60%);
        }
        .comp-id-tag {
          font-family: 'Outfit', sans-serif;
          font-weight: 800;
          font-size: var(--fs-xs);
          color: var(--txt0);
          min-width: 26px;
          background: rgba(255,255,255,0.05);
          padding: 2px 4px;
          border-radius: 4px;
          text-align: center;
          border: 1px solid var(--border);
          flex-shrink: 0;
        }
        .comp-info {
          display: flex;
          flex-direction: column;
          gap: 0px;
          min-width: 0;
          flex: 1;
        }
        .comp-name {
          font-size: var(--fs-md);
          font-weight: 600;
          color: var(--txt0);
          white-space: nowrap;
          overflow: hidden;
          mask-image: linear-gradient(to right, black 90%, transparent 100%);
        }
        .comp-value {
          font-size: var(--fs-xs);
          color: var(--txt1);
          font-family: 'Consolas', monospace;
          white-space: nowrap;
          overflow: hidden;
          mask-image: linear-gradient(to right, black 90%, transparent 100%);
        }
        .comp-actions {
          display: flex;
          align-items: center;
          gap: 4px;
          margin-left: auto;
          flex-shrink: 0;
        }
        .comp-pins-tag {
           font-size: var(--fs-xs);
           font-weight: 800;
           color: var(--txt1);
           background: var(--bg2);
           padding: 0 6px;
           border-radius: 5px;
           border: 1px solid var(--border);
           height: 22px;
           display: flex;
           align-items: center;
           justify-content: center;
           min-width: 28px;
        }
        .edit-mini-btn {
          background: var(--bg2);
          border: 1px solid var(--border);
          color: var(--txt1);
          width: 22px;
          height: 22px;
          border-radius: 5px;
          cursor: pointer;
          transition: 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .edit-mini-btn:hover {
          color: #fff;
          border-color: var(--blu);
        }

        .view-mode-row {
          padding: 0 12px 12px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .view-mode-row label {
          font-size: 0.7em;
          font-weight: 700;
          color: var(--txt2);
          text-transform: uppercase;
        }
        .view-toggle {
          display: flex;
          background: var(--bg3);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 2px;
        }
        .view-toggle button {
          border: none;
          background: transparent;
          color: var(--txt1);
          font-size: 0.65em;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 4px;
          cursor: pointer;
          transition: 0.2s;
        }
        .view-toggle button.active {
          background: var(--blu);
          color: #fff;
        }
      `}} />
    </aside>
  );
}
