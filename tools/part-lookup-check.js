// node tools/part-lookup-check.js [--summary] [circuit.json ...]
// Resolves circuits in the short AI format (src/engine/part-lookup.js) against the real library and
// prints what each part became. Without arguments: the answers a small model (Claude Haiku) wrote
// from the app's prompt, in tools/part-lookup/. Files may hold a raw model answer: ```json fences
// and text around the outermost {...} are ignored; invalid JSON is a failure line, not a crash.
// --summary: one line per file and a total. Exit code 1 when any circuit has problems or bad JSON.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveCircuit, indexPart } from '../src/engine/part-lookup.js';
import { processTemplate } from '../src/engine/templates.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf-8'));
const parseAnswer = (text) => {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  return JSON.parse(a >= 0 && b > a ? text.slice(a, b + 1) : text);
};
const lib = [
  ...read(path.join(root, 'public/component_database.json')).map(c => indexPart(c, 'curated')),
  ...read(path.join(root, 'public/kicad_library.json')).parts.map(c => indexPart(c, 'kicad')),
];
const dir = path.join(root, 'tools/part-lookup');
const args = process.argv.slice(2);
const summary = args.includes('--summary');
const given = args.filter(a => a !== '--summary');
const files = given.length ? given : fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => path.join(dir, f));

let bad = 0;
const total = { problems: 0, placeholders: 0, dropped: 0, notes: 0, badJson: 0 };
for (const f of files) {
  const name = path.basename(f);
  let r;
  try {
    r = resolveCircuit(parseAnswer(fs.readFileSync(f, 'utf-8')), lib);
    processTemplate({ components: r.components });
  } catch (e) {
    bad++; total.badJson++;
    console.log(summary ? `${name}  json=BAD  problems=-  placeholders=-  dropped=-  notes=-` : `== ${name}: FAILED: ${e.message}`);
    continue;
  }
  const placeholders = r.components.filter(c => c.placeholder).length;
  const dropped = r.notes.filter(n => /left out/.test(n)).length;
  total.problems += r.problems.length; total.placeholders += placeholders; total.dropped += dropped; total.notes += r.notes.length;
  if (r.problems.length) bad++;
  if (summary) {
    console.log(`${name}  json=ok  problems=${r.problems.length}  placeholders=${placeholders}  dropped=${dropped}  notes=${r.notes.length}`);
    continue;
  }
  console.log(`== ${name}: ${r.components.length} parts, ${r.problems.length} problems, ${r.notes.length} notes`);
  for (const p of r.problems) console.log('  problem:', p);
  for (const n of r.notes) console.log('  note:   ', n);
  for (const c of r.components) {
    console.log(`  ${c.id.padEnd(5)} ${c.name.padEnd(26)} ${String(c.value).padEnd(14)} ${c.pins.filter(p => p.net).map(p => `${p.label}=${p.net}`).join(' ')}${c.placeholder ? '  [placeholder]' : ''}`);
  }
}
if (summary) console.log(`TOTAL  files=${files.length}  badjson=${total.badJson}  problems=${total.problems}  placeholders=${total.placeholders}  dropped=${total.dropped}  notes=${total.notes}`);
process.exit(bad ? 1 : 0);
