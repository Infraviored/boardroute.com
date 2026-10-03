// Runs solveBox off the main thread. Protocol:
//   in:  { type: 'solve', defs, initial?, budgetMs, stallMs }   { type: 'stop' }
//   out: { type: 'best', components, wires, metrics }  { type: 'progress', elapsed, text }  { type: 'done', found }
import { solveBox } from './boxsolver.js';

let stopRequested = false;

self.onmessage = async (e) => {
    const msg = e.data;
    if (msg.type === 'stop') { stopRequested = true; return; }
    if (msg.type !== 'solve') return;
    stopRequested = false;
    const t0 = performance.now();
    let lastBest = t0;
    // Stop on stagnation: no better layout for stallMs, or for half the time it took to
    // find the last improvement (large boards keep improving for longer).
    const stalled = () => {
        const t = performance.now();
        return t - lastBest > Math.max(msg.stallMs, (lastBest - t0) * 0.5);
    };
    const res = await solveBox(msg.defs, {
        budgetMs: msg.budgetMs,
        initial: msg.initial,
        shouldStop: () => stopRequested || stalled(),
        onBest: (components, wires, metrics) => {
            lastBest = performance.now();
            self.postMessage({ type: 'best', components, wires, metrics });
        },
        onProgress: (text) => self.postMessage({ type: 'progress', elapsed: performance.now() - t0, text }),
    });
    self.postMessage({ type: 'done', found: !!res });
};
