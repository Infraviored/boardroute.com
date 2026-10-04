// Fixed-box placement + routing search.
//
// Instead of minimising area indirectly, fix the board to W×H and search for any legal
// layout inside it (simulated annealing on overlap + negotiated-routing violations).
// Once found, crop to the real footprint, delete one row or column, repair, repeat.
// The best legal layout seen is the answer.
import { buildModel, toEngine } from './model.js';
import { areaLowerBound } from '../lower-bound.js';
import { BoxRouter } from './boxrouter.js';

const now = () => globalThis.performance?.now?.() ?? Date.now();

const W_OVERLAP = 6, W_MISS = 10, W_OVERUSE = 2, W_WL = 0.02;

function clonePl(pl) { return { ox: pl.ox.slice(), oy: pl.oy.slice(), rot: pl.rot.slice() }; }

export function costOf(r, overlap, jumperWeight = 0) {
    return W_OVERLAP * overlap + W_MISS * r.miss + W_OVERUSE * r.overuse + W_WL * r.wl + jumperWeight * (r.jumpers || 0);
}

function isLegal(s) { return s.overlap === 0 && s.route.miss === 0 && s.route.overuse === 0; }

// Footprint of a legal state: bodies + wire cells.
function footprint(model, s, W) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const grow = (x, y) => { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; };
    model.comps.forEach((c, i) => {
        const R = c.rots[s.pl.rot[i]];
        grow(s.pl.ox[i], s.pl.oy[i]); grow(s.pl.ox[i] + R.w - 1, s.pl.oy[i] + R.h - 1);
    });
    for (const n of model.routedNets) for (const conn of s.route.conns[n]) for (const k of conn) grow(k % W, (k / W) | 0);
    return { minX, minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function remapRoute(model, route, oldW, newW, newH, dx, dy) {
    const map = (k) => ((((k / oldW) | 0) + dy) * newW + (k % oldW) + dx);
    const conns = route.conns.map(cs => cs && cs.map(c => c.map(map)));
    const cells = route.cells.map(cs => cs && cs.map(map));
    const occ = new Int16Array(newW * newH);
    for (const cs of cells) {
        if (cs) for (const k of cs) if (k >= 0 && k < occ.length) occ[k]++;
    }
    return { ...route, conns, cells, occ };
}

// Engine components -> placement (null if a part is missing or its footprint changed).
function placementFromEngine(model, comps) {
    const byId = new Map(comps.map(c => [c.id, c]));
    const n = model.comps.length;
    const pl = { ox: new Int32Array(n), oy: new Int32Array(n), rot: new Int32Array(n) };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
        const m = model.comps[i], c = byId.get(m.id);
        if (!c || c.pins.length !== m.net.length) return null;
        const r = m.rots.findIndex(R => R.w === c.w && R.h === c.h && c.pins.every((p, k) => R.dc[k] === p.dCol && R.dr[k] === p.dRow));
        if (r < 0) return null;
        pl.rot[i] = r; pl.ox[i] = c.ox; pl.oy[i] = c.oy;
        minX = Math.min(minX, c.ox); minY = Math.min(minY, c.oy);
        maxX = Math.max(maxX, c.ox + c.w - 1); maxY = Math.max(maxY, c.oy + c.h - 1);
    }
    for (let i = 0; i < n; i++) { pl.ox[i] -= minX; pl.oy[i] -= minY; }
    return { pl, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export async function solveBox(defs, opts = {}) {
    const { budgetMs = 30000, onBest = null, shouldStop = null, onProgress = null } = opts;
    // onLive(components, wires): the state the search is looking at right now (overlaps and
    // unfinished wiring included), at most every liveMs -- for showing the search at work.
    const { onLive = null, liveMs = 80 } = opts;
    // Tunables (benchmark: node bench/run.js box --opt key=val,...)
    const V = {
        polish: 2,        // cold re-route when overuse <= polish (0 = off)
        polishIter: 25,
        iters: 4,         // negotiation rounds per SA move
        pres0: 0.6,
        lines: 8,         // candidate rows/cols tried per shrink (0 = all)
        effort: 60,       // SA evaluations per component per shrink attempt
        fails: 3,         // failed shrinks before a restart
        partial: 1,       // repair only the conflicting branches during negotiation
        local: 0,         // blame parts near conflict cells rather than all parts on conflicting nets
        init: 'hpwl',     // 'hpwl': pre-place by wire-length annealing before routing; 'random'
        // Jumper wires (component-side bridges over other wiring)
        jumpers: 0,          // 1: allowed from the start
        jumperAfterMs: 0,    // >0: switch jumpers on if no legal layout was found by then
        jumperCost: 6,       // router cost of one jumper (in holes of detour it is worth)
        jumperWeight: 1.5,   // search cost per jumper
        jumperArea: 4,       // when comparing layouts, one jumper counts as this many holes
        hpwlSteps: 2000,
        hpwlOverlap: 4,
        shrink: 'hard',   // 'soft': empty a boundary line under cost pressure instead of deleting one
        edgeW: 1,
        sides: 2,         // boundary lines tried per soft shrink step
        softT0: 1.0,
        lazy: 1,          // exact early rejection of overlapping moves (no routing needed)
        // move mix (relative weights)
        pShift: 50, pRot: 18, pSwap: 20, pJump: 12, pSmart: 60, pPush: 0,
        pViol: 0.6,       // chance to move a part involved in a violation
        T0: 1.5, T1: 0.05,
        radius: 2,
        ...(opts.variant || {}),
    };
    const t0 = now();
    const timeLeft = () => budgetMs - (now() - t0);
    const stop = () => optimal || timeLeft() <= 0 || (shouldStop && shouldStop());
    let lastYield = now();
    const maybeYield = async () => {
        if (now() - lastYield > 40) { lastYield = now(); await new Promise(r => setTimeout(r, 0)); }
    };

    const model = buildModel(defs);
    // A jumper-free layout on the provable minimum area can't be beaten: stop there.
    const bound = areaLowerBound(model.comps.map(c => c.rots[0]));
    let optimal = false;
    const nC = model.comps.length;
    const rnd = Math.random;
    const ri = (n) => Math.floor(rnd() * n);

    let W = 0, H = 0, router = null;
    let jumpersOn = !!V.jumpers;
    const setBox = (w, h) => { W = w; H = h; router = new BoxRouter(model, W, H); router.jumpCost = jumpersOn ? V.jumperCost : 0; };
    const enableJumpers = () => { jumpersOn = true; if (router) router.jumpCost = V.jumperCost; };

    let evals = 0, lazyRejects = 0, lastLive = 0;
    const evaluate = (pl, base = null, maxIter = V.iters, rasterized = false) => {
        evals++;
        const overlap = rasterized ? router.overlap : router.setPlacement(pl);
        let route = router.negotiate({ state: base ? base.route : null, maxIter, pres0: V.pres0, partial: !!V.partial });
        // Nearly routable: give the router a real chance (cold start, more rounds) before
        // blaming the placement.
        if (overlap === 0 && route.miss === 0 && route.overuse > 0 && route.overuse <= V.polish) {
            const r2 = router.negotiate({ maxIter: V.polishIter, pres0: V.pres0, partial: false });
            if (r2.overuse === 0 && r2.miss === 0) route = r2;
        }
        if (onLive && now() - lastLive > liveMs) {
            lastLive = now();
            const out = toEngine(model, pl, route, W);
            onLive(out.components, out.wires);
        }
        let cost = costOf(route, overlap, V.jumperWeight), edgeOcc = 0;
        if (edge) { edgeOcc = lineOccupancy(route, edge); cost += V.edgeW * edgeOcc; }
        return { pl, route, overlap, cost, edgeOcc };
    };

    // Soft shrink target: a boundary line that should be emptied (then cropped away).
    let edge = null;
    const lineOccupancy = (route, e) => {
        let n = 0;
        const len = e.axis === 0 ? H : W;
        for (let t = 0; t < len; t++) {
            const k = e.axis === 0 ? t * W + e.idx : e.idx * W + t;
            if (router.bodyCount[k] > 0) n += 2; else if (route.occ[k] > 0) n += 1;
        }
        return n;
    };
    const isDone = (s) => isLegal(s) && (!edge || s.edgeOcc === 0);

    const clampComp = (pl, i) => {
        const R = model.comps[i].rots[pl.rot[i]];
        pl.ox[i] = Math.max(0, Math.min(W - R.w, pl.ox[i]));
        pl.oy[i] = Math.max(0, Math.min(H - R.h, pl.oy[i]));
    };

    // Components involved in a violation (overlap or conflicting net)
    const violators = (s) => {
        const out = [];
        // Local mode: blame parts near an overused cell (or with unreachable pins) instead of
        // every part on a conflicting net -- GND touches almost everything.
        const hot = [];
        if (V.local) { const occ = s.route.occ; for (let k = 0; k < occ.length; k++) if (occ[k] > 1) hot.push(k); }
        model.comps.forEach((c, i) => {
            if (V.local) {
                if (c.nets.some(n => s.route.missing[n] > 0)) { out.push(i); return; }
                const R = c.rots[s.pl.rot[i]], r = V.radius;
                const x0 = s.pl.ox[i] - r, x1 = s.pl.ox[i] + R.w - 1 + r, y0 = s.pl.oy[i] - r, y1 = s.pl.oy[i] + R.h - 1 + r;
                for (const k of hot) { const x = k % W, y = (k / W) | 0; if (x >= x0 && x <= x1 && y >= y0 && y <= y1) { out.push(i); return; } }
            } else if (c.nets.some(n => s.route.badNets.has(n))) { out.push(i); return; }
            if (s.overlap) {
                const R = c.rots[s.pl.rot[i]];
                for (let dx = 0; dx < R.w; dx++) for (let dy = 0; dy < R.h; dy++) {
                    const x = s.pl.ox[i] + dx, y = s.pl.oy[i] + dy;
                    if (x >= W || y >= H || router.bodyCount[y * W + x] > 1) { out.push(i); return; }
                }
            }
        });
        return out;
    };

    const rectsOverlap = (pl, i, j) => {
        const A = model.comps[i].rots[pl.rot[i]], B = model.comps[j].rots[pl.rot[j]];
        return pl.ox[i] < pl.ox[j] + B.w && pl.ox[j] < pl.ox[i] + A.w && pl.oy[i] < pl.oy[j] + B.h && pl.oy[j] < pl.oy[i] + A.h;
    };
    // Pin positions per net (for targeted jumps)
    const pinsOfNet = (pl, n, except) => {
        const out = [];
        model.comps.forEach((c, j) => {
            if (j === except) return;
            const R = c.rots[pl.rot[j]];
            for (let p = 0; p < c.net.length; p++) if (c.net[p] === n) out.push([pl.ox[j] + R.dc[p], pl.oy[j] + R.dr[p]]);
        });
        return out;
    };
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const moveProbs = (() => {
        const w = [V.pShift, V.pRot, V.pSwap, V.pJump, V.pSmart, V.pPush];
        const sum = w.reduce((x, y) => x + y, 0);
        let acc = 0;
        return w.map(x => (acc += x / sum));
    })();

    const propose = (s, viol) => {
        const pl = clonePl(s.pl);
        const i = (viol.length && rnd() < V.pViol) ? viol[ri(viol.length)] : ri(nC);
        const m = rnd();
        const kind = moveProbs.findIndex(x => m < x);
        if (kind === 0) {
            const step = rnd() < 0.8 ? 1 : 2;
            if (rnd() < 0.5) pl.ox[i] += rnd() < 0.5 ? -step : step;
            else pl.oy[i] += rnd() < 0.5 ? -step : step;
        } else if (kind === 1) {
            const R0 = model.comps[i].rots[pl.rot[i]];
            pl.rot[i] = (pl.rot[i] + 1 + ri(3)) & 3;
            const R1 = model.comps[i].rots[pl.rot[i]];
            pl.ox[i] += Math.floor((R0.w - R1.w) / 2);
            pl.oy[i] += Math.floor((R0.h - R1.h) / 2);
        } else if (kind === 2 && nC > 1) {
            let j = ri(nC - 1); if (j >= i) j++;
            const Ri = model.comps[i].rots[pl.rot[i]], Rj = model.comps[j].rots[pl.rot[j]];
            const cxi = pl.ox[i] + Ri.w / 2, cyi = pl.oy[i] + Ri.h / 2;
            const cxj = pl.ox[j] + Rj.w / 2, cyj = pl.oy[j] + Rj.h / 2;
            pl.ox[i] = Math.round(cxj - Ri.w / 2); pl.oy[i] = Math.round(cyj - Ri.h / 2);
            pl.ox[j] = Math.round(cxi - Rj.w / 2); pl.oy[j] = Math.round(cyi - Rj.h / 2);
            clampComp(pl, j);
        } else if (kind === 4 && model.comps[i].nets.length) {
            // Smart jump: put one of our pins right next to a pin of the same net elsewhere.
            const c = model.comps[i];
            const n = c.nets[ri(c.nets.length)];
            const others = pinsOfNet(pl, n, i);
            if (others.length) {
                if (rnd() < 0.5) pl.rot[i] = ri(4);
                const R = c.rots[pl.rot[i]];
                const mine = [];
                for (let p = 0; p < c.net.length; p++) if (c.net[p] === n) mine.push(p);
                const p = mine[ri(mine.length)];
                const [tx, ty] = others[ri(others.length)];
                const [dx, dy] = DIRS[ri(4)];
                pl.ox[i] = tx + dx - R.dc[p];
                pl.oy[i] = ty + dy - R.dr[p];
            }
        } else if (kind === 5) {
            // Push: shift by one and shove whatever we hit along in the same direction.
            const [dx, dy] = DIRS[ri(4)];
            const queue = [i], pushed = new Set([i]);
            let ok = true;
            while (queue.length && ok) {
                const a = queue.shift();
                pl.ox[a] += dx; pl.oy[a] += dy;
                const R = model.comps[a].rots[pl.rot[a]];
                if (pl.ox[a] < 0 || pl.oy[a] < 0 || pl.ox[a] + R.w > W || pl.oy[a] + R.h > H) ok = false;
                for (let j = 0; j < nC && ok; j++) {
                    if (pushed.has(j) || !rectsOverlap(pl, a, j)) continue;
                    pushed.add(j); queue.push(j);
                }
            }
            if (ok) return pl;
            // fall back to a plain shift
            const q = clonePl(s.pl);
            q.ox[i] += dx; q.oy[i] += dy;
            clampComp(q, i);
            return q;
        } else {
            const R = model.comps[i].rots[pl.rot[i]];
            pl.ox[i] = ri(Math.max(1, W - R.w + 1));
            pl.oy[i] = ri(Math.max(1, H - R.h + 1));
        }
        clampComp(pl, i);
        return pl;
    };

    // Simulated annealing inside the current box; returns the first legal state or the best seen.
    const anneal = async (start, evals, T0 = V.T0, T1 = V.T1) => {
        let s = start, best = start;
        if (isDone(s)) return s;
        const alpha = Math.pow(T1 / T0, 1 / evals);
        let T = T0;
        let viol = violators(s);
        for (let e = 0; e < evals; e++) {
            if (stop()) break;
            const pl = propose(s, viol);
            // Metropolis with the random draw first: accept iff delta <= thr. Overlap is cheap
            // and bounds the new cost from below, so many moves can be rejected exactly
            // without routing.
            const thr = -T * Math.log(rnd() || 1e-12);
            let rasterized = false;
            if (V.lazy) {
                const ov = router.setPlacement(pl);
                rasterized = true;
                let lb = W_OVERLAP * ov;
                if (edge) {
                    const len = edge.axis === 0 ? H : W;
                    for (let t = 0; t < len; t++) {
                        const k = edge.axis === 0 ? t * W + edge.idx : edge.idx * W + t;
                        if (router.bodyCount[k] > 0) lb += 2 * V.edgeW;
                    }
                }
                if (lb - s.cost > thr) { lazyRejects++; T *= alpha; continue; }
            }
            const c = evaluate(pl, s, V.iters, rasterized);
            const d = c.cost - s.cost;
            if (d <= thr) {
                s = c;
                viol = violators(s);
                if (s.cost < best.cost) best = s;
                if (isDone(s)) return s;
            }
            T *= alpha;
            if (opts.debug && e % 200 === 0) opts.debug(`e${e} T=${T.toFixed(2)} cur ov=${s.overlap} miss=${s.route.miss} over=${s.route.overuse} wl=${s.route.wl} | best ${best.cost.toFixed(1)}`);
            await maybeYield();
        }
        return best;
    };

    const randomPlacement = () => {
        const pl = { ox: new Int32Array(nC), oy: new Int32Array(nC), rot: new Int32Array(nC) };
        for (let i = 0; i < nC; i++) {
            pl.rot[i] = ri(4);
            const R = model.comps[i].rots[pl.rot[i]];
            pl.ox[i] = ri(Math.max(1, W - R.w + 1));
            pl.oy[i] = ri(Math.max(1, H - R.h + 1));
        }
        return pl;
    };

    // Cheap pre-placement: anneal half-perimeter wire length with a 1-hole keep-out around
    // every body (leaves routing channels). No routing involved, so thousands of moves/ms.
    const pinNetIdx = model.comps.map(c => c.net);
    const hpwlCost = (pl) => {
        let total = 0;
        const bb = new Map();
        for (let i = 0; i < nC; i++) {
            const R = model.comps[i].rots[pl.rot[i]], nets = pinNetIdx[i];
            for (let p = 0; p < nets.length; p++) {
                const n = nets[p];
                if (n < 0 || model.netPinCount[n] < 2) continue;
                const x = pl.ox[i] + R.dc[p], y = pl.oy[i] + R.dr[p];
                const b = bb.get(n);
                if (!b) bb.set(n, [x, x, y, y]);
                else { if (x < b[0]) b[0] = x; if (x > b[1]) b[1] = x; if (y < b[2]) b[2] = y; if (y > b[3]) b[3] = y; }
            }
        }
        for (const b of bb.values()) total += b[1] - b[0] + b[3] - b[2];
        let ov = 0;
        for (let i = 0; i < nC; i++) {
            const A = model.comps[i].rots[pl.rot[i]];
            for (let j = i + 1; j < nC; j++) {
                const B = model.comps[j].rots[pl.rot[j]];
                const dx = Math.min(pl.ox[i] + A.w + 1, pl.ox[j] + B.w + 1) - Math.max(pl.ox[i], pl.ox[j]);
                const dy = Math.min(pl.oy[i] + A.h + 1, pl.oy[j] + B.h + 1) - Math.max(pl.oy[i], pl.oy[j]);
                if (dx > 0 && dy > 0) ov += dx * dy;
            }
        }
        return total + V.hpwlOverlap * ov;
    };
    const hpwlPlace = (pl) => {
        let cur = hpwlCost(pl);
        const steps = V.hpwlSteps * nC;
        let T = 3;
        const alpha = Math.pow(0.05 / T, 1 / steps);
        for (let e = 0; e < steps; e++, T *= alpha) {
            const i = ri(nC);
            const ox = pl.ox[i], oy = pl.oy[i], rot = pl.rot[i];
            const m = rnd();
            if (m < 0.25) pl.rot[i] = (rot + 1 + ri(3)) & 3;
            else if (m < 0.9) { pl.ox[i] += ri(5) - 2; pl.oy[i] += ri(5) - 2; }
            else { const R = model.comps[i].rots[rot]; pl.ox[i] = ri(Math.max(1, W - R.w + 1)); pl.oy[i] = ri(Math.max(1, H - R.h + 1)); }
            clampComp(pl, i);
            const c = hpwlCost(pl);
            if (c <= cur || rnd() < Math.exp((cur - c) / T)) cur = c;
            else { pl.ox[i] = ox; pl.oy[i] = oy; pl.rot[i] = rot; }
        }
        return pl;
    };

    let best = null; // { area, wl, pl, route, W }
    const record = (s) => {
        const f = footprint(model, s, W);
        const area = f.w * f.h;
        const jumpers = s.route.jumpers || 0;
        const key = area + V.jumperArea * jumpers;
        if (!best || key < best.key || (key === best.key && s.route.wl < best.wl)) {
            // Emit clean trees (no loops or dangling ends left over from salvaging).
            router.setPlacement(s.pl);
            const conns = s.route.conns.map((cs, n) => cs && router.prune(n, cs).conns);
            const route = { ...s.route, conns, wl: conns.reduce((t, cs) => t + (cs ? cs.reduce((u, c) => u + c.length - 1, 0) : 0), 0) };
            s = { ...s, route };
            best = { area, key, jumpers, wl: route.wl, pl: clonePl(s.pl), route, W, H, f };
            optimal = area <= bound.area && jumpers === 0;
            if (onBest) {
                const out = toEngine(model, s.pl, s.route, W);
                onBest(out.components, out.wires, { area, width: f.w, height: f.h, wl: s.route.wl, jumpers, bound: bound.area, optimal });
            }
        }
        return f;
    };

    // Crop a legal state to its footprint (free shrink).
    const crop = (s) => {
        const f = footprint(model, s, W);
        if (f.w === W && f.h === H && f.minX === 0 && f.minY === 0) return s;
        const pl = clonePl(s.pl);
        for (let i = 0; i < nC; i++) { pl.ox[i] -= f.minX; pl.oy[i] -= f.minY; }
        const route = remapRoute(model, s.route, W, f.w, f.h, -f.minX, -f.minY);
        setBox(f.w, f.h);
        const overlap = router.setPlacement(pl);
        return { pl, route, overlap, cost: costOf(route, overlap, V.jumperWeight) };
    };

    // Remove column x (axis 0) or row x (axis 1) from a placement.
    const removeLine = (pl, axis, x, newW, newH) => {
        const q = clonePl(pl);
        for (let i = 0; i < nC; i++) {
            const R = model.comps[i].rots[q.rot[i]];
            if (axis === 0) {
                if (q.ox[i] > x) q.ox[i]--;
                q.ox[i] = Math.max(0, Math.min(newW - R.w, q.ox[i]));
            } else {
                if (q.oy[i] > x) q.oy[i]--;
                q.oy[i] = Math.max(0, Math.min(newH - R.h, q.oy[i]));
            }
        }
        return q;
    };

    const minDimA = Math.max(...model.comps.map(c => Math.min(c.rots[0].w, c.rots[0].h)));
    const minDimB = Math.max(...model.comps.map(c => Math.max(c.rots[0].w, c.rots[0].h)));
    const baseEvals = Math.max(300, V.effort * nC);

    // Warm start from an existing layout (engine components), e.g. after manual edits.
    let warm = opts.initial ? placementFromEngine(model, opts.initial) : null;
    // opts.takeover(reason): polled before every restart ('restart') and shrink step ('tick');
    // may return a layout (engine components) to continue from instead -- e.g. the best
    // layout another solver of a portfolio has found.
    const takeover = (reason) => {
        const t = opts.takeover?.(reason);
        return t ? placementFromEngine(model, t) : null;
    };

    // ---- outer loop: restarts ----
    let restart = 0;
    while (!stop()) {
        restart++;
        // 1. initial legal layout in a roomy box
        let side = Math.max(minDimB, Math.ceil(Math.sqrt(model.area * 3)) + 2);
        if (best) side = Math.max(minDimB, Math.ceil(Math.sqrt(best.area * 1.6)));
        let s = null;
        if (!warm && restart > 1) warm = takeover('restart');
        if (warm) {
            // one hole of slack around the parts so the router can get around the edge
            const pl = clonePl(warm.pl);
            for (let i = 0; i < nC; i++) { pl.ox[i]++; pl.oy[i]++; }
            setBox(warm.w + 2, warm.h + 2);
            s = evaluate(pl, null, 8);
            if (!isLegal(s)) s = await anneal(s, baseEvals * 2, 1, 0.05);
            if (!isLegal(s)) s = null;
            warm = null;
        }
        for (let tries = 0; tries < 8 && !stop() && !(s && isLegal(s)); tries++) {
            if (!best && !jumpersOn && V.jumperAfterMs > 0 && now() - t0 > V.jumperAfterMs) enableJumpers();
            setBox(side, side);
            const pl0 = randomPlacement();
            if (V.init === 'hpwl') hpwlPlace(pl0);
            s = evaluate(pl0, null, 8);
            s = await anneal(s, baseEvals * 2, 2, 0.1);
            if (isLegal(s)) break;
            side += 2;
        }
        if (!s || !isLegal(s)) continue;
        s = crop(s); record(s);

        // 2. shrink loop
        let fails = 0;
        while (!stop()) {
            if ((warm = takeover('tick'))) break;
            onProgress?.(`box ${W}x${H} (best ${best.f.w}x${best.f.h}=${best.area})`);
            const options = [];
            if (W - 1 >= minDimA && (W - 1) * H > 0) options.push({ axis: 0, w: W - 1, h: H });
            if (H - 1 >= minDimA) options.push({ axis: 1, w: W, h: H - 1 });
            // larger area cut first
            options.sort((a, b) => a.w * a.h - b.w * b.h);
            if (W - 1 < minDimB && H - 1 < minDimB) { /* both dims at minimum */ }

            let next = null;
            const legalBase = s, baseW = W, baseH = H;
            if (V.shrink === 'soft') {
                // Rank the four boundary lines: least occupied per cell cut first.
                const lines = [
                    { axis: 0, idx: 0 }, { axis: 0, idx: W - 1 }, { axis: 1, idx: 0 }, { axis: 1, idx: H - 1 },
                ].filter(e => (e.axis === 0 ? W - 1 >= minDimA : H - 1 >= minDimA));
                for (const e of lines) e.occ = lineOccupancy(s.route, e) / (e.axis === 0 ? H : W);
                lines.sort((a, b) => a.occ - b.occ);
                for (const e of lines.slice(0, V.sides)) {
                    if (stop()) break;
                    edge = e;
                    const start = evaluate(legalBase.pl, legalBase);
                    const effort = baseEvals * (1 + Math.min(fails, 4));
                    const r = await anneal(start, effort, V.softT0);
                    edge = null;
                    if (isLegal(r) && r.edgeOcc === 0) { next = r; break; }
                }
                if (next) { s = crop(next); record(s); fails = 0; }
                else {
                    fails++;
                    router.setPlacement(s.pl);
                    if (fails > V.fails) break;
                }
                await maybeYield();
                continue;
            }
            for (const o of options) {
                if (stop()) break;
                if (Math.max(o.w, o.h) < minDimB) continue;
                // pick the line whose removal hurts least
                setBox(o.w, o.h);
                const lines = o.axis === 0 ? baseW : baseH;
                let cand = null;
                const order = [...Array(lines).keys()].sort(() => rnd() - 0.5).slice(0, V.lines > 0 ? Math.min(lines, V.lines) : lines);
                for (const x of order) {
                    const pl = removeLine(legalBase.pl, o.axis, x, o.w, o.h);
                    const c = evaluate(pl, null, 6);
                    if (!cand || c.cost < cand.cost) cand = c;
                }
                const effort = baseEvals * (1 + Math.min(fails, 4));
                const r = await anneal(cand, effort);
                if (isLegal(r)) { next = r; break; }
                setBox(baseW, baseH);
            }
            if (next) {
                s = crop(next);
                record(s);
                fails = 0;
            } else {
                fails++;
                setBox(baseW, baseH);
                s = legalBase;
                router.setPlacement(s.pl);
                if (fails > V.fails) break; // restart from scratch for a different topology
            }
            await maybeYield();
        }
    }

    if (!best) return null;
    const out = toEngine(model, best.pl, best.route, best.W);
    return { ...out, area: best.area, jumpers: best.jumpers, restarts: restart, evals, lazyRejects };
}
