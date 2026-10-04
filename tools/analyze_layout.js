import { readFileSync } from 'fs';
import { resolve } from 'path';
const path = process.argv[2];
if (!path) { console.error('Usage: node analyze_layout.js <path-to-json>'); process.exit(1); }
const data = JSON.parse(readFileSync(path.startsWith('/') ? path : resolve(process.cwd(), path), 'utf-8'));

const comps = data.components;
let minCol = Infinity, maxCol = -Infinity, minRow = Infinity, maxRow = -Infinity;
comps.forEach(c => {
    minCol = Math.min(minCol, c.ox);
    maxCol = Math.max(maxCol, c.ox + c.w - 1);
    minRow = Math.min(minRow, c.oy);
    maxRow = Math.max(maxRow, c.oy + c.h - 1);
});

console.log(`BB: cols [${minCol}..${maxCol}], rows [${minRow}..${maxRow}]`);
console.log(`BB size: ${maxCol - minCol + 1} x ${maxRow - minRow + 1} = ${(maxCol - minCol + 1) * (maxRow - minRow + 1)}`);
console.log();

console.log("Components:");
comps.forEach(c => {
    const nets = [...new Set(c.pins.map(p => p.net).filter(Boolean))];
    const right = c.ox + c.w - 1;
    const bottom = c.oy + c.h - 1;
    const tags = [];
    if (right === maxCol) tags.push("RIGHT");
    if (c.ox === minCol) tags.push("LEFT");
    if (c.oy === minRow) tags.push("TOP");
    if (bottom === maxRow) tags.push("BOTTOM");
    const boundary = tags.length ? ` [${tags.join('+')} BOUNDARY]` : "";
    console.log(`  ${c.id} (${c.w}x${c.h}) at (${c.ox},${c.oy})-(${right},${bottom}) nets: [${nets.join(', ')}]${boundary}`);
});

// Draw ASCII board
console.log("\nASCII Board:");
const grid = {};
comps.forEach(c => {
    for (let dc = 0; dc < c.w; dc++) {
        for (let dr = 0; dr < c.h; dr++) {
            const col = c.ox + dc;
            const row = c.oy + dr;
            grid[`${col},${row}`] = c.id.substring(0, 3).padEnd(3);
        }
    }
});
(data.wires || []).forEach(w => {
    if (w.path) w.path.forEach(pt => {
        const key = `${pt.col},${pt.row}`;
        if (!grid[key]) grid[key] = ` ${w.net.substring(0, 1)} `;
    });
});

for (let r = minRow - 1; r <= maxRow + 1; r++) {
    let line = `${String(r).padStart(3)}: `;
    for (let c = minCol - 1; c <= maxCol + 1; c++) {
        const key = `${c},${r}`;
        line += grid[key] || ' . ';
    }
    console.log(line);
}
let hdr = '     ';
for (let c = minCol - 1; c <= maxCol + 1; c++) {
    hdr += String(c).padStart(3);
}
console.log(hdr);

// Free cells
console.log("\n--- Free cells within BB ---");
const occupied = new Set();
comps.forEach(c => {
    for (let dc = 0; dc < c.w; dc++)
        for (let dr = 0; dr < c.h; dr++)
            occupied.add(`${c.ox + dc},${c.oy + dr}`);
});
let freeCells = [];
for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
        if (!occupied.has(`${c},${r}`)) freeCells.push({ col: c, row: r });
    }
}
console.log(`Free cells: ${freeCells.length}`);
freeCells.forEach(f => console.log(`  (${f.col}, ${f.row})`));

// Wire stats
console.log("\n--- Wire stats ---");
const wiresByNet = {};
(data.wires || []).forEach(w => {
    if (!wiresByNet[w.net]) wiresByNet[w.net] = { segments: 0, totalLen: 0, failed: 0 };
    wiresByNet[w.net].segments++;
    if (w.failed) wiresByNet[w.net].failed++;
    else wiresByNet[w.net].totalLen += (w.path ? w.path.length - 1 : 0);
});
let totalWL = 0;
for (const [net, info] of Object.entries(wiresByNet)) {
    totalWL += info.totalLen;
    console.log(`  ${net}: ${info.segments} segment(s), length ${info.totalLen}${info.failed ? ' [' + info.failed + ' FAILED]' : ''}`);
}
console.log(`Total wirelength: ${totalWL}`);
