import React from 'react';
import { RotateCw, Pencil, Trash2 } from 'lucide-react';
import { MOBILE_MQ, LANDSCAPE_MQ } from '../mobile.js';

// Rotate / Edit / Delete for the selected part: what R, the pencil in the Parts list and Del do,
// as buttons for touch. variant "float": a bar over the bottom-left of the canvas (phones only);
// "inspector": a row in the Inspector's Component section.
export function PartActions({ comp, onRotate, onEdit, onDelete, canRotate = true, variant = 'float' }) {
  if (!comp) return null;
  return (
    <div className={`part-actions ${variant}`} role="toolbar" aria-label={`Part ${comp.id}`}>
      <button type="button" onClick={() => onRotate(comp.id)} disabled={!canRotate}
        title={canRotate ? 'Turn the part by 90° (R)' : 'Turning works on the component side'}>
        <RotateCw size={15} /> <span>Rotate</span>
      </button>
      <button type="button" onClick={() => onEdit(comp.id)} title="Edit pins, nets and outline">
        <Pencil size={14} /> <span>Edit</span>
      </button>
      <button type="button" className="danger" onClick={onDelete} title="Remove the part (Del)">
        <Trash2 size={14} /> <span>Delete</span>
      </button>
      <style dangerouslySetInnerHTML={{
        __html: `
        .part-actions { display: flex; gap: 4px; }
        .part-actions button {
          flex: 1 1 0; display: inline-flex; align-items: center; justify-content: center; gap: 5px;
          height: 28px; padding: 0 8px; border-radius: var(--radius-md); cursor: pointer; white-space: nowrap;
          background: var(--ui-neutral); border: 1px solid var(--border); color: var(--txt0);
          font: inherit; font-size: var(--fs-xs); font-weight: 600; transition: background .15s, border-color .15s;
        }
        .part-actions button:hover:not(:disabled) { background: var(--ui-neutral-hover); border-color: var(--border2); }
        .part-actions button:active:not(:disabled) { background: var(--ui-neutral-active); }
        .part-actions button:disabled { opacity: .45; cursor: default; }
        .part-actions button.danger { color: var(--ui-danger-subtle-text); }
        .part-actions button.danger:hover:not(:disabled) { background: var(--ui-danger-subtle-bg); border-color: var(--ui-danger-subtle-border); }
        .part-actions.inspector { margin: 2px 12px 10px; }
        .part-actions.float { display: none; }
        @media ${MOBILE_MQ} {
          .part-actions.inspector button { height: 40px; font-size: var(--fs-sm); }
          .part-actions.float {
            display: flex; position: absolute; z-index: 11;
            left: 12px; bottom: calc(12px + var(--bottom-nav-height, 0px));
            padding: 4px; border-radius: 12px;
            background: rgba(13, 17, 23, 0.94); border: 1px solid var(--border2);
            box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
            animation: pa-in .2s ease-out;
          }
          .part-actions.float button { flex: none; height: 40px; padding: 0 10px; font-size: 12px; background: transparent; border-color: transparent; }
          /* above the result card and the row of canvas controls over it */
          #ca-col:has(.result-card) .part-actions.float { bottom: calc(var(--rc-h, 136px) + 18px + 48px + var(--bottom-nav-height, 0px)); }
        }
        @media ${LANDSCAPE_MQ} {
          /* controls stay in their column on the right; only the card is below */
          #ca-col:has(.result-card) .part-actions.float { bottom: calc(var(--rc-h, 136px) + 18px + var(--bottom-nav-height, 0px)); }
        }
        @keyframes pa-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
      `}} />
    </div>
  );
}
