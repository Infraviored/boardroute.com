// One solver of the `portfolio` strategy (bench/strategies.js), in a worker_thread like the
// browser's solver.worker.js. Own seeded random stream; reports every new best to the parent.
//   in:  { type: 'global', components, key }  (best of the whole portfolio)   { type: 'stop' }
//   out: { type: 'best', components, wires, metrics }   { type: 'done' }
// Sharing (workerData.share): adopt the portfolio's best when it beats our own --
//   'restart': only when our search restarts anyway;  <ms>: also every <ms> during shrinking.
import { parentPort, workerData } from 'worker_threads';
import { solveBox } from '../src/engine/solver/boxsolver.js';

let s = workerData.seed >>> 0 || 1;
Math.random = () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
console.log = () => { };
console.warn = () => { };

const { defs, budgetMs, variant, share } = workerData;
let stop = false, global = null, ownKey = Infinity, lastAdopt = performance.now();
parentPort.on('message', (m) => {
    if (m.type === 'stop') stop = true;
    else if (m.type === 'global') global = m;
});

const takeover = (reason) => {
    if (!share || !global || global.key >= ownKey) return null;
    if (reason === 'tick' && (share === 'restart' || performance.now() - lastAdopt < share)) return null;
    lastAdopt = performance.now();
    ownKey = global.key; // don't adopt the same layout again
    return global.components;
};

await solveBox(defs, {
    budgetMs, variant,
    shouldStop: () => stop,
    takeover,
    onBest: (components, wires, metrics) => {
        ownKey = Math.min(ownKey, metrics.area + 4 * (metrics.jumpers || 0));
        parentPort.postMessage({ type: 'best', components, wires, metrics });
    },
});
parentPort.postMessage({ type: 'done' });
