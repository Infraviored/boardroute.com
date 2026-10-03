import { useState, useEffect } from 'react';
import { normalizeBoardView } from '../engine/render-utils.js';

const STORAGE_KEY = 'pcb_board_view';

/** Physical-board / hole-coordinate display settings, persisted in localStorage. */
export function useBoardView() {
  const [view, setView] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return normalizeBoardView(saved ? JSON.parse(saved) : null);
    } catch {
      return normalizeBoardView(null);
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(view));
    } catch {
      // Storage unavailable (private mode, quota): settings just don't persist.
    }
  }, [view]);

  return [view, setView];
}
