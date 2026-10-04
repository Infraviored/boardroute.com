// Solver strategies under benchmark. Each is
//   async (compDefs, { budgetMs, report }) => { components, wires }
// `report(components, wires)` may be called any time a new candidate exists; the worker
// validates it and keeps a time-stamped best-so-far trace.
import { AutorouterEngine } from '../src/engine/engine.js';
import { solveBox } from '../src/engine/solver/boxsolver.js';
import { analyzeTopology } from '../src/engine/topology.js';
import { Worker } from 'worker_threads';

const now = () => performance.now();

// The pipeline exactly as the UI runs it: Route (placeAndRoute) -> Compact (optimize) -> Optimize (plateau).
async function legacy(defs, { budgetMs, report }) {
    const t0 = now();
    const eng = new AutorouterEngine(30, 20);
    eng.setCallbacks({ onBestSnapshot: (s) => report(s.components, s.wires) });
    const left = () => budgetMs - (now() - t0);
    const phase = async (fn) => {
        if (left() <= 0) return;
        const timer = setTimeout(() => eng.cancel(), Math.max(0, left()));
        try { await fn(); } finally { clearTimeout(timer); }
        report(eng.components, eng.wires);
    };
    await phase(() => eng.placeAndRoute(defs));
    eng.config.maxTimeMs = Math.min(eng.config.maxTimeMs, Math.max(1, left()));
    await phase(() => eng.optimize());
    await phase(() => eng.plateau());
    return { components: eng.components, wires: eng.wires };
}

// Fixed-box shrinking with negotiated-congestion routing.
async function box(defs, { budgetMs, report, variant }) {
    return solveBox(defs, { budgetMs, variant, onBest: (c, w) => report(c, w) });
}

// What the app runs (engine.layout): jumpers right away for non-planar circuits, otherwise
// only if no jumper-free layout turned up within 10 s.
async function app(defs, { budgetMs, report, variant }) {
    const policy = analyzeTopology(defs).planar ? { jumperAfterMs: 10000 } : { jumpers: 1 };
    return solveBox(defs, { budgetMs, variant: { ...policy, ...variant }, onBest: (c, w) => report(c, w) });
}

// Per-worker tunables for a diversified portfolio (--opt pf=<name>); worker i gets
// PRESETS[name][i % length] on top of the shared settings.
const PRESETS = {
    same: [{}],
    smart: [{}, { pSmart: 40 }, { pSmart: 90 }, { pSmart: 60, pJump: 24 }],
    soft: [{}, {}, {}, { shrink: 'soft' }],
    effort: [{}, { effort: 40 }, { effort: 90 }, { effort: 60, fails: 6 }],
    mix: [{}, { pSmart: 90 }, { shrink: 'soft' }, { effort: 90, fails: 6 }],
    restarts: [{}, { fails: 1 }, { fails: 6 }, {}],
    init: [{}, {}, { init: 'random' }, { local: 1 }],
};

// The app's multi-core layout (engine.layout): N solvers (worker_threads, like the browser's
// Web Workers) with their own random streams, the overall best counts.
// --opt n=4            number of solvers (use --jobs 3 so runs don't compete for cores)
//       pf=<preset>    diversified tunables per solver (PRESETS)
//       share=restart  a solver that restarts continues from the overall best instead (if better)
//       share=<ms>     ... and also adopts it every <ms> while shrinking
//       stop=1         end on the engine's stall rule instead of using the whole budget
// Any other key is a solver tunable for all workers. Jumper policy as in `app`.
async function portfolio(defs, { budgetMs, report, variant, seed = 1 }) {
    const { n = 4, pf = 'same', share = 0, stop: stallStop = 0, ...shared } = variant || {};
    const policy = analyzeTopology(defs).planar ? { jumperAfterMs: 10000 } : { jumpers: 1 };
    const preset = PRESETS[pf];
    if (!preset) throw new Error(`unknown portfolio preset ${pf}`);
    const stallMs = Math.max(3000, Math.min(15000, 1200 * defs.length));
    const t0 = now();
    let best = null, lastImprove = null;
    const workers = [];
    await new Promise((resolve) => {
        let open = n;
        const stopAll = () => workers.forEach(w => w.postMessage({ type: 'stop' }));
        const watchdog = setInterval(() => {
            if (!stallStop || !best) return;
            if (now() - lastImprove > Math.max(stallMs, (lastImprove - t0) * 0.5)) stopAll();
        }, 100);
        for (let i = 0; i < n; i++) {
            const w = new Worker(new URL('./portfolio-thread.js', import.meta.url), {
                workerData: { defs, budgetMs, seed: (seed * 7919 + i * 104729) >>> 0, share, variant: { ...policy, ...shared, ...preset[i % preset.length] } },
            });
            workers.push(w);
            let done = false;
            const finish = () => { if (done) return; done = true; w.terminate(); if (--open === 0) { clearInterval(watchdog); resolve(); } };
            w.on('message', (m) => {
                if (m.type === 'done') return finish();
                if (m.type !== 'best') return;
                const key = m.metrics.area + 4 * (m.metrics.jumpers || 0);
                if (best && (key > best.key || (key === best.key && m.metrics.wl >= best.wl))) return;
                best = { key, wl: m.metrics.wl, components: m.components, wires: m.wires };
                lastImprove = now();
                report(m.components, m.wires);
                if (share) workers.forEach(o => { if (o !== w) o.postMessage({ type: 'global', components: m.components, key }); });
            });
            w.on('error', (err) => { process.stderr.write(`portfolio worker ${i}: ${err?.stack || err}\n`); finish(); });
        }
    });
    return best ? { components: best.components, wires: best.wires } : null;
}

export const STRATEGIES = { legacy, box, app, portfolio };
