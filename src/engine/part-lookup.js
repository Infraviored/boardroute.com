// The short circuit format for AI models: parts by name, connections as a net list. No pin
// offsets, no positions -- the footprint of every part comes from the library (curated parts,
// a few built-in generics, the KiCad set), and the solver places everything anyway.
//
//   { "parts": [ { "id": "U1", "part": "Wemos D1 Mini" },
//                { "id": "R1", "part": "resistor", "value": "220" } ],
//     "nets":  { "LED": ["U1.D5", "R1.1"], "GND": ["U1.GND", "R1.2"] } }
//
// A part may instead list its own connections ("pins": { "D5": "LED", "GND": "GND" }), and a part
// that is in no library may bring its own footprint (the full format's "pins" array of
// { offset, label, net }). resolveCircuit() turns all of it into the full format of templates.js.

// lower-case text plus a copy without separators, so "dip8", "DIP 8" and "DIP-8" all match "DIP-8_W7.62mm"
export const squash = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

export function indexPart(c, origin) {
  const text = [c.name, c.value, c.desc, c.category, c.source, ...(c.aka || [])].filter(Boolean).join(' ').toLowerCase();
  return { c, origin, category: c.category || 'Curated', text, flat: squash(text), name: c.name.toLowerCase() };
}

// every search word must match
export function matches(entry, words) {
  return words.every(w => entry.text.includes(w) || (squash(w) && entry.flat.includes(squash(w))));
}

// --- built-in generics: the everyday parts, in the hole spacing people use on perfboard ---
const row = (labels, step = 1) => labels.map((label, i) => ({ offset: [i * step, 0], label }));
const nums = (n) => Array.from({ length: n }, (_, i) => String(i + 1));
const GENERICS = [
  { re: /^(resistor|widerstand|res|r)( |$)/, make: () => ({ name: 'Resistor', pins: [{ offset: [0, 0], label: '1' }, { offset: [3, 0], label: '2' }], swap: true }) },
  { re: /^(led|light emitting)(?! ?(strip|driver|matrix|display|bar|ring|panel))/, make: () => ({ name: 'LED', pins: row(['K', 'A']) }) },
  { re: /^(diode|1n4148|1n400\d|schottky|1n58\d\d|zener)/, make: () => ({ name: 'Diode', pins: [{ offset: [0, 0], label: 'K' }, { offset: [4, 0], label: 'A' }] }) },
  { re: /^(electrolytic|elko|cp)( |$)|^(polarized|polarised) cap/, lib: 'Electrolytic Cap 6.3mm' },
  { re: /^(capacitor|cap|ceramic|kondensator|c)( |$)/, make: () => ({ name: 'Capacitor', pins: row(['1', '2'], 2), swap: true }) },
  { re: /\bto ?220\b|^(mosfet|power transistor|voltage regulator|78\d\d|lm317|irl|irf)/, lib: 'Transistor TO-220' },
  { re: /\bto ?92\b|^(bc5\d\d|2n2222|2n3904|2n3906|small transistor|transistor)( |$)/, make: () => ({ name: 'TO-92', pins: row(nums(3)) }) },
  { re: /^(push ?button|button|tactile|taster|switch)( |$)/, make: () => ({ name: 'Button', pins: row(['1', '2'], 2), swap: true, body: { offset: [0, -1], size: [3, 3] } }) },
  { re: /^(potentiometer|poti|pot|trimmer)( |$)/, make: () => ({ name: 'Potentiometer', pins: row(nums(3), 2), body: { offset: [0, -1], size: [5, 4] } }) },
  { re: /^(crystal|quartz|xtal|quarz)( |$)/, make: () => ({ name: 'Crystal', pins: row(['1', '2'], 2), swap: true }) },
  { re: /^(buzzer|piezo)( |$)/, make: () => ({ name: 'Buzzer', pins: [{ offset: [0, 0], label: '+' }, { offset: [3, 0], label: '-' }], body: { offset: [-1, -2], size: [5, 5] } }) },
  {
    // "pin header 6", "header 1x6", "socket 2x5" (2 rows: pins 1-2 side by side, like KiCad)
    re: /^(pin ?header|header|pin ?socket|socket|female header|male header|connector|jst|dupont)\D*?(?:([12]) ?x ?)?(\d+)/,
    make: (m) => {
      const r = +(m[2] || 1), n = +m[3];
      if (n < 1 || n > 40) return null;
      return { name: `Pin header ${r}x${n}`, pins: nums(r * n).map((label, i) => ({ offset: [r === 2 ? i % 2 : 0, r === 2 ? i >> 1 : i], label })) };
    },
  },
  {
    re: /^(screw ?terminal|terminal ?block|terminal|klemme)\D*(\d+)/,
    make: (m) => { const n = +m[2]; return n >= 1 && n <= 12 ? { name: `Screw terminal ${n}P`, pins: nums(n).map((label, i) => ({ offset: [0, 2 * i], label })), swap: true, edge: 'left', body: { offset: [-1, -1], size: [3, 2 * n] } } : null; },
  },
  { re: /^(screw ?terminal|terminal ?block|terminal|klemme)( |$)/, lib: 'Screw Terminal 2P' },
  { re: /^dip ?(\d+)/, kicad: (m) => `DIP-${m[1]}_W7.62mm` },
];

function generic(query, lib) {
  const q = query.toLowerCase().replace(/[_-]+/g, ' ').trim();
  for (const g of GENERICS) {
    const m = q.match(g.re);
    if (!m) continue;
    if (g.lib) { const e = lib.find(e => e.c.name === g.lib); if (e) return e.c; }
    if (g.kicad) { const name = g.kicad(m); const e = lib.find(e => e.c.name === name); if (e) return e.c; }
    if (g.make) { const c = g.make(m); if (c) return c; }
  }
  return null;
}

// --- pins: "D5", "GND", "3", "+" -> the index of the pin in the footprint ---
const pinKey = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9+-]/g, '');
const PIN_ALIASES = { ANODE: 'A', CATHODE: 'K', C: 'K', PLUS: '+', POS: '+', MINUS: '-', NEG: '-', VCC: '+', GND: '-' };

export function findPin(pins, ref) {
  const k = pinKey(ref);
  if (!k) return -1;
  const labels = pins.map(p => pinKey(p.label));
  let i = labels.indexOf(k);
  if (i >= 0) return i;
  // a label with several names: "D1/TX"
  i = pins.findIndex(p => String(p.label ?? '').split('/').some(n => pinKey(n) === k));
  if (i >= 0) return i;
  // "GPIO5" for "5", "D5" for "5", or "1:GND"-style labels
  i = labels.findIndex(l => l.replace(/^(GPIO|IO|PIN|P)/, '') === k.replace(/^(GPIO|IO|PIN|P)/, ''));
  if (i >= 0) return i;
  if (PIN_ALIASES[k]) { i = labels.indexOf(PIN_ALIASES[k]); if (i >= 0) return i; }
  // a pin number: the pin of that label, else the n-th pin
  if (/^\d+$/.test(k)) { const n = +k; if (n >= 1 && n <= pins.length) return n - 1; }
  return -1;
}

// --- library search: all words of the name must match; parts that have every named pin win ---
function search(query, lib, pinRefs) {
  const words = query.toLowerCase().split(/[\s_,/()]+/).filter(Boolean);
  if (!words.length) return [];
  const score = (e) => words.filter(w => e.text.includes(w) || (squash(w) && e.flat.includes(squash(w)))).length / words.length;
  const pinsOk = (c) => pinRefs.every(r => findPin(c.pins, r) >= 0);
  return lib
    .map((e, i) => ({ e, i, s: score(e) }))
    .filter(x => x.s >= 0.5)
    .map(x => ({ ...x, all: x.s === 1, s: x.s + (pinsOk(x.e.c) ? 0.5 : 0) + (x.e.origin === 'curated' ? 0.1 : 0) + (squash(x.e.c.name) === squash(query) ? 1 : 0) }))
    .sort((a, b) => b.s - a.s || a.e.c.name.length - b.e.c.name.length || a.i - b.i);
}

/** Finds the footprint for a part name: { part, guess } or { part: null, suggestions }. */
export function lookupPart(query, lib, pinRefs = []) {
  const g = generic(query, lib);
  if (g) return { part: g, guess: false };
  const hits = search(query, lib, pinRefs);
  const best = hits[0];
  // every word found and every named pin present: sure; every word but not the pins: a guess
  if (best && best.all && best.s >= 1.5) return { part: best.e.c, guess: hits[1]?.s === best.s };
  if (best && best.all) return { part: best.e.c, guess: true };
  return { part: null, suggestions: hits.slice(0, 3).map(h => h.e.c.name) };
}

export const isShortCircuit = (data) => Array.isArray(data?.parts);

/**
 * Short format -> full format ({ components: [...] }). problems: hard errors (the circuit is not
 * loaded); notes: guesses the user should check.
 */
export function resolveCircuit(data, lib) {
  const problems = [], notes = [];
  const parts = data.parts.filter(p => p && typeof p === 'object');
  // every "ID.PIN" of the net list, per part
  const conns = new Map(); // id -> [{ pin, net }]
  const addConn = (id, pin, net) => { if (!conns.has(id)) conns.set(id, []); conns.get(id).push({ pin: String(pin), net: String(net) }); };
  const nets = data.nets && typeof data.nets === 'object' ? data.nets : {};
  for (const [net, refs] of Object.entries(nets)) {
    for (const ref of Array.isArray(refs) ? refs : []) {
      const m = String(ref).match(/^\s*([^.:\s]+)\s*[.:]\s*(.+?)\s*$/);
      if (m) addConn(m[1], m[2], net); else problems.push(`"${ref}" in net ${net}: write it as PART.PIN, e.g. "R1.1"`);
    }
  }
  for (const p of parts) {
    if (p.pins && typeof p.pins === 'object' && !Array.isArray(p.pins)) {
      for (const [pin, net] of Object.entries(p.pins)) if (net) addConn(p.id, pin, net);
    }
  }
  const ids = new Set();
  const components = [];
  for (const [i, p] of parts.entries()) {
    const id = String(p.id || `P${i + 1}`);
    if (ids.has(id)) { problems.push(`Two parts are called ${id}`); continue; }
    ids.add(id);
    const mine = conns.get(id) || [];
    let foot;
    if (Array.isArray(p.pins) && p.pins.every(pin => Array.isArray(pin?.offset))) {
      foot = { name: p.part || p.name || id, pins: p.pins, body: p.body, swap: p.swap, edge: p.edge };
    } else {
      const query = String(p.part || p.name || p.footprint || '');
      const r = lookupPart(query, lib, mine.map(c => c.pin));
      if (!r.part) {
        problems.push(`${id}: no part "${query}" in the library${r.suggestions?.length ? ` (closest: ${r.suggestions.join(', ')})` : ''}`);
        continue;
      }
      if (r.guess) notes.push(`${id}: no exact match for "${query}", using ${r.part.name}`);
      foot = r.part;
    }
    const pins = foot.pins.map(pin => ({ offset: [pin.offset[0], pin.offset[1]], label: pin.label ?? '', net: pin.net || '' }));
    // "labels": the part's own pin names in pin order (a module on a plain pin header)
    if (Array.isArray(p.labels)) p.labels.slice(0, pins.length).forEach((l, k) => { if (l != null && l !== '') pins[k].label = String(l); });
    for (const c of mine) {
      const k = findPin(pins, c.pin);
      if (k < 0) { problems.push(`${id} has no pin "${c.pin}" (pins: ${pins.map(q => q.label).join(', ')})`); continue; }
      if (pins[k].net && pins[k].net !== c.net) { problems.push(`${id}.${c.pin} is in two nets: ${pins[k].net} and ${c.net}`); continue; }
      pins[k].net = c.net;
    }
    // a two-pin part with a loose end is almost always a mistake (a resistor that leads nowhere)
    if (pins.length === 2 && pins.some(q => q.net) && pins.some(q => !q.net)) {
      notes.push(`${id}: pin ${pins.find(q => !q.net).label} is not connected`);
    }
    components.push({
      id,
      name: foot.name,
      value: String(p.value ?? foot.value ?? ''),
      pins,
      ...(foot.body ? { body: foot.body } : {}),
      ...(foot.swap ? { swap: foot.swap } : {}),
      ...(p.edge || foot.edge ? { edge: p.edge || foot.edge } : {}),
    });
  }
  for (const id of conns.keys()) if (!ids.has(id)) problems.push(`The nets name ${id}, but there is no part ${id}`);
  return { components, problems, notes };
}

// the library the short format resolves against, loaded once
let libPromise = null;
export function loadLibrary() {
  if (!libPromise) {
    const get = (url) => fetch(url).then(r => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); });
    libPromise = Promise.all([get('/component_database.json'), get('/kicad_library.json').then(d => d.parts || [])])
      .then(([curated, kicad]) => [...curated.map(c => indexPart(c, 'curated')), ...kicad.map(c => indexPart(c, 'kicad'))])
      .catch(err => { libPromise = null; throw err; });
  }
  return libPromise;
}
