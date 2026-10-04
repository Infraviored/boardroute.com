// Provable lower bound on the board area: no layout can be smaller, so a layout that reaches it
// is perfect and the search can stop.
//
// Two facts, both independent of wiring:
//   - part bodies may not overlap, so the box holds at least the sum of all body areas;
//   - every part must fit into the box in one of its two orientations.
// The bound is the smallest W×H box satisfying both. Wires are ignored (they may run under
// parts), which keeps the bound valid but makes it reachable only by tightly packed boards.
//
// parts: [{ w, h }]  (footprints in holes, bodies included)
export function areaLowerBound(parts) {
    if (!parts?.length) return { area: 0, width: 0, height: 0 };
    const sum = parts.reduce((s, p) => s + p.w * p.h, 0);
    const minSide = Math.max(...parts.map(p => Math.min(p.w, p.h)));
    const maxSide = Math.max(...parts.map(p => Math.max(p.w, p.h)));
    let best = { area: Infinity, width: 0, height: 0 };
    for (let W = minSide; W <= maxSide + sum; W++) {
        // tallest requirement over parts, each in its best orientation for this width
        let H = Math.ceil(sum / W);
        for (const p of parts) {
            const a = p.w <= W ? p.h : Infinity, b = p.h <= W ? p.w : Infinity;
            H = Math.max(H, Math.min(a, b));
        }
        if (W * H < best.area) best = { area: W * H, width: W, height: H };
        if (W >= Math.ceil(sum / minSide) && W >= maxSide) break; // wider boxes only grow
    }
    return best;
}

// A layout is perfect when its area meets the bound and it uses no more jumper wires than any
// layout must: 0 for a circuit that can be drawn without crossings, 1 for one that can't
// (a non-planar network needs at least one crossing).
export function isPerfect(area, jumpers, bound, planar = true) {
    return area <= bound.area && (jumpers || 0) <= (planar ? 0 : 1);
}
