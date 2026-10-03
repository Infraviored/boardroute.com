// Negotiated-congestion (PathFinder-style) router confined to a W×H box.
//
// Nets may temporarily share cells; shared cells get more expensive every round
// (present cost) and keep a history cost, so nets negotiate who yields. The
// result reports how far the placement is from routable (overused cells, pins that
// cannot be reached at all), which gives the placer a smooth signal instead of a
// pass/fail bit that depends on net order.

const DX = [1, -1, 0, 0];
const DY = [0, 0, 1, -1];

class Heap {
    constructor(cap) { this.k = new Int32Array(cap); this.f = new Float64Array(cap); this.n = 0; }
    clear() { this.n = 0; }
    push(key, f) {
        if (this.n >= this.k.length) {
            const k = new Int32Array(this.k.length * 2); k.set(this.k); this.k = k;
            const ff = new Float64Array(this.f.length * 2); ff.set(this.f); this.f = ff;
        }
        let i = this.n++;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (this.f[p] <= f) break;
            this.k[i] = this.k[p]; this.f[i] = this.f[p]; i = p;
        }
        this.k[i] = key; this.f[i] = f;
    }
    pop() {
        const top = this.k[0];
        const last = --this.n;
        if (last > 0) {
            const k = this.k[last], f = this.f[last];
            let i = 0;
            for (; ;) {
                let c = 2 * i + 1;
                if (c >= last) break;
                if (c + 1 < last && this.f[c + 1] < this.f[c]) c++;
                if (this.f[c] >= f) break;
                this.k[i] = this.k[c]; this.f[i] = this.f[c]; i = c;
            }
            this.k[i] = k; this.f[i] = f;
        }
        return top;
    }
}

export const CELL_FREE = -1;
export const CELL_DEAD = -2; // unconnected pin or pin collision: nobody may use it

export class BoxRouter {
    constructor(model, W, H) {
        this.model = model;
        this.W = W; this.H = H;
        const N = W * H;
        this.N = N;
        this.pinNet = new Int32Array(N);
        this.blocked = new Uint8Array(N);    // non-routeUnder bodies
        this.bodyCount = new Uint8Array(N);  // all bodies, for overlap
        this.hist = new Float32Array(N);
        this.g = new Float64Array(N);
        this.parent = new Int32Array(N);
        this.pdir = new Int8Array(N);
        this.stamp = new Int32Array(N);
        this.tgt = new Int32Array(N);
        this.cur = 1;
        this.tgtStamp = 1;
        this.treeStamp = new Int32Array(N);
        this.treeStampCur = 1;
        this.heap = new Heap(N * 4);
        this.netPinCells = model.netNames.map(() => []);
        this.turnCost = 0.2;
    }

    // Rasterize a placement. Returns overlap cell count.
    setPlacement(pl) {
        const { W, H, model } = this;
        this.pinNet.fill(CELL_FREE);
        this.blocked.fill(0);
        this.bodyCount.fill(0);
        for (const arr of this.netPinCells) arr.length = 0;
        let overlap = 0;
        for (let i = 0; i < model.comps.length; i++) {
            const c = model.comps[i], R = c.rots[pl.rot[i]];
            const ox = pl.ox[i], oy = pl.oy[i];
            for (let dx = 0; dx < R.w; dx++) for (let dy = 0; dy < R.h; dy++) {
                const x = ox + dx, y = oy + dy;
                if (x < 0 || y < 0 || x >= W || y >= H) { overlap += 4; continue; } // out of box
                const k = y * W + x;
                if (this.bodyCount[k]++ > 0) overlap++;
                if (!c.routeUnder) this.blocked[k] = 1;
            }
        }
        for (let i = 0; i < model.comps.length; i++) {
            const c = model.comps[i], R = c.rots[pl.rot[i]];
            for (let p = 0; p < c.net.length; p++) {
                const x = pl.ox[i] + R.dc[p], y = pl.oy[i] + R.dr[p];
                if (x < 0 || y < 0 || x >= W || y >= H) continue;
                const k = y * W + x;
                const prev = this.pinNet[k];
                const n = c.net[p];
                if (prev !== CELL_FREE) this.pinNet[k] = CELL_DEAD;
                else this.pinNet[k] = (n >= 0 && model.netPinCount[n] >= 2) ? n : CELL_DEAD;
                if (n >= 0) this.netPinCells[n].push(k);
            }
        }
        // A pin killed by a collision must not count as reachable for its own net.
        for (const arr of this.netPinCells) for (let i = arr.length - 1; i >= 0; i--) if (this.pinNet[arr[i]] === CELL_DEAD) arr.splice(i, 1);
        this.overlap = overlap;
        return overlap;
    }

    // Salvage the still-usable part of a net's old tree: drop connections that cross a
    // now-illegal cell (foreign pin, blocked body, or -- if `occ` is given -- a cell another
    // net uses) or that no longer end on one of this net's pins, then keep the connected
    // piece touching the most pins. Returns null if nothing is worth keeping.
    salvage(n, oldConns, occ = null) {
        if (!oldConns || !oldConns.length) return null;
        const ok = [];
        for (const c of oldConns) {
            let good = this.pinNet[c[c.length - 1]] === n;
            for (let i = 0; good && i < c.length; i++) {
                const k = c[i], pn = this.pinNet[k];
                if (pn === n) continue;
                if (pn !== CELL_FREE || this.blocked[k] || (occ && occ[k] > 0)) good = false;
            }
            if (good) ok.push(c);
        }
        if (!ok.length) return null;
        // union-find over connections sharing a cell
        const parent = ok.map((_, i) => i);
        const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
        const owner = new Map();
        ok.forEach((c, i) => { for (const k of c) { const o = owner.get(k); if (o === undefined) owner.set(k, i); else parent[find(i)] = find(o); } });
        const pinsOf = new Map();
        for (const p of this.netPinCells[n]) {
            const o = owner.get(p);
            if (o !== undefined) { const r = find(o); pinsOf.set(r, (pinsOf.get(r) || 0) + 1); }
        }
        let bestRoot = -1, bestPins = 0;
        for (const [r, cnt] of pinsOf) if (cnt > bestPins) { bestPins = cnt; bestRoot = r; }
        if (bestRoot < 0 || bestPins < 2) return null;
        const kept = ok.filter((_, i) => find(i) === bestRoot);
        return { conns: kept, intact: kept.length === oldConns.length && bestPins === this.netPinCells[n].length };
    }

    // Route one net as a Steiner tree (repeated multi-source/multi-target A*), optionally
    // growing from salvaged connections. occ: per-cell count of OTHER nets.
    routeNet(n, occ, pres, seed = null) {
        const { W, H } = this;
        const pins = this.netPinCells[n];
        const expected = this.model.netPinCount[n];
        let missing = expected - pins.length; // pins lost to collisions / outside box
        if (pins.length < 2) return { conns: [], cells: [], missing: Math.max(0, missing) };

        const ts = ++this.treeStampCur;
        const treeStamp = this.treeStamp;
        const tree = [];
        const conns = [];
        const cells = [];
        const addTree = (k) => {
            if (treeStamp[k] === ts) return;
            treeStamp[k] = ts; tree.push(k);
            if (this.pinNet[k] === CELL_FREE) cells.push(k);
        };
        if (seed) for (const c of seed.conns) { conns.push(c); for (const k of c) addTree(k); }
        else addTree(pins[0]);

        const tgtS = ++this.tgtStamp;
        let remaining = 0;
        for (const p of pins) if (treeStamp[p] !== ts && this.tgt[p] !== tgtS) { this.tgt[p] = tgtS; remaining++; }

        const pinNet = this.pinNet, blocked = this.blocked, hist = this.hist;
        const g = this.g, stamp = this.stamp, parentA = this.parent, pdir = this.pdir, tgt = this.tgt;
        const turnCost = this.turnCost;
        const tx = new Int32Array(pins.length), ty = new Int32Array(pins.length);

        while (remaining > 0) {
            const s = ++this.cur;
            const heap = this.heap; heap.clear();
            let nt = 0;
            for (const p of pins) if (tgt[p] === tgtS) { tx[nt] = p % W; ty[nt] = (p / W) | 0; nt++; }
            for (const k of tree) {
                stamp[k] = s; g[k] = 0; parentA[k] = -1; pdir[k] = -1;
                const x = k % W, y = (k / W) | 0;
                let h = 1e9;
                for (let i = 0; i < nt; i++) { const d = Math.abs(x - tx[i]) + Math.abs(y - ty[i]); if (d < h) h = d; }
                heap.push(k, h);
            }
            let hit = -1;
            while (heap.n > 0) {
                const k = heap.pop();
                if (tgt[k] === tgtS) { hit = k; break; }
                const gk = g[k], dk = pdir[k];
                const x = k % W, y = (k / W) | 0;
                for (let d = 0; d < 4; d++) {
                    const nx = x + DX[d], ny = y + DY[d];
                    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                    const nk = ny * W + nx;
                    const pn = pinNet[nk];
                    let cost = 1 + hist[nk];
                    if (pn === CELL_FREE) {
                        if (blocked[nk]) continue;
                        cost += pres * occ[nk];
                    } else if (pn !== n) continue;
                    if (dk !== -1 && dk !== d) cost += turnCost;
                    const ng = gk + cost;
                    if (stamp[nk] !== s || ng < g[nk]) {
                        stamp[nk] = s; g[nk] = ng; parentA[nk] = k; pdir[nk] = d;
                        let h = 1e9;
                        for (let i = 0; i < nt; i++) { const dd = Math.abs(nx - tx[i]) + Math.abs(ny - ty[i]); if (dd < h) h = dd; }
                        heap.push(nk, ng + h);
                    }
                }
            }
            if (hit < 0) { missing += remaining; break; }
            const path = [];
            for (let k = hit; ; k = parentA[k]) { path.push(k); if (parentA[k] === -1) break; }
            path.reverse();
            conns.push(Int32Array.from(path));
            for (const k of path) {
                if (tgt[k] === tgtS) { tgt[k] = 0; remaining--; }
                addTree(k);
            }
        }
        if (seed) return this.trim(n, conns, missing);
        return { conns, cells, missing: Math.max(0, missing) };
    }

    // Cells of a tree that count as wire (not a pin) under the CURRENT placement.
    wireCells(conns) {
        const cells = [];
        const seen = new Set();
        for (const c of conns) for (const k of c) if (!seen.has(k)) { seen.add(k); if (this.pinNet[k] === CELL_FREE) cells.push(k); }
        return cells;
    }

    // Cheap clean-up used during search: cut dangling wire ends (non-pin leaves) left over
    // from salvaged trees.
    trim(n, conns, missing) {
        const nb = new Map();
        const link = (a, b) => {
            if (!nb.has(a)) nb.set(a, new Set()); if (!nb.has(b)) nb.set(b, new Set());
            nb.get(a).add(b); nb.get(b).add(a);
        };
        for (const c of conns) for (let i = 1; i < c.length; i++) link(c[i - 1], c[i]);
        let out = conns.map(c => Array.from(c));
        let changed = true;
        while (changed) {
            changed = false;
            for (const c of out) {
                while (c.length > 1 && this.pinNet[c[0]] !== n && nb.get(c[0]).size === 1) {
                    const a = c.shift();
                    nb.get(c[0]).delete(a); nb.delete(a);
                    changed = true;
                }
            }
        }
        out = out.filter(c => c.length > 1).map(c => Int32Array.from(c));
        return { conns: out, cells: this.wireCells(out), missing: Math.max(0, missing) };
    }

    // Full clean-up for output: salvage can also leave redundant loops. Take a spanning
    // forest over the net's copper, trim non-pin leaves, and split the result into paths
    // between pins/junctions.
    prune(n, conns, missing = 0) {
        const nb = new Map();
        const link = (a, b) => {
            if (!nb.has(a)) nb.set(a, new Set()); if (!nb.has(b)) nb.set(b, new Set());
            nb.get(a).add(b); nb.get(b).add(a);
        };
        for (const c of conns) for (let i = 1; i < c.length; i++) link(c[i - 1], c[i]);
        // spanning forest (BFS from each pin)
        const tree = new Map();
        const tlink = (a, b) => {
            if (!tree.has(a)) tree.set(a, new Set()); if (!tree.has(b)) tree.set(b, new Set());
            tree.get(a).add(b); tree.get(b).add(a);
        };
        const seen = new Set();
        for (const p of this.netPinCells[n]) {
            if (seen.has(p) || !nb.has(p)) continue;
            seen.add(p);
            const q = [p];
            for (let qi = 0; qi < q.length; qi++) {
                for (const m of nb.get(q[qi])) if (!seen.has(m)) { seen.add(m); tlink(q[qi], m); q.push(m); }
            }
        }
        // trim leaves that are not this net's pins
        const leaves = [...tree.keys()].filter(k => tree.get(k).size === 1 && this.pinNet[k] !== n);
        while (leaves.length) {
            const k = leaves.pop();
            const adj = tree.get(k);
            if (!adj || adj.size !== 1 || this.pinNet[k] === n) continue;
            const [m] = adj;
            tree.delete(k);
            tree.get(m).delete(k);
            if (tree.get(m).size === 1 && this.pinNet[m] !== n) leaves.push(m);
        }
        // split into paths between stops (pins or junctions)
        const isStop = (k) => this.pinNet[k] === n || tree.get(k).size !== 2;
        const used = new Set();
        const ekey = (a, b) => a < b ? a * 1e6 + b : b * 1e6 + a;
        const out = [];
        for (const [k, adj] of tree) {
            if (!isStop(k)) continue;
            for (const first of adj) {
                if (used.has(ekey(k, first))) continue;
                const path = [k];
                let prev = k, cur = first;
                used.add(ekey(prev, cur));
                while (true) {
                    path.push(cur);
                    if (isStop(cur)) break;
                    let next = -1;
                    for (const m of tree.get(cur)) if (m !== prev) { next = m; break; }
                    prev = cur; cur = next;
                    used.add(ekey(prev, cur));
                }
                out.push(Int32Array.from(path));
            }
        }
        return { conns: out, cells: this.wireCells(out), missing: Math.max(0, missing) };
    }

    // Negotiated routing. `state` (optional) is a previous routing to warm-start from:
    // intact nets are kept as they are, damaged nets are repaired from their salvage.
    negotiate({ state = null, maxIter = 6, pres0 = 0.6, presMul = 1.8, histInc = 0.4, partial = true } = {}) {
        const { model, N } = this;
        const nets = model.routedNets;
        const occ = new Int16Array(N);
        const conns = new Array(model.netNames.length);
        const cells = new Array(model.netNames.length);
        const missing = new Int32Array(model.netNames.length);
        const seeds = new Map();
        let order = [];

        if (state) {
            for (const n of nets) {
                const sv = state.missing[n] > 0 ? null : this.salvage(n, state.conns[n]);
                if (sv && sv.intact) {
                    conns[n] = state.conns[n]; cells[n] = this.wireCells(conns[n]);
                    for (const k of cells[n]) occ[k]++;
                } else {
                    seeds.set(n, sv);
                    order.push(n);
                }
            }
        } else {
            order = [...nets];
        }
        this.hist.fill(0);
        let pres = pres0;
        let overuse = 0, miss = 0;
        for (let it = 0; it < maxIter; it++) {
            for (const n of order) {
                if (cells[n]) for (const k of cells[n]) occ[k]--;
                let seed = seeds.get(n) || null;
                if (it > 0) seed = partial ? this.salvage(n, conns[n], occ) : null;
                const r = this.routeNet(n, occ, pres, seed);
                conns[n] = r.conns; cells[n] = r.cells; missing[n] = r.missing;
                for (const k of r.cells) occ[k]++;
            }
            overuse = 0; miss = 0;
            for (const n of nets) miss += missing[n];
            for (let k = 0; k < N; k++) if (occ[k] > 1) { overuse += occ[k] - 1; this.hist[k] += histInc * (occ[k] - 1); }
            if (overuse === 0) break;
            const bad = [];
            for (const n of nets) {
                for (const k of cells[n]) if (occ[k] > 1) { bad.push(n); break; }
            }
            order = bad;
            pres *= presMul;
        }
        let wl = 0;
        for (const n of nets) for (const c of conns[n]) wl += c.length - 1;
        // Nets that still conflict, for targeted moves
        const badNets = new Set();
        for (const n of nets) {
            if (missing[n] > 0) { badNets.add(n); continue; }
            for (const k of cells[n]) if (occ[k] > 1) { badNets.add(n); break; }
        }
        return { conns, cells, missing, occ, overuse, miss, wl, badNets };
    }
}
