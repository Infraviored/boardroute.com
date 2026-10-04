// Provable lower bound on the board area: no layout can be smaller, so a layout that reaches it
// is perfect and the search can stop.
//
// Facts used, all independent of how the wires run:
//   - part bodies may not overlap and every part lies inside the board's bounding box, so the
//     box must admit a packing of all part rectangles (each in one of its two orientations);
//   - a jumper wire needs a straight run of at least 3 holes free of part bodies and pins
//     (two legs at least 2 holes apart), and two jumpers never share a hole. A circuit that
//     needs k jumpers therefore packs k extra 1×3 rectangles.
// Wires on the solder side are ignored (they may run under parts), which keeps the bound valid
// but makes it reachable only by tightly packed boards.
//
// The bound is the area of the smallest box W×H that is not proven infeasible. Boxes are tried
// in order of area. Cheap necessary conditions (total area, every part fits) rule most of them
// out; the rest go to an exact packing search with an effort budget. A box the search packs ends
// the scan with an exact answer for the packing relaxation; a box it can't decide within the
// budget ends the scan too, and its area is still a valid bound because every smaller box was
// proven infeasible.
//
// parts: [{ w, h }]  (footprints in holes, bodies included; extra fields are ignored)
// opts.jumpers: how many jumper wires every layout needs (1 for a non-planar circuit)
// opts.work: effort for the exact packing checks, in cells scanned, shared by all boxes
//            (deterministic, unlike a time limit, so every worker gets the same bound)
// Returns { area, width, height, exact } -- exact: the packing relaxation was solved exactly
// (a packing of this box exists), false when the budget ran out first.
export function areaLowerBound(parts, opts = {}) {
    const { jumpers = 0, work = WORK, pre = PRE } = opts;
    const rects = (parts || []).map(p => ({ w: p.w, h: p.h }));
    for (let i = 0; i < jumpers; i++) rects.push({ w: 3, h: 1 });
    if (!rects.length) return { area: 0, width: 0, height: 0, exact: true };

    const sum = rects.reduce((s, p) => s + p.w * p.h, 0);
    const minSide = Math.max(...rects.map(p => Math.min(p.w, p.h)));

    // Candidate boxes W <= H (rotations are allowed, so W×H and H×W are the same question),
    // up to the box a greedy shelf packing achieves. A box passes the cheap test when it holds
    // the total area and every part fits; the survivors are checked in order of area.
    const upper = shelfUpper(rects);
    const fits = (W, H) => rects.every(p => (p.w <= W && p.h <= H) || (p.h <= W && p.w <= H));
    const boxes = [];
    for (let W = minSide; W * W <= upper.area; W++) {
        for (let H = Math.max(W, Math.ceil(sum / W)); W * H <= upper.area; H++) {
            if (fits(W, H)) boxes.push({ W, H });
        }
    }
    boxes.sort((a, b) => a.W * a.H - b.W * b.H || a.W - b.W);

    const budget = { left: work };
    for (const { W, H } of boxes) {
        const r = packs(rects, W, H, sum, budget, pre);
        if (r === true) return { area: W * H, width: W, height: H, exact: true };
        if (r === null) return { area: W * H, width: W, height: H, exact: false };
    }
    // Unreachable: the shelf box itself is in the list and is feasible. Keep a safe answer.
    return { area: upper.area, width: upper.width, height: upper.height, exact: false };
}

// A feasible box (any packing found by a greedy shelf heuristic): upper limit for the scan.
function shelfUpper(rects) {
    const rs = rects.map(p => ({ w: Math.max(p.w, p.h), h: Math.min(p.w, p.h) }))
        .sort((a, b) => b.h - a.h || b.w - a.w);
    const widest = Math.max(...rs.map(r => r.w));
    const total = rs.reduce((s, r) => s + r.w * r.h, 0);
    let best = null;
    for (let W = widest; W <= Math.max(widest, 2 * Math.ceil(Math.sqrt(total))) + 1; W++) {
        let x = 0, y = 0, shelfH = 0;
        for (const r of rs) {
            if (x + r.w > W) { y += shelfH; x = 0; shelfH = 0; }
            x += r.w; shelfH = Math.max(shelfH, r.h);
        }
        const H = y + shelfH;
        if (!best || W * H < best.area) best = { area: W * H, width: Math.min(W, H), height: Math.max(W, H) };
    }
    return best;
}

// Exact feasibility: can all rects be packed into W×H (axis-aligned, integer grid, each part in
// either orientation)? Returns true / false, or null when the effort budget runs out.
//
// Search: always decide the first undecided cell in row-major order. In any packing, the part
// covering that cell has it as its top-left corner (every cell before it is already decided),
// so it suffices to try each remaining part shape with its corner there, or to leave the cell
// empty (costs one cell of the slack W·H − Σ area). Identical shapes are grouped, so no packing
// is visited twice (the largest part is placed up front, see below).
//
// Pruning (wasted space, after Korf): every row of a placed part lies in a horizontal run of
// free cells at least as long as the part's width in that orientation. So a free cell whose
// run is shorter than every remaining part's narrowest allowed width can never be covered,
// and more generally the cells in runs of length L can only take the area of parts that fit
// in L. Filling runs from short to long with the pooled area of the parts that fit gives the
// minimum number of cells that must stay empty; if that exceeds the remaining slack, the
// branch is dead. Same for columns.
export function packs(rects, W, H, sum = null, budget = { left: Infinity }, preN = PRE) {
    if (sum === null) sum = rects.reduce((s, p) => s + p.w * p.h, 0);
    const slack0 = W * H - sum;
    if (slack0 < 0) return false;
    // group identical shapes (orientation-independent)
    const byKey = new Map();
    for (const p of rects) {
        const a = Math.min(p.w, p.h), b = Math.max(p.w, p.h);
        const k = a + 'x' + b;
        if (!byKey.has(k)) byKey.set(k, { a, b, n: 0 });
        byKey.get(k).n++;
    }
    const shapes = [...byKey.values()].sort((s, t) => t.a * t.b - s.a * s.b || t.b - s.b);
    for (const s of shapes) if (!((s.a <= W && s.b <= H) || (s.b <= W && s.a <= H))) return false;
    // orientations per shape: [w, h]
    const ors = shapes.map(s => (s.a === s.b ? [[s.a, s.a]] : [[s.b, s.a], [s.a, s.b]])
        .filter(([w, h]) => w <= W && h <= H));
    const count = shapes.map(s => s.n);
    const area = shapes.map(s => s.a * s.b);
    const needX = ors.map(o => Math.min(...o.map(([w]) => w)));
    const needY = ors.map(o => Math.min(...o.map(([, h]) => h)));
    const grid = new Uint8Array(W * H);
    const L = Math.max(W, H) + 1;
    const cells = new Int32Array(L), pool = new Int32Array(L);
    // minimum number of free cells no remaining part can cover (one direction)
    // (rows above y0 are fully decided, so the scan starts there)
    const waste = (horiz, y0) => {
        cells.fill(0); pool.fill(0);
        if (horiz) {
            for (let r = y0; r < H; r++) {
                let run = 0;
                for (let i = r * W, e = i + W; i <= e; i++) {
                    if (i < e && !grid[i]) run++;
                    else if (run) { cells[run] += run; run = 0; }
                }
            }
        } else {
            for (let c = 0; c < W; c++) {
                let run = 0;
                for (let r = y0; r <= H; r++) {
                    if (r < H && !grid[r * W + c]) run++;
                    else if (run) { cells[run] += run; run = 0; }
                }
            }
        }
        for (let i = 0; i < shapes.length; i++) if (count[i]) pool[horiz ? needX[i] : needY[i]] += count[i] * area[i];
        let carry = 0, lost = 0;
        for (let l = 1; l < L; l++) {
            carry += pool[l];
            const use = Math.min(carry, cells[l]);
            lost += cells[l] - use; carry -= use;
        }
        return lost;
    };
    let left = rects.length;

    const free = (x, y, w, h) => {
        if (x + w > W || y + h > H) return false;
        for (let r = y; r < y + h; r++) {
            const o = r * W;
            for (let c = x; c < x + w; c++) if (grid[o + c]) return false;
        }
        return true;
    };
    const fill = (x, y, w, h, v) => {
        for (let r = y; r < y + h; r++) grid.fill(v, r * W + x, r * W + x + w);
    };

    let aborted = false;
    const rec = (pos, slack) => {
        if (left === 0) return true;
        while (pos < W * H && grid[pos]) pos++;
        if (pos >= W * H) return false;
        const x = pos % W, y = (pos / W) | 0;
        // a node costs about two passes over the undecided part of the box (the waste scans)
        budget.left -= 1 + 2 * (H - y) * W;
        if (budget.left < 0) { aborted = true; return false; }
        if (waste(true, y) > slack || waste(false, y) > slack) return false;
        // free run to the right in this row
        let run = 0;
        while (x + run < W && !grid[pos + run]) run++;
        for (let i = 0; i < shapes.length; i++) {
            if (!count[i]) continue;
            for (const [w, h] of ors[i]) {
                if (w > run || !free(x, y, w, h)) continue;
                fill(x, y, w, h, 1); count[i]--; left--;
                const ok = rec(pos + w, slack);
                fill(x, y, w, h, 0); count[i]++; left++;
                if (ok) return true;
                if (aborted) return false;
            }
        }
        // leave the cell empty
        if (slack > 0) {
            grid[pos] = 2;
            const ok = rec(pos + 1, slack - 1);
            grid[pos] = 0;
            if (ok) return true;
        }
        return false;
    };
    // The largest parts go first, at every position (cell order alone would bury them under
    // permutations of small parts). Mirroring a packing left-right or top-bottom gives another
    // packing, so the largest part's corner can stay in the top-left quarter of its free range;
    // in a square box transposing does the same for its orientation.
    const pre = [];
    for (let i = 0; i < shapes.length && pre.length < preN; i++) {
        for (let k = 0; k < shapes[i].n && pre.length < preN; k++) pre.push(i);
    }
    const place = (j) => {
        if (j === pre.length) return rec(0, slack0);
        const i = pre[j];
        const os = j === 0 && W === H ? ors[i].slice(0, 1) : ors[i];
        count[i]--; left--;
        let res = false;
        for (const [w, h] of os) {
            const yMax = j === 0 ? (H - h) >> 1 : H - h, xMax = j === 0 ? (W - w) >> 1 : W - w;
            for (let y = 0; y <= yMax && !res && !aborted; y++) {
                for (let x = 0; x <= xMax && !res && !aborted; x++) {
                    if (--budget.left < 0) { aborted = true; break; }
                    if (!free(x, y, w, h)) continue;
                    fill(x, y, w, h, 1);
                    res = place(j + 1);
                    fill(x, y, w, h, 0);
                }
            }
        }
        count[i]++; left++;
        return res;
    };
    if (place(0)) return true;
    return aborted ? null : false;
}

// how many of the largest parts are placed up front, position by position
const PRE = 2;
// search effort per bound, in cells scanned (at most ~80 ms on a hard instance)
const WORK = 3e6;

// A layout is perfect when its area meets the bound and it uses no more jumper wires than any
// layout must: 0 for a circuit that can be drawn without crossings, 1 for one that can't
// (a non-planar network needs at least one crossing).
export function isPerfect(area, jumpers, bound, planar = true) {
    return area <= bound.area && (jumpers || 0) <= (planar ? 0 : 1);
}
