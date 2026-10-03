/* global process, Buffer */
// Round trip of the share-link codec (src/engine/share.js) over every example circuit's preview
// layout: encode -> decode must give back identical parts (positions, footprint, pins) and wires.
//   node tools/share-roundtrip.js
import { readFileSync } from 'node:fs';
import { encodeShare, decodeShare, ShareError } from '../src/engine/share.js';
import { processTemplate } from '../src/engine/templates.js';
import { makeComp } from '../src/engine/initial-placement.js';
import { rotateComp90InPlace, moveComp } from '../src/engine/placer.js';

const examples = JSON.parse(readFileSync(new URL('../public/examples.json', import.meta.url)));
let failures = 0;
const fail = (msg) => { failures++; console.log('  FAIL', msg); };

const normComp = (c) => JSON.stringify({
  id: c.id, name: c.name || '', value: c.value || '', color: c.color || null, routeUnder: c.routeUnder !== false,
  w: c.w, h: c.h, ox: c.ox, oy: c.oy,
  pins: c.pins.map(p => [p.dCol, p.dRow, p.col, p.row, p.net || '', p.lbl ?? '']),
});
const normWire = (w) => JSON.stringify({ net: w.net, jumper: !!w.jumper, failed: !!w.failed, path: w.path.map(p => [p.col, p.row]) });

async function check(label, components, wires) {
  const lens = {};
  for (const compress of [true, false]) {
    const v = await encodeShare(components, wires, { compress });
    lens[compress ? 'deflate' : 'plain'] = v.length;
    const back = await decodeShare(v);
    if (back.components.length !== components.length) fail(`${label}: part count`);
    components.forEach((c, i) => { if (normComp(c) !== normComp(back.components[i])) fail(`${label}: part ${c.id} differs`); });
    if (back.wires.length !== wires.length) fail(`${label}: wire count ${back.wires.length} vs ${wires.length}`);
    wires.forEach((w, i) => { if (normWire(w) !== normWire(back.wires[i])) fail(`${label}: wire ${i} (${w.net}) differs`); });
  }
  return lens;
}

console.log('example            parts wires jumpers  link (#b=...) deflate / plain');
const lengths = [];
for (const ex of examples) {
  const { components, wires } = ex.preview;
  const lens = await check(ex.id, components, wires);
  lengths.push(lens.deflate);
  console.log(`${ex.id.padEnd(18)} ${String(components.length).padStart(5)} ${String(wires.length).padStart(5)} ${String(wires.filter(w => w.jumper).length).padStart(7)}  ${String(lens.deflate).padStart(13)} / ${lens.plain}`);
}

// Rotated parts, colours, routeUnder:false, a failed wire, unconnected pin, negative coordinates.
{
  const defs = processTemplate(examples[0].circuit);
  const comps = defs.map((d, i) => {
    const c = makeComp(d, 0, 0);
    for (let r = 0; r < i % 4; r++) rotateComp90InPlace(c);
    moveComp(c, -500000 + i * 9, 499990 - i * 3);
    return c;
  });
  comps[0].color = '#ff8800'; comps[1].routeUnder = false; comps[2].pins[0].net = '';
  comps[3].name = 'Relais "groß" ✓';
  const wires = [
    { net: 'VCC', failed: false, path: [{ col: comps[0].pins[0].col, row: comps[0].pins[0].row }, { col: comps[0].pins[0].col + 1, row: comps[0].pins[0].row }, { col: comps[0].pins[0].col + 1, row: comps[0].pins[0].row + 3 }] },
    { net: 'GND', failed: true, path: [{ col: 1, row: 1 }, { col: 2, row: 1 }] },
    { net: 'GATE', failed: false, jumper: true, path: [{ col: 3, row: 2 }, { col: 3, row: -2 }] },
  ];
  await check('synthetic', comps, wires);
  console.log('synthetic (rotations, colour, routeUnder:false, failed + jumper wire, non-unit step, unicode): checked');
}

// Damaged links must fail with a ShareError, never with something else.
const good = await encodeShare(examples[0].preview.components, examples[0].preview.wires);
const bad = ['', '1', '2dAAAA', '1x' + good.slice(2), good.slice(0, Math.floor(good.length / 2)), good.slice(0, -3) + 'zzz', '1d$$$$', '1u' + Buffer.from('{"c":[["A","","",1,1,0,0,[5,5,0,"x"]]],"n":[]}').toString('base64url'), '1u' + Buffer.from('null').toString('base64url')];
for (const b of bad) {
  try { await decodeShare(b); fail(`damaged link accepted: ${b.slice(0, 30)}`); }
  catch (e) { if (!(e instanceof ShareError)) fail(`damaged link threw ${e.constructor.name}: ${e.message}`); }
}
console.log(`damaged links rejected with ShareError: ${bad.length} cases`);

lengths.sort((a, b) => a - b);
console.log(`link payload length: min ${lengths[0]}, median ${lengths[Math.floor(lengths.length / 2)]}, max ${lengths[lengths.length - 1]} characters (plus "https://boardroute.com/#b=")`);
console.log(failures ? `${failures} FAILURES` : 'all round trips identical');
process.exit(failures ? 1 : 0);
