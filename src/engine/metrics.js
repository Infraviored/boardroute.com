// Board metrics shared by the UI, the engine facade and the legacy optimizer: footprint,
// lexicographic score, recentring. Kept separate from optimizer-algorithms.js so the app
// doesn't have to load the legacy optimizer just to score a board.
import { moveComp } from './placer.js';
import { completion } from './state-utils.js';

export function calculateFootprintArea(components, wires) {
  if (components.length === 0) return { area: 0, bounds: { minCol: 0, maxCol: 0, minRow: 0, maxRow: 0 } };

  let minCol = Infinity, maxCol = -Infinity;
  let minRow = Infinity, maxRow = -Infinity;

  components.forEach(c => {
    minCol = Math.min(minCol, c.ox);
    maxCol = Math.max(maxCol, c.ox + c.w - 1);
    minRow = Math.min(minRow, c.oy);
    maxRow = Math.max(maxRow, c.oy + c.h - 1);
  });

  wires.forEach(w => {
    if (w.path) w.path.forEach(pt => {
      minCol = Math.min(minCol, pt.col);
      maxCol = Math.max(maxCol, pt.col);
      minRow = Math.min(minRow, pt.row);
      maxRow = Math.max(maxRow, pt.row);
    });
  });

  const width = maxCol - minCol + 1;
  const height = maxRow - minRow + 1;
  const area = width * height;

  return { area, bounds: { minCol, maxCol, minRow, maxRow } };
}


export function calculateComponentBounds(components) {
  if (components.length === 0) return { minCol: 0, maxCol: 0, minRow: 0, maxRow: 0 };
  let minCol = Infinity, maxCol = -Infinity;
  let minRow = Infinity, maxRow = -Infinity;
  components.forEach(c => {
    minCol = Math.min(minCol, c.ox);
    maxCol = Math.max(maxCol, c.ox + c.w - 1);
    minRow = Math.min(minRow, c.oy);
    maxRow = Math.max(maxRow, c.oy + c.h - 1);
  });
  return { minCol, maxCol, minRow, maxRow };
}


export function footprintBoxMetrics(components, ws) {
  const b0 = calculateComponentBounds(components);
  let minCol = b0.minCol, maxCol = b0.maxCol, minRow = b0.minRow, maxRow = b0.maxRow;
  (ws || []).forEach(w => {
    if (w?.path) w.path.forEach(pt => {
      minCol = Math.min(minCol, pt.col);
      maxCol = Math.max(maxCol, pt.col);
      minRow = Math.min(minRow, pt.row);
      maxRow = Math.max(maxRow, pt.row);
    });
  });
  const width = (maxCol - minCol + 1);
  const height = (maxRow - minRow + 1);
  const area = width * height;
  const perim = (width + height) * 2;
  return { area, perim, width, height, bounds: { minCol, maxCol, minRow, maxRow } };
}

export function wireLengthMetric(ws) {
  return (ws || []).reduce((s, w) => s + (w.failed ? 0 : Math.max(0, (w.path?.length || 0) - 1)), 0);
}

export function scoreState(components, ws) {
  const comp = completion(ws || []);
  const { area, perim, width, height, bounds } = footprintBoxMetrics(components, ws || []);
  const wl = wireLengthMetric(ws || []);
  return { comp, area, perim, wl, width, height, bounds };
}


export function formatScore(s) {
  if (!s) return '';
  return `Comp ${Math.round((s.comp || 0) * 100)}%, Board ${s.width}×${s.height}, area ${s.area} holes², perimeter ${s.perim} holes, WL ${s.wl}`;
}

export function isScoreBetter(a, b) {
  if (a.comp !== b.comp) return a.comp > b.comp;
  if (a.area !== b.area) return a.area < b.area;
  if (a.perim !== b.perim) return a.perim < b.perim;
  if (a.wl !== b.wl) return a.wl < b.wl;
  return false;
}

export function recenterComponents(components, wires) {
  if (components.length === 0) return;
  const b = calculateComponentBounds(components);
  const cx = Math.floor((b.minCol + b.maxCol + 1) / 2);
  const cy = Math.floor((b.minRow + b.maxRow + 1) / 2);

  // We want the center of the bounding box to be exactly at 0,0
  const dx = -cx;
  const dy = -cy;

  if (dx === 0 && dy === 0) return;

  components.forEach(c => moveComp(c, c.ox + dx, c.oy + dy));
  if (wires) {
    wires.forEach(w => {
      if (w.path) w.path.forEach(pt => { pt.col += dx; pt.row += dy; });
    });
  }
}
