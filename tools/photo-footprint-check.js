// Runs the photo -> footprint detection on a folder of test photos and prints what it found.
//   node tools/photo-footprint-check.js <dir> [--out <dir>]
// <dir> holds binary PPM files (P6; convert with any image tool, e.g.
// `python3 -c "from PIL import Image; Image.open('a.jpg').convert('RGB').save('a.ppm')"`)
// and optionally truth.json: { "<name>": { "rows": [15, 15], "gap": 6 } } -- pins per pin row
// and the distance between the outer rows in holes. With --out, an overlay of the detected grid
// and pins is written per photo (PPM).
import fs from 'node:fs';
import path from 'node:path';
import { detectFootprint } from '../src/engine/photo-footprint.js';

const args = process.argv.slice(2);
const dir = args[0];
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
if (!dir) { console.error('usage: node tools/photo-footprint-check.js <dir> [--out <dir>]'); process.exit(2); }
const truthFile = path.join(dir, 'truth.json');
const truth = fs.existsSync(truthFile) ? JSON.parse(fs.readFileSync(truthFile, 'utf8')) : {};

function readPPM(file) {
    const buf = fs.readFileSync(file);
    let pos = 0;
    const tok = () => {
        while (/\s/.test(String.fromCharCode(buf[pos])) || buf[pos] === 35) {
            if (buf[pos] === 35) while (buf[pos] !== 10) pos++;
            pos++;
        }
        let s = '';
        while (!/\s/.test(String.fromCharCode(buf[pos]))) s += String.fromCharCode(buf[pos++]);
        return s;
    };
    if (tok() !== 'P6') throw new Error('not a P6 PPM: ' + file);
    const width = +tok(), height = +tok();
    tok(); pos++;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        data[i * 4] = buf[pos + i * 3]; data[i * 4 + 1] = buf[pos + i * 3 + 1]; data[i * 4 + 2] = buf[pos + i * 3 + 2]; data[i * 4 + 3] = 255;
    }
    return { data, width, height };
}

function writeOverlay(res, file) {
    const { width: W, height: H } = res.image;
    const px = Buffer.alloc(W * H * 3);
    for (let i = 0; i < W * H; i++) for (let k = 0; k < 3; k++) px[i * 3 + k] = res.image.data[i * 4 + k];
    const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) { px[(y * W + x) * 3] = c[0]; px[(y * W + x) * 3 + 1] = c[1]; px[(y * W + x) * 3 + 2] = c[2]; } };
    const circle = (cx, cy, r, c) => { for (let a = 0; a < 360; a += 1) for (const d of [0, 1]) set(cx + (r + d) * Math.cos(a * Math.PI / 180), cy + (r + d) * Math.sin(a * Math.PI / 180), c); };
    if (res.pitch && res.body) {
        const b = res.body;
        for (let c = b.x - 1; c <= b.x + b.w; c++) for (let r = b.y - 1; r <= b.y + b.h; r++) {
            const x = res.phaseX + c * res.pitch, y = res.phaseY + r * res.pitch;
            for (let d = -2; d <= 2; d++) { set(x + d, y, [0, 220, 0]); set(x, y + d, [0, 220, 0]); }
        }
        const x0 = res.phaseX + (b.x - 0.5) * res.pitch, y0 = res.phaseY + (b.y - 0.5) * res.pitch;
        const x1 = x0 + b.w * res.pitch, y1 = y0 + b.h * res.pitch;
        for (let x = x0; x <= x1; x++) { set(x, y0, [0, 120, 255]); set(x, y1, [0, 120, 255]); }
        for (let y = y0; y <= y1; y++) { set(x0, y, [0, 120, 255]); set(x1, y, [0, 120, 255]); }
        for (const [c, r] of res.pins) circle(res.phaseX + c * res.pitch, res.phaseY + r * res.pitch, res.pitch * 0.35, [255, 0, 0]);
    }
    fs.writeFileSync(file, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), px]));
}

const files = fs.readdirSync(dir).filter(f => f.endsWith('.ppm')).sort();
let pass = 0, checked = 0;
for (const f of files) {
    const name = f.replace(/\.ppm$/, '');
    const t0 = performance.now();
    const res = detectFootprint(readPPM(path.join(dir, f)));
    const ms = Math.round(performance.now() - t0);
    const byRow = new Map();
    for (const [, r] of res.pins || []) byRow.set(r, (byRow.get(r) || 0) + 1);
    const rowsSorted = [...byRow.keys()].sort((a, b) => a - b);
    // pin rows = rows with at least 3 pins
    const lineRows = rowsSorted.filter(r => byRow.get(r) >= 3);
    const rows = lineRows.map(r => byRow.get(r));
    const gap = lineRows.length > 1 ? lineRows[lineRows.length - 1] - lineRows[0] : 0;
    const mm = res.pitch ? [(res.bodyPx.x1 - res.bodyPx.x0) / res.pitch * 2.54, (res.bodyPx.y1 - res.bodyPx.y0) / res.pitch * 2.54].map(v => v.toFixed(1)).join('x') : '-';
    let verdict = '';
    if (truth[name]) {
        checked++;
        const ok = JSON.stringify(rows) === JSON.stringify(truth[name].rows) && gap === truth[name].gap;
        if (ok) pass++;
        verdict = ok ? 'OK  ' : `FAIL (want ${JSON.stringify(truth[name].rows)} gap ${truth[name].gap})`;
    }
    console.log(`${name.padEnd(16)} ${res.ok ? '' : 'no result: ' + res.reason} pins ${String(res.pins?.length ?? 0).padStart(3)}  rows ${JSON.stringify(rows).padEnd(12)} gap ${String(gap).padStart(2)}  body ${res.body ? res.body.w + 'x' + res.body.h : '-'} holes (${mm} mm)  pitch ${res.pitch?.toFixed(2) ?? '-'}px  ${ms}ms  ${verdict}`);
    if (outDir && res.image) { fs.mkdirSync(outDir, { recursive: true }); writeOverlay(res, path.join(outDir, name + '.ppm')); }
}
if (checked) console.log(`\n${pass}/${checked} match the expected pin rows`);
