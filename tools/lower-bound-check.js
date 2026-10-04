/* global process */
// Checks the provable minimum area (src/engine/lower-bound.js).
//   node tools/lower-bound-check.js
//
// 1. Every bench circuit and app example: old bound (sum of areas + every part fits), new bound,
//    best known area (bench/best-known.json) and the time it took. Asserts new >= old and
//    new <= best known -- a bound above a layout that exists would be a bug.
// 2. The exact packing check against an independent brute force on small random instances:
//    try every position and orientation of every part, no shared code, no pruning. Compares
//    feasibility box by box (both W×H and H×W) and the resulting minimum area, and checks that a
//    run cut short by its node budget never returns more than the exact answer.
import { readFileSync, readdirSync } from 'node:fs';
import { processTemplate } from '../src/engine/templates.js';
import { analyzeTopology } from '../src/engine/topology.js';
import { areaLowerBound, packs } from '../src/engine/lower-bound.js';

let failures = 0;
const fail = (msg) => { failures++; console.log('  FAIL', msg); };

// The bound before exact packing: smallest box holding the total area with every part fitting.
function oldBound(parts) {
    const sum = parts.reduce((s, p) => s + p.w * p.h, 0);
    let best = Infinity;
    for (let W = 1; W <= sum + 50; W++) {
        let H = Math.ceil(sum / W);
        for (const p of parts) H = Math.max(H, Math.min(p.w <= W ? p.h : Infinity, p.h <= W ? p.w : Infinity));
        best = Math.min(best, W * H);
    }
    return best;
}

// ---- 1. real circuits ------------------------------------------------------------------------
const best = JSON.parse(readFileSync(new URL('../bench/best-known.json', import.meta.url)));
const circuits = [];
const dir = new URL('../bench/circuits/', import.meta.url);
for (const f of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    circuits.push({ name: f.replace(/\.json$/, ''), json: JSON.parse(readFileSync(new URL(f, dir))) });
}
for (const ex of JSON.parse(readFileSync(new URL('../public/examples.json', import.meta.url)))) {
    circuits.push({ name: 'example:' + ex.id, json: ex.circuit });
}

console.log('circuit'.padEnd(28) + 'planar'.padStart(7) + 'old'.padStart(6) + 'new'.padStart(6) + 'box'.padStart(8) + 'exact'.padStart(7) + 'known'.padStart(7) + 'ms'.padStart(8));
let totalMs = 0, benchMs = 0;
for (const { name, json } of circuits) {
    const defs = processTemplate(json);
    const planar = analyzeTopology(defs).planar;
    const old = oldBound(defs);
    const t = performance.now();
    const b = areaLowerBound(defs, { jumpers: planar ? 0 : 1 });
    const ms = performance.now() - t;
    totalMs += ms;
    if (!name.startsWith('example:')) benchMs += ms;
    const known = best[name]?.area;
    console.log(name.padEnd(28) + String(planar ? 'yes' : 'no').padStart(7) + String(old).padStart(6) + String(b.area).padStart(6)
        + `${b.width}x${b.height}`.padStart(8) + String(b.exact).padStart(7) + String(known ?? '-').padStart(7) + ms.toFixed(1).padStart(8));
    if (b.area < old) fail(`${name}: new bound ${b.area} below old ${old}`);
    if (known !== undefined && b.area > known) fail(`${name}: bound ${b.area} above best known ${known}`);
    if (b.width * b.height !== b.area) fail(`${name}: box ${b.width}x${b.height} != area ${b.area}`);
}
console.log(`bench circuits: ${benchMs.toFixed(0)} ms, all: ${totalMs.toFixed(0)} ms`);
if (benchMs > 200) fail(`bench circuits took ${benchMs.toFixed(0)} ms (limit 200)`);

// ---- 2. brute force on small instances ----------------------------------------------------
// Exhaustive: part i goes to every position in every orientation, recursively.
function bruteFits(rects, W, H) {
    const occ = Array.from({ length: H }, () => new Array(W).fill(false));
    const go = (i) => {
        if (i === rects.length) return true;
        const { w, h } = rects[i];
        for (const [a, b] of [[w, h], [h, w]]) {
            for (let y = 0; y + b <= H; y++) for (let x = 0; x + a <= W; x++) {
                let ok = true;
                for (let r = y; r < y + b && ok; r++) for (let c = x; c < x + a; c++) if (occ[r][c]) { ok = false; break; }
                if (!ok) continue;
                for (let r = y; r < y + b; r++) for (let c = x; c < x + a; c++) occ[r][c] = true;
                const done = go(i + 1);
                for (let r = y; r < y + b; r++) for (let c = x; c < x + a; c++) occ[r][c] = false;
                if (done) return true;
            }
        }
        return false;
    };
    return go(0);
}
function bruteMinArea(rects) {
    const sum = rects.reduce((s, p) => s + p.w * p.h, 0);
    for (let A = sum; ; A++) {
        for (let W = 1; W <= A; W++) if (A % W === 0 && bruteFits(rects, W, A / W)) return A;
    }
}

let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
let boxes = 0, instances = 0;
for (let t = 0; t < 400; t++) {
    const n = ri(1, 6);
    const rects = Array.from({ length: n }, () => ({ w: ri(1, 4), h: ri(1, 3) }));
    const sum = rects.reduce((s, p) => s + p.w * p.h, 0);
    if (sum > 26) continue;
    instances++;
    // feasibility box by box, every way of placing parts up front
    for (let W = 1; W <= 7; W++) for (let H = 1; H <= 7; H++) {
        if (W * H > sum + 6) continue;
        const want = bruteFits(rects, W, H);
        for (const pre of [0, 1, 2, 3]) {
            const got = packs(rects, W, H, null, { left: Infinity }, pre);
            boxes++;
            if (got !== want) fail(`packs(${JSON.stringify(rects)}, ${W}x${H}, pre=${pre}) = ${got}, brute force ${want}`);
        }
    }
    // minimum area
    const exact = bruteMinArea(rects);
    const b = areaLowerBound(rects);
    if (b.area !== exact || !b.exact) fail(`areaLowerBound(${JSON.stringify(rects)}) = ${b.area} (exact ${b.exact}), brute force ${exact}`);
    // a run cut short must stay a lower bound
    for (const work of [0, 10, 100, 1000, 10000]) {
        const c = areaLowerBound(rects, { work });
        if (c.area > exact) fail(`work ${work}: ${c.area} > exact ${exact} for ${JSON.stringify(rects)}`);
        if (c.exact && c.area !== exact) fail(`work ${work}: claims exact ${c.area}, brute force ${exact}`);
    }
}
console.log(`brute force: ${instances} instances, ${boxes} box checks`);

if (failures) { console.log(`${failures} failure(s)`); process.exit(1); }
console.log('ok');
