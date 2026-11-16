import React, { useMemo } from 'react';
import { MOBILE_MQ, LANDSCAPE_MQ } from '../mobile.js';
import { ModalShell, Button } from './ui';
import { generateBoardSVG } from '../engine/render-utils.js';

// Example circuit picker (public/examples.json, built by scripts/build-examples.js).
// Each card previews the best layout the benchmark found; picking one loads the bare circuit,
// unconnected, so Wire and Compact still have everything to do.
export function ExamplesOverlay({ isOpen, examples, firstVisit, onClose, onSelect }) {
    const previews = useMemo(() => Object.fromEntries((examples || []).map(ex => [ex.id,
        ex.preview ? generateBoardSVG(ex.preview.components, ex.preview.wires).replace(/@import url\([^)]*\);?/, '') : ''])), [examples]);

    if (!isOpen) return null;

    return (
        <ModalShell isOpen onClose={onClose} maxWidth="1120px" className="examples-modal" ariaLabel={firstVisit ? 'Pick a circuit to start with' : 'Example circuits'}>
            <ModalShell.Header
                title={firstVisit ? 'Pick a circuit to start with' : 'Example circuits'}
                subtitle={firstVisit
                    ? 'Each one loads unconnected. Press Wire to connect everything, then Compact to shrink the board. The picture shows how small it can get.'
                    : 'Loads the circuit unconnected and replaces the current board (Undo brings it back). The picture shows the best layout found so far.'}
                onClose={onClose}
            />
            <ModalShell.Body className="examples-body">
                <ul className="examples-grid">
                    {(examples || []).map(ex => (
                        <li key={ex.id}>
                            <button className="example-card" onClick={() => onSelect(ex)}>
                                <div className="example-thumb" dangerouslySetInnerHTML={{ __html: previews[ex.id] }} />
                                <div className="example-body">
                                    <div className="example-title-row">
                                        <span className="example-title">{ex.title}</span>
                                        <span className={`example-level lvl-${ex.level.toLowerCase()}`}>{ex.level}</span>
                                    </div>
                                    <p className="example-blurb">{ex.blurb}</p>
                                    <div className="example-meta">
                                        {ex.parts} parts, {ex.nets} nets
                                        {ex.preview && <>, best {ex.preview.width}×{ex.preview.height}{ex.preview.jumpers ? `, ${ex.preview.jumpers} jumper${ex.preview.jumpers > 1 ? 's' : ''}` : ''}</>}
                                    </div>
                                </div>
                            </button>
                        </li>
                    ))}
                </ul>
            </ModalShell.Body>
            {firstVisit && (
                <ModalShell.Footer align="between" className="examples-foot">
                    <a href="/how-it-works/" className="examples-learn">How does it work?</a>
                    <Button onClick={onClose}>Skip, I'll describe my own circuit</Button>
                </ModalShell.Footer>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
        .examples-modal { width: calc(100% - 32px); }
        .examples-grid { list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; margin: 0; padding: 0; }
        .example-card { width: 100%; height: 100%; display: flex; flex-direction: column; text-align: left; background: var(--ui-neutral); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 0; cursor: pointer; color: inherit; font: inherit; overflow: hidden; transition: border-color .15s ease, transform .15s ease, background .15s ease; }
        .example-card:hover, .example-card:focus-visible { border-color: var(--ui-primary-hover); transform: translateY(-2px); background: var(--ui-neutral-hover); outline: none; }
        .example-thumb { height: 150px; display: flex; align-items: center; justify-content: center; background: radial-gradient(circle at 50% 40%, #1b2a1e 0, var(--bg0) 75%); padding: 12px; }
        .example-thumb svg { max-width: 100%; max-height: 100%; width: auto; height: auto; }
        .example-body { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
        .example-title-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .example-title { font-family: 'Outfit', sans-serif; font-weight: 600; color: var(--txt0); font-size: var(--fs-15); }
        .example-level { font-size: var(--fs-xs); font-weight: 600; padding: 2px 8px; border-radius: var(--radius-full); border: 1px solid var(--border2); color: var(--txt1); white-space: nowrap; }
        .example-level.lvl-starter { color: var(--ui-primary-hover); border-color: rgba(63,185,80,.4); }
        .example-level.lvl-classic { color: var(--ui-accent-hover); border-color: rgba(208, 138, 62,.4); }
        .example-level.lvl-bigger { color: var(--org); border-color: rgba(210,153,34,.45); }
        .example-level.lvl-tricky { color: var(--ui-purple-hover); border-color: rgba(163,113,247,.45); }
        .example-blurb { color: var(--txt1); font-size: var(--fs-sm); line-height: 1.45; flex: 1; }
        .example-meta { color: var(--txt2); font-size: var(--fs-xs); font-family: ui-monospace, Consolas, monospace; }
        .examples-learn { color: var(--blu-bright); font-size: var(--fs-sm); text-decoration: none; }
        @media ${MOBILE_MQ} {
          .examples-modal { width: 100vw; max-width: 100vw !important; height: 100dvh; max-height: 100dvh; border-radius: 0; border: 0; }
          .examples-grid { grid-template-columns: minmax(0, 1fr); }
          .example-thumb { height: 120px; }
          .examples-foot { flex-direction: column-reverse; align-items: stretch; padding-bottom: max(14px, env(safe-area-inset-bottom, 0px)); }
          .examples-foot .ui-btn { width: 100%; min-height: 44px; }
          .examples-learn { text-align: center; min-height: 40px; display: inline-flex; align-items: center; justify-content: center; }
        }
        /* phone sideways: cards side by side, the buttons in one row */
        @media ${LANDSCAPE_MQ} {
          .examples-modal .ui-modal-subtitle { display: none; }
          .examples-grid { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
          .example-thumb { height: 96px; padding: 8px; }
          .example-body { padding: 8px 12px 10px; }
          .examples-foot { flex-direction: row; align-items: center; }
          .examples-foot .ui-btn { width: auto; flex: 1; }
        }
      `}} />
        </ModalShell>
    );
}
