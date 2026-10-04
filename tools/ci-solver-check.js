// CI smoke test for the engine: short solver runs on a few benchmark circuits, each result
// checked by the independent validator, plus the routability verdicts of the constructed cases.
//   node tools/ci-solver-check.js
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { processTemplate } from '../src/engine/templates.js';
import { analyzeTopology } from '../src/engine/topology.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++; };

// planarity verdicts (x1 = K3,3, x3 = K5 are provably unroutable on one layer; the rest is planar)
for (const [c, planar] of [['x1_caps_k33', false], ['x2_caps_k33_minus1', true], ['x3_caps_k5', false], ['x4_resistors_k5', true], ['x5_parallel_mosfets3', true], ['04_blinker555', true]]) {
    const defs = processTemplate(JSON.parse(readFileSync(join(ROOT, 'bench', 'circuits', `${c}.json`), 'utf-8')));
    check(analyzeTopology(defs).planar === planar, `topology ${c}: ${planar ? 'planar' : 'non-planar'}`);
}

// short solver runs: must route, and the validator must accept the final layout
for (const [c, budget] of [['01_default', 4000], ['04_blinker555', 6000], ['x3_caps_k5', 6000]]) {
    const out = execFileSync(process.execPath, [join(ROOT, 'bench', 'worker.js'), 'app', join(ROOT, 'bench', 'circuits', `${c}.json`), '1', String(budget)], { encoding: 'utf-8' });
    const r = JSON.parse(out.trim().split('\n').pop());
    check(r.routed && r.finalValid, `solver ${c}: ${r.routed ? `${r.width}x${r.height}${r.jumpers ? `, ${r.jumpers} jumper(s)` : ''}` : 'not routed'}${r.finalValid ? '' : ' INVALID ' + r.finalErrors.join('; ')}`);
}

if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
