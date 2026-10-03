// Topological routability check for single-layer perfboard routing.
//
// Model: wires may not cross and may not use a pin cell of another net. Bodies of
// routeUnder parts are transparent; bodies of other parts block like pins.
// Every part therefore splits into "walls": 4-connected clusters of blocking cells
// (pins at spacing 1, plus the body if it isn't routeUnder). A wire can pass between
// two pins only if there is a free hole between them -- but a net may run *through*
// its own pins (adjacent same-net pins connect directly).
//
// Take any valid layout and contract each net's copper (its wires together with its
// pins) to a single point. What remains is the graph Q: one vertex per net, wall cells
// as vertices with their grid adjacencies, and every pin identified with its net's
// vertex. Contraction preserves planarity, so for ANY placement, rotation and board
// size:  Q non-planar  =>  the circuit is unroutable on one layer, and the minimal
// non-planar subgraph (K3,3 or K5 subdivision) names the parts and nets to blame.
// Using the full grid graph of a solid body only adds freedom (faces may be "used"),
// so a non-planar verdict is always a proof, never a false alarm.
//
// Q planar is necessary, not sufficient: it ignores that the edges of one pin must stay
// together around its net vertex, and capacity (how many tracks fit between two DIP
// rows). A constructive solver closes that gap.

// ---------- planarity (Demoucron–Malgrange–Pertuiset on biconnected blocks) ----------

function biconnectedBlocks(n, adj) {
    const disc = new Int32Array(n).fill(-1), low = new Int32Array(n);
    const blocks = [], stack = [];
    let time = 0;
    for (let root = 0; root < n; root++) {
        if (disc[root] !== -1 || adj[root].size === 0) continue;
        // iterative DFS
        const it = [[root, -1, [...adj[root]], 0]];
        disc[root] = low[root] = time++;
        while (it.length) {
            const top = it[it.length - 1];
            const [v, parent, nbrs] = top;
            if (top[3] < nbrs.length) {
                const w = nbrs[top[3]++];
                if (disc[w] === -1) {
                    stack.push([v, w]);
                    disc[w] = low[w] = time++;
                    it.push([w, v, [...adj[w]], 0]);
                } else if (w !== parent && disc[w] < disc[v]) {
                    stack.push([v, w]);
                    low[v] = Math.min(low[v], disc[w]);
                }
            } else {
                it.pop();
                if (parent !== -1) {
                    low[parent] = Math.min(low[parent], low[v]);
                    if (low[v] >= disc[parent]) {
                        const block = [];
                        let e;
                        do { e = stack.pop(); block.push(e); } while (e[0] !== parent || e[1] !== v);
                        blocks.push(block);
                    }
                }
            }
        }
    }
    return blocks;
}

// Planarity of one biconnected block given as an edge list.
function blockIsPlanar(edges) {
    const verts = [...new Set(edges.flat())];
    if (edges.length <= 3 || verts.length <= 4) return true;
    if (edges.length > 3 * verts.length - 6) return false;
    const adj = new Map(verts.map(v => [v, []]));
    for (const [a, b] of edges) { adj.get(a).push(b); adj.get(b).push(a); }
    const ekey = (a, b) => a < b ? `${a},${b}` : `${b},${a}`;

    // Initial cycle via DFS back edge
    const cycle = (() => {
        const parent = new Map([[verts[0], null]]);
        const order = [verts[0]];
        const st = [verts[0]];
        const depth = new Map([[verts[0], 0]]);
        while (st.length) {
            const v = st.pop();
            for (const w of adj.get(v)) {
                if (!parent.has(w)) { parent.set(w, v); depth.set(w, depth.get(v) + 1); st.push(w); order.push(w); }
            }
        }
        for (const v of order) for (const w of adj.get(v)) {
            if (w !== parent.get(v) && parent.get(w) !== v) {
                // v..w via tree paths to their LCA
                const pa = [], pb = [];
                let a = v, b = w;
                while (depth.get(a) > depth.get(b)) { pa.push(a); a = parent.get(a); }
                while (depth.get(b) > depth.get(a)) { pb.push(b); b = parent.get(b); }
                while (a !== b) { pa.push(a); pb.push(b); a = parent.get(a); b = parent.get(b); }
                return [...pa, a, ...pb.reverse()];
            }
        }
        return null;
    })();
    if (!cycle) return true;

    const inH = new Set(cycle);
    const hEdges = new Set();
    for (let i = 0; i < cycle.length; i++) hEdges.add(ekey(cycle[i], cycle[(i + 1) % cycle.length]));
    let faces = [cycle.slice(), cycle.slice()];

    while (hEdges.size < edges.length) {
        // Fragments: chords between H vertices, and components of G - V(H) plus their attachments
        const frags = [];
        for (const [a, b] of edges) {
            if (inH.has(a) && inH.has(b) && !hEdges.has(ekey(a, b))) frags.push({ att: new Set([a, b]), chord: [a, b] });
        }
        const seen = new Set();
        for (const s of verts) {
            if (inH.has(s) || seen.has(s)) continue;
            const comp = new Set([s]), att = new Set(), st = [s];
            seen.add(s);
            while (st.length) {
                const v = st.pop();
                for (const w of adj.get(v)) {
                    if (inH.has(w)) att.add(w);
                    else if (!seen.has(w)) { seen.add(w); comp.add(w); st.push(w); }
                }
            }
            frags.push({ att, comp });
        }
        let best = null;
        for (const f of frags) {
            f.faces = faces.filter(F => { const fs = new Set(F); for (const a of f.att) if (!fs.has(a)) return false; return true; });
            if (f.faces.length === 0) return false;
            if (!best || f.faces.length < best.faces.length) best = f;
        }
        // Path through the fragment between two attachment vertices
        let path;
        if (best.chord) path = best.chord;
        else {
            const [u] = best.att;
            // BFS from u through fragment interior to another attachment
            const prev = new Map([[u, null]]);
            const q = [u];
            let end = null;
            outer: while (q.length) {
                const v = q.shift();
                for (const w of adj.get(v)) {
                    if (prev.has(w)) continue;
                    if (v !== u && best.att.has(w) && w !== u) { prev.set(w, v); end = w; break outer; }
                    if (best.comp.has(w)) { prev.set(w, v); q.push(w); }
                }
            }
            path = [];
            for (let x = end; x !== null; x = prev.get(x)) path.push(x);
            path.reverse();
        }
        const F = best.faces[0];
        const u = path[0], v = path[path.length - 1];
        const i = F.indexOf(u), j = F.indexOf(v);
        const walk = (from, to) => { const r = []; for (let k = from; ; k = (k + 1) % F.length) { r.push(F[k]); if (k === to) break; } return r; };
        const inner = path.slice(1, -1);
        const f1 = [...walk(i, j), ...inner.slice().reverse()];
        const f2 = [...walk(j, i), ...inner];
        faces = faces.filter(x => x !== F);
        faces.push(f1, f2);
        for (const x of path) inH.add(x);
        for (let k = 0; k + 1 < path.length; k++) hEdges.add(ekey(path[k], path[k + 1]));
    }
    return true;
}

export function isPlanar(n, edgeList) {
    const adj = Array.from({ length: n }, () => new Set());
    for (const [a, b] of edgeList) if (a !== b) { adj[a].add(b); adj[b].add(a); }
    for (const block of biconnectedBlocks(n, adj)) {
        if (!blockIsPlanar(block)) return false;
    }
    return true;
}

// Minimal non-planar subgraph by greedy edge deletion -> K5 / K3,3 subdivision.
export function kuratowskiSubgraph(n, edgeList) {
    const uniq = new Map();
    for (const [a, b] of edgeList) if (a !== b) uniq.set(a < b ? `${a},${b}` : `${b},${a}`, a < b ? [a, b] : [b, a]);
    let edges = [...uniq.values()];
    if (isPlanar(n, edges)) return null;
    for (let i = edges.length - 1; i >= 0; i--) {
        const trial = edges.slice(0, i).concat(edges.slice(i + 1));
        if (!isPlanar(n, trial)) edges = trial;
    }
    const deg = new Map();
    for (const [a, b] of edges) { deg.set(a, (deg.get(a) || 0) + 1); deg.set(b, (deg.get(b) || 0) + 1); }
    const branch = [...deg].filter(([, d]) => d >= 3).map(([v]) => v);
    return { edges, branch, type: branch.length === 5 ? 'K5' : 'K3,3' };
}

// ---------- circuit -> graph H ----------

export function buildTopologyGraph(defs) {
    const labels = [];       // vertex -> description
    const owner = [];        // vertex -> { comp } | { net }
    const edges = [];
    const addV = (label, info) => { labels.push(label); owner.push(info); return labels.length - 1; };
    const netV = new Map();
    const netPins = new Map();
    defs.forEach(d => d.pinNets.forEach(n => { if (n) netPins.set(n, (netPins.get(n) || 0) + 1); }));
    const vertexOfNet = (net) => {
        if (!netV.has(net)) netV.set(net, addV(`net ${net}`, { net }));
        return netV.get(net);
    };
    let walls = 0;

    for (const d of defs) {
        const cells = new Map(); // "c,r" -> pin index or -1 (body)
        if (!d.routeUnder) for (let c = 0; c < d.w; c++) for (let r = 0; r < d.h; r++) cells.set(`${c},${r}`, -1);
        d.offsets.forEach(([c, r], i) => cells.set(`${c},${r}`, i));
        const vOf = new Map();
        for (const [k, pi] of cells) {
            const net = pi >= 0 ? d.pinNets[pi] : null;
            // Pins of a multi-pin net collapse into the net vertex.
            if (net && netPins.get(net) >= 2) vOf.set(k, vertexOfNet(net));
            else vOf.set(k, addV(pi >= 0 ? `${d.id}.${d.pinLbls[pi]}` : `${d.id}[body]`, { comp: d.id }));
        }
        for (const [k] of cells) {
            const [c, r] = k.split(',').map(Number);
            for (const [dc, dr] of [[1, 0], [0, 1]]) {
                const k2 = `${c + dc},${r + dr}`;
                if (cells.has(k2)) edges.push([vOf.get(k), vOf.get(k2), d.id]);
            }
        }
        // count walls (clusters with >= 2 cells)
        const visited = new Set();
        for (const k of cells.keys()) {
            if (visited.has(k)) continue;
            const st = [k]; visited.add(k); let size = 0;
            while (st.length) {
                const [c, r] = st.pop().split(',').map(Number); size++;
                for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const k2 = `${c + dc},${r + dr}`;
                    if (cells.has(k2) && !visited.has(k2)) { visited.add(k2); st.push(k2); }
                }
            }
            if (size >= 2) walls++;
        }
    }
    return { n: labels.length, edges, labels, owner, walls };
}

// Full analysis with a human-readable explanation when unroutable.
export function analyzeTopology(defs) {
    const g = buildTopologyGraph(defs);
    const planar = isPlanar(g.n, g.edges);
    const result = { planar, walls: g.walls };
    if (planar) return result;

    const k = kuratowskiSubgraph(g.n, g.edges);
    // Every edge of Q belongs to one part; vertices are nets or unconnected pins/body.
    const partOf = new Map();
    for (const [a, b, comp] of g.edges) partOf.set(a < b ? `${a},${b}` : `${b},${a}`, comp);
    const parts = new Set(), nets = new Set();
    for (const [a, b] of k.edges) {
        parts.add(partOf.get(`${a},${b}`));
        for (const v of [a, b]) if (g.owner[v].net) nets.add(g.owner[v].net);
    }
    const branch = k.branch.map(v => g.owner[v].net ? `net ${g.owner[v].net}` : `${g.labels[v]}`);
    result.certificate = { type: k.type, branch, parts: [...parts], nets: [...nets] };
    result.explanation = `Not routable on a single layer: ${k.type} structure of components ${[...parts].join(', ')} and nets ${[...nets].join(', ')}.`;
    return result;
}
