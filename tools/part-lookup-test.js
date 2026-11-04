// node tools/part-lookup-test.js -- checks of the short AI formats (src/engine/part-lookup.js)
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';
import { resolveCircuit, indexPart, isShortCircuit, parsePartString, findPin } from '../src/engine/part-lookup.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf-8'));
const lib = [
  ...read(path.join(root, 'public/component_database.json')).map(c => indexPart(c, 'curated')),
  ...read(path.join(root, 'public/kicad_library.json')).parts.map(c => indexPart(c, 'kicad')),
];
const comp = (r, id) => r.components.find(c => c.id === id);
const netOf = (r, id, label) => comp(r, id).pins.find(p => p.label === label)?.net;
const cases = [];
const test = (name, fn) => cases.push([name, fn]);

test('example: new format with a custom module', () => {
  const data = {
    parts: {
      U1: 'Wemos D1 Mini', R1: 'resistor, 220', D1: 'LED, red', J1: 'screw terminal 2, 12V in',
      U2: 'MP1584 buck module (IN+, IN-, OUT+, OUT-)',
    },
    connections: [['U1.D5', 'R1.1'], ['R1.2', 'D1.A'], ['U1.GND', 'D1.K', 'J1.2', 'U2.IN-', 'U2.OUT-']],
  };
  assert(isShortCircuit(data));
  const r = resolveCircuit(data, lib);
  assert.deepStrictEqual(r.problems, []);
  const u2 = comp(r, 'U2');
  assert.strictEqual(u2.placeholder, true);
  assert.deepStrictEqual(u2.pins.map(p => p.label), ['IN+', 'IN-', 'OUT+', 'OUT-']);
  assert.strictEqual(u2.name, 'MP1584 buck module');
  assert(r.notes.includes('U2: "MP1584 buck module" is not in the library, placed as a 4-pin header (IN+, IN-, OUT+, OUT-). Check the pin order, or replace it with a library part.'));
  const gnd = r.components.flatMap(c => c.pins).filter(p => p.net === 'GND');
  assert.strictEqual(gnd.length, 5);
  assert.strictEqual(netOf(r, 'R1', '1'), 'D5');
  assert.strictEqual(netOf(r, 'U1', 'D5'), 'D5');
  assert.strictEqual(comp(r, 'R1').value, '220');
  assert.strictEqual(comp(r, 'D1').value, 'red');
  assert.strictEqual(comp(r, 'J1').value, '12V in');
  assert.strictEqual(comp(r, 'J1').name, 'Screw terminal 2P');
  assert(!comp(r, 'U1').placeholder);
});

test('part strings', () => {
  const p = (s) => { const { part, value, brk } = parsePartString(s, lib); return [part, value, brk]; };
  assert.deepStrictEqual(p('resistor 220'), ['resistor', '220', null]);
  assert.deepStrictEqual(p('LED red'), ['LED', 'red', null]);
  assert.deepStrictEqual(p('capacitor 100nF'), ['capacitor', '100nF', null]);
  assert.deepStrictEqual(p('DIP-8 NE555'), ['DIP-8', 'NE555', null]);
  assert.deepStrictEqual(p('electrolytic capacitor 10uF'), ['electrolytic', '10uF', null]);
  assert.deepStrictEqual(p('Wemos D1 Mini'), ['Wemos D1 Mini', '', null]);
  assert.deepStrictEqual(p('relay module (VCC, GND, IN), 5V'), ['relay module', '5V', ['VCC', 'GND', 'IN']]);
  assert.deepStrictEqual(p('relay module, 5V (VCC, GND, IN)'), ['relay module', '5V', ['VCC', 'GND', 'IN']]);
});

test('object value with pins list', () => {
  const r = resolveCircuit({ parts: { M1: { part: 'Foo module', value: 'x', pins: ['A', 'B'] }, R1: 'resistor, 1k' }, connections: [['M1.A', 'R1.1']] }, lib);
  assert.deepStrictEqual(r.problems, []);
  assert.strictEqual(comp(r, 'M1').placeholder, true);
  assert.strictEqual(comp(r, 'M1').value, 'x');
  assert.strictEqual(comp(r, 'M1').pins.length, 2);
});

test('resistor 220 without comma', () => {
  const r = resolveCircuit({ parts: { R1: 'resistor 220', R2: 'resistor, 1k' }, connections: [['R1.2', 'R2.1']] }, lib);
  assert.strictEqual(comp(r, 'R1').name, 'Resistor');
  assert.strictEqual(comp(r, 'R1').value, '220');
  assert(!comp(r, 'R1').placeholder);
});

test('groups sharing a pin merge, also through pin aliases', () => {
  const r = resolveCircuit({
    parts: { U1: 'Wemos D1 Mini', D1: 'LED', R1: 'resistor, 1k', R2: 'resistor, 1k', R3: 'resistor, 1k' },
    connections: [['R1.1', 'R2.1'], ['R2.1', 'R3.1'], ['D1.K', 'R1.2'], ['D1.CATHODE', 'R2.2'], ['D1.K', 'U1.GND']],
  }, lib);
  assert.deepStrictEqual(r.problems, []);
  assert.strictEqual(netOf(r, 'R1', '1'), netOf(r, 'R3', '1'));
  assert.strictEqual(netOf(r, 'R1', '2'), 'GND');
  assert.strictEqual(netOf(r, 'R2', '2'), 'GND');
  // a named net joins the group, and so do strings with separators
  const r2 = resolveCircuit({
    parts: { R1: 'resistor, 1k', R2: 'resistor, 1k' },
    connections: ['R1.2 - R2.1', 'R2.1 -> R1.2, R2.2'],
    nets: { OUT: ['R1.2'] },
  }, lib);
  assert.strictEqual(netOf(r2, 'R1', '2'), 'OUT');
  assert.strictEqual(netOf(r2, 'R2', '2'), 'OUT');
  assert.strictEqual(netOf(r2, 'R2', '1'), 'OUT');
});

test('unknown part without bracket: header of the referenced pins', () => {
  const r = resolveCircuit({ parts: { X1: 'Zorblax 9000', R1: 'resistor, 1k' }, connections: [['X1.VIN', 'R1.1'], ['X1.OUT', 'R1.2'], ['X1.VIN', 'X1.OUT']] }, lib);
  assert.deepStrictEqual(r.problems, []);
  const x = comp(r, 'X1');
  assert.strictEqual(x.placeholder, true);
  assert.deepStrictEqual(x.pins.map(p => p.label), ['VIN', 'OUT']);
  assert(r.notes.some(n => n.startsWith('X1: "Zorblax 9000" is not in the library, placed as a 2-pin header (VIN, OUT).')));
});

test('known part, missing pin: left out with a note', () => {
  const r = resolveCircuit({ parts: { U1: 'Wemos D1 Mini', R1: 'resistor, 1k' }, connections: [['U1.D9', 'R1.1'], ['U1.D5', 'R1.2']] }, lib);
  assert.deepStrictEqual(r.problems, []);
  assert(r.notes.some(n => n.startsWith('U1 has no pin "D9" (pins: ') && n.endsWith('; that connection was left out.')));
  assert.strictEqual(netOf(r, 'R1', '2'), 'D5');
  assert(!comp(r, 'R1').pins[0].net);
  assert(!comp(r, 'U1').placeholder);
});

test('connection naming an unknown part id', () => {
  const r = resolveCircuit({ parts: { R1: 'resistor, 1k', R2: 'resistor, 1k' }, connections: [['R1.1', 'R2.1', 'Q9.1']] }, lib);
  assert.deepStrictEqual(r.problems, []);
  assert(r.notes.some(n => n.includes('Q9')));
  assert.strictEqual(netOf(r, 'R1', '1'), netOf(r, 'R2', '1'));
});

test('old format: unknown part becomes a placeholder, pin in two nets stays a problem', () => {
  const r = resolveCircuit({ parts: [{ id: 'R1', part: 'resistor', value: '1k' }, { id: 'X1', part: 'Zorblax' }], nets: { A: ['R1.1', 'X1.IN'], B: ['R1.2'] } }, lib);
  assert.deepStrictEqual(r.problems, []);
  assert.strictEqual(comp(r, 'X1').placeholder, true);
  assert.strictEqual(netOf(r, 'R1', '1'), 'A');
  assert.strictEqual(netOf(r, 'X1', 'IN'), 'A');
  const r2 = resolveCircuit({ parts: [{ id: 'R1', part: 'resistor' }], nets: { A: ['R1.1'], B: ['R1.1'] } }, lib);
  assert(r2.problems.some(p => p.includes('is in two nets')));
  // in connections the same thing just merges
  const r3 = resolveCircuit({ parts: { R1: 'resistor', R2: 'resistor', R3: 'resistor' }, connections: [['R1.1', 'R2.1'], ['R1.1', 'R3.1']] }, lib);
  assert.deepStrictEqual(r3.problems, []);
  assert.strictEqual(netOf(r3, 'R3', '1'), netOf(r3, 'R2', '1'));
});

test('hard problems only for unusable input', () => {
  assert(resolveCircuit({ parts: [] }, lib).problems.length);
  assert(resolveCircuit({ parts: 'x' }, lib).problems.length);
  assert(resolveCircuit({ parts: {} }, lib).problems.length);
  assert(resolveCircuit({ parts: [{ id: 'R1', part: 'resistor' }, { id: 'R1', part: 'resistor' }] }, lib).problems.some(p => p.includes('Two parts')));
});

test('net names are unique', () => {
  const r = resolveCircuit({
    parts: { U1: 'Wemos D1 Mini', R1: 'resistor, 1k', R2: 'resistor, 1k', R3: 'resistor, 1k', R4: 'resistor, 1k' },
    connections: [['U1.GND', 'R1.1'], ['R1.2', 'R2.1'], ['R3.1', 'R4.1'], ['R3.2', 'R4.2']],
  }, lib);
  const names = new Set(r.components.flatMap(c => c.pins.map(p => p.net)).filter(Boolean));
  assert.strictEqual(names.size, 4); // GND, N1, N2, N3
});

test('old-format files in tools/part-lookup resolve without problems', () => {
  const dir = path.join(root, 'tools/part-lookup');
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
    const r = resolveCircuit(read(path.join(dir, f)), lib);
    assert.deepStrictEqual(r.problems, [], f);
    assert(r.components.every(c => !c.placeholder), f);
  }
});

test('findPin: D26 finds the plain-number label, exact labels still win', () => {
  const esp = { pins: [{ label: '25' }, { label: '26' }, { label: 'GND' }] };
  assert.strictEqual(findPin(esp.pins, 'D26'), 1);
  assert.strictEqual(findPin([{ label: 'D5' }, { label: '5' }], 'D5'), 0);
  assert.strictEqual(findPin([{ label: 'D0/RX' }, { label: 'D1/TX' }], 'D1'), 1);
  const r = resolveCircuit({ parts: { U1: 'ESP32 DevKit V1', R1: 'resistor, 1k' }, connections: [['U1.D26', 'R1.1']] }, lib);
  assert(!r.notes.some(n => /left out/.test(n)), r.notes.join('\n'));
});

test('TO-92 / TO-220 pin roles by value', () => {
  const roles = (part) => resolveCircuit({ parts: { Q1: part }, connections: [] }, lib).components[0].pins.map(p => p.label).join(' ');
  assert.strictEqual(roles('TO-220, 7805'), 'IN GND OUT');
  assert.strictEqual(roles('TO-220, 7905'), 'GND IN OUT');
  assert.strictEqual(roles('TO-220, LM317'), 'ADJ OUT IN');
  assert.strictEqual(roles('TO-220, AMS1117'), 'ADJ OUT IN');
  assert.strictEqual(roles('TO-220, IRLZ44N'), 'G D S');
  assert.strictEqual(roles('TO-220, IRF540'), 'G D S');
  assert.strictEqual(roles('TO-220, TIP120'), 'B C E');
  assert.strictEqual(roles('TO-92, BC547'), 'C B E');
  assert.strictEqual(roles('TO-92, 2N3904'), 'E B C');
  assert.strictEqual(roles('TO-92, 2N7000'), 'S G D');
  assert.strictEqual(roles('TO-92'), '1 2 3');
  // roles and numbers both resolve
  const r = resolveCircuit({ parts: { U1: 'TO-220, 7805', R1: 'resistor', R2: 'resistor' }, connections: [['U1.IN', 'R1.1'], ['U1.1', 'R2.1'], ['U1.3', 'R2.2'], ['U1.OUT', 'R1.2']] }, lib);
  assert.deepStrictEqual(r.notes.filter(n => /left out/.test(n)), []);
  assert.strictEqual(netOf(r, 'R1', '1'), netOf(r, 'R2', '1'));
  assert.strictEqual(netOf(r, 'R1', '2'), netOf(r, 'R2', '2'));
});

let failed = 0;
for (const [name, fn] of cases) {
  try { fn(); console.log('ok   ', name); } catch (e) { failed++; console.log('FAIL ', name, '\n', e.message); }
}
console.log(`${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
