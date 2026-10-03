// Independent checker for a finished layout. Shares no code with the engine on purpose,
// so a solver cannot "win" by bending the router's own rules.
//
// Rules (same physical model the router implements):
//   - component bodies (w×h) must not overlap
//   - a wire cell may not lie on a non-routeUnder component body, except on a pin of its own net
//   - a wire cell may not lie on a pin of another net (or an unconnected pin)
//   - two different nets may not share a cell
//   - consecutive path points must be 4-neighbours
//   - every net's pins must end up in one connected piece (connections only along wire paths)
//   - jumper wires ({ jumper: true, path: [a, b] }) are straight bridges on the component side:
//     both legs in holes free of pins and part bodies, nothing but solder-side wiring under
//     them, no two jumpers over the same hole. Their legs count as copper of their net.

const key = (c, r) => `${c},${r}`;

export function validateLayout(components, wires) {
    const errors = [];
    const body = new Map();   // cell -> component id (non-routeUnder bodies)
    const pinAt = new Map();  // cell -> net ('' for unconnected pins)
    const occupied = new Map(); // cell -> component id (all bodies, for overlap)

    for (const c of components) {
        for (let dc = 0; dc < c.w; dc++) for (let dr = 0; dr < c.h; dr++) {
            const k = key(c.ox + dc, c.oy + dr);
            if (occupied.has(k)) errors.push(`overlap ${c.id}/${occupied.get(k)} at ${k}`);
            occupied.set(k, c.id);
            if (!c.routeUnder) body.set(k, c.id);
        }
        for (const p of c.pins) {
            const col = c.ox + p.dCol, row = c.oy + p.dRow;
            if (p.dCol < 0 || p.dRow < 0 || p.dCol >= c.w || p.dRow >= c.h) errors.push(`pin outside body ${c.id}`);
            pinAt.set(key(col, row), p.net || '');
        }
    }

    const netOfCell = new Map();
    const adj = new Map(); // net -> Map(cell -> Set(cell))
    const link = (net, a, b) => {
        if (!adj.has(net)) adj.set(net, new Map());
        const m = adj.get(net);
        if (!m.has(a)) m.set(a, new Set());
        if (!m.has(b)) m.set(b, new Set());
        m.get(a).add(b); m.get(b).add(a);
    };

    let failed = 0, jumpers = 0;
    const jumperAt = new Map();
    for (const w of wires || []) {
        if (w.failed || !w.jumper) continue;
        jumpers++;
        const [a, b] = w.path || [];
        if (!a || !b || w.path.length !== 2 || (a.col !== b.col && a.row !== b.row) || Math.abs(a.col - b.col) + Math.abs(a.row - b.row) < 2) {
            errors.push(`bad jumper geometry in ${w.net}`); continue;
        }
        const n = Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
        const sx = Math.sign(b.col - a.col), sy = Math.sign(b.row - a.row);
        for (let i = 0; i <= n; i++) {
            const k = key(a.col + sx * i, a.row + sy * i);
            if (occupied.has(k)) errors.push(`jumper of ${w.net} over part ${occupied.get(k)} at ${k}`);
            if (pinAt.has(k)) errors.push(`jumper of ${w.net} over a pin at ${k}`);
            if (jumperAt.has(k)) errors.push(`jumpers ${jumperAt.get(k)}/${w.net} overlap at ${k}`);
            jumperAt.set(k, w.net);
        }
    }
    for (const w of wires || []) {
        if (w.failed) { failed++; continue; }
        if (!w.path?.length) continue;
        if (w.jumper) {
            // legs are copper of the net; the bridge links them
            for (const p of w.path) {
                const k = key(p.col, p.row);
                const owner = netOfCell.get(k);
                if (owner !== undefined && owner !== w.net) errors.push(`nets ${owner}/${w.net} share ${k}`);
                netOfCell.set(k, w.net);
            }
            link(w.net, key(w.path[0].col, w.path[0].row), key(w.path[1].col, w.path[1].row));
            continue;
        }
        for (let i = 0; i < w.path.length; i++) {
            const { col, row } = w.path[i];
            const k = key(col, row);
            const pinNet = pinAt.get(k);
            if (pinNet !== undefined && pinNet !== w.net) errors.push(`net ${w.net} touches foreign pin at ${k}`);
            if (pinNet === undefined && body.get(k)) errors.push(`net ${w.net} runs over ${body.get(k)} at ${k}`);
            const owner = netOfCell.get(k);
            if (owner !== undefined && owner !== w.net) errors.push(`nets ${owner}/${w.net} share ${k}`);
            netOfCell.set(k, w.net);
            if (i > 0) {
                const p = w.path[i - 1];
                if (Math.abs(p.col - col) + Math.abs(p.row - row) !== 1) errors.push(`non-adjacent step in ${w.net}`);
                link(w.net, key(p.col, p.row), k);
            } else {
                link(w.net, k, k);
            }
        }
    }

    // Connectivity per net
    const pinsByNet = new Map();
    for (const [k, net] of pinAt) {
        if (!net) continue;
        if (!pinsByNet.has(net)) pinsByNet.set(net, []);
        pinsByNet.get(net).push(k);
    }
    let netsOpen = 0;
    for (const [net, pins] of pinsByNet) {
        if (pins.length < 2) continue;
        const m = adj.get(net) || new Map();
        const seen = new Set([pins[0]]);
        const stack = [pins[0]];
        while (stack.length) {
            const k = stack.pop();
            for (const n of m.get(k) || []) if (!seen.has(n)) { seen.add(n); stack.push(n); }
        }
        if (!pins.every(p => seen.has(p))) netsOpen++;
    }

    // Footprint: bodies + wire cells
    let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
    const grow = (c, r) => { minC = Math.min(minC, c); maxC = Math.max(maxC, c); minR = Math.min(minR, r); maxR = Math.max(maxR, r); };
    for (const c of components) { grow(c.ox, c.oy); grow(c.ox + c.w - 1, c.oy + c.h - 1); }
    for (const k of netOfCell.keys()) { const [c, r] = k.split(',').map(Number); grow(c, r); }
    const width = maxC - minC + 1, height = maxR - minR + 1;

    let wl = 0;
    for (const w of wires || []) if (!w.failed && w.path) for (let i = 1; i < w.path.length; i++) wl += Math.abs(w.path[i].col - w.path[i - 1].col) + Math.abs(w.path[i].row - w.path[i - 1].row);

    return {
        valid: errors.length === 0,
        routed: errors.length === 0 && netsOpen === 0,
        netsOpen, failed, jumpers, errors: errors.slice(0, 10),
        width, height, area: width * height, wl,
    };
}
