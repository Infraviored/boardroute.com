import React from 'react';
import { boostColor, compColor } from '../engine/render-utils.js';
import {
  Plus,
  Library,
  Cpu,
  Pencil,
  Sparkles,
  CircuitBoard,
  FolderOpen,
  Shapes,
  ClipboardPaste,
  X,
  Check,
  AlertTriangle
} from 'lucide-react';

/** What the circuit JSON contains, without touching the board: counts, or the parse error. */
function summarize(json) {
  if (!json || !json.trim()) return { empty: true };
  try {
    const doc = JSON.parse(json);
    const comps = Array.isArray(doc?.components) ? doc.components : [];
    const nets = new Set();
    for (const c of comps) for (const p of (Array.isArray(c?.pins) ? c.pins : [])) if (p?.net) nets.add(p.net);
    return { parts: comps.length, nets: nets.size };
  } catch (e) {
    return { error: e.message };
  }
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

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
  onOpenExamples,
  onOpenFile,
  onLoadCircuit,
  exampleTitle = null
}) {
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [edited, setEdited] = React.useState(false);
  const textareaRef = React.useRef(null);
  const summary = React.useMemo(() => summarize(jsonInput), [jsonInput]);
  const hasCircuit = components.length > 0;

  const openEditor = () => { setEditorOpen(true); setEdited(false); };
  const closeEditor = React.useCallback(() => setEditorOpen(false), []);

  React.useEffect(() => {
    if (!editorOpen) return;
    textareaRef.current?.focus({ preventScroll: true });
    const onKey = (e) => { if (e.key === 'Escape') closeEditor(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editorOpen, closeEditor]);

  const load = () => {
    // App shows a notice when the JSON is unusable; keep the editor open in that case.
    const ok = onLoadCircuit?.(edited);
    if (ok !== false) setEditorOpen(false);
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) { setJsonInput(text); setEdited(true); }
    } catch {
      // Clipboard read denied or unsupported: select the text so Ctrl+V replaces it.
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }
  };

  const summaryLine = summary.empty ? 'No circuit yet'
    : summary.error ? 'The JSON has an error'
    : `${plural(summary.parts, 'part')} · ${plural(summary.nets, 'net')}`;

  return (
    <aside id="lsb" className={editorOpen ? 'json-open' : ''}>
      {/* Circuit card: what is loaded, and the ways to get a circuit in */}
      <section className="sidebar-section">
        <div className="section-header">
          <CircuitBoard size={18} />
          <h2>Circuit</h2>
        </div>
        <div className="lbody">
          <div className="cc-card">
            <div className="cc-summary">
              {exampleTitle && <div className="cc-title" title={exampleTitle}>{exampleTitle}</div>}
              <div className={`cc-counts ${summary.error ? 'err' : ''}`}>
                {summary.error && <AlertTriangle size={12} />}
                {summaryLine}
              </div>
            </div>
            <div className="cc-actions">
              <button className="cc-btn grn" onClick={onOpenExamples} title="Load one of the example circuits">
                <Shapes size={14} /> Examples
              </button>
              <button className="cc-btn blu" onClick={onOpenPrompt} title="Copy a prompt that makes your AI write the circuit JSON">
                <Sparkles size={14} /> Get it from your AI
              </button>
              <button
                className={`cc-btn wide ${editorOpen ? 'on' : ''}`}
                onClick={() => (editorOpen ? closeEditor() : openEditor())}
                aria-expanded={editorOpen}
                aria-controls="json-editor"
              >
                {hasCircuit ? <Pencil size={13} /> : <ClipboardPaste size={14} />}
                {editorOpen ? 'Close JSON editor' : hasCircuit ? 'Edit JSON' : 'Paste JSON'}
              </button>
              <button className="cc-btn wide" onClick={onOpenFile} title="Open a project file saved with Export → Project file">
                <FolderOpen size={14} /> Open project file
              </button>
            </div>
          </div>
        </div>

        {editorOpen && (
          <div className="json-drawer" id="json-editor" role="dialog" aria-label="Circuit JSON">
            <div className="jd-head">
              <div className="jd-title">Circuit JSON</div>
              <div className="jd-tools">
                <button className="jd-mini" onClick={pasteFromClipboard} title="Replace with the clipboard contents">
                  <ClipboardPaste size={12} /> Paste
                </button>
                <button className="jd-mini" onClick={() => { setJsonInput(''); setEdited(true); textareaRef.current?.focus(); }} title="Empty the editor">
                  Clear
                </button>
                <button className="jd-close" onClick={closeEditor} aria-label="Close JSON editor"><X size={16} /></button>
              </div>
            </div>
            <textarea
              ref={textareaRef}
              className="jd-text"
              placeholder={'Paste the JSON your AI wrote, e.g.\n{\n  "components": [ ... ]\n}'}
              value={jsonInput}
              onChange={(e) => { setJsonInput(e.target.value); setEdited(true); }}
              spellCheck="false"
            />
            <div className="jd-foot">
              <div className={`jd-status ${summary.error ? 'err' : summary.empty ? '' : 'ok'}`}>
                {summary.error ? <><AlertTriangle size={12} /> <span>{summary.error}</span></>
                  : summary.empty ? <span>Paste or type the circuit description</span>
                  : <><Check size={12} /> <span>Valid JSON · {summaryLine}</span></>}
              </div>
              <button className="jd-load" onClick={load} disabled={summary.empty}>
                Load circuit
              </button>
            </div>
          </div>
        )}
      </section>

      <div className="section-divider"></div>

      {/* Parts list: the part of this sidebar people actually use */}
      <section className="sidebar-section scroll-container parts-section">
        <div className="section-header parts-header">
          <Cpu size={18} />
          <h2>Parts</h2>
          {hasCircuit && <span className="parts-count">{components.length}</span>}
        </div>
        <div className="header-actions-row">
          <button className="tplbtn" onClick={onOpenLibrary} title="Add a part from the library">
            <Library size={13} /> Library
          </button>
          <button className="tplbtn grn-bg" onClick={onAddNewComponent} title="Draw a new part">
            <Plus size={13} /> New
          </button>
        </div>

        <div className="lbody comp-list">
          {components.length === 0 ? (
            <div className="empty-state">
              <Cpu size={32} style={{ opacity: 0.2, marginBottom: '8px' }} />
              <div>No parts loaded yet.</div>
              <div className="empty-hint">Pick an example or paste the JSON from your AI.</div>
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
          position: relative;
          min-height: 0;
        }
        /* The desktop JSON drawer hangs over the canvas: lift the sidebar above the canvas overlays */
        #lsb.json-open { z-index: 60; }
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

        /* --- Circuit card --- */
        .cc-card {
          background: var(--bg3);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .cc-summary { min-width: 0; padding: 0 2px; }
        .cc-title {
          font-family: 'Outfit', sans-serif;
          font-weight: 700;
          font-size: var(--fs-md);
          color: var(--txt0);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .cc-counts {
          font-size: var(--fs-sm);
          color: var(--txt1);
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .cc-counts.err { color: #ff7b72; }
        .cc-actions { display: flex; flex-wrap: wrap; gap: 6px; }
        .cc-btn {
          flex: 1 1 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 7px 10px;
          border-radius: 8px;
          font-size: var(--fs-sm);
          font-weight: 700;
          cursor: pointer;
          transition: 0.2s;
          white-space: nowrap;
          background: var(--bg4);
          border: 1px solid var(--border);
          color: var(--txt1);
        }
        .cc-btn:hover { color: var(--txt0); border-color: var(--border2); }
        .cc-btn.wide { flex-basis: 100%; }
        .cc-btn.on { color: var(--txt0); border-color: var(--blu-bright); background: rgba(31, 111, 235, 0.12); }
        .cc-btn.grn { color: var(--grn-bright); background: rgba(63, 185, 80, 0.1); border-color: rgba(63, 185, 80, 0.25); }
        .cc-btn.grn:hover { background: rgba(63, 185, 80, 0.18); border-color: var(--grn-bright); }
        .cc-btn.blu { color: var(--blu-bright); background: rgba(31, 111, 235, 0.1); border-color: rgba(31, 111, 235, 0.25); }
        .cc-btn.blu:hover { background: rgba(31, 111, 235, 0.18); border-color: var(--blu-bright); }

        /* --- JSON editor: a drawer over the canvas on desktop, inline on phones --- */
        .json-drawer {
          position: absolute;
          top: 8px;
          bottom: 8px;
          left: calc(100% + 6px);
          width: min(560px, calc(100vw - var(--lsb-width) - 48px));
          display: flex;
          flex-direction: column;
          background: var(--glass-bg);
          backdrop-filter: blur(14px);
          border: 1px solid var(--border2);
          border-radius: 12px;
          box-shadow: var(--shadow-premium);
          overflow: hidden;
          animation: jd-in 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes jd-in { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: none; } }
        .jd-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 10px 10px 10px 14px;
          border-bottom: 1px solid var(--border);
        }
        .jd-title { font-family: 'Outfit', sans-serif; font-weight: 700; font-size: var(--fs-md); }
        .jd-tools { display: flex; align-items: center; gap: 6px; }
        .jd-mini {
          display: flex; align-items: center; gap: 5px;
          padding: 4px 9px;
          background: var(--bg4);
          border: 1px solid var(--border);
          border-radius: 6px;
          color: var(--txt1);
          font-size: var(--fs-xs);
          font-weight: 700;
          cursor: pointer;
        }
        .jd-mini:hover { color: var(--txt0); border-color: var(--border2); }
        .jd-close {
          display: flex; align-items: center; justify-content: center;
          width: 28px; height: 28px;
          background: none; border: none; border-radius: 6px;
          color: var(--txt1); cursor: pointer;
        }
        .jd-close:hover { color: var(--txt0); background: var(--bg4); }
        #lsb .jd-text {
          flex: 1;
          min-height: 0;
          width: 100%;
          resize: none;
          border: none;
          border-radius: 0;
          background: rgba(0, 0, 0, 0.25);
          padding: 12px 14px;
          font-family: 'JetBrains Mono', 'Consolas', ui-monospace, monospace;
          font-size: 12.5px;
          line-height: 1.55;
          color: var(--txt0);
          tab-size: 2;
        }
        #lsb .jd-text:focus { background: rgba(0, 0, 0, 0.35); }
        .jd-foot {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 10px 10px 14px;
          border-top: 1px solid var(--border);
        }
        .jd-status {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: var(--fs-xs);
          color: var(--txt1);
        }
        .jd-status span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .jd-status svg { flex-shrink: 0; }
        .jd-status.ok { color: var(--grn-bright); }
        .jd-status.err { color: #ff7b72; }
        .jd-load {
          flex-shrink: 0;
          padding: 9px 18px;
          border-radius: 8px;
          border: 1px solid var(--blu-bright);
          background: var(--blu);
          color: #fff;
          font-family: 'Outfit', sans-serif;
          font-size: var(--fs-md);
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 0 18px rgba(31, 111, 235, 0.35);
          transition: 0.2s;
        }
        .jd-load:hover:not(:disabled) { background: #388bfd; }
        .jd-load:disabled { opacity: 0.4; cursor: default; box-shadow: none; }

        @media (max-width: 700px) {
          #lsb.json-open { z-index: 10; }
          .json-drawer {
            position: static;
            width: auto;
            height: 60dvh;
            margin: 0 12px 8px 16px;
            animation: none;
          }
        }

        /* --- Parts list --- */
        .parts-section { display: flex; flex-direction: column; min-height: 0; }
        .parts-count {
          font-family: 'Outfit', sans-serif;
          font-size: var(--fs-xs);
          font-weight: 800;
          color: var(--txt1);
          background: var(--bg3);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 1px 8px;
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
        .empty-hint { margin-top: 4px; font-size: var(--fs-xs); color: var(--txt1); }

        .comp-card {
           background: var(--bg3);
           border: 1px solid var(--border);
           border-left: 3px solid var(--comp-color);
           border-radius: 8px;
           padding: 8px 10px;
           display: flex;
           align-items: center;
           gap: 10px;
           cursor: pointer;
           transition: all 0.2s;
           min-width: 0;
           overflow: hidden;
           flex-shrink: 0;
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
          font-size: var(--fs-sm);
          color: var(--comp-color);
          min-width: 32px;
          background: color-mix(in srgb, var(--comp-color), transparent 88%);
          padding: 3px 5px;
          border-radius: 5px;
          text-align: center;
          border: 1px solid color-mix(in srgb, var(--comp-color), transparent 70%);
          flex-shrink: 0;
        }
        .comp-info {
          display: flex;
          flex-direction: column;
          gap: 1px;
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
           height: 24px;
           display: flex;
           align-items: center;
           justify-content: center;
           min-width: 28px;
        }
        .edit-mini-btn {
          background: var(--bg2);
          border: 1px solid var(--border);
          color: var(--txt1);
          width: 24px;
          height: 24px;
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
        .lsb-legal { margin-top: auto; padding: 10px 16px 12px; font-size: var(--fs-xs); color: var(--txt2); display: flex; gap: 10px; flex-shrink: 0; }
        .lsb-legal a { color: var(--txt2); text-decoration: none; }
        .lsb-legal a:hover { color: var(--txt1); }
      `}} />
      <footer className="lsb-legal"><a href="/imprint/">Imprint</a><a href="/privacy/">Privacy</a><a href="https://github.com/Infraviored/boardroute.com" target="_blank" rel="noopener">GitHub</a></footer>
    </aside>
  );
}
