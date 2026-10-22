// Resistor colour code: the value ("10k", "4k7", "2.2 kΩ", "100") as colour rings.
// 4 rings = 2 digits + multiplier + tolerance (gold, 5 %), 5 rings = 3 digits + multiplier +
// tolerance (brown, 1 %). A part's `bands` is 4, 5 or 0 (no rings); resistors default to 5.

export const RING_COLORS = [
  ['black', '#111111'], ['brown', '#7a4a1e'], ['red', '#d1302f'], ['orange', '#f07c12'],
  ['yellow', '#f4d22a'], ['green', '#2f8f3a'], ['blue', '#2662c9'], ['violet', '#8a3fb5'],
  ['grey', '#9a9a9a'], ['white', '#f4f4f4'],
];
const GOLD = ['gold', '#c9a227'], SILVER = ['silver', '#c4c8cc'];

export const DEFAULT_BANDS = 5;

/** A valid `bands` value: 4, 5 or 0 (off). */
export const isBands = (n) => [0, 4, 5].includes(n);

/** The part's ring count: 4, 5 or 0 (off). */
export const bandsOf = (c) => (isBands(c?.bands) ? c.bands : DEFAULT_BANDS);

export function isResistor(c) {
  return c?.pins?.length === 2 && /resist|^R_/i.test(String(c.name || ''));
}

/** Ohms from a value string, or null. Accepts "10k", "4k7", "4.7K", "1M", "2R2", "100 Ω", "10kOhm". */
export function parseOhms(value) {
  const s = String(value ?? '').trim().replace(/\s*(Ω|ohms?)$/i, '').replace(/\s+/g, '');
  if (!s) return null;
  const m = s.match(/^(\d+)(?:([.,])(\d+))?([rRkKmM])?$/) || s.match(/^(\d+)([rRkKmM])(\d+)$/);
  if (!m) return null;
  let num, unit;
  if (m[2] === '.' || m[2] === ',' || m[2] === undefined) { num = parseFloat(`${m[1]}.${m[3] || 0}`); unit = m[4]; }
  else { num = parseFloat(`${m[1]}.${m[3]}`); unit = m[2]; } // 4k7 style
  const mult = { r: 1, k: 1e3, m: 1e6 }[String(unit || 'r').toLowerCase()];
  const ohms = num * mult;
  return Number.isFinite(ohms) && ohms > 0 ? ohms : null;
}

/**
 * The rings for `ohms` with `n` (4 or 5) rings: [[name, hex], ...], or null when the value needs
 * more digits than the rings have (e.g. 4.99k with 4 rings) or is out of range.
 */
export function ringsFor(ohms, n = 4) {
  if (!(ohms > 0) || (n !== 4 && n !== 5)) return null;
  const digits = n === 4 ? 2 : 3;
  // exponent so that the value is a whole number of `digits` significant digits
  for (let e = -2; e <= 9; e++) {
    const sig = ohms / 10 ** e;
    const r = Math.round(sig);
    if (Math.abs(sig - r) > 1e-6 * Math.max(1, sig)) continue;
    if (r >= 10 ** digits) continue;
    if (r < 10 ** (digits - 1) && e > -2) return null; // can't fill the leading digit: smaller exponent was tried first
    const ds = String(r).padStart(digits, '0').split('').map(Number);
    const mult = e === -2 ? SILVER : e === -1 ? GOLD : RING_COLORS[e];
    return [...ds.map(d => RING_COLORS[d]), mult, n === 4 ? GOLD : RING_COLORS[1]];
  }
  return null;
}

/** Rings to draw for a part, or null (not a resistor, rings off, value not codable). */
export function partRings(c) {
  if (!isResistor(c)) return null;
  const n = bandsOf(c);
  if (!n) return null;
  return ringsFor(parseOhms(c.value), n);
}
