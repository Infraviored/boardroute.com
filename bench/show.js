// ASCII view of a saved layout (bench/best/<circuit>.json or any worker --save output).
//   node bench/show.js 04_blinker555          (looks in bench/best/)
//   node bench/show.js path/to/layout.json
// Pins print as the net's letter in upper case, wires in lower case; '#' is an unconnected
// pin, '·' a part body without pin, '.' an empty hole.
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { validateLayout } from './validate.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const arg = process.argv[2];
const file = existsSync(arg) ? arg : join(DIR, 'best', `${arg}.json`);
const { components, wires } = JSON.parse(readFileSync(file, 'utf-8'));

const nets = [...new Set(components.flatMap(c => c.pins.map(p => p.net)).filter(Boolean))].sort();
const sym = new Map(nets.map((n, i) => [n, 'abcdefghijklmnopqrstuvwxyz0123456789'[i] || '?']));

const cells = new Map();
const put = (c, r, ch) => cells.set(`${c},${r}`, ch);
for (const c of components) for (let dc = 0; dc < c.w; dc++) for (let dr = 0; dr < c.h; dr++) put(c.ox + dc, c.oy + dr, '·');
for (const w of wires) if (!w.failed) for (const p of w.path) put(p.col, p.row, sym.get(w.net));
for (const c of components) for (const p of c.pins) put(c.ox + p.dCol, c.oy + p.dRow, p.net ? sym.get(p.net).toUpperCase() : '#');

const keys = [...cells.keys()].map(k => k.split(',').map(Number));
const minC = Math.min(...keys.map(k => k[0])), maxC = Math.max(...keys.map(k => k[0]));
const minR = Math.min(...keys.map(k => k[1])), maxR = Math.max(...keys.map(k => k[1]));
for (let r = minR; r <= maxR; r++) {
    let line = '';
    for (let c = minC; c <= maxC; c++) line += (cells.get(`${c},${r}`) || '.') + ' ';
    console.log(line);
}
const v = validateLayout(components, wires);
console.log(`\n${v.width}x${v.height} = ${v.area} holes, wire length ${v.wl}, ${v.routed ? 'fully routed' : 'NOT routed'}${v.valid ? '' : ' INVALID: ' + v.errors.join('; ')}`);
console.log('nets: ' + nets.map(n => `${sym.get(n).toUpperCase()}=${n}`).join('  '));
console.log('parts: ' + components.map(c => `${c.id}@(${c.ox - minC},${c.oy - minR})`).join(' '));
