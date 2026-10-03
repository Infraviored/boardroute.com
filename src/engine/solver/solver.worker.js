// Runs solveBox off the main thread. Several of these run side by side (engine.layout), each
// with its own random stream; the engine keeps the overall best and decides when to stop.
// Protocol:
//   in:  { type: 'solve', defs, initial?, budgetMs, stallMs?, variant?, firstOnly?, live? }   { type: 'stop' }
//   out: { type: 'best', components, wires, metrics }  { type: 'live', components, wires }
//        { type: 'progress', elapsed, text }  { type: 'done', found }
import { solveBox } from './boxsolver.js';

let stopRequested = false;

self.onmessage = async (e) => {
    const msg = e.data;
    if (msg.type === 'stop') { stopRequested = true; return; }
    if (msg.type !== 'solve') return;
    stopRequested = false;
    const t0 = performance.now();
    let lastBest = null;
    // Optional own stop on stagnation (stallMs set): no better layout for stallMs, or for half
    // the time it took to find the last improvement. Never before the first layout: until then
    // the search (and the switch to jumper wires) needs the time.
    // firstOnly (the UI's Wire step): stop as soon as one fully routed layout exists.
    const stalled = () => {
        if (lastBest === null) return false;
        if (msg.firstOnly) return true;
        if (!msg.stallMs) return false;
        const t = performance.now();
        return t - lastBest > Math.max(msg.stallMs, (lastBest - t0) * 0.5);
    };
    let res = null, error = null;
    try {
        res = await solveBox(msg.defs, {
            budgetMs: msg.budgetMs,
            initial: msg.initial,
            variant: msg.variant,
            shouldStop: () => stopRequested || stalled(),
            onBest: (components, wires, metrics) => {
                lastBest = performance.now();
                self.postMessage({ type: 'best', components, wires, metrics });
            },
            onLive: msg.live ? (components, wires) => self.postMessage({ type: 'live', components, wires }) : null,
            onProgress: (text) => self.postMessage({ type: 'progress', elapsed: performance.now() - t0, text }),
        });
    } catch (err) {
        // never leave the engine waiting: an exception must still end with 'done'
        error = String(err?.message || err);
    }
    self.postMessage({ type: 'done', found: !!res, error });
};
