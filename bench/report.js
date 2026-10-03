// Table output shared by run.js and compare.js.
//   node bench/report.js results/a.json results/b.json ...   -> side-by-side comparison
import { readFileSync, existsSync } from 'fs';
import { processTemplate } from '../src/engine/templates.js';
import { analyzeTopology } from '../src/engine/topology.js';
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
    let head = 'circuit'.padEnd(20) + 'topo' + pad('known', 6);
    for (const s of series) head += ' │ ' + s.name.slice(0, W).padEnd(W);
    console.log(head);
    let sub = ''.padEnd(30);
    for (const _ of series) sub += ' │ ' + 'ok  best   med  med@¼  medWL  t(best)  ev/s'.padEnd(W);
    console.log(sub);
    for (const c of circuits) {
        let line = c.slice(0, 20).padEnd(20) + `  ${topoStatus(c, bestKnown)} ` + pad(bestKnown[c]?.area, 6);
        for (const s of series) {
            const r = s.rows.get(c);
            if (!r) { line += ' │ ' + ''.padEnd(W); continue; }
            const t = r.tBest != null ? (r.tBest / 1000).toFixed(1) + 's' : '-';
            line += ' │ ' + `${r.ok}/${r.n}`.padEnd(4) + pad(r.best, 5) + pad(r.median, 6) + pad(r.q1, 7) + pad(r.wl, 7) + pad(t, 8) + pad(r.eps, 6) + (r.invalid ? ' !' : '  ') + (r.jumpers ? ` J${r.jumpers}` : '');
        }
        console.log(line);
    }
    let foot = 'score (gmean area/ref)'.padEnd(30);
    for (const s of series) { const sc = scoreRuns(s.results); foot += ' │ ' + (sc ? sc.toFixed(3) : '-').padEnd(W); }
    console.log(foot);
    console.log('topo: X = proven unroutable (non-planar), R = routable (layout known), ? = open.  ! = a run ended on an invalid layout.  Jn = median jumper wires');
}

if (process.argv[1] && basename(process.argv[1]) === 'report.js') {
    const bestPath = join(DIR, 'best-known.json');
    const bestKnown = existsSync(bestPath) ? JSON.parse(readFileSync(bestPath, 'utf-8')) : {};
    const series = process.argv.slice(2).map(f => {
        const d = JSON.parse(readFileSync(f, 'utf-8'));
        return { name: (d.tag ? `${d.strategy}-${d.tag}` : d.strategy) + ` ${d.budget / 1000}s`, rows: summarize(d.results), results: d.results };
    });
    printTable(series, bestKnown);
}
