// What boardroute knows by name: shared by build-parts.js (dist/parts.txt, for AI assistants)
// and build-site.js (the /parts/ pages). Everything comes from public/*.json and
// src/engine/part-lookup.js, and every name written out is fed back through resolveCircuit.
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { squash, indexPart, lookupPart, resolveCircuit, rolesFor } from '../src/engine/part-lookup.js';
import { processTemplate } from '../src/engine/templates.js';
import { makeComp } from '../src/engine/initial-placement.js';
import { generateBoardSVG } from '../src/engine/render-utils.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(readFileSync(join(ROOT, 'public', f), 'utf-8'));
export const SITE = 'https://boardroute.com';

export const curated = read('component_database.json');
export const kicad = read('kicad_library.json').parts;
export const lib = [...curated.map(c => indexPart(c, 'curated')), ...kicad.map(c => indexPart(c, 'kicad'))];

const labels = (c) => c.pins.map(p => String(p.label ?? ''));
const isSeq = (ls) => ls.every((l, i) => l === String(i + 1));
const pinText = (ls) => (isSeq(ls) && ls.length > 2 ? `1..${ls.length}` : ls.join(', '));

// --- the self-check: a name must resolve to exactly that part, with exactly those pins ---
export const checked = { n: 0 };
export function checkName(name, expectName, expectLabels, value) {
  const ls = expectLabels;
  const str = value ? `${name}, ${value}` : name;
  const refs = ls.length > 1 ? [`X.${ls[0]}`, `X.${ls[ls.length - 1]}`] : [`X.${ls[0]}`];
  const r = resolveCircuit({ parts: { X: str }, connections: [refs] }, lib);
  const c = r.components[0];
  const bad = [];
  if (r.problems.length) bad.push(r.problems.join('; '));
  if (!c) bad.push('no component');
  else {
    if (c.placeholder) bad.push('not found (placeholder)');
    if (c.name.toLowerCase() !== expectName.toLowerCase()) bad.push(`resolves to "${c.name}"`);
    if (labels(c).join('|') !== ls.join('|')) bad.push(`pins are ${labels(c).join(' ')}`);
  }
  if (r.notes.some(n => /no pin|no exact match/.test(n))) bad.push(r.notes.join(' '));
  checked.n++;
  if (bad.length) throw new Error(`parts self-check failed for "${str}": ${bad.join('; ')}`);
}

// --- generics: names to write, pins derived from the lookup itself ---
const GENERIC_SAMPLES = [
  ['resistor', 'resistor, 220'], ['capacitor', 'capacitor, 100nF'], ['electrolytic capacitor', 'electrolytic capacitor, 100uF'],
  ['crystal', 'crystal, 16MHz'], ['push button', 'push button'], ['potentiometer', 'potentiometer, 10k'],
  ['buzzer', 'buzzer'], ['LED', 'LED, red'], ['diode', 'diode, 1N4148'],
  ['pin header N', 'pin header 4'], ['pin header 2xN', 'pin header 2x3'], ['screw terminal N', 'screw terminal 2'],
  ['DIP-N', 'DIP-8, NE555'], ['TO-92', 'TO-92, BC547'], ['TO-220', 'TO-220, IRLZ44N'],
].map(([title, example]) => ({ title, example }));
// role names by value (ROLES in part-lookup.js decides; the check below fails if an example loses its roles)
const ROLE_EXAMPLES = [['TO-220', '7805'], ['TO-220', '7905'], ['TO-220', 'LM317'], ['TO-220', 'IRLZ44N'], ['TO-92', '2N7000'], ['TO-92', 'BC547'], ['TO-92', '2N2222'], ['TO-92', '2N3906'], ['TO-220', 'TIP120']];

export function genericsText() {
  const out = [];
  for (const g of GENERIC_SAMPLES) {
    const [head, ...rest] = g.example.split(', ');
    const r = lookupPart(head, lib);
    if (!r.part) throw new Error(`generic "${head}" does not resolve`);
    const ls = labels(r.part);
    const hasValue = rest.length ? ' (value after a comma, optional)' : '';
    checkName(head, r.part.name, /^TO-/.test(head) ? rolesFor(rest[0]) ?? ls : ls, rest[0]);
    out.push(`${g.title} | write e.g. "${g.example}"${hasValue} | pins: ${pinText(ls)}${/2xN/.test(g.title) ? ' (2·N pins)' : /^(pin header|screw|DIP)/.test(g.title) ? ' (N = number of pins)' : ''}`);
  }
  out.push('');
  out.push('Pin roles of TO-92 and TO-220 parts: with a known value in the part string the role names work (the numbers 1, 2, 3 always work, in datasheet order).');
  for (const [type, value] of ROLE_EXAMPLES) {
    const roles = rolesFor(value);
    if (!roles) throw new Error(`no pin roles for ${value}`);
    checkName(type, type === 'TO-92' ? 'TO-92' : 'Transistor TO-220', roles, value);
    out.push(`${type}, ${value}: ${roles.join(' ')}`);
  }
  return out;
}

// --- modules (curated) ---
export const slugOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const catOf = (c) => {
  if (/ESP|Wemos|Arduino/i.test(c.name)) return 'Microcontroller boards';
  if (/Screw|Electrolytic|Transistor/i.test(c.name)) return 'Basic parts with their own footprint';
  if (/DIP/i.test(c.value || '')) return 'ICs';
  return 'Sensors, displays and modules';
};
export const modules = curated.map(c => ({ ...c, slug: slugOf(c.name), cat: catOf(c), ls: labels(c) }));
if (new Set(modules.map(m => m.slug)).size !== modules.length) throw new Error('two modules share a slug');

export function modulesText() {
  return modules.map(m => {
    checkName(m.name, m.name, m.ls);
    const note = [m.value, ...(m.aka || [])].filter(Boolean).join('; ');
    return `${m.name} | ${note} | pins in order: ${m.ls.join(', ')}`;
  });
}

// --- KiCad footprints: grouped by category ---
export const skipped = [];
export function kicadText() {
  const byCat = new Map();
  for (const c of kicad) { if (!byCat.has(c.category)) byCat.set(c.category, []); byCat.get(c.category).push(c); }
  const out = [];
  // a name that squashes to one already taken (a curated module, another library) cannot be told apart: listed once
  const taken = new Set(curated.map(c => squash(c.name)));
  for (const [cat, list] of [...byCat].sort((a, b) => a[0].localeCompare(b[0]))) {
    const lines = [];
    for (const c of list) {
      if (taken.has(squash(c.name))) { skipped.push(c.name); continue; }
      taken.add(squash(c.name));
      const ls = labels(c);
      checkName(c.name, c.name, ls);
      lines.push(isSeq(ls) ? `${c.name} | ${ls.length} pins` : `${c.name} | ${ls.length} pins: ${ls.join(', ')}`);
    }
    out.push('', `## ${cat} (${lines.length})`, ...lines);
  }
  return out;
}

export function partsTxt() {
  const generics = genericsText(), mods = modulesText(), kc = kicadText();
  return [
    '# boardroute: part names and their pin names',
    '',
    'boardroute (https://boardroute.com) lays out a circuit on perfboard. In the circuit JSON you write each part as',
    '"ID": "part name, value" under "parts" (the value is optional) and refer to its pins as ID.PIN in "connections".',
    'Use a name from this list and the pin names shown here. Format and example: https://boardroute.com/llms.txt',
    'Pages with footprint drawings: https://boardroute.com/parts/',
    'Name matching ignores case, spaces and dashes. A part that is not found becomes a plain pin header with the pins you used',
    '(write its pins in brackets after the name: "MP1584 module (IN+, IN-, OUT+, OUT-)").',
    'Line format: name (write exactly this) | description or aliases | pins. A pin can be named by its printed name or its number.',
    '',
    '# GENERICS: built-in everyday parts',
    ...generics,
    '',
    `# MODULES: ${modules.length} ready-made boards and parts with the pin names printed on them`,
    ...mods,
    '',
    `# KICAD: ${kicad.length} through-hole footprints (write the name as shown; "DIP-14" and "BarrelJack" style short names are searched too)`,
    'Pins are named 1..N unless listed.',
    ...kc,
    '',
  ].join('\n');
}

// --- pages ---
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export { esc };

export function circuitLink(circuit) {
  return `${SITE}/#circuit=${encodeURIComponent(JSON.stringify(circuit)).replace(/\(/g, '%28').replace(/\)/g, '%29')}`;
}

const POWER = /^(?:(GND|VCC|VIN|VDD|VSS|3V3|5V|3\.3V|EN|RST|RESET|NC)\b|\+|-)/i;
// a small circuit using the part: a resistor and an LED between a signal pin and ground
export function exampleFor(m) {
  const n = m.ls.length;
  const signal = m.ls.find(l => !POWER.test(l)) ?? m.ls[0];
  const ground = m.ls.find(l => /^(GND|-|G)$/i.test(l)) ?? m.ls.find(l => l !== signal && /GND/i.test(l)) ?? m.ls.filter(l => l !== signal).pop() ?? signal;
  const circuit = {
    parts: { U1: m.name, R1: 'resistor, 330', D1: 'LED, red' },
    connections: [[`U1.${signal}`, 'R1.1'], ['R1.2', 'D1.A'], ['D1.K', `U1.${ground}`]],
  };
  if (n < 2 || signal === ground) circuit.connections = [[`U1.${signal}`, 'R1.1'], ['R1.2', 'D1.A'], ['D1.K', `U1.${m.ls[n - 1]}`]];
  const r = resolveCircuit(circuit, lib);
  if (r.problems.length || r.notes.some(x => /no pin|not in the library/.test(x))) throw new Error(`example for ${m.name} does not resolve: ${[...r.problems, ...r.notes].join('; ')}`);
  checked.n++;
  return circuit;
}

export function footprintSvg(m) {
  const cd = processTemplate({ components: [{ id: 'U1', name: m.name, value: m.value, pins: m.pins, body: m.body, swap: m.swap, edge: m.edge }] })[0];
  const comp = makeComp(cd, 0, 0);
  return generateBoardSVG([comp], [])
    .replace(/@import url\([^)]*\);?/, '')
    .replace('<svg ', `<svg role="img" aria-label="${esc(m.name)} footprint on a 2.54 mm grid" `);
}

export const modulePath = (m) => `/parts/${m.slug}/`;
