// Benchmark runner: every (circuit × seed) of a strategy in parallel worker processes.
//   node bench/run.js <strategy> [--quick] [--seeds 5] [--budget 60000] [--jobs 6] [--filter substr] [--tag name]
// --quick: 3 hard-but-routable boards x 4 seeds x 15 s, all in parallel (~20 s wall clock) for
// iterating on ideas; confirm winners on the full set afterwards.
// Writes bench/results/<strategy>[-tag].json, updates bench/best-known.json (+ best layouts in
// bench/best/), and prints a per-circuit table relative to the best area ever found.
import { spawn } from 'child_process';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { summarize, printTable } from './report.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const strategy = args[0];
if (!strategy || strategy.startsWith('--')) {
    console.error('usage: node bench/run.js <strategy> [--seeds N] [--budget ms] [--jobs N] [--filter s] [--tag t]');
    process.exit(2);
}
const quick = args.includes('--quick');
const QUICK_SET = ['04_blinker555', '05_opamp_dual', '09_mosfet_bank4'];
const seeds = Number(opt('seeds', quick ? 4 : 5));
const budget = Number(opt('budget', quick ? 15000 : 60000));
const jobs = Number(opt('jobs', quick ? 12 : 6));
const filter = opt('filter', '');
const variantOpt = opt('opt', '');
const baseTag = opt('tag', variantOpt.replace(/[^\w=.-]+/g, '_'));
const tag = baseTag + (quick ? (baseTag ? '-quick' : 'quick') : '');

const circuits = readdirSync(join(DIR, 'circuits'))
    .filter(f => f.endsWith('.json') && f.includes(filter) && (!quick || QUICK_SET.includes(f.replace('.json', ''))))
    .sort();
const tasks = [];
for (const c of circuits) for (let s = 1; s <= seeds; s++) tasks.push({ circuit: c, seed: s });

mkdirSync(join(DIR, 'results'), { recursive: true });
mkdirSync(join(DIR, 'best'), { recursive: true });
mkdirSync(join(DIR, 'tmp'), { recursive: true });

const runOne = ({ circuit, seed }) => new Promise((resolve) => {
    const save = join(DIR, 'tmp', `${strategy}-${tag}-${circuit}-${seed}`);
    const p = spawn(process.execPath, [join(DIR, 'worker.js'), strategy, join(DIR, 'circuits', circuit), String(seed), String(budget), '--save', save, ...(variantOpt ? ['--opt', variantOpt] : [])],
        { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);
    // Hard kill if a solver ignores its budget badly.
    const killer = setTimeout(() => p.kill('SIGKILL'), budget * 3 + 30000);
    p.on('close', (code) => {
        clearTimeout(killer);
        try {
            const r = JSON.parse(out.trim().split('\n').pop());
            r.savePath = save;
            resolve(r);
        } catch {
            resolve({ strategy, circuit: circuit.replace('.json', ''), seed, routed: false, area: null, crashed: true, error: (err || `exit ${code}`).slice(-500) });
        }
    });
});

const results = [];
let next = 0, done = 0;
const t0 = Date.now();
await Promise.all(Array.from({ length: Math.min(jobs, tasks.length) }, async () => {
    while (next < tasks.length) {
        const r = await runOne(tasks[next++]);
        results.push(r);
        done++;
        process.stderr.write(`\r[${done}/${tasks.length}] ${r.circuit} s${r.seed}: ${r.routed ? r.width + 'x' + r.height + '=' + r.area : (r.crashed ? 'CRASH' : 'unrouted')}        `);
        if (r.crashed) process.stderr.write(`\n${r.error}\n`);
    }
}));
process.stderr.write(`\ndone in ${Math.round((Date.now() - t0) / 1000)}s\n`);

// Best-known bookkeeping
const bestPath = join(DIR, 'best-known.json');
const bestKnown = existsSync(bestPath) ? JSON.parse(readFileSync(bestPath, 'utf-8')) : {};
for (const r of results) {
    if (!r.routed || !r.finalValid) continue;
    const b = bestKnown[r.circuit];
    if (!b || r.area < b.area) {
        bestKnown[r.circuit] = { area: r.area, width: r.width, height: r.height, strategy: r.strategy, seed: r.seed };
        if (existsSync(r.savePath)) renameSync(r.savePath, join(DIR, 'best', `${r.circuit}.json`));
    }
}
writeFileSync(bestPath, JSON.stringify(bestKnown, null, 2) + '\n');

const name = tag ? `${strategy}-${tag}` : strategy;
for (const r of results) delete r.savePath;
results.sort((a, b) => a.circuit.localeCompare(b.circuit) || a.seed - b.seed);
writeFileSync(join(DIR, 'results', `${name}.json`), JSON.stringify({ strategy, tag, seeds, budget, date: new Date().toISOString(), results }, null, 1));

printTable([{ name, rows: summarize(results), results }], bestKnown);
