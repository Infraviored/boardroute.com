import React from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Zap,
  Cable,
  Minimize2,
  Undo2,
  Redo2,
  Download,
  Upload,
  RotateCcw,
  ExternalLink,
  Eraser,
  FileJson,
  BookOpen
} from 'lucide-react';

export function Topbar({
  workflowStep,
  onStepClick,
  onUndo,
  onRedo,
  onImportState,
  onExportState,
  onClearWires,
  onReset,
  onExportSVG,
  onRouteOnly,
  isProcessing
}) {
  const wireRef = React.useRef(null);
  const compactRef = React.useRef(null);
  const logoRef = React.useRef(null);
  const [hintsSeen, setHintsSeen] = React.useState(readHints);
  const markHint = (key, n = 1) => setHintsSeen(prev => {
    const next = { ...prev, [key]: (prev[key] || 0) + n };
    writeHints(next);
    return next;
  });

  // Next-step coach mark: after Load point at Wire, after Wire at Compact; only for the first runs.
  const hintKey = isProcessing ? null : workflowStep === 1 ? 'wire' : workflowStep === 2 ? 'compact' : null;
  const hint = hintKey && (hintsSeen[hintKey] || 0) < HINT_RUNS ? HINTS[hintKey] : null;

  return (
    <header id="topbar">
      <div className="topbar-row-1">
        <div className="logo" ref={logoRef}>board<em>route.com</em></div>
        <div className="sep logo-sep"></div>
        <div className="workflow-track">
          <button
            className={`flow-btn ${workflowStep >= 1 && !(workflowStep === 1 && isProcessing) ? 'completed' : ''} ${workflowStep === 1 && isProcessing ? 'processing' : ''} ${workflowStep === 0 && !isProcessing ? 'next' : ''}`}
            onClick={() => onStepClick(1)}
            disabled={isProcessing}
            style={{ '--flow-color': '#4da0ff' }}
          >
            <FileJson size={14} />
            Load
          </button>
          <button
            className={`flow-btn ${workflowStep >= 2 && !(workflowStep === 2 && isProcessing) ? 'completed' : ''} ${workflowStep === 2 && isProcessing ? 'processing' : ''} ${workflowStep === 1 && !isProcessing ? 'next' : ''}`}
            ref={wireRef}
            onClick={() => { markHint('wire'); onStepClick(2); }}
            disabled={workflowStep < 1 || isProcessing}
            title="Arrange the parts until every connection is wired"
            style={{ '--flow-color': 'var(--grn-bright)' }}
          >
            <Cable size={14} />
            Wire
          </button>
          <button
            className={`flow-btn ${workflowStep >= 3 && !(workflowStep === 3 && isProcessing) ? 'completed' : ''} ${workflowStep === 3 && isProcessing ? 'processing' : ''} ${workflowStep === 2 && !isProcessing ? 'next' : ''}`}
            ref={compactRef}
            onClick={() => { markHint('compact'); onStepClick(3); }}
            disabled={workflowStep < 2 || isProcessing}
            title="Shrink the board as far as possible, starting from the current layout (also after moving parts by hand)"
            style={{ '--flow-color': '#a371f7' }}
          >
            <Minimize2 size={14} />
            Compact
          </button>
        </div>
      </div>

      <div className="sep"></div>

      <div className="topbar-actions">
        <div className="btn-group">
          <button className="tbtn" onClick={onClearWires} title="Delete all wires" disabled={isProcessing}>
            <Eraser size={16} />
            Clear
          </button>
          <button className="tbtn" onClick={onRouteOnly} title="Re-route the wires without moving any part (e.g. after moving parts by hand)" disabled={isProcessing}>
            <Zap size={16} />
            Reroute
          </button>
        </div>

        <div className="sep"></div>

        <div className="btn-group">
          <button className="tbtn" onClick={onUndo} title="Undo">
            <Undo2 size={16} />
          </button>
          <button className="tbtn" onClick={onRedo} title="Redo">
            <Redo2 size={16} />
          </button>
        </div>

        <div className="sep"></div>

        <div className="btn-group">
          <button className="tbtn" onClick={onImportState} title="Import (JSON)">
            <Download size={16} />
          </button>
          <button className="tbtn" onClick={onExportState} title="Export (JSON)">
            <Upload size={16} />
          </button>
        </div>

        <div className="sep"></div>

        <div className="spc" style={{ flex: 1 }}></div>

        <a className="tbtn docs-link" href="/how-it-works/" title="How the autorouter works">
          <BookOpen size={16} />
          <span className="docs-link-label">How it works</span>
        </a>

        <button className="tbtn svg-export-btn" onClick={onExportSVG} title="Download SVG" aria-label="Export SVG">
          <ExternalLink size={16} />
        </button>

        <button className="tbtn reset-btn" onClick={onReset} title="Reset Project" aria-label="Reset Project">
          <RotateCcw size={16} />
        </button>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        #topbar {
          min-height: var(--topbar-height);
          background: var(--glass-bg);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          gap: 0;
          padding: 0 16px;
          flex-shrink: 0;
          z-index: 100;
          overflow-x: hidden;
        }

        #topbar > .sep {
          display: block;
        }

        .topbar-row-1 {
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }

        .topbar-actions {
          display: flex;
          align-items: center;
          flex: 1;
          min-width: 0;
        }

        @media (max-width: 950px) {
          #topbar > .sep { display: none; }
        }

        .logo {
          font-family: 'Outfit', sans-serif;
          font-size: 1.6rem;
          line-height: 1;
          font-weight: 800;
          color: var(--txt0);
          width: calc(var(--lsb-width) - 16px);
          margin: 0;
          white-space: nowrap;
          letter-spacing: -0.03em;
          display: flex;
          align-items: baseline;
          flex-shrink: 0;
        }

        .logo-sep {
          margin-left: 0 !important;
        }
        
        /* Responsive Spacing */
        @media (max-width: 1150px) {
          .logo { width: 140px; }
          .sep { margin: 0 6px; }
          .btn-group, .workflow-track, .tbtn { margin: 0 4px; }
        }

        /* Two Line Wrap */
        @media (max-width: 950px) {
          #topbar {
            flex-direction: column;
            align-items: stretch;
            padding: 0;
          }
          .logo { 
            width: auto; 
            padding: 10px 16px; 
            font-size: 1.3rem;
          }
          .topbar-row-1 {
            display: flex;
            align-items: center;
            height: var(--topbar-height);
            border-bottom: 1px solid var(--border);
            padding: 0 16px;
          }
          .topbar-actions {
            padding: 8px 16px;
            background: rgba(0,0,0,0.15);
            flex-wrap: wrap;
            gap: 8px 0;
          }
          .topbar-actions .sep { height: 16px; }
          .topbar-actions .spc { display: none; }
        }
        .logo em {
          color: var(--blu-bright);
          font-style: normal;
          font-weight: 600;
        }

        .sep {
          width: 1px;
          height: 24px;
          background: repeating-linear-gradient(
            0deg,
            var(--border),
            var(--border) 2px,
            transparent 2px,
            transparent 4px
          );
          margin: 0 12px;
          flex-shrink: 0;
        }
        
        .btn-group, .workflow-track, .tbtn {
          margin: 0 8px;
          flex-shrink: 0;
        }
        
        .btn-group {
          display: flex;
          align-items: center;
          gap: 0;
        }

        .btn-group .tbtn {
          border-radius: 0;
          margin-left: -1px;
        }
        .btn-group .tbtn:first-child {
          margin-left: 0;
          border-radius: 8px 0 0 8px;
        }
        .btn-group .tbtn:last-child {
          border-radius: 0 8px 8px 0;
        }

        .tbtn {
          background: var(--bg4);
          border: 1px solid var(--border);
          color: var(--txt1);
          padding: 6px 12px;
          height: 34px;
          border-radius: 8px;
          cursor: pointer;
          font-size: .82em;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          white-space: nowrap;
          position: relative;
        }
        .tbtn:hover:not(:disabled) {
          background: var(--bg3);
          border-color: var(--border2);
          color: var(--txt0);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          z-index: 10;
        }

        .docs-link { text-decoration: none; }
        @media (max-width: 1500px) and (min-width: 951px) { .docs-link-label { display: none; } }

        /* Phones: logo on its own line, the three workflow steps share the full width below */
        @media (max-width: 520px) {
          .topbar-row-1 { height: auto; flex-wrap: wrap; padding: 0 12px 8px; }
          .logo { flex-basis: 100%; padding: 10px 4px 8px; }
          #topbar .workflow-track { margin: 0; width: 100%; }
          .flow-btn { flex: 1; justify-content: center; padding-left: 20px; padding-right: 8px; }
          .logo-sep { display: none; }
        }

        .workflow-track {
          display: flex;
          gap: 0;
          padding: 2px;
          background: rgba(0,0,0,0.22);
          border-radius: 10px;
          border: 1px solid var(--border);
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
        }

        .flow-btn {
          background: transparent;
          border: none;
          color: var(--txt2);
          padding: 7px 20px 7px 28px;
          cursor: pointer;
          font-size: .78em;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 9px;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          border-radius: 0;
          clip-path: polygon(
            calc(100% - 10px) 0%, 
            100% 50%, 
            calc(100% - 10px) 100%, 
            0% 100%, 
            10px 50%, 
            0% 0%
          );
          margin-left: -9px;
        }
        
        .flow-btn:first-child {
          border-radius: 8px 0 0 8px;
          padding-left: 20px;
          margin-left: 0;
          clip-path: polygon(calc(100% - 10px) 0%, 100% 50%, calc(100% - 10px) 100%, 0% 100%, 0% 0%);
        }
        .flow-btn:last-child {
          border-radius: 0 8px 8px 0;
          padding-right: 20px;
          clip-path: polygon(100% 0%, 100% 100%, 0% 100%, 10px 50%, 0% 0%);
        }
        
        .flow-btn.completed {
          background: var(--bg3);
          color: var(--txt0);
          z-index: 1;
          opacity: 1 !important;
          filter: none !important;
        }

        .flow-btn.next {
          background: var(--bg3);
          color: var(--txt0);
          box-shadow: 0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1);
          z-index: 2;
        }

        .flow-btn.processing {
          background-color: var(--bg4);
          background-image: linear-gradient(90deg, 
            transparent 0%, 
            color-mix(in srgb, var(--flow-color), transparent 85%) 50%, 
            transparent 100%
          );
          background-size: 200% 100%;
          color: var(--txt0);
          z-index: 5;
          filter: drop-shadow(0 0 10px color-mix(in srgb, var(--flow-color), transparent 60%));
          animation: flow-scan-bg 1.5s infinite linear;
          opacity: 1 !important; /* Force visibility even if disabled */
        }

        /* Pulsing indicator for the target step */
        @keyframes flow-pulse {
          0% { opacity: 0.6; transform: scaleX(1); }
          50% { opacity: 1; transform: scaleX(1.05); }
          100% { opacity: 0.6; transform: scaleX(1); }
        }

        /* Scanning effect for processing background */
        @keyframes flow-scan-bg {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        .flow-btn.completed svg { color: var(--flow-color); opacity: 0.9; }
        .flow-btn.next svg, .flow-btn.processing svg {
          color: var(--flow-color);
          filter: drop-shadow(0 0 8px var(--flow-color));
        }

        .flow-btn.completed::before, .flow-btn.next::before, .flow-btn.processing::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: var(--flow-color);
          pointer-events: none;
        }
        .flow-btn.completed::before { opacity: 0.5; }
        .flow-btn.next::before { opacity: 0.9; box-shadow: 0 0 10px var(--flow-color); animation: flow-pulse 2s infinite ease-in-out; }
        .flow-btn.processing::before { opacity: 1; box-shadow: 0 0 15px var(--flow-color); animation: flow-pulse 0.8s infinite ease-in-out; }

        .flow-btn:disabled:not(.processing):not(.completed) {
          opacity: 0.15;
          cursor: not-allowed;
          filter: grayscale(1);
        }
        
        .flow-btn.completed:disabled {
          cursor: not-allowed;
          opacity: 1 !important;
          filter: none !important;
        }

        .svg-export-btn {
          color: #ffb44a;
          background: rgba(255, 180, 74, 0.08);
          border: 1px solid rgba(255, 180, 74, 0.2);
          font-weight: 700;
        }
        .svg-export-btn:hover:not(:disabled) {
          background: rgba(255, 180, 74, 0.2);
          color: #fff;
          border-color: #ffb44a;
        }

        .reset-btn {
          color: var(--err-bright);
          background: rgba(248, 81, 73, 0.08);
          border: 1px solid rgba(248, 81, 73, 0.2);
        }
        .reset-btn:hover:not(:disabled) {
          background: var(--err-bright);
          color: #fff;
          border-color: var(--err-bright);
        }
      `}} />
      {hint && (
        <CoachMark
          key={hintKey}
          targetRef={hintKey === 'wire' ? wireRef : compactRef}
          watchRef={logoRef}
          color={hint.color}
          onDismiss={() => markHint(hintKey, HINT_RUNS)}
        >
          {hint.text}
        </CoachMark>
      )}
    </header>
  );
}

const HINTS_KEY = 'pcb_hints_seen';
const HINT_RUNS = 2; // show each hint until its step has been run this many times
const HINTS = {
  wire: { color: 'var(--grn-bright)', text: <>Next: press <b>Wire</b> to connect everything</> },
  compact: { color: '#a371f7', text: <>Now press <b>Compact</b> to shrink the board</> },
};

function readHints() {
  try {
    const v = JSON.parse(localStorage.getItem(HINTS_KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
function writeHints(v) {
  try { localStorage.setItem(HINTS_KEY, JSON.stringify(v)); } catch { /* storage unavailable */ }
}

/**
 * Speech bubble under a top-bar button. Rendered into <body> with fixed coordinates: the top bar
 * clips overflow and its backdrop-filter would make it the containing block of a fixed child.
 * Positioned by writing styles directly (no state), re-measured on resize and when the logo
 * (whose width follows the left sidebar) changes size.
 */
function CoachMark({ targetRef, watchRef, color, onDismiss, children }) {
  const bubbleRef = React.useRef(null);

  React.useLayoutEffect(() => {
    const place = () => {
      const t = targetRef.current, b = bubbleRef.current;
      if (!t || !b) return;
      const r = t.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const w = b.offsetWidth;
      const cx = r.left + r.width / 2;
      const left = Math.max(8, Math.min(vw - w - 8, cx - w / 2));
      b.style.top = `${Math.round(r.bottom + 12)}px`;
      b.style.left = `${Math.round(left)}px`;
      b.style.setProperty('--arrow-x', `${Math.round(Math.max(14, Math.min(w - 14, cx - left)))}px`);
      b.style.visibility = r.width ? 'visible' : 'hidden';
    };
    place();
    window.addEventListener('resize', place);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    if (ro) { if (watchRef.current) ro.observe(watchRef.current); if (bubbleRef.current) ro.observe(bubbleRef.current); }
    return () => { window.removeEventListener('resize', place); ro?.disconnect(); };
  }, [targetRef, watchRef]);

  return createPortal(
    <>
      <div ref={bubbleRef} className="coach-mark" role="status" style={{ '--coach-color': color, visibility: 'hidden' }}>
        <span className="coach-text">{children}</span>
        <button type="button" className="coach-close" onClick={onDismiss} aria-label="Dismiss tip"><X size={13} /></button>
      </div>
      <style dangerouslySetInnerHTML={{
        __html: `
        .coach-mark {
          position: fixed;
          z-index: 200;
          display: flex;
          align-items: center;
          gap: 8px;
          max-width: min(340px, calc(100vw - 16px));
          padding: 8px 6px 8px 12px;
          background: var(--glass-bg);
          backdrop-filter: blur(12px);
          border: 1px solid color-mix(in srgb, var(--coach-color), transparent 40%);
          border-radius: 10px;
          box-shadow: 0 8px 28px rgba(0,0,0,0.5), 0 0 18px color-mix(in srgb, var(--coach-color), transparent 75%);
          font-size: var(--fs-sm);
          color: var(--txt0);
          line-height: 1.35;
          animation: coach-in 0.35s cubic-bezier(0.16, 1, 0.3, 1), coach-bob 2.4s 0.4s ease-in-out infinite;
        }
        .coach-mark::before {
          content: '';
          position: absolute;
          top: -6px;
          left: calc(var(--arrow-x, 50%) - 6px);
          width: 10px;
          height: 10px;
          background: var(--bg2);
          border-left: 1px solid color-mix(in srgb, var(--coach-color), transparent 40%);
          border-top: 1px solid color-mix(in srgb, var(--coach-color), transparent 40%);
          transform: rotate(45deg);
        }
        .coach-text b { color: var(--coach-color); font-weight: 800; }
        .coach-close {
          display: flex; align-items: center; justify-content: center;
          width: 22px; height: 22px; flex-shrink: 0;
          background: none; border: none; border-radius: 5px;
          color: var(--txt1); cursor: pointer;
        }
        .coach-close:hover { color: var(--txt0); background: var(--bg4); }
        @keyframes coach-in { from { opacity: 0; translate: 0 -6px; } to { opacity: 1; translate: 0 0; } }
        @keyframes coach-bob { 0%, 100% { translate: 0 0; } 50% { translate: 0 3px; } }
        @media (prefers-reduced-motion: reduce) { .coach-mark { animation: none; } }
      `}} />
    </>,
    document.body
  );
}
