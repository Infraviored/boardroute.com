// Fewer corners at the same length. A corner is harder to solder than a straight run, so among
// wire routes of equal length the one with the fewest bends is the better one. The routers only
// approximate that (their turn cost is per hole, not per hole and direction, and warm starts keep
// old pieces), so every finished layout goes through this pass: each run of copper between two
// fixed points (pins, the ends of other wires of its net = branch points) is replaced by the
// route with the fewest bends that is not longer, through holes nothing else uses, inside the
// layout's footprint. Exact: Dijkstra over (hole, direction) with cost = length * 1000 + bends.
import { Heap } from './solver/boxrouter.js';

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const key = (c, r) => c * 100003 + r; // engine coordinates stay well inside +-1e6

function bendsOf(path) {
  let b = 0;
  for (let i = 2; i < path.length; i++) {
    const d1c = path[i - 1].col - path[i - 2].col, d1r = path[i - 1].row - path[i - 2].row;
    const d2c = path[i].col - path[i - 1].col, d2r = path[i].row - path[i - 1].row;
    if (d1c !== d2c || d1r !== d2r) b++;
  }
  return b;
}

const adjacent = (a, b) => Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;

/** Returns the wires with straighter runs (same objects where nothing changed). */
export function straightenWires(components, wires) {
  if (!components?.length || !wires?.length) return wires;

  // footprint: the pass never makes the board bigger
  let c0 = Infinity, r0 = Infinity, c1 = -Infinity, r1 = -Infinity;
  for (const c of components) { c0 = Math.min(c0, c.ox); r0 = Math.min(r0, c.oy); c1 = Math.max(c1, c.ox + c.w - 1); r1 = Math.max(r1, c.oy + c.h - 1); }
  for (const w of wires) for (const p of w.path || []) { c0 = Math.min(c0, p.col); r0 = Math.min(r0, p.row); c1 = Math.max(c1, p.col); r1 = Math.max(r1, p.row); }
  if (!isFinite(c0)) return wires;

  // who uses each hole: a net name, or BLOCK (pin without a net, part body wires may not pass)
  const BLOCK = '\u0000';
  const use = new Map();
  const anchors = new Map(); // net -> Set of fixed holes
  const anchor = (net, c, r) => { if (!anchors.has(net)) anchors.set(net, new Set()); anchors.get(net).add(key(c, r)); };
  for (const comp of components) {
    if (comp.routeUnder === false) {
      for (let c = comp.ox; c < comp.ox + comp.w; c++) for (let r = comp.oy; r < comp.oy + comp.h; r++) use.set(key(c, r), BLOCK);
    }
    for (const p of comp.pins) {
      use.set(key(p.col, p.row), p.net || BLOCK);
      if (p.net) anchor(p.net, p.col, p.row);
    }
  }
  for (const w of wires) {
    if (w.failed || !w.path?.length) continue;
    const a = w.path[0], b = w.path[w.path.length - 1];
    anchor(w.net, a.col, a.row); anchor(w.net, b.col, b.row);
    if (w.jumper) { use.set(key(a.col, a.row), w.net); use.set(key(b.col, b.row), w.net); continue; }
    for (const p of w.path) {
      const k = key(p.col, p.row);
      if (!use.has(k)) use.set(k, w.net);
      else if (use.get(k) === w.net) anchor(w.net, p.col, p.row); // shared with another run: a junction
    }
  }

  // Fewest-bend route from a to b, not longer than maxLen, with fewer than maxBends bends.
  const best = (a, b, maxLen, maxBends) => {
    const W = c1 - c0 + 1, H = r1 - r0 + 1, N = W * H;
    const idx = (c, r) => (r - r0) * W + (c - c0);
    const dist = new Float64Array(N * 4).fill(Infinity);
    const prev = new Int32Array(N * 4).fill(-1);
    const limit = maxLen * 1000 + maxBends - 1;
    const tgt = idx(b.col, b.row);
    const heap = new Heap(64);
    const s0 = idx(a.col, a.row);
    for (let d = 0; d < 4; d++) { dist[s0 * 4 + d] = 0; heap.push(s0 * 4 + d, 0); }
    let end = -1;
    while (heap.n > 0) {
      const cost = heap.f[0], s = heap.pop();
      if (cost > dist[s]) continue;
      const cell = s >> 2, d = s & 3;
      if (cell === tgt) { end = s; break; }
      const c = (cell % W) + c0, r = Math.floor(cell / W) + r0;
      for (let nd = 0; nd < 4; nd++) {
        const nc = c + DIRS[nd][0], nr = r + DIRS[nd][1];
        if (nc < c0 || nr < r0 || nc > c1 || nr > r1) continue;
        const nCell = idx(nc, nr);
        if (nCell !== tgt && use.has(key(nc, nr))) continue;
        const ncost = cost + 1000 + (cell !== s0 && nd !== d ? 1 : 0);
        if (ncost > limit) continue;
        const ns = nCell * 4 + nd;
        if (ncost < dist[ns]) { dist[ns] = ncost; prev[ns] = s; heap.push(ns, ncost); }
      }
    }
    if (end < 0) return null;
    const out = [];
    for (let s = end; s >= 0; s = prev[s]) { const cell = s >> 2; out.push({ col: (cell % W) + c0, row: Math.floor(cell / W) + r0 }); if (cell === s0) break; }
    out.reverse();
    if (out[0].col !== a.col || out[0].row !== a.row) return null;
    return out;
  };

  let changed = false;
  const result = wires.map(w => {
    if (w.failed || w.jumper || !w.path || w.path.length < 4) return w;
    for (let i = 1; i < w.path.length; i++) if (!adjacent(w.path[i - 1], w.path[i])) return w;
    const fixed = anchors.get(w.net) || new Set();
    // split at the holes that must stay: branch points and pins along the run
    const cuts = [0];
    for (let i = 1; i < w.path.length - 1; i++) if (fixed.has(key(w.path[i].col, w.path[i].row))) cuts.push(i);
    cuts.push(w.path.length - 1);
    const out = [w.path[0]];
    let any = false;
    for (let s = 0; s + 1 < cuts.length; s++) {
      const seg = w.path.slice(cuts[s], cuts[s + 1] + 1);
      const bends = bendsOf(seg);
      let use_ = seg;
      if (bends >= 2) {
        // free this run's own holes while searching
        const inner = seg.slice(1, -1).filter(p => use.get(key(p.col, p.row)) === w.net && !fixed.has(key(p.col, p.row)));
        for (const p of inner) use.delete(key(p.col, p.row));
        const alt = best(seg[0], seg[seg.length - 1], seg.length - 1, bends);
        if (alt && bendsOf(alt) < bends) { use_ = alt; any = true; }
        for (const p of use_.slice(1, -1)) use.set(key(p.col, p.row), w.net);
      }
      out.push(...use_.slice(1));
    }
    if (!any) return w;
    changed = true;
    return { ...w, path: out };
  });
  return changed ? result : wires;
}
