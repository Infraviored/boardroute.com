// Table output shared by run.js and compare.js.
//   node bench/report.js results/a.json results/b.json ...   -> side-by-side comparison
import { readFileSync, existsSync } from 'fs';
import { processTemplate } from '../src/engine/templates.js';
import { analyzeTopology } from '../src/engine/topology.js';
import { areaLowerBound } from '../src/engine/lower-bound.js';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const DIR = dirname(fileURLToPath(import.meta.url));

const median = (xs) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function summarize(results) {
    const by = new Map();
    for (const r of results) {
        if (!by.has(r.circuit)) by.set(r.circuit, []);
        by.get(r.circuit).push(r);
    }
    const rows = new Map();
    for (const [circuit, rs] of by) {
        const ok = rs.filter(r => r.routed && r.finalValid !== false);
        rows.set(circuit, {
            n: rs.length,
            ok: ok.length,
            best: ok.length ? Math.min(...ok.map(r => r.area)) : null,
            median: median(ok.map(r => r.area)),
            tBest: median(ok.map(r => r.tBest)),
            wl: median(ok.map(r => r.wl)),
            jumpers: median(ok.map(r => r.jumpers || 0)),
            // best area reached within a quarter of the budget (convergence speed)
            q1: median(ok.map(r => { const q = (r.trace || []).filter(([t]) => t <= r.budgetMs / 4); return q.length ? q[q.length - 1][1] : Infinity; }).filter(Number.isFinite)),
            eps: median(rs.map(r => r.evalsPerSec).filter(x => x != null)),
            invalid: rs.filter(r => r.finalValid === false && r.routed).length,
        });
    }
    return rows;
}

// Score: geometric mean over ALL runs of area / frozen reference area (bench/reference.json);
// an unrouted run on a routable circuit counts as 2x the reference. Lower is better.
const REF_PATH = join(DIR, 'reference.json');
const REFERENCE = existsSync(REF_PATH) ? JSON.parse(readFileSync(REF_PATH, 'utf-8')) : {};
export function scoreRuns(results) {
    let logSum = 0, n = 0;
    for (const r of results) {
        const ref = REFERENCE[r.circuit];
        if (!ref) continue;
        const ok = r.routed && r.finalValid !== false;
        logSum += Math.log(ok ? r.area / ref : 2); n++;
    }
    return n ? Math.exp(logSum / n) : null;
}

// Topological status per circuit: 'X' = proven unroutable, 'R' = a routed layout is known,
// '?' = planar but nobody has routed it yet.
// Provable minimum area (src/engine/lower-bound.js) per circuit.
function lowerBound(circuit) {
    const f = join(DIR, 'circuits', `${circuit}.json`);
    return existsSync(f) ? areaLowerBound(processTemplate(JSON.parse(readFileSync(f, 'utf-8')))).area : null;
}

function topoStatus(circuit, bestKnown) {
    const f = join(DIR, 'circuits', `${circuit}.json`);
    if (!existsSync(f)) return ' ';
    const t = analyzeTopology(processTemplate(JSON.parse(readFileSync(f, 'utf-8'))));
    if (!t.planar) return 'X';
    return bestKnown[circuit] ? 'R' : '?';
}

export function printTable(series, bestKnown) {
    const circuits = [...new Set(series.flatMap(s => [...s.rows.keys()]))].sort();
    const pad = (x, w) => String(x ?? '-').padStart(w);
    const W = 45;
    let head = 'circuit'.padEnd(20) + 'topo' + pad('known', 6) + pad('min', 5);
    for (const s of series) head += ' │ ' + s.name.slice(0, W).padEnd(W);
    console.log(head);
    let sub = ''.padEnd(35);
    for (const _ of series) sub += ' │ ' + 'ok  best   med  med@¼  medWL  t(best)  ev/s'.padEnd(W);
    console.log(sub);
    for (const c of circuits) {
        const lb = lowerBound(c);
        let line = c.slice(0, 20).padEnd(20) + `  ${topoStatus(c, bestKnown)} ` + pad(bestKnown[c]?.area, 6) + pad(lb, 5);
        for (const s of series) {
            const r = s.rows.get(c);
            if (!r) { line += ' │ ' + ''.padEnd(W); continue; }
            const t = r.tBest != null ? (r.tBest / 1000).toFixed(1) + 's' : '-';
            line += ' │ ' + `${r.ok}/${r.n}`.padEnd(4) + pad(r.best, 5) + pad(r.median, 6) + pad(r.q1, 7) + pad(r.wl, 7) + pad(t, 8) + pad(r.eps, 6) + (r.invalid ? ' !' : '  ') + (r.jumpers ? ` J${r.jumpers}` : '');
        }
        console.log(line);
    }
    let foot = 'score (gmean area/ref)'.padEnd(35);
    for (const s of series) { const sc = scoreRuns(s.results); foot += ' │ ' + (sc ? sc.toFixed(3) : '-').padEnd(W); }
    console.log(foot);
    console.log('topo: X = proven unroutable (non-planar), R = routable (layout known), ? = open.  min = provable minimum area (known = min: perfect).  ! = a run ended on an invalid layout.  Jn = median jumper wires');
}

// "Best of k seeds": what a k-worker portfolio of independent runs (one core each) would hold
// at time t, computed from the per-seed traces without new runs. For every circuit all
// k-subsets of the seeds are evaluated; the table shows the median over subsets.
const subsets = (n, k) => {
    const out = [];
    const rec = (start, acc) => {
        if (acc.length === k) { out.push(acc.slice()); return; }
        for (let i = start; i < n; i++) { acc.push(i); rec(i + 1, acc); acc.pop(); }
    };
    rec(0, []);
    return out;
};
const areaAt = (r, t) => {
    if (!r.routed || r.finalValid === false) return Infinity;
    let a = Infinity;
    for (const [tt, area] of r.trace || []) if (tt <= t) a = area;
    return a;
};
// The app's stop rule (engine.layout) applied after the fact to the merged trace of a set of
// runs: stop once there was no improvement for max(stallMs, half the time of the last one).
// Returns [area at stop or Infinity, stop time].
const nParts = new Map();
function stallMsOf(circuit) {
    if (!nParts.has(circuit)) {
        const f = join(DIR, 'circuits', `${circuit}.json`);
        nParts.set(circuit, existsSync(f) ? processTemplate(JSON.parse(readFileSync(f, 'utf-8'))).length : 10);
    }
    return Math.max(3000, Math.min(15000, 1200 * nParts.get(circuit)));
}
function stallStop(runs, stallMs, budget) {
    const ev = [];
    runs.forEach((r, i) => { if (r.routed && r.finalValid !== false) for (const [t, a] of r.trace || []) ev.push([t, a, i]); });
    ev.sort((a, b) => a[0] - b[0]);
    let area = Infinity, by = -1, last = null;
    for (const [t, a, i] of ev) {
        if (last !== null && t - last > Math.max(stallMs, last * 0.5)) break;
        if (a < area || (a === area && i === by)) { area = a; by = i; last = t; }
    }
    return [area, last === null ? budget : Math.min(budget, last + Math.max(stallMs, last * 0.5))];
}

export function printPortfolio(name, results, kMax, times = [5000, 15000, 30000, 60000]) {
    const ks = [...new Set([1, 2, 4, kMax].filter(k => k <= kMax))].sort((a, b) => a - b);
    const by = new Map();
    for (const r of results) { if (!by.has(r.circuit)) by.set(r.circuit, []); by.get(r.circuit).push(r); }
    const tl = [...times.map(t => `@${t / 1000}s`), 'stop', 't'];
    const colW = (times.length + 2) * 6;
    console.log(`\n${name}: median area of the best of k seeds (all k-subsets; '-' = unrouted)`);
    console.log('circuit'.padEnd(22) + ks.map(k => ` │ ${`k=${k}`.padEnd(colW)}`).join(''));
    console.log(''.padEnd(22) + ks.map(() => ' │ ' + tl.map(s => s.padStart(6)).join('')).join(''));
    const logs = ks.map(() => [...times, 'stop'].map(() => ({ s: 0, n: 0 })));
    const budget = Math.max(...results.map(r => r.budgetMs || 0));
    for (const c of [...by.keys()].sort()) {
        const rs = by.get(c);
        let line = c.slice(0, 22).padEnd(22);
        ks.forEach((k, ki) => {
            const subs = k <= rs.length ? subsets(rs.length, k) : [];
            const stops = subs.map(sub => stallStop(sub.map(i => rs[i]), stallMsOf(c), budget));
            const cell = (vals, ti) => {
                const ref = REFERENCE[c];
                if (ref) for (const v of vals) { logs[ki][ti].s += Math.log(Number.isFinite(v) ? v / ref : 2); logs[ki][ti].n++; }
                const m = median(vals);
                return String(m == null || !Number.isFinite(m) ? '-' : m).padStart(6);
            };
            line += ' │ ' + times.map((t, ti) => cell(subs.map(sub => Math.min(...sub.map(i => areaAt(rs[i], t)))), ti)).join('')
                + cell(stops.map(x => x[0]), times.length)
                + (stops.length ? (median(stops.map(x => x[1])) / 1000).toFixed(0) + 's' : '-').padStart(6);
        });
        console.log(line);
    }
    console.log('score (gmean area/ref)'.padEnd(22) + logs.map(row => ' │ ' + row.map(({ s, n }) => (n ? Math.exp(s / n).toFixed(3) : '-').padStart(6)).join('') + ''.padStart(6)).join(''));
    console.log("stop/t: the app's stall rule applied to the merged trace (area when it would have stopped, median stop time)");
}

if (process.argv[1] && basename(process.argv[1]) === 'report.js') {
    const bestPath = join(DIR, 'best-known.json');
    const bestKnown = existsSync(bestPath) ? JSON.parse(readFileSync(bestPath, 'utf-8')) : {};
    const argv = process.argv.slice(2);
    const pi = argv.indexOf('--portfolio');
    if (pi >= 0) {
        const k = Number(argv[pi + 1]) || 4;
        argv.splice(pi, 2);
        for (const f of argv) {
            const d = JSON.parse(readFileSync(f, 'utf-8'));
            const times = [5000, 15000, 30000, 60000].filter(t => t <= d.budget);
            printPortfolio((d.tag ? `${d.strategy}-${d.tag}` : d.strategy) + ` ${d.budget / 1000}s`, d.results, k, times);
        }
        process.exit(0);
    }
    const series = argv.map(f => {
        const d = JSON.parse(readFileSync(f, 'utf-8'));
        return { name: (d.tag ? `${d.strategy}-${d.tag}` : d.strategy) + ` ${d.budget / 1000}s`, rows: summarize(d.results), results: d.results };
    });
    printTable(series, bestKnown);
}
