// Solver strategies under benchmark. Each is
//   async (compDefs, { budgetMs, report }) => { components, wires }
// `report(components, wires)` may be called any time a new candidate exists; the worker
// validates it and keeps a time-stamped best-so-far trace.
import { AutorouterEngine } from '../src/engine/engine.js';
import { solveBox } from '../src/engine/solver/boxsolver.js';

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

export const STRATEGIES = { legacy, box };
