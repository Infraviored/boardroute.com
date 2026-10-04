import React, { useMemo, useEffect } from 'react';
import { generatePrunedSVG } from '../engine/render-utils.js';

export function ProcessingBar({ status, bestSnapshot, onGoodEnough }) {
  const active = !!status.isProcessing || !!status.results;
  const results = status.results;

  useEffect(() => {
    if (!active || results) return;
    const onKey = (e) => { if (e.key === 'Escape') onGoodEnough(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onGoodEnough, active, results]);

  const preview = useMemo(() => {
    if (!bestSnapshot?.components?.length) return null;
    return generatePrunedSVG({
      components: bestSnapshot.components,
      wires: bestSnapshot.wires,
      side: 'top',
      padding: 3
    });
  }, [bestSnapshot]);

  const renderMetrics = (s) => {
    if (!s || typeof s !== 'object') return null;
    return (
      <div className="active-metrics">
        <div className="res-item">
          <div className="res-label">Board Area</div>
          <div className="res-val small">{s.width}×{s.height} ({s.area})</div>
        </div>
        <div className="res-item wide">
          <div className="res-label">Wire Length</div>
          <div className="res-val small">{s.wl} holes</div>
        </div>
      </div>
    );
  };

  const isShown = active || !!results;
  const improved = results?.improved;

  return (
    <div id="proc-bar" className={`${results ? "results" : ""} ${isShown ? "shown" : ""} ${status.mode === 'compact' ? "mode-compact" : ""} ${status.best?.optimal ? "perfect" : ""}`}>
      <div className="pb-content-wrap">
        <div className="pb-left">
          {results ? (
            <>
              <div className={`pb-title ${improved ? 'success' : ''}`}>
                {results.title || (improved ? "Optimization Successful" : "No Improvement Found")}
              </div>
              <div className="res-grid">
                <div className="res-item">
                  <div className="res-label">Footprint</div>
                  <div className="res-val">
                    {results.startScore.area > results.score.area
                      ? `-${Math.round((results.startScore.area - results.score.area) / results.startScore.area * 100)}%`
                      : 'Optimal'}
                  </div>
                  <div className="res-sub">{results.startScore.width}×{results.startScore.height} → {results.score.width}×{results.score.height}</div>
                </div>
                <div className="res-item">
                  <div className="res-label">Wire Length</div>
                  <div className="res-val">
                    {results.startScore.wl > results.score.wl
                      ? `-${Math.round((results.startScore.wl - results.score.wl) / results.startScore.wl * 100)}%`
                      : 'Optimal'}
                  </div>
                  <div className="res-sub">{results.startScore.wl} → {results.score.wl} holes</div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="pb-title">{status.title || 'Processing...'}</div>
              {renderMetrics(status.best)}
              {/* Before the first layout there is nothing to measure progress against; after it, the
                  bar fills up as time passes without an improvement and the search stops when full. */}
              <div className={`pb-track ${status.progress == null ? 'indeterminate' : ''}`}>
                <div className="pb-fill" style={status.progress == null ? undefined : { width: `${status.progress}%` }} />
              </div>
              {status.detail && <div className="pb-detail">{status.detail}</div>}
              <button className="pb-btn-glass" onClick={onGoodEnough} disabled={status.isProcessing && !bestSnapshot}>
                Apply Current Best
              </button>
            </>
          )}
        </div>

        {preview && (
          <div className="pb-preview">
            <div className="pb-preview-label">{results ? "final design" : "current best"}</div>
            <div className={`pb-preview-wrap ${results && improved ? 'success' : ''}`}>
              <svg viewBox={`-30 0 ${preview.W + 60} ${preview.H}`} style={{ height: '100%', maxWidth: '100%', display: 'block', overflow: 'visible' }}>
                <g dangerouslySetInnerHTML={{ __html: preview.inner }} />
              </svg>
            </div>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        #proc-bar {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          display: flex;
          align-items: center;
          padding: 0 40px;
          background: var(--glass-bg);
          backdrop-filter: blur(20px);
          border-top: 2px solid var(--grn-bright);
          height: 240px;
          box-shadow: 0 -10px 40px rgba(0,0,0,0.4), 0 -4px 32px rgba(35, 134, 54, 0.15);
          z-index: 100;
          transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
          transform: translateY(100%);
          opacity: 0;
          pointer-events: none;
        }
        #proc-bar.shown {
          transform: translateY(0);
          opacity: 1;
          pointer-events: auto;
        }
        .pb-content-wrap {
          display: flex;
          align-items: center;
          gap: 48px;
          width: 100%;
          height: 100%;
          max-width: 1200px;
          margin: 0 auto;
        }
        .pb-left {
          display: flex;
          flex-direction: column;
          gap: 12px;
          flex: 1;
          min-width: 0;
        }
        .active-metrics {
          display: flex;
          gap: 32px;
          padding: 8px 0;
        }
        .pb-track {
          height: 12px;
          background: rgba(0,0,0,0.3);
          border-radius: 100px;
          overflow: hidden;
          border: 1px solid var(--border);
          position: relative;
          margin-top: 4px;
        }
        .pb-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--grn), var(--grn-bright));
          transition: width 0.15s cubic-bezier(0.1, 0, 0, 1);
          box-shadow: 0 0 15px var(--grn);
        }
        .pb-track.indeterminate .pb-fill {
          width: 30%;
          transition: none;
          animation: pb-sweep 1.2s ease-in-out infinite;
        }
        @keyframes pb-sweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(340%); } }
        .pb-detail { font-size: var(--fs-xs); color: var(--txt1); margin-top: 6px; }
        .pb-title {
          font-family: 'Outfit', sans-serif;
          font-size: 1.25rem;
          color: var(--grn-bright);
          font-weight: 800;
          white-space: nowrap;
          letter-spacing: -0.02em;
          flex-shrink: 0;
        }
        .res-grid { 
          display: flex; 
          gap: 40px; 
          flex: 1;
        }
        .res-item { 
          display: flex; 
          flex-direction: column; 
          gap: 2px;
          flex-shrink: 0;
        }
        .res-item.wide {
          width: 180px;
        }
        .res-label { 
          font-size: 0.65rem; 
          text-transform: uppercase; 
          color: var(--txt1); 
          letter-spacing: 0.12em; 
          font-weight: 800; 
          white-space: nowrap;
        }
        .res-val { 
          font-size: 1.8rem; 
          font-weight: 800; 
          color: #fff; 
          font-family: 'Outfit', sans-serif; 
          line-height: 1; 
          font-variant-numeric: tabular-nums;
        }
        .res-val.small { 
          font-size: 1.4rem; 
          color: #fff;
          font-family: 'Outfit', sans-serif; 
        }
        .res-sub { 
          font-size: 0.7rem; 
          color: var(--txt1); 
          font-family: 'Consolas', monospace; 
          opacity: 0.7; 
          white-space: nowrap;
        }
        .pb-btn-glass {
          width: fit-content;
          min-width: 140px;
          height: 38px;
          padding: 0 24px;
          background: rgba(35, 134, 54, 0.15);
          border: 1px solid var(--grn-bright);
          color: var(--grn-bright);
          border-radius: 10px;
          font-family: 'Outfit', sans-serif;
          font-weight: 700;
          font-size: 0.9rem;
          cursor: pointer;
          backdrop-filter: blur(8px);
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          margin-top: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        }
        .pb-btn-glass:hover {
          background: rgba(35, 134, 54, 0.3);
          color: #fff;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(63, 185, 80, 0.2);
        }
        .pb-btn-glass:active {
          transform: translateY(0);
        }
        .pb-esc {
          font-size: 0.7rem;
          opacity: 0.6;
          margin-left: 10px;
          background: rgba(0,0,0,0.2);
          padding: 2px 6px;
          border-radius: 4px;
          color: #fff;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .pb-preview {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
          width: 300px; /* Slightly wider */
        }
        .pb-preview-label {
          font-family: 'Outfit', sans-serif;
          font-size: 0.68rem;
          color: var(--txt1);
          text-transform: uppercase;
          letter-spacing: 0.2em;
          font-weight: 800;
        }
        .pb-preview-wrap {
          height: 180px;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
          position: relative;
        }
        .pb-preview-wrap.success {
          filter: drop-shadow(0 0 20px rgba(35, 134, 54, 0.4));
        }
        /* Compact: the purple of its step in the top bar; gold once the board is provably perfect */
        #proc-bar.mode-compact { border-top-color: #a371f7; box-shadow: 0 -10px 40px rgba(0,0,0,0.4), 0 -4px 32px rgba(137, 87, 229, 0.18); }
        #proc-bar.mode-compact .pb-fill { background: linear-gradient(90deg, #8957e5, #a371f7); box-shadow: 0 0 15px #8957e5; }
        #proc-bar.mode-compact .pb-title { color: #d2a8ff; }
        #proc-bar.mode-compact .pb-btn-glass { border-color: #a371f7; color: #d2a8ff; background: rgba(137, 87, 229, 0.15); }
        #proc-bar.perfect { border-top-color: #e3b341; }
        #proc-bar.perfect .pb-title { color: #e3b341; }
        #proc-bar.results { border-top-color: var(--grn-bright); background: linear-gradient(180deg, #101413 0%, #050706 100%); }
      `}} />
    </div>
  );
}
