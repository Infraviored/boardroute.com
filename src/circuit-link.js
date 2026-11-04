// Circuit links: https://boardroute.com/#circuit=<URL-encoded JSON> (or ?circuit=...) open a circuit
// (short AI format or full format) and lay it out. AIs paste these links, so decoding is forgiving.

const tryParse = (s) => { try { return JSON.parse(s) && s; } catch { return null; } };

// raw URL value -> clean JSON text, or null
export function cleanCircuit(raw) {
  if (!raw) return null;
  let v = raw;
  try { v = decodeURIComponent(raw); } catch { /* keep the raw string */ }
  const variants = (s) => {
    s = s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const end = s.lastIndexOf('}');
    return [s, end >= 0 ? s.slice(0, end + 1) : s];
  };
  // '+' is a space only if the strict parse fails (a literal '+' can occur in a value)
  for (const s of [v, v.replace(/\+/g, ' ')]) for (const t of variants(s)) if (tryParse(t)) return t;
  return null;
}

// raw value in the address (hash first), not validated
export function circuitParam(hash, search) {
  const h = /^#circuit=([\s\S]*)$/.exec(hash || '');
  if (h) return h[1];
  // URLSearchParams would turn '+' into a space before we can decide; read the raw value
  const q = /[?&]circuit=([^&]*)/.exec(search || '');
  return q ? q[1] : null;
}

// JSON text from the address, or null when there is no circuit link; '' when there is one but it cannot be read.
export function circuitFromLocation(hash, search) {
  const raw = circuitParam(hash, search);
  if (raw == null) return null;
  return cleanCircuit(raw) ?? '';
}

// address without the circuit value (keeps other params)
export function withoutCircuit(pathname, hash, search) {
  const q = (search || '').replace(/([?&])circuit=[^&]*&?/, '$1').replace(/[?&]$/, '');
  return pathname + q + (/^#circuit=/.test(hash || '') ? '' : (hash || ''));
}

// brackets encoded too: a Markdown link [..](url) would end at the first ')'
export const circuitLink = (json, origin = 'https://boardroute.com') =>
  `${origin}/#circuit=${encodeURIComponent(JSON.stringify(json)).replace(/\(/g, '%28').replace(/\)/g, '%29')}`;
