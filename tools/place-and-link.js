// Put parts where you say, wire them without moving anything, print a share link.
// For rebuilding a layout seen on a screenshot, or hand-tweaking one, without clicking.
//
//   node tools/place-and-link.js <source>                     # print the source's positions (a starting point)
//   node tools/place-and-link.js <source> <positions.json> [--origin http://localhost:5197]
//
// <source>: a share link, a file holding one, or a circuit JSON (the parts' footprints and nets).
// positions.json: { "U1": { "at": [col, row], "turn": 2 }, "J1": { "at": [0, 10], "swap": true }, ... }
//   at    hole of the part's top-left corner (bounding box after turning), y down
//   turn  quarter turns clockwise from the source's orientation (0-3)
//   swap  exchange the pins' holes (reverses the pin order; for interchangeable 2-pin parts)
//   Short form: "U1": [4, 5, 2] or [0, 10, 0, "swap"]. Parts left out keep the source position.
// Wiring uses the solver's router at fixed placement (as after an editor change); exits 1 if the
// parts overlap or a net can't be connected.
import { readFileSync, existsSync } from 'node:fs';
import { decodeShare, encodeShare } from '../src/engine/share.js';
import { processTemplate } from '../src/engine/templates.js';
import { makeComp } from '../src/engine/initial-placement.js';
import { rotateComp90InPlace, moveComp } from '../src/engine/placer.js';
import { routeFixed } from '../src/engine/engine.js';
import { netCompletion } from '../src/engine/net-completion.js';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i < 0 ? def : args.splice(i, 2)[1]; };
const origin = opt('--origin', 'https://boardroute.com');
const [src, posFile] = args;
if (!src) { console.error('usage: node tools/place-and-link.js <link|file> [positions.json] [--origin URL]'); process.exit(2); }

const text = existsSync(src) ? readFileSync(src, 'utf-8').trim() : src;
let components;
if (text.includes('#b=')) components = (await decodeShare(text.split('#b=')[1])).components;
else components = processTemplate(JSON.parse(text)).map((d, i) => makeComp(d, 0, i * 20));
const x0 = Math.min(...components.map(c => c.ox)), y0 = Math.min(...components.map(c => c.oy));
for (const c of components) moveComp(c, c.ox - x0, c.oy - y0);

if (!posFile) {
    console.log('{\n' + components.map(c => `  "${c.id}": { "at": [${c.ox}, ${c.oy}], "turn": 0 }`).join(',\n') + '\n}');
    process.exit(0);
}

const positions = JSON.parse(readFileSync(posFile, 'utf-8'));
for (const [id, p] of Object.entries(positions)) {
    const c = components.find(k => k.id === id);
    if (!c) { console.error(`no part ${id}`); process.exit(2); }
    const { at, turn = 0, swap = false } = Array.isArray(p) ? { at: p.slice(0, 2), turn: p[2], swap: p[3] === 'swap' } : p;
    if (swap) {
        const offs = c.pins.map(q => [q.dCol, q.dRow]).reverse();
        c.pins.forEach((q, i) => { [q.dCol, q.dRow] = offs[i]; });
    }
    for (let t = 0; t < ((turn % 4) + 4) % 4; t++) rotateComp90InPlace(c);
    moveComp(c, at[0], at[1]);
}

// map of the placement: part id letters, pins as the id's first letter in lower case
const W = Math.max(...components.map(c => c.ox + c.w)), H = Math.max(...components.map(c => c.oy + c.h));
const grid = Array.from({ length: H }, () => Array(W).fill('.'));
const clash = new Set();
for (const c of components) {
    const ch = c.id[0] + (c.id[1] || '');
    for (let y = c.oy; y < c.oy + c.h; y++) for (let x = c.ox; x < c.ox + c.w; x++) {
        if (grid[y][x] !== '.') clash.add(`${c.id} at ${x},${y}`);
        grid[y][x] = ch[0];
    }
    for (const q of c.pins) grid[q.row][q.col] = q.net ? 'o' : ':';
}
console.error(`${W} x ${H} holes\n` + grid.map(r => r.join(' ')).join('\n'));
if (clash.size) { console.error('overlap:', [...clash].join(', ')); process.exit(1); }

const wires = routeFixed(components);
if (!wires) { console.error('could not wire every net at these positions'); process.exit(1); }
const nc = netCompletion(components, wires);
console.error(`${nc.done}/${nc.total} connections, ${wires.length} wires`);
for (const c of components) {
    if (!(c.edge >= 0)) continue;
    const ok = [c.oy === 0, c.ox + c.w === W, c.oy + c.h === H, c.ox === 0][c.edge];
    if (!ok) console.error(`note: ${c.id}'s cable side (${['top', 'right', 'bottom', 'left'][c.edge]}) is not on the board edge`);
}
console.log(origin + '/#b=' + await encodeShare(components, wires));
