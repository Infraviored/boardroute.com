// placer.js
var bboxCache = null;
var numNetsCache = 0;

export function setupHpwl(numNets) {
  numNetsCache = numNets;
  if (!bboxCache || bboxCache.length < numNets * 4) {
    bboxCache = new Int32Array(numNets * 4);
  }
}

export function hpwl(components) {
  // Reset existing bounding boxes
  for (let i = 0; i < numNetsCache * 4; i += 4) {
    bboxCache[i] = 1000000;    // minC
    bboxCache[i + 1] = -1000000; // maxC
    bboxCache[i + 2] = 1000000;  // minR
    bboxCache[i + 3] = -1000000; // maxR
  }

  // Populate bounds
  for (let i = 0; i < components.length; i++) {
    const pins = components[i].pins;
    for (let j = 0; j < pins.length; j++) {
      const p = pins[j];
      const nid = p.netId;
      if (nid === undefined) continue;

      const base = nid * 4;
      if (p.col < bboxCache[base]) bboxCache[base] = p.col;
      if (p.col > bboxCache[base + 1]) bboxCache[base + 1] = p.col;
      if (p.row < bboxCache[base + 2]) bboxCache[base + 2] = p.row;
      if (p.row > bboxCache[base + 3]) bboxCache[base + 3] = p.row;
    }
  }

  let total = 0;
  for (let i = 0; i < numNetsCache * 4; i += 4) {
    if (bboxCache[i] !== 1000000) {
      total += (bboxCache[i + 1] - bboxCache[i]) + (bboxCache[i + 3] - bboxCache[i + 2]);
    }
  }
  return total;
}

export function hasOverlap(a, b) {
  return a.ox < b.ox + b.w && a.ox + a.w > b.ox &&
    a.oy < b.oy + b.h && a.oy + a.h > b.oy;
}

export function moveComp(comp, ox, oy) {
  comp.ox = ox; comp.oy = oy;
  const pins = comp.pins;
  for (let i = 0; i < pins.length; i++) {
    const p = pins[i];
    p.col = ox + p.dCol;
    p.row = oy + p.dRow;
  }
}

export function anyOverlap(comp, all) {
  for (let i = 0; i < all.length; i++) {
    const o = all[i];
    if (o !== comp && hasOverlap(comp, o)) return true;
  }
  return false;
}

// In-place rotation to prevent GC pauses
export function rotateComp90InPlace(c) {
  const oldW = c.w;
  const oldH = c.h;
  // the cable side turns with the part (top -> right -> bottom -> left)
  if (c.edge >= 0) c.edge = (c.edge + 1) % 4;

  c.w = oldH;
  c.h = oldW;

  const pins = c.pins;
  for (let i = 0; i < pins.length; i++) {
    const p = pins[i];
    const oldCol = p.dCol;
    const oldRow = p.dRow;

    p.dCol = oldH - 1 - oldRow;
    p.dRow = oldCol;

    p.col = c.ox + p.dCol;
    p.row = c.oy + p.dRow;
  }
}

export function unrotateComp90InPlace(c) {
  const oldW = c.w;
  const oldH = c.h;
  if (c.edge >= 0) c.edge = (c.edge + 3) % 4;

  c.w = oldH;
  c.h = oldW;

  const pins = c.pins;
  for (let i = 0; i < pins.length; i++) {
    const p = pins[i];
    const oldCol = p.dCol;
    const oldRow = p.dRow;

    p.dCol = oldRow;
    p.dRow = oldW - 1 - oldCol;

    p.col = c.ox + p.dCol;
    p.row = c.oy + p.dRow;
  }
}

export async function anneal(components, cols, rows, onProgress, shouldCancel) {
  if (components.length === 0) return;

  function yld() { return new Promise(r => setTimeout(r, 0)); }

  // Assign fast numeric net IDs before annealing for blazing fast HPWL memory lookups
  const netIdMap = new Map();
  let nextNetId = 0;
  for (let i = 0; i < components.length; i++) {
    const pins = components[i].pins;
    for (let j = 0; j < pins.length; j++) {
      const p = pins[j];
      if (p.net) {
        if (!netIdMap.has(p.net)) {
          netIdMap.set(p.net, nextNetId++);
        }
        p.netId = netIdMap.get(p.net);
      } else {
        p.netId = undefined; // Erase past state cleanly
      }
    }
  }
  setupHpwl(nextNetId);

  let T = 100, Tmin = 0.5, alpha = 0.94;
  let cur = hpwl(components); // Using fast static Memory HPWL now
  const totalSteps = Math.ceil(Math.log(Tmin / T) / Math.log(alpha));
  let step = 0;

  while (T > Tmin) {
    const MOVES_PER_STEP = 8;
    for (let m = 0; m < MOVES_PER_STEP; m++) {
      if (shouldCancel && shouldCancel()) return;
      const c = components[Math.floor(Math.random() * components.length)];
      const oldOx = c.ox, oldOy = c.oy;

      // Try rotation in-place (1 to 3 times for 90, 180, 270 deg)
      let rotationSteps = 0;
      if (Math.random() < 0.4) {
        rotationSteps = Math.floor(Math.random() * 3) + 1;
        for (let r = 0; r < rotationSteps; r++) {
          rotateComp90InPlace(c);
        }
      }

      const mag = Math.ceil(Math.random() * 4);
      let dox = 0, doy = 0;
      const randDir = Math.random();
      if (randDir < 0.25) dox = mag;
      else if (randDir < 0.5) dox = -mag;
      else if (randDir < 0.75) doy = mag;
      else doy = -mag;

      const nox = Math.max(-50000, Math.min(50000, c.ox + dox));
      const noy = Math.max(-50000, Math.min(50000, c.oy + doy));

      moveComp(c, nox, noy);

      let overlap = anyOverlap(c, components);
      if (overlap) {
        // Revert 
        for (let r = 0; r < rotationSteps; r++) unrotateComp90InPlace(c);
        moveComp(c, oldOx, oldOy);
        continue;
      }

      const ns = hpwl(components); // Fast HPWL evaluation
      const dE = ns - cur;

      if (dE < 0 || Math.random() < Math.exp(-dE / T)) {
        cur = ns;
      } else {
        // Revert
        for (let r = 0; r < rotationSteps; r++) unrotateComp90InPlace(c);
        moveComp(c, oldOx, oldOy);
      }
    }
    T *= alpha; step++;
    if (shouldCancel && shouldCancel()) return;
    onProgress(step / totalSteps, `SA T=${T.toFixed(1)} WL=${cur}`);
    if (step % 5 === 0) await yld();
  }
}
