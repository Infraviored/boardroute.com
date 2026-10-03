import { getAllNets } from './router.js';

import { NET_PAL, compColor } from './colors.js';

export const SP = 28; // Standard pitch - 28px

const hashString = (n) => {
  const str = String(n || '');
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

const getGoldenHue = (hash) => {
  const phi = 0.618033988749895;
  const h = (hash * phi + 0.25) % 1;
  return Math.floor(h * 360);
};

export function netColor(n) {
  if (!n) return '#666';
  const uname = n.toUpperCase();
  if (NET_PAL[uname]) return NET_PAL[uname];

  const h = getGoldenHue(hashString(n));
  return `hsl(${h}, 95%, 60%)`; // Vibrant for wires
}

export { compColor };

/**
 * boostColor - For components manually assigned color, make them pop.
 * For auto-colored ones, we already have our HSL targets.
 */
export function boostColor(hexOrHsl) {
  if (!hexOrHsl) return '#555';
  if (hexOrHsl.startsWith('hsl')) return hexOrHsl; // Already processed

  const hex = hexOrHsl;
  if (hex.length < 6) return hex;

  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);

  const lift = (v) => Math.min(255, Math.max(v * 1.8, v + 40));
  r = lift(r); g = lift(g); b = lift(b);

  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

export function generateBackgroundSVG(cols, rows, bounds = null) {
  // Use massive dimensions for infinite panning
  const W = 100000;
  const H = 100000;
  const OX = -50000;
  const OY = -50000;

  let maskContent = '';
  if (bounds) {
    const cx = ((bounds.minCol + bounds.maxCol + 1) / 2) * SP;
    const cy = ((bounds.minRow + bounds.maxRow + 1) / 2) * SP;
    const rw = (bounds.maxCol - bounds.minCol + 10) * SP / 2;
    const rh = (bounds.maxRow - bounds.minRow + 10) * SP / 2;
    // 3x radius for massive visible glow area
    const r = Math.max(rw, rh, 300) * 3;

    maskContent = `
      <radialGradient id="fadeGrad" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="white" stop-opacity="1"/>
        <stop offset="40%" stop-color="white" stop-opacity="1"/>     <!-- 2x larger inner bright circle -->
        <stop offset="60%" stop-color="white" stop-opacity="0.8"/>
        <stop offset="80%" stop-color="white" stop-opacity="0.3"/>   <!-- Smoother, softer falloff -->
        <stop offset="100%" stop-color="white" stop-opacity="0"/>
      </radialGradient>
      <mask id="fadeMask">
        <rect x="${OX}" y="${OY}" width="${W}" height="${H}" fill="url(#fadeGrad)"/>
      </mask>
    `;
  }

  return `
    <defs>
      <pattern id="perfPattern" patternUnits="userSpaceOnUse" width="${SP}" height="${SP}" x="0" y="0">
        <rect width="${SP}" height="${SP}" fill="#1a1208"/>
        <circle cx="${SP / 2}" cy="${SP / 2}" r="${SP * .22}" fill="#b87333"/>
        <circle cx="${SP / 2}" cy="${SP / 2}" r="${SP * .09}" fill="#0d0a06"/>
      </pattern>
      ${maskContent}
    </defs>
    <rect x="${OX}" y="${OY}" width="${W}" height="${H}" fill="url(#perfPattern)" ${bounds ? 'mask="url(#fadeMask)"' : ''}/>
  `;
}

// Jumper wire: an insulated bridge on the component side, drawn as an arc between its legs.
// `hidden` (solder-side view) draws only a faint dashed line between the legs.
function jumperSVG(x1, y1, x2, y2, color, { width = 2.4, hidden = false } = {}) {
  const legs = `<circle cx="${x1}" cy="${y1}" r="${width + 1}" fill="${color}"/><circle cx="${x2}" cy="${y2}" r="${width + 1}" fill="${color}"/>`;
  if (hidden) {
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.2" stroke-dasharray="3 4" opacity="0.6"/>${legs}`;
  }
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const bulge = Math.min(len * 0.35, SP * 0.9);
  const cx = (x1 + x2) / 2 - ((y2 - y1) / len) * bulge;
  const cy = (y1 + y2) / 2 + ((x2 - x1) / len) * bulge;
  const d = `M${x1},${y1} Q${cx.toFixed(1)},${cy.toFixed(1)} ${x2},${y2}`;
  return `<path d="${d}" fill="none" stroke="#e9e4d8" stroke-width="${width + 3}" stroke-linecap="round"/>`
    + `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>${legs}`;
}

export function generateWiresSVG(wires, activeNets = []) {
  let out = '';
  let jumpers = '';
  wires.forEach(w => {
    if (w.jumper && !w.failed && w.path?.length === 2) {
      const [a, b] = w.path;
      const isActive = activeNets.includes(w.net);
      jumpers += jumperSVG(a.col * SP + SP / 2, a.row * SP + SP / 2, b.col * SP + SP / 2, b.row * SP + SP / 2, netColor(w.net), { width: isActive ? 3.4 : 2.4 });
      return;
    }
    if (w.failed) {
      const a = w.path[0], b = w.path[w.path.length - 1];
      out += `<line x1="${a.col * SP + SP / 2}" y1="${a.row * SP + SP / 2}" x2="${b.col * SP + SP / 2}" y2="${b.row * SP + SP / 2}" stroke="#ff2222" stroke-width="1" stroke-dasharray="2 5"/>`;
      return;
    }

    const isActive = activeNets.includes(w.net);
    const strokeW = isActive ? 3.8 : 2.8;
    if (!w.path) return;
    const pts = w.path.map(pt => `${pt.col * SP + SP / 2},${pt.row * SP + SP / 2}`).join(' ');
    const color = netColor(w.net);

    out += `<polyline points="${pts}" fill="none" class="${isActive ? 'wire-active' : ''}" stroke="${color}" stroke-width="${strokeW}" stroke-linecap="round" stroke-linejoin="round" style="${isActive ? `--wire-color: ${color}` : ''}"/>`;
  });
  // Jumpers sit on the component side, above the copper
  return out + jumpers;
}


export function generateRatsnestSVG(components, wires = []) {
  const nets = getAllNets(components);
  let out = '';
  for (const netObj of nets) {
    const { net, pins } = netObj;
    if (pins.length < 2) continue;

    const netWires = wires.filter(w => w.net === net && !w.failed);

    // Coordinate-based connectivity: map each coordinate occupied by the net to a group ID
    const parent = Array.from({ length: pins.length }, (_, i) => i);
    const findParent = (i) => {
      while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
      return i;
    };
    const union = (i, j) => {
      const rootI = findParent(i), rootJ = findParent(j);
      if (rootI !== rootJ) parent[rootI] = rootJ;
    };

    // 1. Map each grid coordinate used by this net to the set of pins it can "see"
    const coordMap = new Map(); // "col,row" -> Set of root parents

    // Seed coordMap with pin locations
    pins.forEach((p, i) => {
      const key = `${p.col},${p.row}`;
      if (!coordMap.has(key)) coordMap.set(key, new Set());
      coordMap.get(key).add(i);
    });

    // 2. For each wire, all coordinates in that wire are now connected
    // This is effectively a flood-fill across all segments
    let changed = true;
    while (changed) {
      changed = false;
      netWires.forEach(w => {
        const path = w.path;
        if (!path) return;

        // Find all groups currently touching this wire
        const touchingGroupRoots = new Set();
        path.forEach(pt => {
          const key = `${pt.col},${pt.row}`;
          if (coordMap.has(key)) {
            coordMap.get(key).forEach(pIdx => touchingGroupRoots.add(findParent(pIdx)));
          }
        });

        if (touchingGroupRoots.size > 1) {
          const roots = Array.from(touchingGroupRoots);
          const first = roots[0];
          for (let i = 1; i < roots.length; i++) {
            union(first, roots[i]);
            changed = true;
          }
        }

        // Mark all path points as belonging to the unified root, if any groups are touching
        if (touchingGroupRoots.size === 0) return;
        const newRoot = findParent(Array.from(touchingGroupRoots)[0]);
        path.forEach(pt => {
          const key = `${pt.col},${pt.row}`;
          if (!coordMap.has(key)) {
            coordMap.set(key, new Set());
            changed = true;
          }
          if (!coordMap.get(key).has(newRoot)) {
            coordMap.get(key).add(newRoot);
            changed = true;
          }
        });
      });
    }

    // 3. Final Grouping
    const finalGroupsMap = new Map();
    pins.forEach((p, i) => {
      const root = findParent(i);
      if (!finalGroupsMap.has(root)) finalGroupsMap.set(root, []);
      finalGroupsMap.get(root).push(i);
    });
    const finalGroups = Array.from(finalGroupsMap.values());

    if (finalGroups.length <= 1) continue;

    // 4. MST between groups
    const connectedGroups = new Set([0]);
    while (connectedGroups.size < finalGroups.length) {
      let bD = Infinity, bJ = -1, pI = -1, pJ = -1;
      connectedGroups.forEach(gi => {
        finalGroups.forEach((groupJ, gj) => {
          if (connectedGroups.has(gj)) return;
          finalGroups[gi].forEach(pi => {
            groupJ.forEach(pj => {
              const d = Math.abs(pins[pi].col - pins[pj].col) + Math.abs(pins[pi].row - pins[pj].row);
              if (d < bD) { bD = d; bJ = gj; pI = pi; pJ = pj; }
            });
          });
        });
      });

      if (bJ === -1) break;
      out += `<line x1="${pins[pI].col * SP + SP / 2}" y1="${pins[pI].row * SP + SP / 2}" x2="${pins[pJ].col * SP + SP / 2}" y2="${pins[pJ].row * SP + SP / 2}" stroke="${netColor(net)}" opacity="0.35" stroke-width="1.5" stroke-dasharray="4 4"/>`;
      connectedGroups.add(bJ);
    }
  }
  return out;
}

export function renderCompSVG(c, isSelected = false, activePin = null) {
  const bx = c.ox * SP + SP * .08, by = c.oy * SP + SP * .08;
  const bw = c.w * SP - SP * .16, bh = c.h * SP - SP * .16;
  const mainColor = boostColor(compColor(c));

  // Use deterministic hash for "random" animation timing
  const hash = (hashString(c.id) % 1000) / 1000;
  const animDelay = -(hash * 5).toFixed(2) + 's';
  const animDur = (2.5 + hash * 2).toFixed(2) + 's';

  const isGhost = activePin?.ghost || isSelected === 'ghost';
  const ghostOp = 0.4;

  let out = `<g class="pcb-comp ${isSelected === true ? 'component-selected' : ''}" data-id="${c.id}" style="--comp-color: ${mainColor}; --anim-delay: ${animDelay}; --anim-dur: ${animDur}; opacity: ${isGhost ? ghostOp : 1}">`;

  // 1. Draw Component Base (balanced shine-through, solid rim)
  const sw = isSelected ? 3.1 : 1.9; // Balanced selecion thickness
  const rimOp = isSelected ? 1.0 : 0.8;
  const tintOp = isSelected ? 0.2 : 0.08;

  const half = sw / 2;
  // Body: Inset by half the stroke width so it doesn't overlap the inner stroke half
  out += `<rect x="${bx + half}" y="${by + half}" width="${bw - sw}" height="${bh - sw}" rx="3" fill="#080808" fill-opacity="0.8"/>`;
  // Rim: Drawn with fill="none" to ensure uniform wire visibility through the stroke
  out += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="4" fill="none" class="pcb-comp-rim" stroke="${mainColor}" stroke-width="${sw}" stroke-opacity="${rimOp}"/>`;
  // subtle tint overlay (entire area)
  out += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="4" fill="${mainColor}" opacity="${tintOp}" style="pointer-events:none"/>`;

  let labelsOut = '';
  // 2. Draw Pins
  c.pins.forEach((p, idx) => {
    const px = p.col * SP + SP / 2, py = p.row * SP + SP / 2;
    const isActive = activePin && activePin.compId === c.id && activePin.pinIdx === idx;
    const pinColor = netColor(p.net);
    // Active pin: soft outer halo ring behind the pad (glow only, no size change)
    if (isActive) {
      out += `<circle cx="${px}" cy="${py}" r="${SP * .38}" fill="${pinColor}" opacity="0.15" style="pointer-events:none"/>`;
    }
    // Centered pin design: Label inside the colored pad (always same size)
    out += `<circle cx="${px}" cy="${py}" r="${SP * .22}" fill="${pinColor}" class="${isActive ? 'active-pin' : ''}" style="${isActive ? `--active-color: ${pinColor}` : ''}"/>`;


    const textAttrs = `x="${px}" y="${py}" dy=".35em" fill="#fff" font-family="'Outfit', sans-serif" font-weight="900" font-size="${Math.min(SP * .22, 6)}" text-anchor="middle" paint-order="stroke" stroke="#000" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;user-select:none"`;
    labelsOut += `<text ${textAttrs}>${p.lbl}</text>`;
  });

  // 3. Draw Component Labels (Centered, two-line layout)
  const midX = bx + bw / 2;
  // Shift midY only for vertical strips (h > w) with odd pin counts (h > 1) to avoid pin overlap.
  const isVerticalStrip = c.h > c.w && c.h > 1;
  const midY = (isVerticalStrip && c.h % 2 !== 0) ? (by + bh / 2 - SP / 2) : (by + bh / 2);
  const fontSize = Math.min(SP * .3, 10);

  // Name line
  const nameAttrs = `x="${midX}" y="${midY}" fill="#fff" font-family="'Outfit', sans-serif" font-size="${fontSize}" font-weight="800" text-anchor="middle" paint-order="stroke" stroke="#0b0c0e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;user-select:none"`;
  labelsOut += `<text ${nameAttrs}>${c.id}</text>`;

  // Value line (slightly smaller and dimmer)
  const valY = midY + fontSize * 0.8;
  const valAttrs = `x="${midX}" y="${valY}" fill="rgba(255,255,255,0.6)" font-family="'Outfit', sans-serif" font-size="${fontSize * 0.8}" font-weight="700" text-anchor="middle" paint-order="stroke" stroke="#0b0c0e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;user-select:none"`;
  labelsOut += `<text ${valAttrs}>${c.value}</text>`;

  out += `</g>`;

  // Return either as a combined string (default old behavior) or an object if requested
  if (isSelected === 'split') {
    return { base: `<g>${out}</g>`, labels: `<g>${labelsOut}</g>` };
  }

  return `<g>${out}${labelsOut}</g>`;
}

export function generatePrunedSVG({ components, wires, side = 'top', padding = 3 }) {
  if (!components?.length) return null;

  let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
  components.forEach(c => {
    if (!isFinite(c.ox) || !isFinite(c.oy)) return;
    minC = Math.min(minC, c.ox);
    maxC = Math.max(maxC, c.ox + c.w);
    minR = Math.min(minR, c.oy);
    maxR = Math.max(maxR, c.oy + c.h);
  });
  if (!isFinite(minC)) return null;

  wires.forEach(w => {
    if (w.failed) return;
    w.path?.forEach(pt => {
      minC = Math.min(minC, pt.col);
      maxC = Math.max(maxC, pt.col + 1);
      minR = Math.min(minR, pt.row);
      maxR = Math.max(maxR, pt.row + 1);
    });
  });

  const mCenter = minC + maxC; // The symmetric center bounds for mirroring

  // Physically mirror the data structures for the layout flip
  const isBottom = side === 'bottom';
  const displayComps = isBottom ? components.map(c => ({
    ...c,
    ox: mCenter - c.ox - c.w,
    pins: c.pins.map(p => ({ ...p, col: mCenter - p.col - 1 }))
  })) : components;

  const displayWires = isBottom ? wires.map(w => ({
    ...w,
    path: w.path?.map(pt => ({ ...pt, col: mCenter - pt.col - 1 }))
  })) : wires;

  const pad = padding / SP;
  minC -= pad; minR -= pad;
  maxC += pad; maxR += pad;

  const W = Math.round((maxC - minC) * SP);
  const H = Math.round((maxR - minR) * SP);
  if (W <= 0 || H <= 0) return null;

  let inner = '';
  // Background
  inner += `<rect width="${W}" height="${H}" fill="#1a1208" rx="7"/>`;

  // Grid / Pads
  for (let c = Math.ceil(minC); c < Math.floor(maxC); c++) {
    for (let r = Math.ceil(minR); r < Math.floor(maxR); r++) {
      const cx = Math.round((c - minC) * SP + SP / 2);
      const cy = Math.round((r - minR) * SP + SP / 2);
      inner += `<circle cx="${cx}" cy="${cy}" r="${Math.round(SP * .22)}" fill="#b87333"/><circle cx="${cx}" cy="${cy}" r="${Math.round(SP * .09)}" fill="#0d0a06"/>`;
    }
  }

  // Wires (Bottom: components first, then wires? User said "wires on highest layer overshadow everything")
  const px = (pt) => [Math.round((pt.col - minC) * SP + SP / 2), Math.round((pt.row - minR) * SP + SP / 2)];
  // Jumpers are on the component side: arcs on top in the top view, faint in the solder-side view
  const jumpersContent = displayWires.filter(w => w.jumper && !w.failed && w.path?.length === 2)
    .map(w => jumperSVG(...px(w.path[0]), ...px(w.path[1]), netColor(w.net), { width: 2, hidden: isBottom })).join('');
  const wiresContent = displayWires.map(w => {
    if (!w.path?.length || w.failed || w.jumper) return '';
    const pts = w.path.map(pt => `${Math.round((pt.col - minC) * SP + SP / 2)},${Math.round((pt.row - minR) * SP + SP / 2)}`).join(' ');
    return `<polyline points="${pts}" fill="none" stroke="${netColor(w.net)}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join('');

  const compsBases = [];
  const compsLabels = [];

  displayComps.forEach(c => {
    const sc = {
      ...c,
      ox: c.ox - minC,
      oy: c.oy - minR,
      pins: c.pins.map(p => ({ ...p, col: p.col - minC, row: p.row - minR }))
    };
    const rendered = renderCompSVG(sc, 'split');
    compsBases.push(rendered.base);
    compsLabels.push(rendered.labels);
  });

  let content = '';
  if (isBottom) {
    // Components Base -> Wires -> Component Labels (always on top)
    content = compsBases.join('') + wiresContent + jumpersContent + compsLabels.join('');
  } else {
    // Wires -> Components (Base + Labels) -> jumpers (component side)
    content = wiresContent + compsBases.join('') + compsLabels.join('') + jumpersContent;
  }

  inner += `<g>${content}</g>`;

  // Border
  const strokeWidth = 2;
  inner += `<rect x="${strokeWidth / 2}" y="${strokeWidth / 2}" width="${W - strokeWidth}" height="${H - strokeWidth}" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="${strokeWidth}" stroke-dasharray="8 6" rx="7"/>`;

  return { W, H, inner };
}

export function generateBoundingBoxSVG(components, wires = []) {
  if (!components.length) return '';

  let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
  components.forEach(c => {
    minC = Math.min(minC, c.ox);
    maxC = Math.max(maxC, c.ox + c.w);
    minR = Math.min(minR, c.oy);
    maxR = Math.max(maxR, c.oy + c.h);
  });

  wires.forEach(w => {
    if (w.failed) return;
    w.path?.forEach(pt => {
      minC = Math.min(minC, pt.col);
      maxC = Math.max(maxC, pt.col + 1);
      minR = Math.min(minR, pt.row);
      maxR = Math.max(maxR, pt.row + 1);
    });
  });

  if (!isFinite(minC)) return '';

  const strokeWidth = 2;
  const padPx = 3; // Exactly one line width gap
  const x = (minC) * SP - padPx;
  const y = (minR) * SP - padPx;
  const w = (maxC - minC) * SP + padPx * 2;
  const h = (maxR - minR) * SP + padPx * 2;

  // rx=7 (4 comp radius + 3 padding) ensures parallel rounding
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="${strokeWidth}" stroke-dasharray="8 6" rx="7"/>`;
}

export function generateBoardSVG(components, wires = [], options = {}) {
  const result = generatePrunedSVG({
    components,
    wires,
    side: options.side || 'top',
    padding: 3
  });
  if (!result) return '';
  const { W, H, inner } = result;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;800&amp;display=swap');
        text { font-family: 'Outfit', sans-serif; }
      </style>
    </defs>
    ${inner}
  </svg>`;
}

export function generateCombinedSVG(components, wires = [], options = {}) {
  const topSvg = generateBoardSVG(components, wires, { ...options, side: 'top' });
  const bottomSvg = generateBoardSVG(components, wires, { ...options, side: 'bottom' });

  // Extract inner content from both SVGs
  const getInner = (s) => s.replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '');

  // Get dimensions from one of them
  const match = topSvg.match(/width="(\d+)" height="(\d+)"/);
  if (!match) return '';
  const [_, W_str, H_str] = match;
  const W = parseInt(W_str);
  const H = parseInt(H_str);

  const gap = 30;
  const totalW = W * 2 + gap;
  const totalH = H + 60; // Extra room for labels

  const commonStyles = `
    <defs>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;800&amp;display=swap');
        text { font-family: 'Outfit', sans-serif; paint-order: stroke; stroke: #000; stroke-width: 2px; stroke-linecap: round; stroke-linejoin: round; }
      </style>
    </defs>
  `;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">
    ${commonStyles}
    <!-- No global background rect to allow transparency between views -->
    
    <g transform="translate(0, 45)">
      <text x="${W / 2}" y="-15" fill="#fff" font-family="Outfit, sans-serif" font-weight="800" font-size="22" text-anchor="middle">TOP VIEW</text>
      ${getInner(topSvg)}
    </g>
 
    <g transform="translate(${W + gap}, 45)">
      <text x="${W / 2}" y="-15" fill="#fff" font-family="Outfit, sans-serif" font-weight="800" font-size="22" text-anchor="middle">BOTTOM VIEW</text>
      ${getInner(bottomSvg)}
    </g>
  </svg>`;
}

export function hitComp(col, row, components) {
  return components.find(c =>
    col >= c.ox && col < c.ox + c.w &&
    row >= c.oy && row < c.oy + c.h
  ) || null;
}

export function hitPin(col, row, components) {
  for (const c of components) {
    for (let i = 0; i < c.pins.length; i++) {
      const p = c.pins[i];
      if (p.col === col && p.row === row) {
        return { compId: c.id, pinIdx: i, pin: p };
      }
    }
  }
  return null;
}

export function hitWire(col, row, wires) {
  return wires.find(w => !w.failed && w.path && w.path.some(pt => pt.col === col && pt.row === row)) || null;
}
