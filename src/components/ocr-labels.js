// Pin labels from the silkscreen next to a pin row (browser only).
//
// The user draws a box over the labels of one row. The box is cut into one cell per pin (one
// pitch wide along the row), each cell is cleaned up (scaled so text is ~48 px high, grey,
// stretched contrast, dark text on white whatever the board colour, Otsu threshold, white
// margin) and read by Tesseract as a single word. Silkscreen text often runs across the row
// (ESP32 dev boards) or is upside down, so the reading direction is tried on a few cells first and the best one
// is used for all.
//
// Tesseract (worker, wasm core, English model) is served from /ocr/ (scripts/copy-ocr-assets.js)
// and loaded on first use only.

let workerPromise = null;

function getWorker() {
    if (!workerPromise) {
        workerPromise = (async () => {
            const { createWorker, OEM, PSM } = await import('tesseract.js');
            const worker = await createWorker('eng', OEM.LSTM_ONLY, {
                workerPath: '/ocr/worker.min.js',
                corePath: '/ocr/',
                langPath: '/ocr/',
                gzip: true,
                cacheMethod: 'refresh',
            });
            await worker.setParameters({
                tessedit_pageseg_mode: PSM.SINGLE_LINE,
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-_/.',
            });
            return worker;
        })();
        workerPromise.catch(() => { workerPromise = null; });
    }
    return workerPromise;
}

// Cut one cell out of the photo: the grid-aligned rectangle [c0, c1] x [r0, r1] (grid units,
// hole centres at integers), turned by `turn` quarter turns so the text runs left to right.
function cellCanvas(img, grid, c0, r0, c1, r1, turn) {
    const cellW = (c1 - c0) * grid.pitch, cellH = (r1 - r0) * grid.pitch;
    // scale: the text line is the cell's short side after turning; aim for ~64 px
    const across = turn % 2 ? cellW : cellH;
    const k = Math.max(1, Math.min(6, 64 / Math.max(1, across)));
    const W = Math.round((turn % 2 ? cellH : cellW) * k), H = Math.round((turn % 2 ? cellW : cellH) * k);
    const pad = 16;
    const c = document.createElement('canvas');
    c.width = W + 2 * pad; c.height = H + 2 * pad;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    // canvas = centre · turn · scale · (grid-aligned photo px); grid-aligned = R(-angle)(P - centre)
    const cs = Math.cos(grid.angle || 0), sn = Math.sin(grid.angle || 0);
    const cc = (c0 + c1) / 2, rc = (r0 + r1) / 2;
    const cx = grid.phaseX + grid.pitch * (cc * cs - rc * sn), cy = grid.phaseY + grid.pitch * (cc * sn + rc * cs);
    ctx.save();
    ctx.translate(pad + W / 2, pad + H / 2);
    ctx.rotate(turn * Math.PI / 2);
    ctx.scale(k, k);
    ctx.beginPath();
    ctx.rect(-cellW / 2, -cellH / 2, cellW, cellH);
    ctx.clip();
    ctx.rotate(-(grid.angle || 0));
    ctx.translate(-cx, -cy);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0);
    ctx.restore();
    const bb = clean(ctx, pad, pad, W, H);
    if (!bb) return null;
    // crop to the text with a white margin (Tesseract likes ~10 px around a word)
    const m = 14, bw = bb.x1 - bb.x0 + 1, bh = bb.y1 - bb.y0 + 1;
    const out = document.createElement('canvas');
    out.width = bw + 2 * m; out.height = bh + 2 * m;
    const o = out.getContext('2d');
    o.fillStyle = '#fff'; o.fillRect(0, 0, out.width, out.height);
    o.drawImage(c, bb.x0, bb.y0, bw, bh, m, m, bw, bh);
    // labels are short words: wider than high when the text runs along the cell's x
    return { canvas: out, wide: bw >= bh * 0.9 };
}

// grey, contrast stretch, text dark on white, Otsu threshold (inside the cell only)
function clean(ctx, xo, yo, W, H) {
    const im = ctx.getImageData(xo, yo, W, H), d = im.data, n = W * H;
    const g = new Float32Array(n);
    let lo = 255, hi = 0;
    for (let i = 0; i < n; i++) {
        g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
        if (g[i] < lo) lo = g[i];
        if (g[i] > hi) hi = g[i];
    }
    const span = Math.max(1, hi - lo);
    const hist = new Float64Array(256);
    for (let i = 0; i < n; i++) { g[i] = (g[i] - lo) / span * 255; hist[g[i] | 0]++; }
    // Otsu
    let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * hist[t];
    let wB = 0, sumB = 0, best = 0, thr = 128;
    for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (!wB || wB === n) continue;
        sumB += t * hist[t];
        const mB = sumB / wB, mF = (sum - sumB) / (n - wB), v = wB * (n - wB) * (mB - mF) ** 2;
        if (v > best) { best = v; thr = t; }
    }
    // text is the smaller class
    let above = 0;
    for (let i = 0; i < n; i++) if (g[i] > thr) above++;
    const textBright = above < n / 2;
    const ink = new Uint8Array(n);
    for (let i = 0; i < n; i++) ink[i] = (textBright ? g[i] > thr : g[i] <= thr) ? 1 : 0;
    // drop blobs touching the cell edge (pieces of the neighbours' labels, pads, the board
    // edge) and specks; what is left is this pin's label
    const lab = new Int32Array(n), stack = [];
    let id = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let s0 = 0; s0 < n; s0++) {
        if (!ink[s0] || lab[s0]) continue;
        id++;
        const members = [];
        let edge = false;
        stack.push(s0); lab[s0] = id;
        while (stack.length) {
            const q = stack.pop(), x = q % W, y = (q / W) | 0;
            members.push(q);
            if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
            for (const r of [x > 0 ? q - 1 : -1, x < W - 1 ? q + 1 : -1, y > 0 ? q - W : -1, y < H - 1 ? q + W : -1]) {
                if (r >= 0 && ink[r] && !lab[r]) { lab[r] = id; stack.push(r); }
            }
        }
        if (edge || members.length < n * 0.002) { for (const q of members) ink[q] = 0; continue; }
        for (const q of members) {
            const x = q % W, y = (q / W) | 0;
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
    }
    for (let i = 0; i < n; i++) { const v = ink[i] ? 0 : 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
    ctx.putImageData(im, xo, yo);
    return x1 < 0 ? null : { x0: x0 + xo, y0: y0 + yo, x1: x1 + xo, y1: y1 + yo };
}

// cleanup plus the usual silkscreen confusions: a "D" read as "0" (D5 -> 05), S for 5, O for 0
function tidy(raw) {
    let t = (raw || '').replace(/\s+/g, '').replace(/^[^A-Za-z0-9+]+|[^A-Za-z0-9+]+$/g, '').toUpperCase();
    if (/^0\d{1,2}$/.test(t)) t = 'D' + t.slice(1);
    if (/^S(V|V0)$/.test(t)) t = '5V';
    t = t.replace(/^([DA])[LI|]$/, '$11'); // A1 read as AL
    t = t.replace(/^GN[O0]$/, 'GND').replace(/^([DAP]|GPIO|GP|IO)O$/, '$10').replace(/^([DAP]|GPIO|GP|IO)O(\d)$/, '$10$2');
    return t;
}

// how much a reading looks like a pin name (decides the reading direction; Tesseract's own
// confidence is just as high for upside-down nonsense)
const PIN_NAME = /^(\d{1,2}|TXO|RXI|GND|AGND|G|VCC|VDD|VIN|VBUS|VBAT|VSYS|3V3|3\.3V|5V|RST|RESET|RUN|EN|BOOT|AREF|IOREF|SCL|SDA|SCK|SCLK|MOSI|MISO|CS|SS|CLK|DIN|DOUT|DATA|SIG|NC|OUT[+-]?|IN[+-]?|B[+-]|[+-]|V[PN]|SV[PN]|SWDIO|SWCLK|TXD?\d?|RXD?\d?|[DAP]\d{1,2}|GPIO\d{1,2}|GP\d{1,2}|IO\d{1,2}|ADC\d?|DAC\d?|PWM\d?|INT\d?)$/;
const nameScore = (t) => (!t ? 0 : PIN_NAME.test(t) ? 1 : /^[A-Z]{1,4}\d{0,2}$/.test(t) ? 0.35 : 0.1);

// cells: [{ key, c0, r0, c1, r1 }] in grid units. turn: 0..3 or 'auto'.
// Returns { labels: { key: text }, turn, confidence } and reports progress(done, total).
export async function readLabels(imageUrl, grid, cells, { turn = 'auto', progress } = {}) {
    const img = new Image();
    img.src = imageUrl;
    await img.decode();
    const worker = await getWorker();
    const read = async (cell, t) => {
        const cut = cellCanvas(img, grid, cell.c0, cell.r0, cell.c1, cell.r1, t);
        if (!cut) return { text: '', conf: 0, wide: null };
        const { data } = await worker.recognize(cut.canvas);
        return { text: tidy(data.text), conf: data.confidence || 0, wide: cut.wide };
    };
    const sample = cells.filter((_, i) => i % Math.max(1, Math.floor(cells.length / 4)) === 0).slice(0, 4);
    const total = cells.length + (turn === 'auto' ? 2 * sample.length : 0);
    let done = 0;
    const step = () => progress?.(++done, total);
    let chosen = turn;
    const cache = new Map();
    if (turn === 'auto') {
        // the shape of the text says whether it runs along the box or across: read the sample
        // upright; text blobs that are taller than wide mean a quarter turn
        let wide = 0, tall = 0;
        for (const cell of sample) {
            const r = await read(cell, 0);
            cache.set(cell.key + '|0', r);
            if (r.wide === true) wide++; else if (r.wide === false) tall++;
            step();
        }
        // which way round: compare reading confidence for the two candidate turns
        const pair = tall > wide ? [1, 3] : [0, 2];
        let bestScore = -1;
        for (const t of pair) {
            let s2 = 0;
            for (const cell of sample) {
                const key = cell.key + '|' + t;
                const r = cache.get(key) || await read(cell, t);
                cache.set(key, r);
                s2 += nameScore(r.text) * (0.5 + r.conf / 200);
                if (!(t === 0)) step();
            }
            if (s2 > bestScore) { bestScore = s2; chosen = t; }
        }
    }
    const labels = {};
    let confSum = 0, n = 0;
    for (const cell of cells) {
        const r = cache.get(cell.key + '|' + chosen) || await read(cell, chosen);
        step();
        // an empty label beats a wrong one: names that don't look like pin names need a sure read
        if (r.text && (PIN_NAME.test(r.text) ? r.conf >= 30 : r.conf >= 80)) { labels[cell.key] = r.text; confSum += r.conf; n++; }
    }
    return { labels, turn: chosen, confidence: n ? confSum / n : 0 };
}
