import React, { useState, useEffect, useRef } from 'react';
import { X, Link2, Check, Download, Minimize2, CircleCheck, Trophy } from 'lucide-react';

// Floating summary after a Wire/Compact run: footprint, wire length, jumpers, change vs. the
// start, and the natural next steps. Sits over the bottom of the canvas without blocking it.
export function ResultCard({ result, onClose, onCompact, onExport, onShare }) {
  const [share, setShare] = useState({ state: 'idle', url: '' }); // idle | busy | copied | manual
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  if (!result) return null;
  const { mode, width, height, wl, jumpers, start, optimal, bound } = result;
  const isCompact = mode === 'compact';

  let delta = null;
  if (isCompact && start?.area) {
    const pct = Math.round((start.area - result.area) / start.area * 100);
    delta = pct > 0
      ? { good: true, text: `−${pct} % area`, sub: `${start.width} × ${start.height} → ${width} × ${height}` }
      : { good: false, text: optimal ? 'Already perfect' : 'No smaller layout this run', sub: optimal ? 'Nothing left to shrink' : `${start.width} × ${start.height} stays` };
  }

  const handleShare = async () => {
    setShare({ state: 'busy', url: '' });
    let url = '';
    try {
      url = await onShare();
      await navigator.clipboard.writeText(url);
      setShare({ state: 'copied', url });
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setShare(s => (s.state === 'copied' ? { state: 'idle', url: '' } : s)), 2200);
    } catch (e) {
      // No clipboard access (insecure origin, denied permission): show the link to copy by hand.
      console.warn('share link', e);
      setShare({ state: url ? 'manual' : 'idle', url });
    }
  };

  const shareLabel = share.state === 'copied' ? 'Copied' : share.state === 'busy' ? 'Creating…' : 'Share link';

  return (
    <div className={`result-card ${optimal ? 'perfect' : ''} ${isCompact ? 'is-compact' : ''}`} role="status" aria-live="polite">
      <div className="rc-head">
        {optimal ? <Trophy size={16} className="rc-ok" aria-hidden="true" /> : <CircleCheck size={16} className="rc-ok" aria-hidden="true" />}
        <span className="rc-title">{optimal ? 'Perfect' : isCompact ? 'Compacted' : 'Wired'}</span>
        <span className="rc-hint">{optimal
          ? 'Provably the smallest possible board'
          : isCompact ? `Smallest layout found · no board can be smaller than ${bound} holes` : 'Every net is connected'}</span>
        <button className="rc-close" onClick={onClose} aria-label="Close result"><X size={15} /></button>
      </div>

      <div className="rc-stats">
        <div className="rc-stat">
          <div className="rc-val">{width} × {height}</div>
          <div className="rc-lbl">holes footprint</div>
        </div>
        <div className="rc-stat">
          <div className="rc-val">{wl}</div>
          <div className="rc-lbl">holes of wire</div>
        </div>
        {jumpers > 0 && (
          <div className="rc-stat">
            <div className="rc-val">{jumpers}</div>
            <div className="rc-lbl">jumper{jumpers === 1 ? '' : 's'}</div>
          </div>
        )}
        {delta && (
          <div className={`rc-delta ${delta.good ? 'good' : ''}`} title={delta.sub}>
            <div className="rc-delta-main">{delta.text}</div>
            <div className="rc-delta-sub">{delta.sub}</div>
          </div>
        )}
      </div>

      {share.state === 'manual' && (
        <input className="rc-link" readOnly value={share.url} onFocus={e => e.target.select()} autoFocus aria-label="Share link" />
      )}

      <div className="rc-actions">
        {!optimal && (
          <button className={`rc-btn compact ${isCompact ? '' : 'primary'}`} onClick={onCompact}>
            <Minimize2 size={14} /> {isCompact ? 'Compact again' : 'Compact'}
          </button>
        )}
        <button className={`rc-btn ${isCompact || optimal ? 'primary' : ''} ${share.state === 'copied' ? 'copied' : ''}`} onClick={handleShare} disabled={share.state === 'busy'}>
          {share.state === 'copied' ? <Check size={14} /> : <Link2 size={14} />} {shareLabel}
        </button>
        <button className="rc-btn" onClick={onExport}>
          <Download size={14} /> Export
        </button>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        .result-card {
          position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%);
          z-index: 90; width: min(460px, calc(100% - 24px));
          padding: 12px 14px 14px; border-radius: 12px;
          background: var(--glass-bg); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          border: 1px solid var(--glass-border); border-top: 2px solid var(--grn-bright);
          box-shadow: var(--shadow-premium), 0 -2px 24px rgba(63, 185, 80, 0.12);
          animation: rc-in 0.35s cubic-bezier(0.16, 1, 0.3, 1);
          font-family: 'Inter', system-ui, sans-serif;
        }
        @keyframes rc-in { from { opacity: 0; transform: translate(-50%, 16px); } to { opacity: 1; transform: translate(-50%, 0); } }
        .rc-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .rc-ok { color: var(--grn-bright); flex-shrink: 0; }
        .rc-title { font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 1.05rem; color: var(--txt0); letter-spacing: -0.01em; }
        .rc-hint { font-size: 12px; color: var(--txt1); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .rc-close { background: none; border: none; color: var(--txt1); cursor: pointer; padding: 4px; border-radius: 6px; display: flex; flex-shrink: 0; }
        .rc-close:hover { color: var(--txt0); background: rgba(255,255,255,0.06); }
        .rc-stats { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 6px 22px; margin: 10px 0 12px; }
        .rc-stat { display: flex; flex-direction: column; gap: 2px; }
        .rc-val { font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 1.5rem; line-height: 1; color: var(--txt0); font-variant-numeric: tabular-nums; white-space: nowrap; }
        .rc-lbl { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; color: var(--txt1); white-space: nowrap; }
        .rc-delta { margin-left: auto; padding: 5px 9px; border-radius: 8px; background: rgba(255,255,255,0.04); border: 1px solid var(--border); }
        .rc-delta.good { background: rgba(35, 134, 54, 0.14); border-color: rgba(63, 185, 80, 0.35); }
        .rc-delta-main { font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 0.95rem; color: var(--txt1); white-space: nowrap; }
        .rc-delta.good .rc-delta-main { color: var(--grn-bright); }
        .rc-delta-sub { font-family: Consolas, monospace; font-size: 10.5px; color: var(--txt1); opacity: 0.8; white-space: nowrap; }
        .rc-link { width: 100%; margin: -4px 0 10px; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border2); background: var(--bg2); color: var(--txt0); font: 12px Consolas, monospace; }
        .rc-actions { display: flex; flex-wrap: wrap; gap: 8px; }
        .rc-btn {
          flex: 1 1 auto; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          height: 34px; padding: 0 12px; border-radius: 8px; cursor: pointer; white-space: nowrap;
          background: var(--bg4); border: 1px solid var(--border2); color: var(--txt0);
          font-family: 'Outfit', sans-serif; font-weight: 600; font-size: 0.88rem;
          transition: background 0.15s, border-color 0.15s, transform 0.15s;
        }
        .rc-btn:hover:not(:disabled) { background: #2b313a; border-color: rgba(255,255,255,0.25); transform: translateY(-1px); }
        .rc-btn:disabled { opacity: 0.6; cursor: default; }
        .rc-btn.primary { background: var(--grn); border-color: var(--grn-bright); color: #fff; box-shadow: 0 4px 14px rgba(35, 134, 54, 0.3); }
        .rc-btn.primary:hover:not(:disabled) { background: #2a9a40; }
        /* Compact keeps the purple of its step in the top bar */
        .rc-btn.compact { color: #d2a8ff; border-color: rgba(163, 113, 247, 0.55); }
        .rc-btn.compact:hover:not(:disabled) { background: rgba(163, 113, 247, 0.14); border-color: #a371f7; }
        .rc-btn.compact.primary { background: #8957e5; border-color: #a371f7; color: #fff; box-shadow: 0 4px 14px rgba(137, 87, 229, 0.35); }
        .rc-btn.compact.primary:hover:not(:disabled) { background: #9a6cf0; }
        .result-card.is-compact { border-top-color: #a371f7; }
        .result-card.perfect { border-top-color: #e3b341; }
        .result-card.perfect .rc-ok, .result-card.perfect .rc-title { color: #e3b341; }
        .rc-btn.copied { border-color: var(--grn-bright); color: var(--grn-bright); }
        .rc-btn.primary.copied { color: #fff; }
        /* Phone: one row of numbers, the delta's "from -> to" line goes into its tooltip. */
        @media (max-width: 480px) {
          .result-card { bottom: 8px; padding: 9px 11px 11px; width: calc(100% - 16px); }
          .rc-title { font-size: 0.98rem; }
          .rc-stats { gap: 4px 14px; margin: 8px 0 10px; flex-wrap: nowrap; }
          .rc-val { font-size: 1.2rem; }
          .rc-lbl { font-size: 9.5px; letter-spacing: 0.06em; }
          .rc-delta { padding: 4px 8px; }
          .rc-delta-sub { display: none; }
          .rc-btn { height: 32px; padding: 0 8px; font-size: 0.82rem; gap: 5px; }
        }
      `}} />
    </div>
  );
}
