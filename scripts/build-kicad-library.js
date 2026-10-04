// Builds public/kicad_library.json from the official KiCad footprint libraries
// (https://gitlab.com/kicad/libraries/kicad-footprints, mirrored at github.com/KiCad/kicad-footprints;
// CC-BY-SA 4.0 with an exception that allows using the footprints in your own designs).
//
// Only through-hole footprints whose pads all sit on the 0.1" (2.54 mm) perfboard grid make it in.
// The KiCad sources are fetched into a temp directory (sparse, shallow git clone) and never
// committed.
//
//   node scripts/build-kicad-library.js                 fetch + build
//   node scripts/build-kicad-library.js --src <dir>     use an existing kicad-footprints checkout
//   node scripts/build-kicad-library.js --keep          keep the temp checkout (prints its path)
//   node scripts/build-kicad-library.js --stats         per-library counts and skip reasons
//
// Output entries use the same format as public/component_database.json:
//   { name, value, pins: [{ offset: [col, row], label }], body?: { offset, size }, category, source, desc?, aka? }
// `aka` lists other KiCad footprints that land on exactly the same holes (kept for search).
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdtempSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'kicad_library.json');
const REPO = 'https://gitlab.com/kicad/libraries/kicad-footprints.git';

const PITCH = 2.54;
const GRID_TOL = 0.15;   // mm a pad may be off the 2.54 grid (relative to pad 1)
const LEAD_TOL = 0.25;   // ... for two-pad parts, whose wire leads bend that far without noticing (HC-49 crystal: 4.88 mm)
const BODY_REACH = 0.5;  // a hole counts as covered when the body reaches within this many mm of its centre
const MAX_PINS = 40;     // larger footprints only from BIG_OK libraries
const BIG_OK = new Set(['Package_DIP', 'Connector_PinHeader_2.54mm', 'Connector_PinSocket_2.54mm', 'Connector_IDC', 'Module']);

// library -> category shown in the Library dialog. Order = order in the output.
const LIBS = {
    Package_DIP: 'ICs (DIP)',
    Package_SIP: 'ICs (SIP)',
    Package_TO_SOT_THT: 'Transistors & regulators',
    Resistor_THT: 'Resistors',
    Potentiometer_THT: 'Potentiometers',
    Capacitor_THT: 'Capacitors',
    Diode_THT: 'Diodes',
    LED_THT: 'LEDs',
    Display_7Segment: 'Displays',
    Display: 'Displays',
    OptoDevice: 'Opto',
    Crystal: 'Crystals & oscillators',
    Oscillator: 'Crystals & oscillators',
    Inductor_THT: 'Inductors & transformers',
    Transformer_THT: 'Inductors & transformers',
    Relay_THT: 'Relays',
    Button_Switch_THT: 'Switches & buttons',
    Rotary_Encoder: 'Switches & buttons',
    Buzzer_Beeper: 'Buzzers',
    Fuse: 'Fuses & protection',
    Varistor: 'Fuses & protection',
    'Connector_PinHeader_2.54mm': 'Headers & sockets',
    'Connector_PinSocket_2.54mm': 'Headers & sockets',
    Connector_IDC: 'Headers & sockets',
    Socket: 'Headers & sockets',
    TerminalBlock: 'Terminal blocks',
    TerminalBlock_Phoenix: 'Terminal blocks',
    Connector_JST: 'Connectors',
    Connector_Molex: 'Connectors',
    Connector_BarrelJack: 'Connectors',
    Battery: 'Power',
    Converter_DCDC: 'Power',
    Module: 'Modules & dev boards',
    RF_Module: 'Modules & dev boards',
    Sensor: 'Sensors',
};

// footprint names to drop outright (variants that never matter on perfboard)
const SKIP_NAME = /(SMD|_SMDSocket|Pad[0-9.]+x[0-9.]+mm_Drill|MountingHole|_Sandwich|TestPoint|Kelvin)/;

// ---------------------------------------------------------------- s-expressions
function parseSexp(src) {
    let i = 0;
    const n = src.length;
    function next() {
        while (i < n) {
            const ch = src[i];
            if (ch === '(') { i++; const list = []; for (;;) { const v = next(); if (v === CLOSE) return list; if (v === EOF) return list; list.push(v); } }
            if (ch === ')') { i++; return CLOSE; }
            if (ch === '"') {
                let s = ''; i++;
                while (i < n && src[i] !== '"') { if (src[i] === '\\') i++; s += src[i++]; }
                i++; return s;
            }
            if (/\s/.test(ch)) { i++; continue; }
            let s = '';
            while (i < n && !/[\s()]/.test(src[i])) s += src[i++];
            return s;
        }
        return EOF;
    }
    const CLOSE = Symbol('close'), EOF = Symbol('eof');
    return next();
}
const kids = (node, head) => node.filter(x => Array.isArray(x) && x[0] === head);
const kid = (node, head) => node.find(x => Array.isArray(x) && x[0] === head);
const num = (v) => Number(v);

// ---------------------------------------------------------------- footprint -> part
function graphicsBox(fp, layer) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    for (const g of fp) {
        if (!Array.isArray(g) || !/^fp_(line|rect|circle|arc|poly)$/.test(g[0])) continue;
        const l = kid(g, 'layer');
        if (!l || l[1] !== layer) continue;
        if (g[0] === 'fp_circle') {
            const c = kid(g, 'center'), e = kid(g, 'end');
            const r = Math.hypot(num(e[1]) - num(c[1]), num(e[2]) - num(c[2]));
            add(num(c[1]) - r, num(c[2]) - r); add(num(c[1]) + r, num(c[2]) + r);
        } else if (g[0] === 'fp_poly') {
            const pts = kid(g, 'pts');
            for (const p of kids(pts, 'xy')) add(num(p[1]), num(p[2]));
        } else {
            for (const k of ['start', 'mid', 'end']) { const p = kid(g, k); if (p) add(num(p[1]), num(p[2])); }
        }
    }
    return x0 <= x1 ? { x0, y0, x1, y1 } : null;
}

// Returns { part } or { skip: reason }.
function convert(lib, file, src) {
    const fp = parseSexp(src);
    const name = fp[1];
    if (SKIP_NAME.test(name)) return { skip: 'variant' };
    const attr = kid(fp, 'attr');
    if (attr && attr.includes('smd')) return { skip: 'smd' };
    const pads = [];
    for (const p of kids(fp, 'pad')) {
        const [, number, type] = p;
        if (type === 'smd' || type === 'connect') continue;
        if (type !== 'thru_hole') continue;           // np_thru_hole = mechanical/mounting
        if (number === '') continue;                   // unnumbered copper holes = mechanical
        const at = kid(p, 'at');
        pads.push({ number, x: num(at[1]), y: num(at[2]) });
    }
    if (pads.length === 0) return { skip: 'smd' };
    if (kids(fp, 'pad').some(p => p[2] === 'smd')) return { skip: 'smd' };
    if (pads.length < 2) return { skip: 'single pad' };
    if (pads.length > MAX_PINS && !BIG_OK.has(lib)) return { skip: 'too many pins' };

    // pads with the same number at the same spot (e.g. thermal vias) count once
    const seen = new Set();
    const uniq = pads.filter(p => { const k = `${p.number}@${p.x.toFixed(3)},${p.y.toFixed(3)}`; if (seen.has(k)) return false; seen.add(k); return true; });

    const ref = uniq.find(p => p.number === '1') || uniq[0];
    const pins = [];
    const holes = new Set();
    const tol = uniq.length === 2 ? LEAD_TOL : GRID_TOL;
    for (const p of uniq) {
        const dx = p.x - ref.x, dy = p.y - ref.y;
        const c = Math.round(dx / PITCH), r = Math.round(dy / PITCH);
        if (Math.abs(dx - c * PITCH) > tol || Math.abs(dy - r * PITCH) > tol) return { skip: 'off grid' };
        const k = c + ',' + r;
        if (holes.has(k)) continue; // two pads in one hole (e.g. tight footprints): keep the first
        holes.add(k);
        pins.push({ offset: [c, r], label: p.number });
    }
    if (pins.length < 2) return { skip: 'single pad' };

    // body: fab outline, else courtyard minus its usual 0.25 mm clearance
    let box = graphicsBox(fp, 'F.Fab');
    if (!box) { box = graphicsBox(fp, 'F.CrtYd'); if (box) box = { x0: box.x0 + 0.25, y0: box.y0 + 0.25, x1: box.x1 - 0.25, y1: box.y1 - 0.25 }; }
    let body;
    if (box) {
        const c0 = Math.ceil((box.x0 - ref.x - BODY_REACH) / PITCH), c1 = Math.floor((box.x1 - ref.x + BODY_REACH) / PITCH);
        const r0 = Math.ceil((box.y0 - ref.y - BODY_REACH) / PITCH), r1 = Math.floor((box.y1 - ref.y + BODY_REACH) / PITCH);
        const pc = pins.map(p => p.offset[0]), pr = pins.map(p => p.offset[1]);
        const pc0 = Math.min(...pc), pc1 = Math.max(...pc), pr0 = Math.min(...pr), pr1 = Math.max(...pr);
        if (c1 >= c0 && r1 >= r0 && (c0 < pc0 || c1 > pc1 || r0 < pr0 || r1 > pr1)) {
            const b0 = Math.min(c0, pc0), b1 = Math.max(c1, pc1), q0 = Math.min(r0, pr0), q1 = Math.max(r1, pr1);
            body = { offset: [b0, q0], size: [b1 - b0 + 1, q1 - q0 + 1] };
        }
    }
    if (body && body.size[0] * body.size[1] > 40 * 40) return { skip: 'huge' };

    const descr = (kid(fp, 'descr') || [])[1] || '';
    const part = {
        name,
        value: shortValue(lib, name, pins.length),
        pins,
        ...(body ? { body } : {}),
        category: LIBS[lib],
        source: `KiCad ${lib}:${name}`,
    };
    const desc = cleanDesc(descr);
    if (desc) part.desc = desc;
    return { part };
}

// short value line for the board label: "1x04", "DIP-8", "TO-220-3", else "<n>-pin"
function shortValue(lib, name, n) {
    const dims = name.match(/_(\d+x\d+)(_|$)/);
    if (dims && /PinHeader|PinSocket|IDC/.test(lib)) return dims[1] + (/Horizontal/.test(name) ? ' angled' : '');
    const first = name.split('_')[0];
    if (/\d/.test(first) && first.length <= 12) return first;
    return `${n}-pin`;
}

// keep descriptions short: they are only there for search and the tooltip
function cleanDesc(s) {
    s = s.replace(/\s*\(?(https?:\/\/|www\.)\S+\)?/g, '').replace(/,?\s*see\s*$/i, '').replace(/\s+/g, ' ').trim();
    if (s.length > 90) s = s.slice(0, 87).replace(/\s+\S*$/, '') + '…';
    return s;
}

// ---------------------------------------------------------------- sanity check
// A few footprints whose grid layout is known by heart; the build fails if the converter drifts.
function selfCheck(parts) {
    const byName = new Map(parts.map(p => [p.name, p]));
    const holes = (p) => p.pins.map(q => q.offset.join(',')).sort().join(' ');
    const expect = (name, test, what) => {
        const p = byName.get(name);
        if (!p || !test(p)) throw new Error(`self-check failed: ${name} should ${what}, got ${p ? JSON.stringify(p) : 'nothing'}`);
    };
    expect('DIP-8_W7.62mm', p => holes(p) === '0,0 0,1 0,2 0,3 3,0 3,1 3,2 3,3' && !p.body, 'have pins at cols 0/3, rows 0..3, no extra body');
    expect('DIP-28_W15.24mm', p => p.pins.length === 28 && Math.max(...p.pins.map(q => q.offset[0])) === 6, 'be 6 holes wide');
    expect('TO-220-3_Vertical', p => holes(p) === '0,0 1,0 2,0' && p.body && p.body.size[0] >= 4, 'have 3 pins in a row and a wider body');
    expect('PinHeader_1x04_P2.54mm_Vertical', p => holes(p) === '0,0 0,1 0,2 0,3' && !p.body, 'have 4 pins in a column');
    expect('PinHeader_2x05_P2.54mm_Vertical', p => p.pins.length === 10 && p.pins.find(q => q.label === '2').offset.join(',') === '1,0', 'have pin 2 next to pin 1');
    expect('Relay_SPDT_Schrack-RT1-FormC_RM5mm', p => p.pins.length === 5 && p.body && p.body.size[0] * p.body.size[1] >= 60, 'have 5 pins and a large body');
    expect('CP_Radial_D10.0mm_P5.00mm', p => holes(p) === '0,0 2,0' && JSON.stringify(p.body) === '{"offset":[-1,-2],"size":[5,5]}', 'match the curated 10 mm can');
    expect('Arduino_Nano', p => p.pins.length === 30, 'have 30 pins');
}

// ---------------------------------------------------------------- main
function fetchSources() {
    const dir = mkdtempSync(join(tmpdir(), 'kicad-footprints-'));
    console.log(`cloning ${REPO} (sparse, shallow) into ${dir}`);
    execFileSync('git', ['clone', '-q', '--depth', '1', '--filter=blob:none', '--sparse', REPO, dir], { stdio: 'inherit' });
    execFileSync('git', ['-C', dir, 'sparse-checkout', 'set', ...Object.keys(LIBS).map(l => l + '.pretty')], { stdio: 'inherit' });
    return dir;
}

function main() {
    const args = process.argv.slice(2);
    const srcArg = args.includes('--src') ? args[args.indexOf('--src') + 1] : null;
    const keep = args.includes('--keep'), stats = args.includes('--stats');
    const src = srcArg || fetchSources();
    let commit = '';
    try { commit = execFileSync('git', ['-C', src, 'rev-parse', '--short', 'HEAD']).toString().trim(); } catch { /* not a git checkout */ }

    const out = [];
    const perLib = {};
    const dedupe = new Map();
    for (const lib of Object.keys(LIBS)) {
        const dir = join(src, lib + '.pretty');
        const st = perLib[lib] = { total: 0, kept: 0, skip: {} };
        if (!existsSync(dir)) { st.missing = true; continue; }
        // shortest name first, so the plain variant wins over _LongPads/_Socket/... duplicates
        const files = readdirSync(dir).filter(f => f.endsWith('.kicad_mod'))
            .sort((a, b) => a.length - b.length || a.localeCompare(b));
        for (const f of files) {
            st.total++;
            const res = convert(lib, f, readFileSync(join(dir, f), 'utf8'));
            if (res.skip) { st.skip[res.skip] = (st.skip[res.skip] || 0) + 1; continue; }
            const p = res.part;
            const key = JSON.stringify([lib, p.pins.map(q => [q.offset, q.label]), p.body || null]);
            const twin = dedupe.get(key);
            if (twin) {
                // same footprint on the grid: keep one entry, but stay findable under the other part's name
                // (HC-49 crystal = HC-18 crystal). Pure suffix variants (_LongPads, _Socket, ...) are dropped.
                if (!p.name.startsWith(twin.name)) (twin.aka ||= []).push(p.name);
                st.skip.duplicate = (st.skip.duplicate || 0) + 1;
                continue;
            }
            dedupe.set(key, p);
            out.push(p);
            st.kept++;
        }
    }

    // natural sort inside each category keeps DIP-4, DIP-6, ..., DIP-40 in order
    const catOrder = [...new Set(Object.values(LIBS))];
    const coll = new Intl.Collator('en', { numeric: true });
    out.sort((a, b) => catOrder.indexOf(a.category) - catOrder.indexOf(b.category) || coll.compare(a.name, b.name));

    selfCheck(out);

    const doc = {
        source: 'KiCad footprint libraries' + (commit ? ` @ ${commit}` : ''),
        url: 'https://gitlab.com/kicad/libraries/kicad-footprints',
        license: 'CC-BY-SA 4.0 with the KiCad libraries exception (designs using these footprints are not affected)',
        generated: new Date().toISOString().slice(0, 10),
        parts: out,
    };
    // one part per line: diff-friendly, still compact
    const json = '{\n' + Object.entries(doc).filter(([k]) => k !== 'parts').map(([k, v]) => `"${k}":${JSON.stringify(v)},`).join('\n')
        + '\n"parts":[\n' + out.map(p => JSON.stringify(p)).join(',\n') + '\n]}\n';
    writeFileSync(OUT, json);
    console.log(`wrote ${out.length} parts to ${OUT} (${(json.length / 1024).toFixed(0)} KiB)`);

    if (stats) {
        for (const [lib, st] of Object.entries(perLib)) {
            const sk = Object.entries(st.skip).map(([k, v]) => `${k} ${v}`).join(', ');
            console.log(`${lib.padEnd(30)} ${st.missing ? 'MISSING' : `${String(st.kept).padStart(4)} / ${String(st.total).padStart(4)}   ${sk}`}`);
        }
    }
    if (!srcArg) {
        if (keep) console.log(`kept checkout at ${src}`);
        else rmSync(src, { recursive: true, force: true });
    }
}

main();
