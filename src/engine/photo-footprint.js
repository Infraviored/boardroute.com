// Footprint from a photo: a straight top-down picture of a module (dev board, sensor, relay
// module) on a plain light background -> pins on the 2.54 mm grid and the body size in holes.
//
// No ruler needed: header pins sit 2.54 mm apart, so the period of the pin rows in the image is
// the scale. Steps:
//   1. cut out: background colour from the image border, mask = pixels far from it, keep the
//      largest blob, fit the minimum-area rectangle (rotation + body size in pixels);
//   2. straighten: resample the rectangle upright, long side horizontal;
//   3. pitch: rows (and columns) crossing a pin header are periodic; the autocorrelation of
//      their edge strength, summed over the image, peaks at the pin pitch;
//   4. pin lines: image rows/columns that are strongly periodic at that pitch; the grid phase
//      comes from where "not board colour" (metal pads) repeats along them;
//   5. pins: grid cells on those lines that stand out from the board colour like the others do.
// Pure JS on RGBA pixel arrays, no DOM, so it runs the same in the browser and in Node.
//
// detectFootprint({ data, width, height }) ->
//   { ok, reason?, image: { data, width, height } (straightened), pitch, phaseX, phaseY,
//     bodyPx: { x0, y0, x1, y1 }, pins: [[col, row]], body: { x, y, w, h }, angle }
// Hole (col, row) has its centre at (phaseX + col·pitch, phaseY + row·pitch) in `image`.

const WORK = 700;      // long side of the image used to find the part
const STRAIGHT = 1000; // long side of the straightened part

export function detectFootprint(src, opts = {}) {
    const work = resize(src, Math.min(1, WORK / Math.max(src.width, src.height)));
    const cut = cutout(work);
    const s = src.width / work.width;
    // no clear background (part fills the frame, busy table): take the whole picture as the part,
    // so pins can still be found or measured by hand
    const rect = cut ? { cx: cut.rect.cx * s, cy: cut.rect.cy * s, w: cut.rect.w * s, h: cut.rect.h * s, angle: cut.rect.angle }
        : { cx: src.width / 2, cy: src.height / 2, w: src.width, h: src.height, angle: 0 };
    if (rect.h > rect.w) { rect.angle += Math.PI / 2; [rect.w, rect.h] = [rect.h, rect.w]; }
    const image = straighten(src, rect, opts.straight || STRAIGHT, cut ? undefined : 0);
    const res = { ...analyse(image), angle: rect.angle * 180 / Math.PI };
    if (!cut && !res.ok) res.reason = 'Could not tell the part from the background. Put it on plain white paper.';
    return res;
}

// Grid and pins in a straightened image (`margin` px of background around the part).
export function analyse(image) {
    const { width: W, height: H } = image;
    const m = image.margin || 0;
    const bodyPx = { x0: m, y0: m, x1: W - m, y1: H - m };
    const gray = toGray(image);
    const board = boardColour(image, bodyPx);
    const diff = colourDiff(image, board);
    // open holes show the background through the board: the most direct evidence there is
        // try the strongest periods; keep the one whose pins stand out most clearly from the gaps
    // between them (half or a third of the true pitch puts "gaps" on pads, chip pins and text
    // give short, weak lines)
    let best = null;
    for (const p0 of pitchCandidates(gray, W, H, bodyPx)) {
        const lines = pinLines(gray, W, H, bodyPx, p0);
        const pitch = lines.rows.length || lines.cols.length ? finePitch(diff, W, bodyPx, p0, lines) : p0;
        if (!lines.rows.length && !lines.cols.length) continue;
        const { phaseX, phaseY } = gridPhase(diff, W, H, bodyPx, pitch, lines);
        const found = findPins(image, diff, bodyPx, pitch, phaseX, phaseY, lines);
        if (!found.pins.length) continue;
        if (!best || found.quality > best.quality) best = { pitch, phaseX, phaseY, ...found };
    }
    if (!best) return { ok: false, reason: 'No pin rows found.', image, bodyPx };
    const fit = refineGrid(diff, W, H, best.pitch, best.phaseX, best.phaseY, best.pins);
    const body = bodyHoles(bodyPx, fit.pitch, fit.phaseX, fit.phaseY, best.pins);
    return { ok: true, image, bodyPx, board, ...fit, pins: best.pins, body, quality: best.quality };
}

// The body in holes: every hole the body reaches to within 0.2 pitch of its centre (a board edge
// 0.5-0.6 pitch beyond the outer pins, as on most modules, blocks no extra row).
export function bodyHoles(bodyPx, pitch, phaseX, phaseY, pins) {
    const u0 = (bodyPx.x0 - phaseX) / pitch, u1 = (bodyPx.x1 - phaseX) / pitch;
    const v0 = (bodyPx.y0 - phaseY) / pitch, v1 = (bodyPx.y1 - phaseY) / pitch;
    let x0 = Math.floor(u0 - 0.2) + 1, x1 = Math.ceil(u1 + 0.2) - 1;
    let y0 = Math.floor(v0 - 0.2) + 1, y1 = Math.ceil(v1 + 0.2) - 1;
    for (const [c, r] of pins) { x0 = Math.min(x0, c); x1 = Math.max(x1, c); y0 = Math.min(y0, r); y1 = Math.max(y1, r); }
    return { x: x0, y: y0, w: Math.max(1, x1 - x0 + 1), h: Math.max(1, y1 - y0 + 1) };
}

// --- image helpers -------------------------------------------------------------------------

function resize(img, f) {
    if (f >= 1) return img;
    const w = Math.max(1, Math.round(img.width * f)), h = Math.max(1, Math.round(img.height * f));
    const out = new Uint8ClampedArray(w * h * 4);
    const sx = img.width / w, sy = img.height / h;
    for (let y = 0; y < h; y++) {
        const ya = Math.floor(y * sy), yb = Math.max(ya + 1, Math.floor((y + 1) * sy));
        for (let x = 0; x < w; x++) {
            const xa = Math.floor(x * sx), xb = Math.max(xa + 1, Math.floor((x + 1) * sx));
            let r = 0, g = 0, b = 0, n = 0;
            for (let yy = ya; yy < yb; yy++) for (let xx = xa; xx < xb; xx++) {
                const i = (yy * img.width + xx) * 4;
                r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++;
            }
            const o = (y * w + x) * 4;
            out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
        }
    }
    return { data: out, width: w, height: h };
}

function toGray(img) {
    const n = img.width * img.height, g = new Float32Array(n);
    for (let i = 0; i < n; i++) g[i] = 0.299 * img.data[i * 4] + 0.587 * img.data[i * 4 + 1] + 0.114 * img.data[i * 4 + 2];
    return g;
}

const median = (a) => { const s = Float64Array.from(a).sort(); return s.length ? s[s.length >> 1] : 0; };
const percentile = (a, p) => { const s = Float64Array.from(a).sort(); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };

// --- 1. cut out ----------------------------------------------------------------------------

function cutout(img) {
    const { width: W, height: H, data } = img;
    const b = Math.max(3, Math.round(Math.min(W, H) / 40));
    const R = [], G = [], B = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (x >= b && x < W - b && y >= b && y < H - b) continue;
        const i = (y * W + x) * 4;
        R.push(data[i]); G.push(data[i + 1]); B.push(data[i + 2]);
    }
    const bg = [median(R), median(G), median(B)];
    // distance that mostly ignores brightness: a soft shadow is darker background with the
    // same hue, a part differs in colour or is far darker/lighter (black or white PCBs)
    const bgO = opponent(bg[0], bg[1], bg[2]);
    const dist = (r, g, b) => { const o = opponent(r, g, b); return Math.hypot(0.4 * (o[0] - bgO[0]), o[1] - bgO[1], o[2] - bgO[2]); };
    const spread = [];
    for (let k = 0; k < R.length; k += 3) spread.push(dist(R[k], G[k], B[k]));
    const thr = Math.max(22, 2 * percentile(spread, 0.95));
    let mask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) mask[i] = dist(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) > thr ? 1 : 0;
    const r = Math.max(1, Math.round(Math.min(W, H) / 120));
    mask = erode(dilate(mask, W, H, 3 * r), W, H, 3 * r); // close gaps (holes, labels)
    mask = dilate(erode(mask, W, H, r), W, H, r);         // drop specks and thin shadows
    const comp = largestComponent(mask, W, H);
    if (!comp || comp.count < W * H * 0.01) return null;
    // a "part" touching most of the border is the background itself (dark or busy background)
    if (comp.border > 2 * (W + H) * 0.5) return null;
    const rect = minAreaRect(comp.points);
    return { rect, mask };
}

// brightness and two colour-opponent channels
const opponent = (r, g, b) => [(r + g + b) / 3, r - g, (r + g) / 2 - b];

// dilation/erosion with a (2r+1)² square, via an integral image
function boxCount(mask, W, H, r) {
    const S = new Int32Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) {
        let row = 0;
        for (let x = 0; x < W; x++) { row += mask[y * W + x]; S[(y + 1) * (W + 1) + x + 1] = S[y * (W + 1) + x + 1] + row; }
    }
    return (x, y) => {
        const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(W, x + r + 1), y1 = Math.min(H, y + r + 1);
        return [S[y1 * (W + 1) + x1] - S[y0 * (W + 1) + x1] - S[y1 * (W + 1) + x0] + S[y0 * (W + 1) + x0], (x1 - x0) * (y1 - y0)];
    };
}
function dilate(mask, W, H, r) {
    const c = boxCount(mask, W, H, r), out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[y * W + x] = c(x, y)[0] > 0 ? 1 : 0;
    return out;
}
function erode(mask, W, H, r) {
    const c = boxCount(mask, W, H, r), out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [n, a] = c(x, y); out[y * W + x] = n === a ? 1 : 0; }
    return out;
}

// largest 4-connected blob; returns its row extremes (enough for the convex hull)
function largestComponent(mask, W, H) {
    const lab = new Int32Array(W * H);
    let best = null, id = 0;
    const stack = new Int32Array(W * H);
    for (let s = 0; s < W * H; s++) {
        if (!mask[s] || lab[s]) continue;
        id++;
        let sp = 0, count = 0, border = 0;
        const left = new Map(), right = new Map();
        stack[sp++] = s; lab[s] = id;
        while (sp) {
            const p = stack[--sp];
            const x = p % W, y = (p / W) | 0;
            count++;
            if (x === 0 || y === 0 || x === W - 1 || y === H - 1) border++;
            if (!left.has(y) || x < left.get(y)) left.set(y, x);
            if (!right.has(y) || x > right.get(y)) right.set(y, x);
            if (x > 0 && mask[p - 1] && !lab[p - 1]) { lab[p - 1] = id; stack[sp++] = p - 1; }
            if (x < W - 1 && mask[p + 1] && !lab[p + 1]) { lab[p + 1] = id; stack[sp++] = p + 1; }
            if (y > 0 && mask[p - W] && !lab[p - W]) { lab[p - W] = id; stack[sp++] = p - W; }
            if (y < H - 1 && mask[p + W] && !lab[p + W]) { lab[p + W] = id; stack[sp++] = p + W; }
        }
        if (!best || count > best.count) {
            const points = [];
            for (const [y, x] of left) points.push([x, y], [right.get(y) + 1, y], [x, y + 1], [right.get(y) + 1, y + 1]);
            best = { count, border, points };
        }
    }
    return best;
}

function convexHull(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// minimum-area enclosing rectangle: one side lies on a hull edge
function minAreaRect(points) {
    const hull = convexHull(points);
    let best = null;
    for (let i = 0; i < hull.length; i++) {
        const a = hull[i], b = hull[(i + 1) % hull.length];
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const c = Math.cos(ang), s = Math.sin(ang);
        let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
        for (const [x, y] of hull) {
            const u = x * c + y * s, v = -x * s + y * c;
            if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
        }
        const area = (u1 - u0) * (v1 - v0);
        if (!best || area < best.area) {
            const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
            best = { area, angle: ang, w: u1 - u0, h: v1 - v0, cx: um * c - vm * s, cy: um * s + vm * c };
        }
    }
    // prefer the smallest rotation (a straight photo stays unrotated)
    while (best.angle > Math.PI / 4) { best.angle -= Math.PI / 2; [best.w, best.h] = [best.h, best.w]; }
    while (best.angle < -Math.PI / 4) { best.angle += Math.PI / 2; [best.w, best.h] = [best.h, best.w]; }
    return best;
}

// --- 2. straighten -------------------------------------------------------------------------

function straighten(src, rect, longSide, margin = Math.round(longSide * 0.03)) {
    const f = longSide / rect.w;
    const w = Math.round(rect.w * f) + 2 * margin, h = Math.round(rect.h * f) + 2 * margin;
    const out = new Uint8ClampedArray(w * h * 4);
    const c = Math.cos(rect.angle), s = Math.sin(rect.angle);
    // average several source pixels per output pixel when shrinking (no aliasing on pin rows)
    const k = Math.max(1, Math.min(4, Math.round(1 / f)));
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let r = 0, g = 0, b = 0;
            for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
                const u = (x + (i + 0.5) / k - 0.5 - w / 2) / f, v = (y + (j + 0.5) / k - 0.5 - h / 2) / f;
                const px = rect.cx + u * c - v * s, py = rect.cy + u * s + v * c;
                const p = bilinear(src, px, py);
                r += p[0]; g += p[1]; b += p[2];
            }
            const o = (y * w + x) * 4;
            out[o] = r / (k * k); out[o + 1] = g / (k * k); out[o + 2] = b / (k * k); out[o + 3] = 255;
        }
    }
    return { data: out, width: w, height: h, margin };
}

function bilinear(img, x, y) {
    const { width: W, height: H, data } = img;
    x = Math.max(0, Math.min(W - 1.001, x)); y = Math.max(0, Math.min(H - 1.001, y));
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
    const i = (y0 * W + x0) * 4, j = i + W * 4;
    const p = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
        p[k] = (data[i + k] * (1 - fx) + data[i + 4 + k] * fx) * (1 - fy) + (data[j + k] * (1 - fx) + data[j + 4 + k] * fx) * fy;
    }
    return p;
}

// --- 3. pitch ------------------------------------------------------------------------------

function boardColour(img, b) {
    const R = [], G = [], B = [];
    for (let y = Math.round(b.y0); y < b.y1; y += 2) for (let x = Math.round(b.x0); x < b.x1; x += 2) {
        const i = (y * img.width + x) * 4;
        R.push(img.data[i]); G.push(img.data[i + 1]); B.push(img.data[i + 2]);
    }
    return [median(R), median(G), median(B)];
}

function colourDiff(img, c) {
    const n = img.width * img.height, d = new Float32Array(n);
    for (let i = 0; i < n; i++) d[i] = Math.hypot(img.data[i * 4] - c[0], img.data[i * 4 + 1] - c[1], img.data[i * 4 + 2] - c[2]);
    return d;
}

// edge strength along x (horiz = true) or y
function gradient(gray, W, H, horiz) {
    const g = new Float32Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        g[i] = horiz ? Math.abs(gray[i + 1] - gray[i - 1]) : Math.abs(gray[i + W] - gray[i - W]);
    }
    return g;
}

// normalised autocorrelation of a 1-D signal for lags 0..hi
function autocorr(sig, hi) {
    const n = sig.length;
    let mean = 0;
    for (let i = 0; i < n; i++) mean += sig[i];
    mean /= n;
    const s = new Float32Array(n);
    let e = 0;
    for (let i = 0; i < n; i++) { s[i] = sig[i] - mean; e += s[i] * s[i]; }
    const ac = new Float32Array(hi + 1);
    if (e <= 0) return ac;
    for (let l = 0; l <= hi && l < n; l++) {
        let a = 0;
        for (let i = 0; i + l < n; i++) a += s[i] * s[i + l];
        ac[l] = a / e;
    }
    return ac;
}

// the 1-D signals of the body, one per image row (horiz) or column
function lineSignals(grad, W, b, horiz) {
    const x0 = Math.round(b.x0), x1 = Math.round(b.x1), y0 = Math.round(b.y0), y1 = Math.round(b.y1);
    const out = [];
    if (horiz) for (let y = y0; y < y1; y++) out.push({ at: y, sig: grad.subarray(y * W + x0, y * W + x1) });
    else for (let x = x0; x < x1; x++) { const s = new Float32Array(y1 - y0); for (let y = y0; y < y1; y++) s[y - y0] = grad[y * W + x]; out.push({ at: x, sig: s }); }
    return out;
}

function pitchCandidates(gray, W, H, b) {
    const L = Math.max(b.x1 - b.x0, b.y1 - b.y0);
    // a module is between ~3 and ~60 holes long; pads are at least 5 px apart
    const lo = Math.max(5, Math.floor(L / 60)), hi = Math.floor(L / 3);
    const score = new Float64Array(hi + 2);
    for (const horiz of [true, false]) {
        const g = gradient(gray, W, H, horiz);
        const lines = lineSignals(g, W, b, horiz);
        // headers run along the edges of a module; chip pins and text sit in the middle
        const [a0, a1] = horiz ? [b.y0, b.y1] : [b.x0, b.x1];
        for (let i = 0; i < lines.length; i += 2) {
            const t = (lines[i].at - a0) / (a1 - a0), wt = t < 0.3 || t > 0.7 ? 1 : 0.25;
            const ac = autocorr(lines[i].sig, Math.min(hi, lines[i].sig.length - 1));
            for (let l = lo; l < ac.length; l++) if (ac[l] > 0) score[l] += wt * ac[l] * ac[l];
        }
    }
    // local maxima, strongest first
    const peaks = [];
    for (let l = lo + 1; l < hi; l++) if (score[l] > 0 && score[l] >= score[l - 1] && score[l] > score[l + 1]) peaks.push(l);
    peaks.sort((a, c) => score[c] - score[a]);
    const top = peaks.filter(l => score[l] >= 0.15 * score[peaks[0]]).slice(0, 8);
    // sub-pixel: peaks of the harmonics k·p, fitted through the origin
    const refine = (p) => {
        let num = 0, den = 0;
        for (let k = 1; k * p + 2 <= hi && k <= 8; k++) {
            let m = Math.round(k * p);
            for (let l = m - 2; l <= m + 2; l++) if (score[l] > score[m]) m = l;
            const a = score[m - 1], c = score[m], d = score[m + 1];
            const off = (a - 2 * c + d) !== 0 ? 0.5 * (a - d) / (a - 2 * c + d) : 0;
            num += c * k * (m + Math.max(-0.5, Math.min(0.5, off))); den += c * k * k;
        }
        return den ? num / den : p;
    };
    const out = [];
    for (const l of top) {
        const p = refine(l);
        if (!out.some(q => Math.abs(q - p) < 1.5)) out.push(p);
    }
    return out;
}

// --- 4. pin lines and grid phase -----------------------------------------------------------

function acAt(sig, lag) {
    const l0 = Math.floor(lag), f = lag - l0;
    const ac = autocorr(sig, l0 + 1);
    return ac[l0] * (1 - f) + ac[l0 + 1] * f;
}

// Rows (y) and columns (x) of the body whose edge profile repeats at the pitch.
function pinLines(gray, W, H, b, pitch) {
    const res = {};
    for (const horiz of [true, false]) {
        const g = gradient(gray, W, H, horiz);
        const lines = lineSignals(g, W, b, horiz);
        const sc = lines.map(l => Math.max(0, acAt(l.sig, pitch)));
        const best = Math.max(0, ...sc);
        const thr = Math.max(0.25, 0.4 * best);
        const found = [];
        for (let i = 0; i < sc.length;) {
            if (sc[i] <= thr) { i++; continue; }
            const s = i;
            let wsum = 0, at = 0;
            while (i < sc.length && sc[i] > thr) { wsum += sc[i]; at += sc[i] * lines[i].at; i++; }
            // a pin line is at least ~1/4 pitch thick (a pad), not a 1-px silkscreen line
            if (i - s >= pitch * 0.25) found.push({ at: at / wsum, len: i - s, strength: wsum / (i - s) });
        }
        // two runs closer than half a pitch are the same line
        const merged = [];
        for (const f of found) {
            const last = merged[merged.length - 1];
            if (last && f.at - last.at < pitch * 0.6) { last.at = (last.at * last.len + f.at * f.len) / (last.len + f.len); last.len += f.len; }
            else merged.push({ ...f });
        }
        res[horiz ? 'rows' : 'cols'] = merged.map(m => m.at);
    }
    return res;
}

// Phase along a line: fold the "not board colour" profile at the pitch and take the centre of
// its strongest blob (smoothed over ~0.6 pitch, so a pad ring counts as one blob).
function foldPhase(profile, start, pitch) {
    const n = Math.max(8, Math.round(pitch));
    const bins = new Float64Array(n), cnt = new Float64Array(n);
    for (let i = 0; i < profile.length; i++) {
        const ph = (((start + i) % pitch) + pitch) % pitch;
        const k = Math.floor(ph / pitch * n) % n;
        bins[k] += profile[i]; cnt[k]++;
    }
    for (let k = 0; k < n; k++) bins[k] /= Math.max(1, cnt[k]);
    const half = Math.max(1, Math.round(n * 0.3));
    let best = -Infinity, at = 0;
    for (let k = 0; k < n; k++) {
        let s = 0;
        for (let d = -half; d <= half; d++) s += bins[(k + d + n) % n];
        if (s > best) { best = s; at = k; }
    }
    return (at + 0.5) / n * pitch;
}

function bandProfile(diff, W, b, horiz, at, half) {
    const x0 = Math.round(b.x0), x1 = Math.round(b.x1), y0 = Math.round(b.y0), y1 = Math.round(b.y1);
    if (horiz) {
        const p = new Float32Array(x1 - x0);
        for (let y = Math.max(y0, Math.round(at - half)); y <= Math.min(y1 - 1, Math.round(at + half)); y++)
            for (let x = x0; x < x1; x++) p[x - x0] += diff[y * W + x];
        return { p, start: x0 };
    }
    const p = new Float32Array(y1 - y0);
    for (let y = y0; y < y1; y++)
        for (let x = Math.max(x0, Math.round(at - half)); x <= Math.min(x1 - 1, Math.round(at + half)); x++) p[y - y0] += diff[y * W + x];
    return { p, start: y0 };
}

const circMean = (phases, pitch) => {
    let sx = 0, sy = 0;
    for (const p of phases) { const a = 2 * Math.PI * p / pitch; sx += Math.cos(a); sy += Math.sin(a); }
    return ((Math.atan2(sy, sx) / (2 * Math.PI) * pitch) % pitch + pitch) % pitch;
};

// Fine pitch: folding a long pin line at the exact period gives the sharpest profile (a 20-pin
// header 1 % off already smears the fold by a fifth of a pitch). Search ±6 % around the estimate.
function finePitch(diff, W, b, p0, lines) {
    const profs = [
        ...lines.rows.map(y => bandProfile(diff, W, b, true, y, p0 * 0.3)),
        ...lines.cols.map(x => bandProfile(diff, W, b, false, x, p0 * 0.3)),
    ];
    let best = p0, bestV = -1;
    for (let f = 0.94; f <= 1.06; f += 0.002) {
        const p = p0 * f, n = Math.max(8, Math.round(p));
        let v = 0;
        for (const { p: prof, start } of profs) {
            const bins = new Float64Array(n), cnt = new Float64Array(n);
            for (let i = 0; i < prof.length; i++) {
                const k = Math.floor(((start + i) % p) / p * n) % n;
                bins[k] += prof[i]; cnt[k]++;
            }
            let m = 0, m2 = 0;
            for (let k = 0; k < n; k++) { const x = bins[k] / Math.max(1, cnt[k]); m += x; m2 += x * x; }
            v += m2 / n - (m / n) ** 2;
        }
        if (v > bestV) { bestV = v; best = p; }
    }
    return best;
}

// Phase along each line from the folded profile; across it, the centre of the pads themselves
// (the periodic band found in step 4 can be off-centre, e.g. castellated pads at a board edge).
function gridPhase(diff, W, H, b, pitch, lines) {
    const half = pitch * 0.3;
    const xs = [], ys = [];
    for (const [i, y] of lines.rows.entries()) {
        const { p, start } = bandProfile(diff, W, b, true, y, half);
        const px = foldPhase(p, start, pitch);
        xs.push(px);
        lines.rows[i] = padCentre(diff, W, H, b, pitch, true, y, px);
        ys.push(lines.rows[i]);
    }
    for (const [i, x] of lines.cols.entries()) {
        const { p, start } = bandProfile(diff, W, b, false, x, half);
        const py = foldPhase(p, start, pitch);
        ys.push(py);
        lines.cols[i] = padCentre(diff, W, H, b, pitch, false, x, py);
        xs.push(lines.cols[i]);
    }
    return { phaseX: circMean(xs, pitch), phaseY: circMean(ys, pitch) };
}

// across a pin line at `at`: where the pads (sampled at phase + k·pitch along it) are centred
function padCentre(diff, W, H, b, pitch, horiz, at, phase) {
    const reach = Math.round(pitch * 0.8), w = Math.max(1, Math.round(pitch * 0.12));
    const prof = new Float64Array(2 * reach + 1);
    const [a0, a1] = horiz ? [b.x0, b.x1] : [b.y0, b.y1];
    for (let d = -reach; d <= reach; d++) {
        const q = Math.round(at + d);
        if (q < 0 || q >= (horiz ? H : W)) continue;
        let s = 0, n = 0;
        for (let c = phase + Math.ceil((a0 - phase) / pitch) * pitch; c < a1; c += pitch) {
            for (let e = -w; e <= w; e++) {
                const t = Math.round(c + e);
                if (t < 0 || t >= (horiz ? W : H)) continue;
                s += horiz ? diff[q * W + t] : diff[t * W + q]; n++;
            }
        }
        prof[d + reach] = n ? s / n : 0;
    }
    const sm = Math.max(1, Math.round(pitch * 0.3));
    // a through-hole needs board around it: its centre is at least ~0.4 pitch inside the edge
    // (castellated pads such as the Pico's reach the edge, their hole sits further in)
    const [e0, e1] = horiz ? [b.y0, b.y1] : [b.x0, b.x1];
    let best = -Infinity, at2 = at;
    for (let i = 0; i < prof.length; i++) {
        const pos = at + i - reach;
        if (pos < e0 + 0.4 * pitch || pos > e1 - 0.4 * pitch) continue;
        let s = 0;
        for (let k = i - sm; k <= i + sm; k++) if (k >= 0 && k < prof.length) s += prof[k];
        if (s > best) { best = s; at2 = at + i - reach; }
    }
    return at2;
}

// --- 5. pins -------------------------------------------------------------------------------

// how much a hole's pad area differs from the board colour
function padScore(diff, W, H, cx, cy, pitch) {
    const r = pitch * 0.32, r2 = r * r;
    let s = 0, n = 0;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(H - 1, Math.ceil(cy + r)); y++)
        for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W - 1, Math.ceil(cx + r)); x++) {
            const dx = x - cx, dy = y - cy;
            if (dx * dx + dy * dy <= r2) { s += diff[y * W + x]; n++; }
        }
    return n ? s / n : 0;
}

// Each pin line on its own (a header of silver pads and one of black plastic can sit on the
// same board): cells that stand out from the board clearly more than the gaps between them, and
// that look like the line's other pads.
function findPins(image, diff, b, pitch, phaseX, phaseY, lines) {
    const { width: W, height: H } = image;
    const colOf = (x) => Math.round((x - phaseX) / pitch), rowOf = (y) => Math.round((y - phaseY) / pitch);
    const cx = (c) => phaseX + c * pitch, cy = (r) => phaseY + r * pitch;
    const cMin = Math.ceil((b.x0 - phaseX) / pitch - 0.2), cMax = Math.floor((b.x1 - phaseX) / pitch + 0.2);
    const rMin = Math.ceil((b.y0 - phaseY) / pitch - 0.2), rMax = Math.floor((b.y1 - phaseY) / pitch + 0.2);
    const found = new Map();
    let contrast = 0, nLines = 0;
    const line = (cells, gapAt) => {
        const sc = cells.map(([c, r]) => ({ c, r, s: padScore(diff, W, H, cx(c), cy(r), pitch) }));
        const gaps = gapAt.map(([x, y]) => padScore(diff, W, H, x, y, pitch * 0.6));
        const loS = median(gaps), hiS = percentile(sc.map(c => c.s), 0.75);
        if (!(hiS > loS * 1.15 + 3)) return;
        const thr = loS + 0.45 * (hiS - loS);
        let pins = sc.filter(c => c.s > thr);
        // all pads of a header have the same finish: drop cells far from the typical colour
        // (a shadow, or a part that happens to sit on the line)
        if (pins.length >= 4) {
            for (const c of pins) c.rgb = meanColour(image, cx(c.c), cy(c.r), pitch * 0.32);
            const ref = [0, 1, 2].map(k => median(pins.map(c => c.rgb[k])));
            const d = pins.map(c => Math.hypot(c.rgb[0] - ref[0], c.rgb[1] - ref[1], c.rgb[2] - ref[2]));
            const lim = Math.max(45, 2.5 * median(d));
            pins = pins.filter((c, i) => d[i] <= lim);
        }
        if (!pins.length) return;
        contrast += (median(pins.map(c => c.s)) - loS) / (loS + 8); nLines++;
        for (const c of pins) found.set(c.c + ',' + c.r, [c.c, c.r]);
    };
    const range = (a, z) => Array.from({ length: Math.max(0, z - a + 1) }, (_, i) => a + i);
    for (const y of lines.rows) {
        const r = rowOf(y);
        line(range(cMin, cMax).map(c => [c, r]), range(cMin, cMax - 1).map(c => [cx(c) + pitch / 2, cy(r)]));
    }
    for (const x of lines.cols) {
        const c = colOf(x);
        line(range(rMin, rMax).map(r => [c, r]), range(rMin, rMax - 1).map(r => [cx(c), cy(r) + pitch / 2]));
    }
    const pins = [...found.values()].sort((a, c) => a[1] - c[1] || a[0] - c[0]);
    const quality = nLines ? contrast / nLines * Math.sqrt(Math.min(pins.length, 40)) : 0;
    return { pins, quality };
}

function meanColour(img, cx, cy, r) {
    const { width: W, height: H, data } = img;
    const s = [0, 0, 0];
    let n = 0;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(H - 1, Math.ceil(cy + r)); y++)
        for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W - 1, Math.ceil(cx + r)); x++) {
            if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
            const i = (y * W + x) * 4;
            s[0] += data[i]; s[1] += data[i + 1]; s[2] += data[i + 2]; n++;
        }
    return n ? s.map(v => v / n) : s;
}

// Least-squares refit of pitch and phase from the found pins (each pin snapped to the centre of
// its pad blob), so long headers don't drift by the end.
function refineGrid(diff, W, H, pitch, phaseX, phaseY, pins) {
    if (pins.length < 3) return { pitch, phaseX, phaseY };
    const obs = [];
    for (const [c, r] of pins) {
        const x0 = phaseX + c * pitch, y0 = phaseY + r * pitch, R = pitch * 0.45;
        let sx = 0, sy = 0, sw = 0;
        for (let y = Math.max(0, Math.floor(y0 - R)); y <= Math.min(H - 1, Math.ceil(y0 + R)); y++)
            for (let x = Math.max(0, Math.floor(x0 - R)); x <= Math.min(W - 1, Math.ceil(x0 + R)); x++) {
                const w = diff[y * W + x];
                sx += w * x; sy += w * y; sw += w;
            }
        if (sw > 0) obs.push({ c, r, x: sx / sw, y: sy / sw });
    }
    // x = phaseX + c·p, y = phaseY + r·p: linear least squares in (p, phaseX, phaseY)
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], v = [0, 0, 0];
    for (const o of obs) {
        for (const [row, val] of [[[o.c, 1, 0], o.x], [[o.r, 0, 1], o.y]]) {
            for (let i = 0; i < 3; i++) { v[i] += row[i] * val; for (let j = 0; j < 3; j++) A[i][j] += row[i] * row[j]; }
        }
    }
    const sol = solve3(A, v);
    if (!sol || !(sol[0] > pitch * 0.9 && sol[0] < pitch * 1.1)) return { pitch, phaseX, phaseY };
    return { pitch: sol[0], phaseX: sol[1], phaseY: sol[2] };
}

function solve3(A, b) {
    const M = A.map((r, i) => [...r, b[i]]);
    for (let i = 0; i < 3; i++) {
        let p = i;
        for (let k = i + 1; k < 3; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k;
        if (Math.abs(M[p][i]) < 1e-9) return null;
        [M[i], M[p]] = [M[p], M[i]];
        for (let k = 0; k < 3; k++) if (k !== i) { const f = M[k][i] / M[i][i]; for (let j = i; j < 4; j++) M[k][j] -= f * M[i][j]; }
    }
    return M.map((r, i) => r[3] / r[i]);
}
