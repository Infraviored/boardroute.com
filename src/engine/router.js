import { Grid, BLOCKED_COMP, BLOCKED_PIN, BLOCKED_WIRE } from './grid.js';

export const getAllNets = function (components) {
  const m = {};
  components.forEach(c => c.pins.forEach(p => {
    if (p.net) {
      if (!m[p.net]) m[p.net] = [];
      m[p.net].push({ col: p.col, row: p.row, net: p.net });
    }
  }));
  return Object.entries(m).map(([net, pins]) => ({ net, pins }));
}

function buildOrthogonalPath(start, end, horizontalFirst) {
  const path = [{ col: start.col, row: start.row }];
  let c = start.col;
  let r = start.row;

  if (horizontalFirst) {
    const dc = end.col > c ? 1 : -1;
    while (c !== end.col) {
      c += dc;
      path.push({ col: c, row: r });
    }
    const dr = end.row > r ? 1 : -1;
    while (r !== end.row) {
      r += dr;
      path.push({ col: c, row: r });
    }
  } else {
    const dr = end.row > r ? 1 : -1;
    while (r !== end.row) {
      r += dr;
      path.push({ col: c, row: r });
    }
    const dc = end.col > c ? 1 : -1;
    while (c !== end.col) {
      c += dc;
      path.push({ col: c, row: r });
    }
  }

  return path;
}

function canUsePathOnGrid(grid, path) {
  for (let i = 1; i < path.length - 1; i++) {
    const pt = path[i];
    if (!grid.inBounds(pt.col, pt.row)) return false;
    const cell = grid.cells[grid.idx(pt.col, pt.row)];
    if (cell & (BLOCKED_COMP | BLOCKED_PIN | BLOCKED_WIRE)) return false;
  }
  return true;
}

function straightenWirePath(path, grid) {
  if (!path || path.length <= 2) return path;

  const start = path[0];
  const end = path[path.length - 1];
  const currentLength = path.length - 1;
  const minLength = Math.abs(end.col - start.col) + Math.abs(end.row - start.row);
  if (minLength > currentLength) return path;

  const preferHorizontal = path.length > 1 ? path[1].row === start.row : true;
  const candidates = [
    buildOrthogonalPath(start, end, preferHorizontal),
    buildOrthogonalPath(start, end, !preferHorizontal)
  ];

  for (const candidate of candidates) {
    const candLength = candidate.length - 1;
    if (candLength > currentLength) continue;
    if (!canUsePathOnGrid(grid, candidate)) continue;
    return candidate;
  }

  return path;
}

export const route = async function (components, cols, rows, onProg, shouldCancel = null, existingWires = []) {
  const nets = getAllNets(components);

  let minCol = Infinity, maxCol = -Infinity, minRow = Infinity, maxRow = -Infinity;
  if (components.length > 0) {
    components.forEach(c => {
      minCol = Math.min(minCol, c.ox); maxCol = Math.max(maxCol, c.ox + c.w - 1);
      minRow = Math.min(minRow, c.oy); maxRow = Math.max(maxRow, c.oy + c.h - 1);
    });
  } else {
    minCol = 0; maxCol = cols || 50; minRow = 0; maxRow = rows || 50;
  }

  const pad = 15;
  const gridMinC = minCol - pad;
  const gridMinR = minRow - pad;
  const gridCols = (maxCol - minCol + 1) + pad * 2;
  const gridRows = (maxRow - minRow + 1) + pad * 2;

  const grid = new Grid(gridCols, gridRows, gridMinC, gridMinR);
  components.forEach(c => grid.registerComp(c));

  const wires = [];
  // Preserve manual wires and mark them on the grid first
  existingWires.forEach(w => {
    if (w.manual && !w.failed && w.path) {
      grid.markWire(w.path);
      wires.push(w);
    }
  });

  // Calculate which nets still need routing (exclude pins already connected by manual wires?)
  // For simplicity, we just route everything else normally.
  for (let netIdx = 0; netIdx < nets.length; netIdx++) {
    if (shouldCancel && shouldCancel()) {
      for (let j = netIdx; j < nets.length; j++) {
        const unroutedNet = nets[j];
        const pins = unroutedNet.pins;
        for (let pIdx = 1; pIdx < pins.length; pIdx++) {
          wires.push({ net: unroutedNet.net, path: [pins[0], pins[pIdx]], failed: true });
        }
      }
      break;
    }
    const net = nets[netIdx];
    if (onProg) onProg((netIdx + 1) / nets.length, net.net);

    const pins = [...net.pins];
    const routedIndices = new Set();

    // 1. Temporarily UNBLOCK manual bits of our own net so we can use them
    const manualWiresOfNet = wires.filter(w => w.manual && w.net === net.net);
    manualWiresOfNet.forEach(mw => {
      mw.path.forEach(pt => {
        const idx = grid.idx(pt.col, pt.row);
        routedIndices.add(idx);
        grid.clear(pt.col, pt.row, BLOCKED_WIRE); // Clear so we can pass through/into our own net
      });
    });

    const unroutedPins = pins.filter(p => !routedIndices.has(grid.idx(p.col, p.row)));

    if (routedIndices.size === 0 && unroutedPins.length > 0) {
      const first = unroutedPins.shift();
      routedIndices.add(grid.idx(first.col, first.row));
    }

    const netResultWires = [];
    while (unroutedPins.length > 0) {
      if (shouldCancel && shouldCancel()) {
        unroutedPins.forEach(failPin => {
          const firstIdx = routedIndices.size > 0 ? [...routedIndices][0] : grid.idx(failPin.col, failPin.row);
          const fallbackA = { col: (firstIdx % grid.cols) + grid.minCol, row: Math.floor(firstIdx / grid.cols) + grid.minRow };
          netResultWires.push({ net: net.net, path: [fallbackA, failPin], failed: true });
        });
        break;
      }
      const targetIndices = unroutedPins.map(p => grid.idx(p.col, p.row));

      const result = grid.astarMultiTarget(routedIndices, targetIndices); // STRICT

      if (result && result.path) {
        const normalizedPath = straightenWirePath(result.path, grid);
        netResultWires.push({ net: net.net, path: normalizedPath, failed: false });
        // DO NOT mark grid yet! We might block our own next segment.
        normalizedPath.forEach(pt => routedIndices.add(grid.idx(pt.col, pt.row)));
        const hitIdx = unroutedPins.findIndex(p => grid.idx(p.col, p.row) === result.hitTargetIdx);
        if (hitIdx !== -1) unroutedPins.splice(hitIdx, 1);
      } else {
        const failPin = unroutedPins.shift();
        const firstIdx = [...routedIndices][0];
        const fallbackA = { col: (firstIdx % grid.cols) + grid.minCol, row: Math.floor(firstIdx / grid.cols) + grid.minRow };
        netResultWires.push({ net: net.net, path: [fallbackA, failPin], failed: true });
      }
    }

    // 2. NOW we are done with the net. Mark ALL its wires on the grid permanently.
    netResultWires.forEach(rw => {
      wires.push(rw);
      if (!rw.failed) grid.markWire(rw.path);
    });
    manualWiresOfNet.forEach(mw => {
      grid.markWire(mw.path); // Restore block for others
    });

    if (netIdx % 2 === 1) await new Promise(r => setTimeout(r, 0));
  }
  return wires;
}

/**
 * Incremental re-route: only rips up and re-routes nets affected by moved components.
 * Everything else is kept intact, producing a massive speedup over full route().
 *
 * @param {Array} components  - All components (in their NEW positions)
 * @param {Array} wires       - Wires from BEFORE the move (corresponding to old positions)
 * @param {Array|Object} movedComps - Component(s) that changed position/rotation
 * @returns {{ success: boolean, wires: Array }}
 */
// All holes a jumper spans (legs included).
function jumperCells(w) {
  const [a, b] = w.path, n = Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
  const sx = Math.sign(b.col - a.col), sy = Math.sign(b.row - a.row);
  return Array.from({ length: n + 1 }, (_, i) => ({ col: a.col + sx * i, row: a.row + sy * i }));
}

export function incrementalReroute(components, wires, movedComps) {
  const moved = Array.isArray(movedComps) ? movedComps : [movedComps];

  // 1. Collect nets directly connected to any moved component
  const affectedNets = new Set();
  for (const mc of moved) {
    for (const p of mc.pins) {
      if (p.net) {
        // Only reroute if this net already has at least one wire segment (auto or manual)
        if (wires.some(w => w.net === p.net)) {
          affectedNets.add(p.net);
        }
      }
    }
  }

  // 2. Find nets whose existing wire paths now intersect a moved component's footprint
  const displacedNets = new Set();
  for (const w of wires) {
    if (w.failed || affectedNets.has(w.net)) continue;
    for (const mc of moved) {
      // Wires may run under a routeUnder part, just not through its pins; a blocking part
      // displaces every wire under its body. A jumper may not lie over any part.
      const ox = mc.ox, oy = mc.oy, ox2 = mc.ox + mc.w, oy2 = mc.oy + mc.h;
      const underBody = (pt) => pt.col >= ox && pt.col < ox2 && pt.row >= oy && pt.row < oy2;
      const onPin = (pt) => mc.pins.some(p => p.col === pt.col && p.row === pt.row);
      const hit = w.jumper ? jumperCells(w).some(underBody) : (mc.routeUnder ? w.path?.some(onPin) : w.path?.some(underBody));
      if (hit) {
        displacedNets.add(w.net);
        break;
      }
    }
  }

  // Merge all nets that need rerouting
  const netsToReroute = new Set([...affectedNets, ...displacedNets]);

  if (netsToReroute.size === 0) {
    return { success: true, wires: [...wires] };
  }

  // 3. Keep unaffected wires
  const keptWires = wires.filter(w => !netsToReroute.has(w.net));

  // 4. Build grid
  let minCol = Infinity, maxCol = -Infinity, minRow = Infinity, maxRow = -Infinity;
  for (const c of components) {
    minCol = Math.min(minCol, c.ox);
    maxCol = Math.max(maxCol, c.ox + c.w - 1);
    minRow = Math.min(minRow, c.oy);
    maxRow = Math.max(maxRow, c.oy + c.h - 1);
  }

  const pad = 15;
  const gridMinC = minCol - pad;
  const gridMinR = minRow - pad;
  const gridCols = (maxCol - minCol + 1) + pad * 2;
  const gridRows = (maxRow - minRow + 1) + pad * 2;

  const grid = new Grid(gridCols, gridRows, gridMinC, gridMinR);
  components.forEach(c => grid.registerComp(c));
  // Mark all kept wires on grid (a jumper has no interior cells: block its legs instead)
  // Every cell, ends included: box-solver wires end at branch points and jumper legs, which
  // markWire (interior only) would leave open to other nets.
  keptWires.forEach(w => {
    if (w.failed || !w.path) return;
    w.path.forEach(pt => grid.set(pt.col, pt.row, BLOCKED_WIRE));
  });

  // 5. Route only the affected nets
  const allNets = getAllNets(components);
  const toRoute = allNets.filter(n => netsToReroute.has(n.net));

  const newWires = [...keptWires];
  let allRouted = true;

  for (const net of toRoute) {
    const pins = [...net.pins];
    if (pins.length < 2) continue;

    const routedIndices = new Set();

    // 1. Unblock own-net manual segments
    const manualWiresOfNet = wires.filter(w => w.manual && w.net === net.net);
    manualWiresOfNet.forEach(mw => {
      let isDisplacedManual = false;
      for (const mc of moved) {
        if (mc.routeUnder) continue;
        const ox = mc.ox, oy = mc.oy, ox2 = mc.ox + mc.w, oy2 = mc.oy + mc.h;
        if (mw.path.some(pt => pt.col >= ox && pt.col < ox2 && pt.row >= oy && pt.row < oy2)) {
          isDisplacedManual = true;
          break;
        }
      }

      if (!isDisplacedManual) {
        // Do NOT mark grid yet, but do add to seeds
        newWires.push(mw);
        mw.path.forEach(pt => {
          const idx = grid.idx(pt.col, pt.row);
          routedIndices.add(idx);
          grid.clear(pt.col, pt.row, BLOCKED_WIRE);
        });
      }
    });

    const unroutedPins = pins.filter(p => !routedIndices.has(grid.idx(p.col, p.row)));

    if (routedIndices.size === 0 && unroutedPins.length > 0) {
      const first = unroutedPins.shift();
      routedIndices.add(grid.idx(first.col, first.row));
    }

    const netResultWires = [];
    while (unroutedPins.length > 0) {
      const targetIndices = unroutedPins.map(p => grid.idx(p.col, p.row));
      const result = grid.astarMultiTarget(routedIndices, targetIndices); // STRICT

      if (result && result.path) {
        const normalizedPath = straightenWirePath(result.path, grid);
        netResultWires.push({ net: net.net, path: normalizedPath, failed: false });
        normalizedPath.forEach(pt => routedIndices.add(grid.idx(pt.col, pt.row)));
        const hitIdx = unroutedPins.findIndex(p => grid.idx(p.col, p.row) === result.hitTargetIdx);
        if (hitIdx !== -1) unroutedPins.splice(hitIdx, 1);
      } else {
        allRouted = false;
        const failPin = unroutedPins.shift();
        const firstIdx = [...routedIndices][0];
        const fallbackA = { col: (firstIdx % grid.cols) + grid.minCol, row: Math.floor(firstIdx / grid.cols) + grid.minRow };
        netResultWires.push({ net: net.net, path: [fallbackA, failPin], failed: true });
      }
    }

    // Mark ALL pieces of this net on grid now that we're done
    netResultWires.forEach(rw => {
      newWires.push(rw);
      if (!rw.failed) grid.markWire(rw.path);
    });

    const keptManualsOfNet = newWires.filter(w => w.manual && w.net === net.net);
    keptManualsOfNet.forEach(mw => {
      grid.markWire(mw.path);
    });
  }

  return { success: allRouted, wires: newWires };
}
