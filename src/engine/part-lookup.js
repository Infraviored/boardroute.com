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

// pin roles of the common TO-92 / TO-220 parts by value, in pin order (first match wins)
const ROLES = [
  [/2N7000/, ['S', 'G', 'D']],
  [/IRL|IRF/, ['G', 'D', 'S']],
  [/78\d\d/, ['IN', 'GND', 'OUT']],
  [/79\d\d/, ['GND', 'IN', 'OUT']],
  [/LM317|LM1117|AMS1117|LD1117/, ['ADJ', 'OUT', 'IN']],
  [/BC5\d\d/, ['C', 'B', 'E']],
  [/2N2222|2N3904|2N3906/, ['E', 'B', 'C']],
  [/TIP(12\d|3\d)/, ['B', 'C', 'E']],
];
const rolesFor = (text) => { const t = String(text).toUpperCase().replace(/[^A-Z0-9]/g, ''); return ROLES.find(([re]) => re.test(t))?.[1]; };

// --- pins: "D5","GND", "3", "+" -> the index of the pin in the footprint ---
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
  i = labels.findIndex(l => l.replace(/^(GPIO|IO|PIN|P|D)/, '') === k.replace(/^(GPIO|IO|PIN|P|D)/, ''));
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

export const isShortCircuit = (data) => !!data?.parts && typeof data.parts === 'object';

// --- the part strings of the simple format: "<part name>[ (<pin>, ...)][, <value>]" ---
const BRACKET = /\s*[([]([^()[\]]*)[)\]]/;
function splitTop(s) { // first comma outside brackets
  let d = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[') d++; else if (c === ')' || c === ']') d = Math.max(0, d - 1); else if (c === ',' && !d) return [s.slice(0, i), s.slice(i + 1)];
  }
  return [s, null];
}
// length of the leading generic ("resistor ", "LED", "DIP-8") in a name without comma, else 0
function genericPrefix(s, lib) {
  const q = s.toLowerCase().replace(/[_-]/g, ' ');
  for (const g of GENERICS) {
    const m = q.match(g.re);
    if (!m || m.index !== 0 || !generic(s, lib)) continue;
    let n = m[0].length;
    while (n < s.length && !/\s/.test(s[n]) && !/\s/.test(s[n - 1])) n++; // do not cut a word in two
    return n;
  }
  return 0;
}
export function parsePartString(str, lib) {
  let [head, tail] = splitTop(String(str).trim());
  let brk = null;
  const grab = (t) => {
    const m = t.match(BRACKET);
    if (!m) return t.trim();
    brk ||= m[1].split(/[,;|]/).map(x => x.trim()).filter(Boolean);
    return t.replace(BRACKET, '').trim();
  };
  head = grab(head);
  let value = tail == null ? '' : grab(tail);
  if (tail == null) {
    const n = genericPrefix(head, lib);
    if (n > 0 && head.slice(n).trim()) {
      value = head.slice(n).trim().replace(/^(capacitor|cap|kondensator|resistor|widerstand|led|diode)\s+/i, '');
      head = head.slice(0, n).trim();
    }
  }
  return { part: head, value, brk: brk?.length ? brk : null };
}

// --- net names for groups of connections ---
// GND, 3V3, 5V, VCC ... -> { name, rank }; GND ranks first
function powerName(label) {
  const s = String(label ?? '').toUpperCase().replace(/\s+/g, '');
  if (/^(AGND|DGND|PGND|GND|VSS|0V)$/.test(s)) return { name: 'GND', rank: 0 };
  const t = s.replace(/^\+/, '');
  let m = t.match(/^(\d+)V(\d+)$/);
  if (m) return { name: `${m[1]}V${m[2]}`, rank: 1 };
  m = t.match(/^(\d+)(?:\.(\d+))?V$/);
  if (m) return { name: m[2] ? `${m[1]}V${m[2]}` : `${m[1]}V`, rank: 1 };
  if (/^(VCC|VDD|VIN|VBUS|VBAT|VOUT|V\+)$/.test(t)) return { name: t, rank: 1 };
  return null;
}

const SEP = /\s*(?:<->|->|—|↔)\s*|\s*,\s*|\s+-\s+/;
const REF = /^\s*([^.:\s]+)\s*[.:]\s*(.+?)\s*$/;

/**
 * Short format -> full format ({ components: [...] }). problems: hard errors (the circuit is not
 * loaded); notes: guesses and left-out things the user should check. A part that is not in the
 * library becomes a plain pin header (placeholder: true) instead of an error.
 *
 * Two spellings of parts: an array of { id, part, value, ... } with "nets" (named groups), or an
 * object { "U1": "Wemos D1 Mini", "U2": "MP1584 module (IN+, IN-, OUT+, OUT-), 5V" } with
 * "connections": [["U1.D5", "R1.1"], ...]. Groups that share a physical pin are merged.
 */
export function resolveCircuit(data, lib) {
  const problems = [], notes = [];
  // --- parts: an array of objects (old) or an object id -> "name (pins), value" ---
  const parts = [];
  if (Array.isArray(data.parts)) {
    data.parts.filter(p => p && typeof p === 'object').forEach((p, i) => parts.push({ ...p, id: String(p.id || `P${i + 1}`) }));
  } else if (data.parts && typeof data.parts === 'object') {
    for (const [id, v] of Object.entries(data.parts)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const q = parsePartString(String(v.part ?? v.name ?? v.footprint ?? ''), lib);
        parts.push({ ...v, id, part: q.part, value: v.value ?? q.value, brk: q.brk });
      } else parts.push({ id, ...parsePartString(Array.isArray(v) ? v.join(', ') : String(v ?? ''), lib) });
    }
  } else problems.push('"parts" must be a list or an object');
  if (!parts.length && !problems.length) problems.push('The circuit has no parts');
  for (const p of parts) { // "pins": ["IN+", "IN-"] = the part's own pin names
    if (Array.isArray(p.pins) && p.pins.length && p.pins.every(x => typeof x === 'string')) { p.brk = p.pins; p.pins = undefined; }
  }

  // --- groups of "ID.PIN": connections (merge when they share a pin) and nets (named) ---
  const strict = !('connections' in data); // old format: a pin in two nets is an error
  const groups = []; // { refs: [{ id, pin }], name }
  const mk = (list, name, bad) => {
    const refs = [];
    for (const s of list) {
      const m = String(s).match(REF);
      if (m) refs.push({ id: m[1], pin: m[2] }); else bad(`"${s}"${name ? ` in net ${name}` : ''}: write it as PART.PIN, e.g. "R1.1"`);
    }
    return { refs, name };
  };
  const items = (x) => (Array.isArray(x) ? x : [x]).flatMap(y => (typeof y === 'string' ? y.split(SEP) : [])).map(y => y.trim()).filter(Boolean);
  if (Array.isArray(data.connections)) for (const c of data.connections) groups.push(mk(items(c), null, n => notes.push(n + '; left out.')));
  if (data.nets && typeof data.nets === 'object') for (const [name, refs] of Object.entries(data.nets)) groups.push(mk(typeof refs === 'string' || Array.isArray(refs) ? items(refs) : [], name, n => problems.push(n)));
  for (const p of parts) {
    if (p.pins && typeof p.pins === 'object' && !Array.isArray(p.pins)) {
      for (const [pin, net] of Object.entries(p.pins)) if (net) groups.push({ refs: [{ id: p.id, pin: String(pin) }], name: String(net) });
    }
  }
  const want = new Map(); // id -> pins named in the groups, in order of first appearance
  for (const g of groups) for (const r of g.refs) { if (!want.has(r.id)) want.set(r.id, []); if (!want.get(r.id).includes(r.pin)) want.get(r.id).push(r.pin); }

  // --- footprints ---
  const byId = new Map();
  const components = [];
  for (const p of parts) {
    const id = p.id;
    if (byId.has(id)) { problems.push(`Two parts are called ${id}`); continue; }
    const mine = want.get(id) || [];
    let foot, placeholder = false;
    if (Array.isArray(p.pins) && p.pins.every(pin => Array.isArray(pin?.offset))) {
      foot = { name: p.part || p.name || id, pins: p.pins, body: p.body, swap: p.swap, edge: p.edge };
    } else {
      const query = String(p.part || p.name || p.footprint || '');
      const r = lookupPart(query, lib, mine);
      const ok = r.part && mine.every(ref => findPin(r.part.pins, ref) >= 0);
      // library part: all named pins exist, or it is an exact hit (a missing pin is then left out below)
      if (r.part && (ok || (!p.brk && !r.guess))) {
        if (r.guess) notes.push(`${id}: no exact match for "${query}", using ${r.part.name}`);
        foot = r.part;
      } else {
        // not in the library (or not with these pins): a one-row header with the pins we know
        let names = p.brk;
        if (!names) { const seen = new Set(); names = mine.filter(x => !seen.has(pinKey(x)) && seen.add(pinKey(x))); }
        if (!names.length) names = ['1'];
        foot = { name: query || id, pins: names.map((label, i) => ({ offset: [0, i], label })) };
        placeholder = true;
        notes.push(`${id}: "${foot.name}" is not in the library, placed as a ${names.length}-pin header (${names.join(', ')}). Check the pin order, or replace it with a library part.`);
      }
    }
    const pins = foot.pins.map(pin => ({ offset: [pin.offset[0], pin.offset[1]], label: pin.label ?? '', net: pin.net || '' }));
    // "labels": the part's own pin names in pin order (a module on a plain pin header)
    if (Array.isArray(p.labels)) p.labels.slice(0, pins.length).forEach((l, k) => { if (l != null && l !== '') pins[k].label = String(l); });
    // a generic TO-92 / TO-220 with a known value: pins named by role (the numbers still work)
    if (!placeholder && !p.labels && pins.length === 3 && (foot.name === 'TO-92' || foot.name === 'Transistor TO-220')) {
      const roles = rolesFor(`${p.value ?? ''} ${p.part ?? p.name ?? ''}`);
      if (roles) roles.forEach((l, k) => { pins[k].label = l; });
    }
    const comp = {
      id,
      name: foot.name,
      value: String(p.value ?? foot.value ?? ''),
      pins,
      ...(foot.body ? { body: foot.body } : {}),
      ...(foot.swap ? { swap: foot.swap } : {}),
      ...(p.edge || foot.edge ? { edge: p.edge || foot.edge } : {}),
      ...(placeholder ? { placeholder: true } : {}),
    };
    byId.set(id, comp);
    components.push(comp);
  }

  // --- resolve every ref to a pin, merge groups that share a pin (union-find) ---
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => parent.set(find(a), find(b));
  const nodes = new Map(); // key -> { id, k, pin }
  const said = new Set();
  const named = []; // [name, key]
  const pinNet = new Map();
  for (const g of groups) {
    const keys = [];
    for (const r of g.refs) {
      const c = byId.get(r.id);
      if (!c) { if (!said.has(r.id)) { said.add(r.id); notes.push(`The connections name ${r.id}, but there is no part ${r.id}; those connections were left out.`); } continue; }
      const k = findPin(c.pins, r.pin);
      if (k < 0) {
        if (!said.has(r.id + '|' + r.pin)) { said.add(r.id + '|' + r.pin); notes.push(`${r.id} has no pin "${r.pin}" (pins: ${c.pins.map(q => q.label).join(', ')}); that connection was left out.`); }
        continue;
      }
      const key = r.id + '\0' + k;
      if (strict && g.name != null) {
        if (pinNet.has(key) && pinNet.get(key) !== g.name) { problems.push(`${r.id}.${r.pin} is in two nets: ${pinNet.get(key)} and ${g.name}`); continue; }
        pinNet.set(key, g.name);
      }
      if (!nodes.has(key)) { nodes.set(key, { id: r.id, k, pin: r.pin }); parent.set(key, key); }
      if (!keys.includes(key)) keys.push(key);
    }
    keys.forEach(k => union(keys[0], k));
    if (g.name != null && keys.length) named.push([g.name, keys[0]]);
  }
  const nameRoot = new Map(), firstOf = new Map(); // name -> first key, root -> name
  for (const [name, key] of named) { if (nameRoot.has(name)) union(nameRoot.get(name), key); else nameRoot.set(name, key); }
  for (const [name, key] of named) if (!firstOf.has(find(key))) firstOf.set(find(key), name);
  const members = new Map(); // root -> nodes
  for (const [key, n] of nodes) { const r = find(key); if (!members.has(r)) members.set(r, []); members.get(r).push(n); }
  const taken = new Set(firstOf.values());
  let counter = 1;
  const pickName = (list) => {
    let best = null;
    for (const n of list) {
      for (const l of [byId.get(n.id).pins[n.k].label, n.pin].flatMap(x => String(x ?? '').split('/'))) {
        const pw = powerName(l);
        if (pw && (!best || pw.rank < best.rank)) best = pw;
      }
    }
    if (best) return best.name;
    const top = list.reduce((a, n) => (byId.get(n.id).pins.length > byId.get(a.id).pins.length ? n : a));
    const l = String(byId.get(top.id).pins[top.k].label ?? '').split('/')[0].replace(/[^A-Za-z0-9_+.-]/g, '');
    return /[A-Za-z]/.test(l) ? l : null;
  };
  for (const [root, list] of members) {
    let name = firstOf.get(root);
    if (name == null) {
      if (list.length < 2) continue; // a lone pin in a connection is no net
      name = pickName(list);
      if (name == null) { while (taken.has('N' + counter)) counter++; name = 'N' + counter; } else if (taken.has(name)) { let i = 2; while (taken.has(`${name}_${i}`)) i++; name = `${name}_${i}`; }
      taken.add(name);
    }
    for (const n of list) byId.get(n.id).pins[n.k].net = name;
  }
  // a two-pin part with a loose end is almost always a mistake (a resistor that leads nowhere)
  for (const c of components) {
    if (c.pins.length === 2 && c.pins.some(q => q.net) && c.pins.some(q => !q.net)) {
      notes.push(`${c.id}: pin ${c.pins.find(q => !q.net).label} is not connected`);
    }
  }
  if (!components.length && !problems.length) problems.push('Nothing to load: no part could be read');
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
