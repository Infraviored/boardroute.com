// How many nets are fully connected on the board: each net's pins must be joined by its own
// wires (consecutive path cells; a jumper joins its two legs). Used for the Completion stat, so
// a net whose wires were deleted counts as open instead of silently vanishing from the ratio.
export function netCompletion(components, wires) {
    const key = (c, r) => `${c},${r}`;
    const pinsByNet = new Map();
    for (const c of components) for (const p of c.pins) {
        if (!p.net) continue;
        if (!pinsByNet.has(p.net)) pinsByNet.set(p.net, []);
        pinsByNet.get(p.net).push(key(c.ox + p.dCol, c.oy + p.dRow));
    }
    const parent = new Map();
    const find = (k) => {
        if (!parent.has(k)) { parent.set(k, k); return k; }
        let r = k;
        while (parent.get(r) !== r) r = parent.get(r);
        while (parent.get(k) !== r) { const n = parent.get(k); parent.set(k, r); k = n; }
        return r;
    };
    const union = (net, a, b) => {
        const ra = find(`${net}|${a}`), rb = find(`${net}|${b}`);
        if (ra !== rb) parent.set(rb, ra);
    };
    for (const w of wires || []) {
        if (w.failed || !w.path?.length) continue;
        for (let i = 1; i < w.path.length; i++) union(w.net, key(w.path[i - 1].col, w.path[i - 1].row), key(w.path[i].col, w.path[i].row));
    }
    let total = 0, done = 0;
    for (const [net, pins] of pinsByNet) {
        if (pins.length < 2) continue;
        total++;
        const root = find(`${net}|${pins[0]}`);
        if (pins.every(p => find(`${net}|${p}`) === root)) done++;
    }
    return { done, total };
}
