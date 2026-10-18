import { rotateComp90InPlace } from './placer.js';

export function placeInitial(compDefs, startX = 50, startY = 50) {
  const components = [];

  // Calculate total area required by all components
  let totalArea = 0;
  compDefs.forEach(cd => {
    totalArea += (cd.w + 2) * (cd.h + 2); // adding padding
  });

  // Calculate a logical spread (square root of area * 1.5 for breathing room)
  const spread = Math.max(10, Math.ceil(Math.sqrt(totalArea) * 1.5));
  const cx = startX;
  const cy = startY;

  compDefs.forEach(cd => {
    // Position within the calculated square zone
    const ox = cx + Math.floor(Math.random() * spread - spread / 2);
    const oy = cy + Math.floor(Math.random() * spread - spread / 2);

    let c = makeComp(cd, ox, oy);

    // Random Initial Rotation (0 to 3 times 90 degrees)
    const rotations = Math.floor(Math.random() * 4);
    for (let i = 0; i < rotations; i++) {
      rotateComp90InPlace(c);
    }

    components.push(c);
  });
  return components;
}


export function makeComp(cd, ox, oy) {
  return {
    id: cd.id, name: cd.name, value: cd.value, color: cd.color,
    routeUnder: !!cd.routeUnder,
    ...(cd.swap ? { swap: cd.swap } : {}),
    w: cd.w, h: cd.h, ox, oy,
    pins: cd.offsets.map((off, i) => ({
      col: ox + off[0], row: oy + off[1],
      net: cd.pinNets[i], lbl: cd.pinLbls[i],
      dCol: off[0], dRow: off[1]
    }))
  };
}
