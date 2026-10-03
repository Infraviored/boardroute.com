// Runs one (strategy, circuit, seed) and prints a single JSON result line on stdout.
//   node bench/worker.js <strategy> <circuit.json> <seed> <budgetMs> [--save <out.json>]
import { readFileSync, writeFileSync } from 'fs';
import { basename } from 'path';
import { processTemplate } from '../src/engine/templates.js';
import { validateLayout } from './validate.js';
import { STRATEGIES } from './strategies.js';

const [stratName, circuitPath, seedArg, budgetArg] = process.argv.slice(2);
const saveIdx = process.argv.indexOf('--save');
const savePath = saveIdx > 0 ? process.argv[saveIdx + 1] : null;
const optIdx = process.argv.indexOf('--opt');
const variant = {};
if (optIdx > 0) for (const kv of process.argv[optIdx + 1].split(',')) {
    const [k, v] = kv.split('=');
    variant[k] = v === undefined ? true : (isNaN(Number(v)) ? v : Number(v));
}
const seed = Number(seedArg) >>> 0;
const budgetMs = Number(budgetArg);

// Deterministic Math.random (mulberry32) so runs are reproducible per seed.
let s = seed || 1;
Math.random = () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
// Engine code logs progress chatter; keep stdout clean for the result line.
console.log = () => { };
console.warn = () => { };

const strategy = STRATEGIES[stratName];
if (!strategy) { process.stderr.write(`unknown strategy ${stratName}\n`); process.exit(2); }

const defs = processTemplate(JSON.parse(readFileSync(circuitPath, 'utf-8')));
const t0 = performance.now();
let best = null;
const trace = [];

const snapshot = (components, wires) => ({
    components: components.map(c => ({
        id: c.id, routeUnder: !!c.routeUnder, w: c.w, h: c.h, ox: c.ox, oy: c.oy,
        pins: c.pins.map(p => ({ dCol: p.dCol, dRow: p.dRow, net: p.net || null, lbl: p.lbl }))
    })),
    wires: (wires || []).map(w => ({ net: w.net, failed: !!w.failed, path: (w.path || []).map(p => ({ col: p.col, row: p.row })) })),
});

function report(components, wires) {
    if (!components?.length) return;
    const v = validateLayout(components, wires);
    if (!v.routed) return;
    if (!best || v.area < best.area || (v.area === best.area && v.wl < best.wl)) {
        const t = Math.round(performance.now() - t0);
        best = { area: v.area, width: v.width, height: v.height, wl: v.wl, t, layout: snapshot(components, wires) };
        trace.push([t, v.area]);
    }
}

const result = await strategy(defs, { budgetMs, report, variant });
const elapsed = Math.round(performance.now() - t0);
let final = null;
if (result) {
    report(result.components, result.wires);
    final = validateLayout(result.components, result.wires);
}

if (savePath && best) writeFileSync(savePath, JSON.stringify(best.layout));

process.stdout.write(JSON.stringify({
    strategy: stratName, circuit: basename(circuitPath, '.json'), seed, budgetMs, elapsed,
    routed: !!best,
    area: best?.area ?? null, width: best?.width ?? null, height: best?.height ?? null, wl: best?.wl ?? null,
    tBest: best?.t ?? null, trace,
    finalValid: final?.valid ?? false, finalErrors: final?.errors ?? [],
    evalsPerSec: result?.evals ? Math.round(result.evals / (elapsed / 1000)) : null,
}) + '\n');
process.exit(0);
