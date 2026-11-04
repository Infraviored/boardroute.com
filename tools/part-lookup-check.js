// node tools/part-lookup-check.js [circuit.json ...]
// Resolves circuits in the short AI format (src/engine/part-lookup.js) against the real library and
// prints what each part became. Without arguments: the answers a small model (Claude Haiku) wrote
// from the app's prompt, in tools/part-lookup/. Exit code 1 when any circuit has problems.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveCircuit, indexPart } from '../src/engine/part-lookup.js';
import { processTemplate } from '../src/engine/templates.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf-8'));
const lib = [
  ...read(path.join(root, 'public/component_database.json')).map(c => indexPart(c, 'curated')),
  ...read(path.join(root, 'public/kicad_library.json')).parts.map(c => indexPart(c, 'kicad')),
];
const dir = path.join(root, 'tools/part-lookup');
const files = process.argv.length > 2 ? process.argv.slice(2) : fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => path.join(dir, f));

let bad = 0;
for (const f of files) {
  const r = resolveCircuit(read(f), lib);
  const defs = processTemplate({ components: r.components });
  console.log(`== ${path.basename(f)}: ${defs.length} parts, ${r.problems.length} problems, ${r.notes.length} notes`);
  for (const p of r.problems) console.log('  problem:', p);
  for (const n of r.notes) console.log('  note:   ', n);
  for (const c of r.components) {
    console.log(`  ${c.id.padEnd(5)} ${c.name.padEnd(26)} ${String(c.value).padEnd(14)} ${c.pins.filter(p => p.net).map(p => `${p.label}=${p.net}`).join(' ')}`);
  }
  if (r.problems.length) bad++;
}
process.exit(bad ? 1 : 0);
