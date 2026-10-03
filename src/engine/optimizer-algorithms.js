import { getAllNets, route, incrementalReroute } from './router.js';
import { moveComp, anyOverlap, rotateComp90InPlace } from './placer.js';
import { saveComps, restoreComps } from './state-utils.js';
import { calculateFootprintArea, calculateComponentBounds, footprintBoxMetrics, wireLengthMetric, scoreState, formatScore, isScoreBetter, recenterComponents } from './metrics.js';
export { calculateFootprintArea, calculateComponentBounds, footprintBoxMetrics, wireLengthMetric, scoreState, formatScore, isScoreBetter, recenterComponents };



export function restoreCompRotation(c, orig) {
  c.w = orig.w;
  c.h = orig.h;
  c.pins.forEach((p, idx) => {
    const op = orig.pins && orig.pins[idx];
    if (op) {
      p.dCol = op.dCol;
      p.dRow = op.dRow;
    }
    p.col = c.ox + p.dCol;
    p.row = c.oy + p.dRow;
  });
}


export function findFirstOverlap(moved, comps) {
  const aMinX = moved.ox;
  const aMaxX = moved.ox + moved.w - 1;
  const aMinY = moved.oy;
  const aMaxY = moved.oy + moved.h - 1;
  for (const o of comps) {
    if (o === moved) continue;
    const bMinX = o.ox;
    const bMaxX = o.ox + o.w - 1;
    const bMinY = o.oy;
    const bMaxY = o.oy + o.h - 1;
    const overlap = !(aMaxX < bMinX || bMaxX < aMinX || aMaxY < bMinY || bMaxY < aMinY);
    if (overlap) return o;
  }
  return null;
}


export function moveVectorTowardWires(c, components) {
  const nets = getAllNets(components);
  let sumX = 0, sumY = 0, count = 0;
  c.pins.forEach(p => {
    if (!p.net || !nets[p.net]) return;
    nets[p.net].forEach(op => {
      if (op.col >= c.ox && op.col < c.ox + c.w && op.row >= c.oy && op.row < c.oy + c.h) return;
      sumX += op.col;
      sumY += op.row;
      count++;
    });
  });
  if (count === 0) return { dx: 0, dy: 0 };
  const tx = sumX / count;
  const ty = sumY / count;
  const cx = c.ox + c.w / 2;
  const cy = c.oy + c.h / 2;
  const dx = (tx > cx + 0.1) ? 1 : (tx < cx - 0.1) ? -1 : 0;
  const dy = (ty > cy + 0.1) ? 1 : (ty < cy - 0.1) ? -1 : 0;
  return { dx, dy };
}


export function pickShrinkDirsForComp(c, components) {
  const b = calculateComponentBounds(components);
  const dirs = [];
  if (c.ox === b.minCol) dirs.push({ dx: 1, dy: 0 });
  if (c.ox + c.w - 1 === b.maxCol) dirs.push({ dx: -1, dy: 0 });
  if (c.oy === b.minRow) dirs.push({ dx: 0, dy: 1 });
  if (c.oy + c.h - 1 === b.maxRow) dirs.push({ dx: 0, dy: -1 });

  // Bias toward moving along the "wire pull" direction when possible.
  const pull = moveVectorTowardWires(c, components);
  const scoreDir = (d) => d.dx * pull.dx + d.dy * pull.dy;
  dirs.sort((a, b) => scoreDir(b) - scoreDir(a));
  return dirs;
}


export function stateKeyForPlateau(components) {
  const byId = [...components].slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return JSON.stringify(byId.map(c => ({
    id: c.id,
    ox: c.ox,
    oy: c.oy,
    w: c.w,
    h: c.h,
    pins: c.pins.map(p => ({ dCol: p.dCol, dRow: p.dRow }))
  })));
}


export async function enumeratePlateauNeighbors(components, wires, baseBox, baseScore, cols, rows, maxPerComp = 80, startCompOffset = 0, visited = null, onProgress = null, maxTotalEvals = 80, gCancelRequested = false) {
  const out = [];
  const bounds = baseBox.bounds;
  const minX = bounds.minCol;
  const maxX = bounds.maxCol;
  const minY = bounds.minRow;
  const maxY = bounds.maxRow;

  const makeKey = (ox, oy) => `${ox},${oy}`;
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const compsSorted = [...components].slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const ncs = compsSorted.length;
  let totalEvals = 0;
  for (let ci = 0; ci < ncs; ci++) {
    const c = compsSorted[(ci + (startCompOffset % Math.max(1, ncs))) % Math.max(1, ncs)];
    const cId = c.id;
    const orig = { ox: c.ox, oy: c.oy, w: c.w, h: c.h, pins: c.pins.map(p => ({ dCol: p.dCol, dRow: p.dRow })) };
    let emitted = 0;
    for (let rot = 0; rot < 4; rot++) {
      restoreCompRotation(c, orig);
      moveComp(c, orig.ox, orig.oy);
      for (let r = 0; r < rot; r++) rotateComp90InPlace(c);

      const maxOx = maxX - c.w + 1;
      const maxOy = maxY - c.h + 1;
      if (minX > maxOx || minY > maxOy) continue;

      // Instead of scanning all ox/oy (very slow), sample a small set of promising candidates.
      const cand = [];
      const candSeen = new Set();
      const add = (ox, oy) => {
        if (ox < minX || ox > maxOx || oy < minY || oy > maxOy) return;
        const k = makeKey(ox, oy);
        if (candSeen.has(k)) return;
        candSeen.add(k);
        cand.push({ ox, oy });
      };

      // Boundary / shrink-friendly positions.
      add(minX, orig.oy);
      add(maxOx, orig.oy);
      add(orig.ox, minY);
      add(orig.ox, maxOy);
      add(minX, minY);
      add(minX, maxOy);
      add(maxOx, minY);
      add(maxOx, maxOy);

      // One-step and two-step pulls toward wires.
      const pull = moveVectorTowardWires(c, components);
      if (pull.dx || pull.dy) {
        add(orig.ox + pull.dx, orig.oy + pull.dy);
        add(orig.ox + 2 * pull.dx, orig.oy + 2 * pull.dy);
        add(orig.ox + 3 * pull.dx, orig.oy + 3 * pull.dy);
      }

      // Small local neighborhood (helps avoid missing near improvements).
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) add(orig.ox + dx, orig.oy + dy);

      // A few random samples within the current bbox.
      for (let i = 0; i < 10; i++) {
        const ox = minX + Math.floor(Math.random() * (maxOx - minX + 1));
        const oy = minY + Math.floor(Math.random() * (maxOy - minY + 1));
        add(ox, oy);
      }

      shuffle(cand);

      for (const pos of cand) {
        const ox = pos.ox;
        const oy = pos.oy;
        if (rot === 0 && ox === orig.ox && oy === orig.oy) continue;
        moveComp(c, ox, oy);
        if (anyOverlap(c, components)) continue;

        const preKey = stateKeyForPlateau(components);
        if (visited && visited.has(preKey)) continue;

        totalEvals++;
        if (onProgress) onProgress(totalEvals, maxTotalEvals, `${cId} rot${rot}`);
        if (totalEvals > maxTotalEvals || gCancelRequested) break;

        // Measure changes primarily via component bounds to avoid being masked by stale wires
        const compBounds = calculateComponentBounds(components);
        const w2 = compBounds.maxCol - compBounds.minCol + 1;
        const h2 = compBounds.maxRow - compBounds.minRow + 1;
        const compArea = w2 * h2;
        const compPerim = (w2 + h2) * 2;

        if (compArea > baseBox.area) continue;
        if (compArea === baseBox.area && compPerim > baseBox.perim) continue;
        // Even if area is same, if perim is better, it's a candidate
        // Note: we compare against baseBox.area which includes wires, but that's okay as a ceiling.

        out.push({
          key: preKey,
          comps: saveComps(components),
          score: { comp: baseScore.comp, area: compArea, perim: compPerim, wl: baseScore.wl }, // placeholder, full routing evaluated by caller
          compId: cId,
          desc: `${cId}@(${ox},${oy}) rot${rot}`
        });
        emitted++;
        if (emitted >= maxPerComp) break;
      }

      if (totalEvals > maxTotalEvals) break;
      if (emitted >= maxPerComp) break;
    }
    restoreCompRotation(c, orig);
    moveComp(c, orig.ox, orig.oy);
    if (totalEvals > maxTotalEvals) break;
  }
  return out;
}


export async function postOptimizePlateauTree(components, wires, startBestScore, cols, rows, gCancelRequested = false) {
  const startComps = saveComps(components);
  const startWires = wires;

  let bestScore = startBestScore;
  let bestComps = startComps;
  let bestWires = startWires;

  const startBox = footprintBoxMetrics(components, wires);
  const baseBox = { area: startBox.area, perim: startBox.perim, bounds: startBox.bounds };

  const visited = new Set();
  const q = [];

  const k0 = stateKeyForPlateau(components);
  visited.add(k0);
  q.push({ comps: startComps, wires: startWires, score: startBestScore, box: baseBox, depth: 0, tag: 'start' });

  const MAX_NODES = 220;
  let nodes = 0;

  while (q.length && nodes < MAX_NODES) {
    const cur = q.shift();
    nodes++;

    restoreComps(components, cur.comps);
    let currentWires = cur.wires;

    const shrinkRes = await tryShrinkAlongWires(components, currentWires, cur.score, cols, rows, gCancelRequested);
    if (shrinkRes.improved) {
      const msg = `NEW post-opt shrink @node ${nodes}: ${formatScore(shrinkRes.score)}`;
      console.log(msg);
      bestScore = shrinkRes.score;
      bestComps = saveComps(components);
      bestWires = shrinkRes.wires;
      const nb = footprintBoxMetrics(components, bestWires);
      const newBox = { area: nb.area, perim: nb.perim, bounds: nb.bounds };
      visited.clear();
      q.length = 0;
      const k = stateKeyForPlateau(components);
      visited.add(k);
      q.push({ comps: bestComps, wires: bestWires, score: bestScore, box: newBox, depth: 0, tag: 'after-shrink' });
      continue;
    }

    const neighbors = await enumeratePlateauNeighbors(components, currentWires, cur.box, cur.score, cols, rows, 80, 0, visited, null, 80, gCancelRequested);
    for (const n of neighbors) {
      if (visited.has(n.key)) continue;

      // Compute actual routing metrics before adopting
      restoreComps(components, n.comps);
      const testWires = await route(components, cols, rows, () => { }, () => gCancelRequested);
      n.wires = testWires;
      n.score = scoreState(components, testWires);

      visited.add(n.key);
      const msg = `NEW plateau ${cur.depth + 1}: ${n.desc} | ${formatScore(n.score)}`;
      console.log(msg);
      q.push({ comps: n.comps, wires: n.wires, score: n.score, box: footprintBoxMetrics(components, n.wires), depth: cur.depth + 1, tag: n.desc });
      if (q.length + nodes >= MAX_NODES) break;
    }
  }

  restoreComps(components, bestComps);
  return { improved: isScoreBetter(bestScore, startBestScore), score: bestScore, wires: bestWires };
}


export function tryTranslateWithPush(comp, dx, dy, cols, rows, visited, depth, components) {
  if (dx === 0 && dy === 0) return false;
  if (visited.has(comp)) return false;
  visited.add(comp);

  const prev = { ox: comp.ox, oy: comp.oy };
  const nx = comp.ox + dx;
  const ny = comp.oy + dy;
  if (nx < 0 || ny < 0 || nx + comp.w > cols || ny + comp.h > rows) return false;

  moveComp(comp, nx, ny);
  let blocker = findFirstOverlap(comp, components);
  if (!blocker) return true;

  // Revert this move, attempt to push blocker, then retry.
  moveComp(comp, prev.ox, prev.oy);

  if (depth >= 4) return false;

  if (tryTranslateWithPush(blocker, dx, dy, cols, rows, visited, depth + 1, components)) {
    moveComp(comp, nx, ny);
    blocker = findFirstOverlap(comp, components);
    if (!blocker) return true;
    moveComp(comp, prev.ox, prev.oy);
  }

  if (depth <= 2) {
    const orig = { w: blocker.w, h: blocker.h, pins: blocker.pins.map(p => ({ dCol: p.dCol, dRow: p.dRow })) };
    rotateComp90InPlace(blocker);
    const rotOk = blocker.ox >= 0 && blocker.oy >= 0 && blocker.ox + blocker.w <= cols && blocker.oy + blocker.h <= rows && !anyOverlap(blocker, components);
    if (rotOk) {
      moveComp(comp, nx, ny);
      blocker = findFirstOverlap(comp, components);
      if (!blocker) return true;
      moveComp(comp, prev.ox, prev.oy);
    }
    restoreCompRotation(blocker, orig);
  }

  if (depth <= 2) {
    const orig = { w: blocker.w, h: blocker.h, pins: blocker.pins.map(p => ({ dCol: p.dCol, dRow: p.dRow })) };
    rotateComp90InPlace(blocker);
    if (!anyOverlap(blocker, components)) {
      if (tryTranslateWithPush(blocker, dx, dy, cols, rows, visited, depth + 1, components)) {
        moveComp(comp, nx, ny);
        blocker = findFirstOverlap(comp, components);
        if (!blocker) return true;
        moveComp(comp, prev.ox, prev.oy);
      }
    }
    restoreCompRotation(blocker, orig);
  }

  return false;
}


export async function tryShrinkAlongWires(components, currentWires, bestScore, cols, rows, checkCancel = null) {
  const isCanceled = () => (typeof checkCancel === 'function' ? checkCancel() : !!checkCancel);

  const original = saveComps(components);
  const originalWires = currentWires;

  // Prefer components on the boundary.
  const bounds = calculateComponentBounds(components);
  const onEdge = (c) => c.ox === bounds.minCol || (c.ox + c.w - 1) === bounds.maxCol || c.oy === bounds.minRow || (c.oy + c.h - 1) === bounds.maxRow;
  const candidates = components.filter(onEdge);
  // Try the ones with strongest pull first.
  candidates.sort((a, b) => {
    const pa = moveVectorTowardWires(a, components);
    const pb = moveVectorTowardWires(b, components);
    return (Math.abs(pb.dx) + Math.abs(pb.dy)) - (Math.abs(pa.dx) + Math.abs(pa.dy));
  });

  for (const c of candidates) {
    const dirs = pickShrinkDirsForComp(c, components);
    for (const d of dirs) {
      if (isCanceled()) return { improved: false, score: bestScore, wires: originalWires };
      restoreComps(components, original);

      // Save positions before push to detect which components actually moved
      const posBefore = components.map(comp => ({ ox: comp.ox, oy: comp.oy, w: comp.w, h: comp.h }));

      const visited = new Set();
      const ok = tryTranslateWithPush(c, d.dx, d.dy, cols, rows, visited, 0, components);
      if (!ok) continue;
      if (anyOverlap(c, components)) continue;

      // Find which components actually moved (tryTranslateWithPush can chain-push multiple)
      const movedComps = components.filter((comp, i) => {
        const before = posBefore[i];
        return comp.ox !== before.ox || comp.oy !== before.oy || comp.w !== before.w || comp.h !== before.h;
      });

      const { success, wires: testWires } = incrementalReroute(components, originalWires, movedComps);
      if (!success) continue;
      const testScore = scoreState(components, testWires);

      // Only allow moves that keep routing completion and improve score.
      if (testScore.comp < bestScore.comp) continue;
      if (!isScoreBetter(testScore, bestScore)) continue;

      return { improved: true, score: testScore, wires: testWires };
    }
  }

  restoreComps(components, original);
  return { improved: false, score: bestScore, wires: originalWires };
}


/**
 * Topological Wire Absorption:
 * Iteratively pulls components along their connected wire paths toward
 * their connections. For each pin, follows the wire path direction and
 * moves the component 1 step along it. The cell was already occupied by
 * the wire, so the move is provably safe and wirelength monotonically
 * improves. Repeats until no more progress, creating free space for
 * subsequent TCC and plateau passes.
 */
export function tryWireAbsorption(components, currentWires, bestScore, cols, rows, gCancelRequested = false) {
  const startComps = saveComps(components);
  let latestWires = currentWires;
  let latestScore = bestScore;

  let madeProgress = true;
  let passes = 0;
  const MAX_PASSES = 30;

  while (madeProgress && passes++ < MAX_PASSES && !gCancelRequested) {
    madeProgress = false;

    const bounds = calculateComponentBounds(components);
    const bbArea = (bounds.maxCol - bounds.minCol + 1) * (bounds.maxRow - bounds.minRow + 1);

    // Sort: small components first, then few pins first
    const sorted = [...components].sort((a, b) => {
      const aSize = a.w * a.h, bSize = b.w * b.h;
      if (aSize !== bSize) return aSize - bSize;
      return a.pins.length - b.pins.length;
    });

    for (const c of sorted) {
      if (gCancelRequested) break;

      // Collect unique move directions from wire paths connected to this component's pins
      const triedDirs = new Set();

      for (const pin of c.pins) {
        if (!pin.net) continue;

        for (const w of latestWires) {
          if (w.failed || w.net !== pin.net || !w.path || w.path.length < 2) continue;

          let dx = 0, dy = 0;
          const first = w.path[0];
          const last = w.path[w.path.length - 1];

          if (first.col === pin.col && first.row === pin.row) {
            // Pin is at start of path — follow toward second cell
            dx = w.path[1].col - first.col;
            dy = w.path[1].row - first.row;
          } else if (last.col === pin.col && last.row === pin.row) {
            // Pin is at end of path — follow toward second-to-last cell
            const sl = w.path[w.path.length - 2];
            dx = sl.col - last.col;
            dy = sl.row - last.row;
          } else {
            continue;
          }

          // Normalize to unit step
          if (dx !== 0) dx = dx > 0 ? 1 : -1;
          if (dy !== 0) dy = dy > 0 ? 1 : -1;

          const dirKey = `${dx},${dy}`;
          if (triedDirs.has(dirKey)) continue;
          triedDirs.add(dirKey);

          // Try moving the component 1 step along this wire direction
          const origOx = c.ox, origOy = c.oy;
          moveComp(c, c.ox + dx, c.oy + dy);

          if (anyOverlap(c, components)) {
            moveComp(c, origOx, origOy);
            continue;
          }

          // BB must not increase
          const nb = calculateComponentBounds(components);
          const nArea = (nb.maxCol - nb.minCol + 1) * (nb.maxRow - nb.minRow + 1);
          if (nArea > bbArea) {
            moveComp(c, origOx, origOy);
            continue;
          }

          // Incremental reroute (only affected nets)
          const { success, wires: testWires } = incrementalReroute(components, latestWires, c);
          if (!success) {
            moveComp(c, origOx, origOy);
            continue;
          }

          const testScore = scoreState(components, testWires);
          if (testScore.comp < latestScore.comp) {
            moveComp(c, origOx, origOy);
            continue;
          }

          // Accept if score strictly improved (area, perim, or wirelength)
          if (isScoreBetter(testScore, latestScore)) {
            latestScore = testScore;
            latestWires = testWires;
            madeProgress = true;
            break;
          }

          moveComp(c, origOx, origOy);
        }
        if (madeProgress) break;
      }
      if (madeProgress) break;
    }
  }

  const finalImproved = isScoreBetter(latestScore, bestScore);
  if (!finalImproved) {
    restoreComps(components, startComps);
    return { improved: false, score: bestScore, wires: currentWires };
  }

  return { improved: true, score: latestScore, wires: latestWires };
}


/**
 * Generate candidate positions for placing `mover` so that its shared-net
 * pins land within Manhattan distance 1-2 of `anchor`'s shared-net pins.
 */
function generateAffinityPositions(mover, anchor, sharedNets) {
  const seen = new Set();
  const candidates = [];

  // Manhattan distance deltas for dist 1 and 2
  const deltas = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [2, 0], [-2, 0], [0, 2], [0, -2],
    [1, 1], [1, -1], [-1, 1], [-1, -1]
  ];

  for (const net of sharedNets) {
    const moverPins = mover.pins.filter(p => p.net === net);
    const anchorPins = anchor.pins.filter(p => p.net === net);

    for (const mp of moverPins) {
      for (const ap of anchorPins) {
        for (const [dx, dy] of deltas) {
          // Place mover so mp lands at (ap.col+dx, ap.row+dy)
          const ox = ap.col + dx - mp.dCol;
          const oy = ap.row + dy - mp.dRow;
          const key = `${ox},${oy}`;
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push({ ox, oy });
        }
      }
    }
  }

  return candidates;
}

/**
 * Affinity Packing (Wire Loop Resolution):
 * Detects component pairs sharing ≥2 nets and tries to place the smaller
 * one directly adjacent to the larger one. This resolves "wire loops"
 * where two tightly-connected components ended up far apart, forcing
 * shared-net wires to route long detours around obstacles.
 *
 * Candidate positions are computed by targeting pin-to-pin proximity
 * for shared nets (Manhattan distance 1-2), producing a small focused
 * set of ~20 candidates per pair. Only the best-scoring valid position
 * is accepted.
 */
export function tryAffinityPacking(components, currentWires, bestScore, cols, rows, gCancelRequested = false) {
  // 1. Build affinity pairs: component pairs sharing ≥2 nets
  const affinityPairs = [];
  for (let i = 0; i < components.length; i++) {
    const aNets = new Set(components[i].pins.map(p => p.net).filter(Boolean));
    for (let j = i + 1; j < components.length; j++) {
      const uniqueShared = [...new Set(
        components[j].pins.map(p => p.net).filter(n => n && aNets.has(n))
      )];
      if (uniqueShared.length >= 2) {
        affinityPairs.push({ ai: i, bi: j, shared: uniqueShared, count: uniqueShared.length });
      }
    }
  }

  if (affinityPairs.length === 0) {
    return { improved: false, score: bestScore, wires: currentWires };
  }

  // Sort: most shared nets first
  affinityPairs.sort((x, y) => y.count - x.count);

  const original = saveComps(components);
  const bounds = calculateComponentBounds(components);
  const currentArea = (bounds.maxCol - bounds.minCol + 1) * (bounds.maxRow - bounds.minRow + 1);

  for (const pair of affinityPairs) {
    if (gCancelRequested) break;

    const a = components[pair.ai], b = components[pair.bi];

    // Move the smaller component toward the larger one
    const [mover, anchor] = (a.w * a.h <= b.w * b.h) ? [a, b] : [b, a];

    const candidates = generateAffinityPositions(mover, anchor, pair.shared);

    let bestCandidate = null;
    let bestCandScore = bestScore;

    for (const pos of candidates) {
      restoreComps(components, original);
      const comp = components.find(c => c.id === mover.id);
      moveComp(comp, pos.ox, pos.oy);

      if (anyOverlap(comp, components)) continue;

      // BB must not increase
      const nb = calculateComponentBounds(components);
      const nArea = (nb.maxCol - nb.minCol + 1) * (nb.maxRow - nb.minRow + 1);
      if (nArea > currentArea) continue;

      const { success, wires: testWires } = incrementalReroute(components, currentWires, comp);
      if (!success) continue;

      const testScore = scoreState(components, testWires);
      if (testScore.comp < bestScore.comp) continue;

      if (isScoreBetter(testScore, bestCandScore)) {
        bestCandidate = { ox: pos.ox, oy: pos.oy, score: testScore, wires: testWires };
        bestCandScore = testScore;
      }
    }

    if (bestCandidate) {
      restoreComps(components, original);
      const comp = components.find(c => c.id === mover.id);
      moveComp(comp, bestCandidate.ox, bestCandidate.oy);
      return { improved: true, score: bestCandidate.score, wires: bestCandidate.wires };
    }
  }

  restoreComps(components, original);
  return { improved: false, score: bestScore, wires: currentWires };
}

/**
 * Identify clusters of components that are tightly coupled.
 * Two components are bonded if they share >= 2 nets, OR if they share
 * 1 net and that is the ONLY net one of the components has.
 * They must also be physically adjacent (Manhattan BB distance <= 2).
 */
function findTightClusters(components) {
  const n = components.length;
  const adj = Array.from({ length: n }, () => []);

  const bbs = components.map(c => ({
    minC: c.ox, maxC: c.ox + c.w - 1,
    minR: c.oy, maxR: c.oy + c.h - 1,
    nets: new Set(c.pins.map(p => p.net).filter(Boolean))
  }));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = bbs[i], b = bbs[j];

      const distC = Math.max(0, a.minC - b.maxC, b.minC - a.maxC);
      const distR = Math.max(0, a.minR - b.maxR, b.minR - a.maxR);
      if (distC + distR > 2) continue;

      let sharedCount = 0;
      for (const net of a.nets) {
        if (b.nets.has(net)) sharedCount++;
      }

      if (sharedCount >= 2 || (sharedCount === 1 && (a.nets.size === 1 || b.nets.size === 1))) {
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }

  const visited = new Set();
  const clusters = [];

  for (let i = 0; i < n; i++) {
    if (visited.has(i)) continue;

    const cluster = [];
    const queue = [i];
    visited.add(i);

    while (queue.length > 0) {
      const curr = queue.shift();
      cluster.push(components[curr].id);
      for (const neighbor of adj[curr]) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    if (cluster.length > 1 && cluster.length <= 6) {
      clusters.push(cluster);
    }
  }

  return clusters;
}

/**
 * Cluster Rotate Optimize:
 * Identifies tightly coupled clusters and attempts to rotate the entire
 * cluster as a rigid body (90, 180, 270 degrees) to resolve topology
 * issues and shrink the footprint. Includes a 5x5 sub-grid translation
 * search per angle to seat the rotated cluster optimally.
 */
export function tryClusterRotateOptimize(components, currentWires, bestScore, cols, rows, gCancelRequested = false) {
  const clusters = findTightClusters(components);
  if (clusters.length === 0) return { improved: false, score: bestScore, wires: currentWires };

  const original = saveComps(components);
  const bounds = calculateComponentBounds(components);
  const currentArea = (bounds.maxCol - bounds.minCol + 1) * (bounds.maxRow - bounds.minRow + 1);

  let bestGlobalScore = bestScore;
  let bestGlobalWires = currentWires;
  let improved = false;

  for (const clusterIds of clusters) {
    if (gCancelRequested) break;

    const clusterComps = clusterIds.map(id => components.find(c => c.id === id));

    // Cluster bounding box
    let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
    clusterComps.forEach(c => {
      minC = Math.min(minC, c.ox);
      maxC = Math.max(maxC, c.ox + c.w - 1);
      minR = Math.min(minR, c.oy);
      maxR = Math.max(maxR, c.oy + c.h - 1);
    });
    const W = maxC - minC + 1;
    const H = maxR - minR + 1;

    let bestLocalScore = bestGlobalScore;
    let bestLocalWires = null;
    let bestLocalPos = null;

    const preRotateOriginal = saveComps(components);

    for (const angle of [90, 180, 270]) {
      for (let tx = -2; tx <= 2; tx++) {
        for (let ty = -2; ty <= 2; ty++) {
          if (gCancelRequested) break;
          restoreComps(components, preRotateOriginal);

          let hasOverlapWithNonCluster = false;
          const movedBatch = [];

          for (const c of components) {
            if (clusterIds.includes(c.id)) {
              const dx = c.ox - minC;
              const dy = c.oy - minR;
              const cw = c.w;
              const ch = c.h;
              let new_dx, new_dy;

              if (angle === 90) {
                new_dx = H - dy - ch;
                new_dy = dx;
                rotateComp90InPlace(c);
              } else if (angle === 180) {
                new_dx = W - dx - cw;
                new_dy = H - dy - ch;
                rotateComp90InPlace(c);
                rotateComp90InPlace(c);
              } else if (angle === 270) {
                new_dx = dy;
                new_dy = W - dx - cw;
                rotateComp90InPlace(c);
                rotateComp90InPlace(c);
                rotateComp90InPlace(c);
              }

              moveComp(c, minC + new_dx + tx, minR + new_dy + ty);
              movedBatch.push(c);
            }
          }

          for (const c of movedBatch) {
            if (anyOverlap(c, components)) {
              hasOverlapWithNonCluster = true;
              break;
            }
          }

          if (hasOverlapWithNonCluster) continue;

          const nb = calculateComponentBounds(components);
          const nArea = (nb.maxCol - nb.minCol + 1) * (nb.maxRow - nb.minRow + 1);
          if (nArea > currentArea) continue;

          const { success, wires: testWires } = incrementalReroute(components, bestGlobalWires, movedBatch);
          if (!success) continue;

          const testScore = scoreState(components, testWires);
          if (testScore.comp < bestGlobalScore.comp) continue;

          // Crucial: we want *strict* improvement so it doesn't vacillate
          if (isScoreBetter(testScore, bestLocalScore)) {
            bestLocalScore = testScore;
            bestLocalWires = testWires;
            bestLocalPos = saveComps(components);
          }
        }
      }
    }

    if (bestLocalWires) {
      restoreComps(components, bestLocalPos);
      bestGlobalScore = bestLocalScore;
      bestGlobalWires = bestLocalWires;
      improved = true;
    } else {
      restoreComps(components, preRotateOriginal);
    }
  }

  if (!improved) {
    restoreComps(components, original);
    return { improved: false, score: bestScore, wires: currentWires };
  }

  return { improved: true, score: bestGlobalScore, wires: bestGlobalWires };
}

/**
 * Generate candidate positions for relocating a blocker component.
 * Positions within the current BB are prioritized; +1 outside is allowed
  * (temporary growth to enable future shrink).
 */
function generateBlockerCandidates(blocker, bounds) {
  const candidates = [];
  const seen = new Set();
  const compArea = blocker.w * blocker.h;
  const radius = compArea <= 4 ? 5 : 3;

  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      if (dx === 0 && dy === 0) continue;
      const ox = blocker.ox + dx;
      const oy = blocker.oy + dy;
      // Allow positions within BB + 1 margin (temporary growth)
      if (ox + blocker.w - 1 < bounds.minCol - 1 || ox > bounds.maxCol + 1) continue;
      if (oy + blocker.h - 1 < bounds.minRow - 1 || oy > bounds.maxRow + 1) continue;
      const key = `${ox},${oy}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ ox, oy });
    }
  }

  // Sort: within-BB first, then closer to center
  const cx = (bounds.minCol + bounds.maxCol) / 2;
  const cy = (bounds.minRow + bounds.maxRow) / 2;

  candidates.sort((a, b) => {
    const aIn = a.ox >= bounds.minCol && a.ox + blocker.w - 1 <= bounds.maxCol &&
      a.oy >= bounds.minRow && a.oy + blocker.h - 1 <= bounds.maxRow;
    const bIn = b.ox >= bounds.minCol && b.ox + blocker.w - 1 <= bounds.maxCol &&
      b.oy >= bounds.minRow && b.oy + blocker.h - 1 <= bounds.maxRow;
    if (aIn !== bIn) return aIn ? -1 : 1;
    const dA = Math.abs(a.ox + blocker.w / 2 - cx) + Math.abs(a.oy + blocker.h / 2 - cy);
    const dB = Math.abs(b.ox + blocker.w / 2 - cx) + Math.abs(b.oy + blocker.h / 2 - cy);
    return dA - dB;
  });

  return candidates;
}

/**
 * Recursive search: finds a sequence of component relocations that allows
 * `target` to be placed at (goalX, goalY). If a blocker is in the way,
 * it tries relocating the blocker to valid nearby positions and recurses.
 *
 * Returns an array of {id, ox, oy} move steps (blocker moves first), or null.
 */
function findChainSequence(target, goalX, goalY, components, bounds, maxDepth, budget) {
  if (budget.calls++ > budget.max) return null;

  // Simulate target at goal, find blocker
  const origOx = target.ox, origOy = target.oy;
  moveComp(target, goalX, goalY);
  const blocker = findFirstOverlap(target, components);
  moveComp(target, origOx, origOy);

  if (!blocker) {
    return [{ id: target.id, ox: goalX, oy: goalY }];
  }

  if (maxDepth <= 0) return null;

  const candidates = generateBlockerCandidates(blocker, bounds);

  for (const cand of candidates) {
    if (budget.calls > budget.max) break;

    // Save full state, move blocker to candidate
    const saved = saveComps(components);
    moveComp(blocker, cand.ox, cand.oy);

    if (anyOverlap(blocker, components)) {
      restoreComps(components, saved);
      continue;
    }

    // Recurse: with blocker relocated, can target reach goalPos now?
    const subSeq = findChainSequence(target, goalX, goalY, components, bounds, maxDepth - 1, budget);

    restoreComps(components, saved);

    if (subSeq) {
      return [{ id: blocker.id, ox: cand.ox, oy: cand.oy }, ...subSeq];
    }
  }

  return null;
}

/**
 * Targeted Chain Compaction (TCC):
 * For each boundary component (small first, few-nets first), try to find
 * a multi-step sequence of component relocations that lets it move inward
 * and shrink the bounding box. Blockers are recursively relocated to
 * nearby free positions (air gaps). Routing is checked only once at the
 * end of a successful sequence.
 */
export function tryChainedCompaction(components, currentWires, bestScore, cols, rows, gCancelRequested = false) {
  const bounds = calculateComponentBounds(components);
  const bbW = bounds.maxCol - bounds.minCol + 1;
  const bbH = bounds.maxRow - bounds.minRow + 1;
  const currentArea = bbW * bbH;

  const original = saveComps(components);

  // Boundary components: small footprint first, then few-nets first
  const onBoundary = (c) =>
    c.ox === bounds.minCol || (c.ox + c.w - 1) === bounds.maxCol ||
    c.oy === bounds.minRow || (c.oy + c.h - 1) === bounds.maxRow;

  const boundary = components.filter(onBoundary).sort((a, b) => {
    const aArea = a.w * a.h, bArea = b.w * b.h;
    if (aArea !== bArea) return aArea - bArea;
    const aNets = new Set(a.pins.map(p => p.net).filter(Boolean)).size;
    const bNets = new Set(b.pins.map(p => p.net).filter(Boolean)).size;
    return aNets - bNets;
  });

  for (const c of boundary) {
    if (gCancelRequested) break;

    // Find inward directions that would actually shrink BB
    const dirs = [];
    if (c.ox === bounds.minCol) dirs.push({ dx: 1, dy: 0 });
    if ((c.ox + c.w - 1) === bounds.maxCol) dirs.push({ dx: -1, dy: 0 });
    if (c.oy === bounds.minRow) dirs.push({ dx: 0, dy: 1 });
    if ((c.oy + c.h - 1) === bounds.maxRow) dirs.push({ dx: 0, dy: -1 });

    for (const dir of dirs) {
      for (let delta = 1; delta <= 3; delta++) {
        restoreComps(components, original);

        const comp = components.find(x => x.id === c.id);
        const goalX = comp.ox + dir.dx * delta;
        const goalY = comp.oy + dir.dy * delta;

        const budget = { calls: 0, max: 500 };
        const seq = findChainSequence(comp, goalX, goalY, components, bounds, 2, budget);

        if (!seq || seq.length === 0) continue;

        // Apply all moves atomically
        restoreComps(components, original);
        const movedComps = [];
        for (const step of seq) {
          const mc = components.find(x => x.id === step.id);
          moveComp(mc, step.ox, step.oy);
          movedComps.push(mc);
        }

        // Verify BB actually shrank
        const newBounds = calculateComponentBounds(components);
        const newArea = (newBounds.maxCol - newBounds.minCol + 1) *
          (newBounds.maxRow - newBounds.minRow + 1);
        if (newArea >= currentArea) {
          restoreComps(components, original);
          continue;
        }

        // Verify no overlaps in the final state
        let hasOverlapFinal = false;
        for (const mc of movedComps) {
          if (anyOverlap(mc, components)) { hasOverlapFinal = true; break; }
        }
        if (hasOverlapFinal) {
          restoreComps(components, original);
          continue;
        }

        // One incremental route for the entire sequence
        const { success, wires: testWires } = incrementalReroute(components, currentWires, movedComps);
        if (!success) {
          restoreComps(components, original);
          continue;
        }

        const testScore = scoreState(components, testWires);
        if (testScore.comp < bestScore.comp) {
          restoreComps(components, original);
          continue;
        }

        if (isScoreBetter(testScore, bestScore)) {
          return { improved: true, score: testScore, wires: testWires };
        }

        restoreComps(components, original);
      }
    }
  }

  restoreComps(components, original);
  return { improved: false, score: bestScore, wires: currentWires };
}


export async function explorePlateauStates(components, currentWires, bestScore, cols, rows, gCancelRequested = false) {
  const baseBounds = calculateComponentBounds(components);
  const baseW = (baseBounds.maxCol - baseBounds.minCol + 1);
  const baseH = (baseBounds.maxRow - baseBounds.minRow + 1);
  const baseArea = baseW * baseH;
  const basePerim = (baseW + baseH) * 2;

  if (baseArea > 700) return { improved: false, score: bestScore, wires: currentWires };

  const original = saveComps(components);
  const originalWires = currentWires;

  const bounds = baseBounds;
  const candidates = [...components];

  let bestLocalScore = bestScore;
  let bestLocalComps = null;
  let bestLocalWires = null;

  for (const c of candidates) {
    const cOrig = { w: c.w, h: c.h, pins: c.pins.map(p => ({ dCol: p.dCol, dRow: p.dRow })), ox: c.ox, oy: c.oy };

    for (let rot = 0; rot < 4; rot++) {
      restoreComps(components, original);

      const cc = components.find(x => x.id === c.id);
      const rotOrig = { w: cc.w, h: cc.h, pins: cc.pins.map(p => ({ dCol: p.dCol, dRow: p.dRow })) };
      for (let r = 0; r < rot; r++) rotateComp90InPlace(cc);

      const minOx = bounds.minCol;
      const maxOx = bounds.maxCol - cc.w + 1;
      const minOy = bounds.minRow;
      const maxOy = bounds.maxRow - cc.h + 1;
      if (minOx > maxOx || minOy > maxOy) {
        restoreCompRotation(cc, rotOrig);
        continue;
      }

      for (let ox = minOx; ox <= maxOx; ox++) {
        for (let oy = minOy; oy <= maxOy; oy++) {
          if (gCancelRequested) return { improved: false, score: bestLocalScore, wires: bestLocalWires || originalWires };
          if (rot === 0 && ox === cOrig.ox && oy === cOrig.oy) continue;

          moveComp(cc, ox, oy);
          if (anyOverlap(cc, components)) continue;

          const b2 = calculateComponentBounds(components);
          const w2 = (b2.maxCol - b2.minCol + 1);
          const h2 = (b2.maxRow - b2.minRow + 1);
          const area2 = w2 * h2;
          const per2 = (w2 + h2) * 2;
          if (area2 > baseArea) continue;
          if (area2 === baseArea && per2 > basePerim) continue;

          const testScore = { comp: bestScore.comp, area: area2, perim: per2, wl: bestScore.wl, width: w2, height: h2, bounds: b2 };

          if (isScoreBetter(testScore, bestLocalScore) || (
            testScore.comp === bestLocalScore.comp &&
            testScore.area === bestLocalScore.area &&
            testScore.perim === bestLocalScore.perim &&
            testScore.wl < bestLocalScore.wl
          )) {
            // Use incremental routing — only re-route nets touching the moved component
            const { success, wires: testWires } = incrementalReroute(components, originalWires, cc);
            if (!success) continue;
            const realScore = scoreState(components, testWires);
            if (realScore.comp < bestScore.comp) continue;

            if (isScoreBetter(realScore, bestLocalScore) || (
              realScore.comp === bestLocalScore.comp &&
              realScore.area === bestLocalScore.area &&
              realScore.perim === bestLocalScore.perim &&
              realScore.wl < bestLocalScore.wl
            )) {
              bestLocalScore = realScore;
              bestLocalComps = saveComps(components);
              bestLocalWires = testWires;
            }
          }
        }
      }

      restoreCompRotation(cc, rotOrig);
    }
  }

  if (bestLocalComps) {
    restoreComps(components, bestLocalComps);
    return { improved: true, score: bestLocalScore, wires: bestLocalWires };
  }

  restoreComps(components, original);
  return { improved: false, score: bestScore, wires: originalWires };
}


export async function tryRotateOptimize(components, wires, checkCancel = null) {
  const isCanceled = () => (typeof checkCancel === 'function' ? checkCancel() : !!checkCancel);
  let bestScore = scoreState(components, wires);
  let bestWires = wires;
  let improved = false;

  for (let c of components) {
    const originalW = c.w, originalH = c.h;
    const originalPins = c.pins.map(p => ({ dCol: p.dCol, dRow: p.dRow }));
    let cImproved = false;

    for (let rot = 1; rot <= 3; rot++) {
      if (isCanceled()) return { improved, score: bestScore, wires: bestWires };
      rotateComp90InPlace(c);

      if (anyOverlap(c, components)) continue;

      const { success, wires: testWires } = incrementalReroute(components, bestWires, c);
      if (!success) continue;
      const testScore = scoreState(components, testWires);

      if (isScoreBetter(testScore, bestScore)) {
        bestScore = testScore;
        bestWires = testWires;
        improved = true; cImproved = true; break;
      }
    }

    if (!cImproved) {
      restoreCompRotation(c, { w: originalW, h: originalH, pins: originalPins });
    }
  }
  return { improved, score: bestScore, wires: bestWires };
}


export async function doRecursivePushPacking(components, wires, cols, rows, gCancelRequested = false) {
  let changed = true;
  let loops = 0;
  let bestScore = scoreState(components, wires);
  let bestWires = wires;

  while (changed && loops < 25) {
    if (gCancelRequested) break;
    changed = false;
    loops++;

    const { bounds } = calculateFootprintArea(components, bestWires);
    const globalCx = bounds.minCol + (bounds.maxCol - bounds.minCol) / 2;
    const globalCy = bounds.minRow + (bounds.maxRow - bounds.minRow) / 2;

    const nets = getAllNets(components);

    // Calculate a specific target "Center of Mass" for EACH component based on its wires
    const compTargets = new Map();
    components.forEach(c => {
      let sumX = 0, sumY = 0, count = 0;

      c.pins.forEach(p => {
        if (p.net && nets[p.net]) {
          nets[p.net].forEach(op => {
            // Don't count pins that are on THIS component
            if (op.col >= c.ox && op.col < c.ox + c.w && op.row >= c.oy && op.row < c.oy + c.h) return;
            sumX += op.col;
            sumY += op.row;
            count++;
          });
        }
      });

      // If connected to things, target their average location. If unconnected, drift to global center.
      if (count > 0) {
        compTargets.set(c, { x: sumX / count, y: sumY / count });
      } else {
        compTargets.set(c, { x: globalCx, y: globalCy });
      }
    });

    // Sort components: furthest from their personal target move first
    const sorted = [...components].sort((a, b) => {
      const tA = compTargets.get(a);
      const tB = compTargets.get(b);
      const distA = Math.max(Math.abs(a.ox + a.w / 2 - tA.x), Math.abs(a.oy + a.h / 2 - tA.y));
      const distB = Math.max(Math.abs(b.ox + b.w / 2 - tB.x), Math.abs(b.oy + b.h / 2 - tB.y));
      return distB - distA;
    });

    const oldStates = saveComps(components);
    const movedSet = [];

    for (let c of sorted) {
      const target = compTargets.get(c);
      let dx = 0, dy = 0;

      // Move toward personal target
      if (c.ox + c.w / 2 < target.x - 0.5) dx = 1;
      else if (c.ox + c.w / 2 > target.x + 0.5) dx = -1;

      if (c.oy + c.h / 2 < target.y - 0.5) dy = 1;
      else if (c.oy + c.h / 2 > target.y + 0.5) dy = -1;

      const tryMove = (mx, my) => {
        if (mx === 0 && my === 0) return false;
        moveComp(c, c.ox + mx, c.oy + my);
        if (anyOverlap(c, components)) {
          moveComp(c, c.ox - mx, c.oy - my); // Revert physical collision
          return false;
        }
        return true;
      };

      // Try moving diagonally first, then slide horizontally or vertically
      if (tryMove(dx, dy) || tryMove(dx, 0) || tryMove(0, dy)) {
        movedSet.push(c);
      }
    }

    if (movedSet.length > 0) {
      const { success, wires: testWires } = incrementalReroute(components, bestWires, movedSet);
      if (!success) {
        restoreComps(components, oldStates);
      } else {
        const testScore = scoreState(components, testWires);

        if (isScoreBetter(testScore, bestScore) || (
          testScore.comp === bestScore.comp && testScore.area === bestScore.area && testScore.perim === bestScore.perim
        )) {
          if (isScoreBetter(testScore, bestScore)) bestScore = testScore;
          bestWires = testWires;
          changed = true;
        } else {
          restoreComps(components, oldStates); // Revert if topological move broke a wire
        }
      }
    }
  }
  return { score: bestScore, wires: bestWires };
}


export async function tryGlobalNudge(components, wires, bestScore, cols, rows, gCancelRequested = false) {
  const dirs = [
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 }
  ];

  const original = saveComps(components);
  const originalWires = wires;

  for (const d of dirs) {
    restoreComps(components, original);

    // Validate bounds for the entire translation first.
    let inBounds = true;
    for (const c of components) {
      const nx = c.ox + d.dx;
      const ny = c.oy + d.dy;
      if (nx < 0 || ny < 0 || nx + c.w > cols || ny + c.h > rows) { inBounds = false; break; }
    }
    if (!inBounds) continue;

    // Apply the translation atomically.
    for (const c of components) moveComp(c, c.ox + d.dx, c.oy + d.dy);

    const testWires = await route(components, cols, rows, () => { }, () => gCancelRequested);
    const testScore = scoreState(components, testWires);
    if (isScoreBetter(testScore, bestScore)) {
      return { improved: true, score: testScore, wires: testWires };
    }
  }

  restoreComps(components, original);
  return { improved: false, score: bestScore, wires: originalWires };
}



export function cutToBoundingBox(components, wires) {
  if (!components.length) return null;

  const { bounds } = calculateFootprintArea(components, wires);

  const pad = 0;
  const newCols = (bounds.maxCol - bounds.minCol) + 1 + (pad * 2);
  const newRows = (bounds.maxRow - bounds.minRow) + 1 + (pad * 2);

  if (newCols <= 0 || newRows <= 0) return null;

  const offsetX = -bounds.minCol + pad;
  const offsetY = -bounds.minRow + pad;

  components.forEach(comp => {
    comp.ox += offsetX;
    comp.oy += offsetY;
    comp.pins.forEach(pin => {
      pin.col += offsetX;
      pin.row += offsetY;
    });
  });

  wires.forEach(wire => {
    if (wire.path) {
      wire.path.forEach(point => {
        point.col += offsetX;
        point.row += offsetY;
      });
    }
  });

  return { cols: newCols, rows: newRows, offsetX, offsetY };
}
