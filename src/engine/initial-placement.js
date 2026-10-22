import { rotateComp90InPlace } from './placer.js';

export function placeInitial(compDefs, startX = 50, startY = 50) {
  // Total area required by all components, with padding
  const totalArea = compDefs.reduce((sum, cd) => sum + (cd.w + 2) * (cd.h + 2), 0);

  // Calculate a logical spread (square root of area * 1.5 for breathing room)
  const spread = Math.max(10, Math.ceil(Math.sqrt(totalArea) * 1.5));

  return compDefs.map(cd => {
    // Position within the calculated square zone
    const ox = startX + Math.floor(Math.random() * spread - spread / 2);
    const oy = startY + Math.floor(Math.random() * spread - spread / 2);

    const c = makeComp(cd, ox, oy);

    // Random Initial Rotation (0 to 3 times 90 degrees)
    const rotations = Math.floor(Math.random() * 4);
    for (let i = 0; i < rotations; i++) {
      rotateComp90InPlace(c);
    }
    return c;
  });
}

// The per-part options a component takes over from its def (processTemplate output);
// optional ones only when set.
export function compOptions(cd) {
  return {
    routeUnder: !!cd.routeUnder,
    ...(cd.swap ? { swap: cd.swap } : {}),
    ...(cd.edge >= 0 ? { edge: cd.edge } : {}),
    ...(cd.bands !== undefined ? { bands: cd.bands } : {}),
  };
}

export function makeComp(cd, ox, oy) {
  return {
    id: cd.id, name: cd.name, value: cd.value, color: cd.color,
    ...compOptions(cd),
    w: cd.w, h: cd.h, ox, oy,
    pins: cd.offsets.map((off, i) => ({
      col: ox + off[0], row: oy + off[1],
      net: cd.pinNets[i], lbl: cd.pinLbls[i],
      dCol: off[0], dRow: off[1]
    }))
  };
}
