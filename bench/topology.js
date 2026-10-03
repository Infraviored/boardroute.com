// Topological routability report for circuit JSON files (default: all of bench/circuits).
//   node bench/topology.js [file.json ...] [--blocking]   (--blocking: treat every body as non-routeUnder)
import { readFileSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { processTemplate } from '../src/engine/templates.js';
import { analyzeTopology } from '../src/engine/topology.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const blocking = args.includes('--blocking');
let files = args.filter(a => !a.startsWith('--'));
if (!files.length) files = readdirSync(join(DIR, 'circuits')).filter(f => f.endsWith('.json')).sort().map(f => join(DIR, 'circuits', f));

for (const f of files) {
    const defs = processTemplate(JSON.parse(readFileSync(f, 'utf-8')));
    if (blocking) defs.forEach(d => { d.routeUnder = false; });
    const r = analyzeTopology(defs);
    const tag = r.planar ? 'planar' : `UNROUTABLE (${r.certificate.type})`;
    console.log(`${basename(f, '.json').padEnd(24)} ${String(r.walls).padStart(3)} walls  ${tag}`);
    if (!r.planar) console.log(`    parts: ${r.certificate.parts.join(', ')}\n    nets:  ${r.certificate.nets.join(', ')}\n    branch vertices: ${r.certificate.branch.join(', ')}`);
}
