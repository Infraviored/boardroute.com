// Compact numeric model of a circuit for the box solver.
import { makeComp } from '../initial-placement.js';
import { rotateComp90InPlace, moveComp } from '../placer.js';

// Rotation matches rotateComp90InPlace: w' = h, h' = w, dCol' = h-1-dRow, dRow' = dCol.
function rotations(def) {
    const out = [];
    let w = def.w, h = def.h;
    let dc = def.offsets.map(o => o[0]);
    let dr = def.offsets.map(o => o[1]);
    for (let r = 0; r < 4; r++) {
        out.push({ w, h, dc: Int32Array.from(dc), dr: Int32Array.from(dr) });
        const ndc = dr.map(v => h - 1 - v);
        const ndr = dc;
        dc = ndc; dr = ndr;
        [w, h] = [h, w];
    }
    return out;
}

export function buildModel(defs) {
    const netIds = new Map();
    const comps = defs.map(def => ({
        id: def.id,
        def,
        routeUnder: !!def.routeUnder,
        rots: rotations(def),
        net: Int32Array.from(def.pinNets.map(n => {
            if (!n) return -1;
            if (!netIds.has(n)) netIds.set(n, netIds.size);
            return netIds.get(n);
        })),
    }));
    const netNames = [...netIds.keys()];
    const netPinCount = new Int32Array(netNames.length);
    for (const c of comps) for (const n of c.net) if (n >= 0) netPinCount[n]++;
    // Nets with a single pin need no routing.
    const routedNets = [];
    for (let n = 0; n < netNames.length; n++) if (netPinCount[n] >= 2) routedNets.push(n);
    // Which nets each component touches (for incremental re-routing)
    for (const c of comps) c.nets = [...new Set([...c.net].filter(n => n >= 0 && netPinCount[n] >= 2))];
    const area = comps.reduce((s, c) => s + c.rots[0].w * c.rots[0].h, 0);
    return { comps, netNames, netPinCount, routedNets, area };
}

// Placement -> engine components/wires (engine format, positions offset by origin).
export function toEngine(model, pl, routing, W, originCol = 0, originRow = 0) {
    const components = model.comps.map((c, i) => {
        const comp = makeComp(c.def, 0, 0);
        for (let r = 0; r < pl.rot[i]; r++) rotateComp90InPlace(comp);
        moveComp(comp, pl.ox[i] + originCol, pl.oy[i] + originRow);
        return comp;
    });
    const wires = [];
    if (routing) {
        for (const n of model.routedNets) {
            for (const conn of routing.conns[n] || []) {
                wires.push({
                    net: model.netNames[n], failed: false,
                    path: Array.from(conn, k => ({ col: (k % W) + originCol, row: Math.floor(k / W) + originRow })),
                });
            }
        }
    }
    return { components, wires };
}
