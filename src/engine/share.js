// Shareable links: the whole board (circuit + layout) packed into the URL fragment `#b=...`.
// The fragment never reaches the server, so links work without a backend and stay out of logs.
//
// Link format:  #b=1<mode><payload>
//   1        format version
//   mode     'd' = deflate-raw (CompressionStream), 'u' = uncompressed
//   payload  base64url of the UTF-8 JSON below
//
// JSON (v1), all coordinates relative to `o` so the numbers stay small:
//   { o: [col0, row0],
//     n: ["VCC", "GND", ...],                         net names
//     c: [[id, name, value, w, h, ox, oy, pins, extra?], ...]
//          pins  = flat [dCol, dRow, net, label, ...] in the part's current rotation;
//                  net = index into n plus 1, 0 = unconnected
//          extra = { u: 0 } for routeUnder: false, { k: "#hex" } for a custom colour
//     w: [[net, flags, col, row, steps], ...]          flags: 1 = jumper, 2 = failed
//          steps = run-length unit steps "r3d2l" (r/l/u/d), any other step as "~dc,dr;" }
//
// The circuit JSON in the Circuit Definition box is derived from the placed components (their
// pins in the current rotation, body = w x h box), so the components carry the circuit too.

const VERSION = '1';
const MAX_PAYLOAD = 200000;   // characters of the encoded fragment
const MAX_PARTS = 500, MAX_PINS = 400, MAX_WIRES = 5000, MAX_STEPS = 20000, MAX_COORD = 2000000;

export class ShareError extends Error {}

const DIRS = { r: [1, 0], l: [-1, 0], d: [0, 1], u: [0, -1] };
const dirOf = (dc, dr) => (dr === 0 ? (dc === 1 ? 'r' : dc === -1 ? 'l' : null) : dc === 0 ? (dr === 1 ? 'd' : dr === -1 ? 'u' : null) : null);

function encodeSteps(path) {
  let out = '', last = null, run = 0;
  const flush = () => { if (last) out += last + (run > 1 ? run : ''); last = null; run = 0; };
  for (let i = 1; i < path.length; i++) {
    const dc = path[i].col - path[i - 1].col, dr = path[i].row - path[i - 1].row;
    const d = dirOf(dc, dr);
    if (d && d === last) { run++; continue; }
    flush();
    if (d) { last = d; run = 1; } else out += `~${dc},${dr};`;
  }
  flush();
  return out;
}

function decodeSteps(start, steps) {
  const path = [start];
  let { col, row } = start, i = 0;
  const push = (c, r) => {
    if (path.length > MAX_STEPS) throw new ShareError('wire too long');
    col = c; row = r; path.push({ col, row });
  };
  while (i < steps.length) {
    const ch = steps[i];
    if (DIRS[ch]) {
      let j = i + 1;
      while (j < steps.length && steps[j] >= '0' && steps[j] <= '9') j++;
      const n = j > i + 1 ? parseInt(steps.slice(i + 1, j), 10) : 1;
      if (!(n >= 1 && n <= MAX_STEPS)) throw new ShareError('bad step count');
      const [dc, dr] = DIRS[ch];
      for (let k = 0; k < n; k++) push(col + dc, row + dr);
      i = j;
    } else if (ch === '~') {
      const end = steps.indexOf(';', i);
      const m = end > 0 && /^~(-?\d+),(-?\d+)$/.exec(steps.slice(i, end));
      if (!m) throw new ShareError('bad wire step');
      push(col + parseInt(m[1], 10), row + parseInt(m[2], 10));
      i = end + 1;
    } else throw new ShareError('bad wire step');
  }
  return path;
}

/** Board -> compact plain object (no compression). */
export function packBoard(components, wires) {
  let minC = Infinity, minR = Infinity;
  for (const c of components) { minC = Math.min(minC, c.ox); minR = Math.min(minR, c.oy); }
  for (const w of wires) for (const p of w.path || []) { minC = Math.min(minC, p.col); minR = Math.min(minR, p.row); }
  if (!isFinite(minC)) { minC = 0; minR = 0; }

  const nets = [], netIdx = new Map();
  const net = (name) => {
    if (!name) return 0;
    if (!netIdx.has(name)) { netIdx.set(name, nets.length); nets.push(name); }
    return netIdx.get(name) + 1;
  };

  const c = components.map(comp => {
    const pins = [];
    for (const p of comp.pins) pins.push(p.dCol, p.dRow, net(p.net), p.lbl ?? '');
    const extra = {};
    if (comp.routeUnder === false) extra.u = 0;
    if (comp.color) extra.k = comp.color;
    const row = [comp.id, comp.name ?? '', comp.value ?? '', comp.w, comp.h, comp.ox - minC, comp.oy - minR, pins];
    if (Object.keys(extra).length) row.push(extra);
    return row;
  });

  const w = wires.filter(wr => wr.path?.length).map(wr => [
    net(wr.net), (wr.jumper ? 1 : 0) | (wr.failed ? 2 : 0),
    wr.path[0].col - minC, wr.path[0].row - minR, encodeSteps(wr.path),
  ]);

  return { o: [minC, minR], n: nets, c, w };
}

const isInt = (v, lo = -MAX_COORD, hi = MAX_COORD) => Number.isInteger(v) && v >= lo && v <= hi;
const isStr = (v, max = 200) => typeof v === 'string' && v.length <= max;

/** Compact object -> { components, wires } in engine form. Throws ShareError if malformed. */
export function unpackBoard(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.c) || !Array.isArray(data.n)) throw new ShareError('missing board data');
  const [oc, or] = Array.isArray(data.o) ? data.o : [0, 0];
  if (!isInt(oc) || !isInt(or)) throw new ShareError('bad origin');
  const nets = data.n;
  if (nets.length > 2000 || !nets.every(s => isStr(s) && s)) throw new ShareError('bad net list');
  if (!data.c.length || data.c.length > MAX_PARTS) throw new ShareError('bad part count');
  const netName = (i) => {
    if (!isInt(i, 0, nets.length)) throw new ShareError('bad net index');
    return i === 0 ? '' : nets[i - 1];
  };

  const ids = new Set();
  const components = data.c.map(row => {
    if (!Array.isArray(row) || row.length < 8) throw new ShareError('bad part');
    const [id, name, value, w, h, x, y, pins, extra] = row;
    if (!isStr(id, 40) || !id || ids.has(id)) throw new ShareError('bad part id');
    ids.add(id);
    if (!isStr(name) || !isStr(value)) throw new ShareError(`bad name for ${id}`);
    if (!isInt(w, 1, 200) || !isInt(h, 1, 200) || !isInt(x) || !isInt(y)) throw new ShareError(`bad size or position for ${id}`);
    if (!Array.isArray(pins) || !pins.length || pins.length % 4 || pins.length / 4 > MAX_PINS) throw new ShareError(`bad pins for ${id}`);
    const ox = x + oc, oy = y + or;
    const comp = { id, name, value, color: null, routeUnder: true, w, h, ox, oy, pins: [] };
    if (extra !== undefined) {
      if (!extra || typeof extra !== 'object') throw new ShareError(`bad options for ${id}`);
      if (extra.u === 0) comp.routeUnder = false;
      if (extra.k !== undefined) {
        if (!isStr(extra.k, 40)) throw new ShareError(`bad colour for ${id}`);
        comp.color = extra.k;
      }
    }
    const seen = new Set();
    for (let i = 0; i < pins.length; i += 4) {
      const [dCol, dRow, n, lbl] = pins.slice(i, i + 4);
      if (!isInt(dCol, 0, w - 1) || !isInt(dRow, 0, h - 1)) throw new ShareError(`pin outside part ${id}`);
      if (seen.has(dCol * 1000 + dRow)) throw new ShareError(`two pins in one hole on ${id}`);
      seen.add(dCol * 1000 + dRow);
      if (!isStr(lbl, 40)) throw new ShareError(`bad pin label on ${id}`);
      comp.pins.push({ dCol, dRow, col: ox + dCol, row: oy + dRow, net: netName(n), lbl });
    }
    return comp;
  });

  const wl = Array.isArray(data.w) ? data.w : [];
  if (wl.length > MAX_WIRES) throw new ShareError('too many wires');
  const wires = wl.map(row => {
    if (!Array.isArray(row) || row.length !== 5) throw new ShareError('bad wire');
    const [n, flags, x, y, steps] = row;
    if (!isInt(flags, 0, 3) || !isInt(x) || !isInt(y) || !isStr(steps, MAX_STEPS * 2)) throw new ShareError('bad wire');
    const wire = { net: netName(n), failed: !!(flags & 2), path: decodeSteps({ col: x + oc, row: y + or }, steps) };
    if (flags & 1) wire.jumper = true;
    return wire;
  });

  return { components, wires };
}

// --- bytes <-> base64url ---
function toB64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s) {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new ShareError('link contains invalid characters');
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  let bin;
  try { bin = atob(b64); } catch { throw new ShareError('link is not valid base64'); }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

const hasCompression = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

/** Board -> fragment value (the part after `#b=`). */
export async function encodeShare(components, wires, { compress = true } = {}) {
  const bytes = new TextEncoder().encode(JSON.stringify(packBoard(components, wires)));
  if (compress && hasCompression()) {
    try { return VERSION + 'd' + toB64url(await pipe(bytes, new CompressionStream('deflate-raw'))); }
    catch (e) { console.warn('share: compression failed, using an uncompressed link', e); }
  }
  return VERSION + 'u' + toB64url(bytes);
}

/** Fragment value -> { components, wires }. Throws ShareError with a readable message. */
export async function decodeShare(value) {
  if (typeof value !== 'string' || value.length < 3) throw new ShareError('the link is empty or cut off');
  if (value.length > MAX_PAYLOAD) throw new ShareError('the link is too long');
  if (value[0] !== VERSION) throw new ShareError('the link was made by a newer version of boardroute');
  const mode = value[1];
  let bytes = fromB64url(value.slice(2));
  if (mode === 'd') {
    if (!hasCompression()) throw new ShareError('this browser cannot unpack compressed links');
    try { bytes = await pipe(bytes, new DecompressionStream('deflate-raw')); }
    catch { throw new ShareError('the link is damaged or cut off'); }
  } else if (mode !== 'u') throw new ShareError('unknown link format');
  let data;
  try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new ShareError('the link is damaged or cut off'); }
  return unpackBoard(data);
}

/** The share value in a location hash (`#b=...`), or null. */
export function shareFromHash(hash) {
  const m = /^#b=(.+)$/.exec(hash || '');
  return m ? m[1] : null;
}

/** Full link for the current page. */
export async function shareUrl(components, wires) {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#b=${await encodeShare(components, wires)}`;
}
