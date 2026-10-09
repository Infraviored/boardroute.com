import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Camera } from 'lucide-react';
import { compColor } from '../engine/render-utils.js';

const CURATED = 'Curated';
const PAGE = 120; // rendered rows per "show more" step; the KiCad set has ~1,100 parts

// lower-case text plus a copy without separators, so "dip8", "DIP 8" and "DIP-8" all match "DIP-8_W7.62mm"
const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

function indexPart(c, origin) {
    const text = [c.name, c.value, c.desc, c.category, c.source, ...(c.aka || [])].filter(Boolean).join(' ').toLowerCase();
    return { c, origin, category: c.category || CURATED, text, flat: squash(text), name: c.name.toLowerCase() };
}

// every search word must match; parts whose name starts with the query come first
function matches(entry, words) {
    return words.every(w => entry.text.includes(w) || (squash(w) && entry.flat.includes(squash(w))));
}

// footprint thumbnail: body box + pins, in holes
function Thumb({ part }) {
    const pts = part.pins.map(p => p.offset);
    let x0 = Math.min(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1]));
    let x1 = Math.max(...pts.map(p => p[0])), y1 = Math.max(...pts.map(p => p[1]));
    const b = part.body;
    if (b) {
        x0 = Math.min(x0, b.offset[0]); y0 = Math.min(y0, b.offset[1]);
        x1 = Math.max(x1, b.offset[0] + b.size[0] - 1); y1 = Math.max(y1, b.offset[1] + b.size[1] - 1);
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const color = compColor(part);
    return (
        <svg className="lib-thumb" viewBox={`${x0 - 0.5} ${y0 - 0.5} ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
            <rect x={(b ? b.offset[0] : x0) - 0.45} y={(b ? b.offset[1] : y0) - 0.45}
                width={(b ? b.size[0] : w) - 0.1} height={(b ? b.size[1] : h) - 0.1}
                rx="0.3" fill={color} fillOpacity="0.35" stroke={color} strokeWidth={Math.max(w, h) / 40} />
            {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="0.28" fill={i === 0 ? '#fff' : '#c9d1d9'} />)}
        </svg>
    );
}

export function LibraryOverlay({ isOpen, onClose, onSelect, onPhoto }) {
    const [curated, setCurated] = useState([]);
    const [kicad, setKicad] = useState(null); // null = not loaded yet
    const [kicadError, setKicadError] = useState(false);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('All');
    const [limit, setLimit] = useState(PAGE);
    const kicadRequested = useRef(false);

    useEffect(() => {
        fetch('/component_database.json')
            .then(r => r.json())
            .then(setCurated)
            .catch(console.error);
    }, []);

    // the big KiCad-derived library only loads the first time the dialog opens
    useEffect(() => {
        if (!isOpen || kicadRequested.current) return;
        kicadRequested.current = true;
        fetch('/kicad_library.json')
            .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
            .then(d => setKicad(d.parts || []))
            .catch(err => { console.error(err); setKicadError(true); setKicad([]); });
    }, [isOpen]);

    const entries = useMemo(() => [
        ...curated.map(c => indexPart(c, 'curated')),
        ...(kicad || []).map(c => indexPart(c, 'kicad')),
    ], [curated, kicad]);

    const categories = useMemo(() => {
        const counts = new Map();
        for (const e of entries) counts.set(e.category, (counts.get(e.category) || 0) + 1);
        return [...counts.entries()];
    }, [entries]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const words = q.split(/\s+/).filter(Boolean);
        const list = entries.filter(e => (category === 'All' || e.category === category) && matches(e, words));
        if (!q) return list;
        // stable: curated first, then name-prefix hits, then the rest in library order
        const rank = (e) => (e.origin === 'curated' ? 0 : 2) + (e.name.startsWith(q) || e.flat.startsWith(squash(q)) ? 0 : 1);
        return list.map((e, i) => [rank(e), i, e]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]);
    }, [entries, search, category]);

    if (!isOpen) return null;

    const shown = filtered.slice(0, limit);
    const setQuery = (v) => { setSearch(v); setLimit(PAGE); };
    const pickCategory = (v) => { setCategory(v); setLimit(PAGE); };

    return (
        <div className="overlay-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="modal lib-modal">
                <div className="modal-header">
                    <h3>Component Library</h3>
                    {onPhoto && (
                        <label className="lib-photo" title="Take or pick a photo of the part: pins and size are read from it">
                            <Camera size={14} /> From a photo
                            <input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPhoto(f); }} />
                        </label>
                    )}
                    <button className="close-btn" onClick={onClose}>✕</button>
                </div>
                <input
                    type="text"
                    placeholder="Search, e.g. ESP32, DIP-8, TO-220, relay…"
                    value={search}
                    onChange={(e) => setQuery(e.target.value)}
                    autoFocus
                />
                <div className="lib-cats">
                    {[['All', entries.length], ...categories].map(([cat, n]) => (
                        <button key={cat} className={'lib-cat' + (cat === category ? ' active' : '')} onClick={() => pickCategory(cat)}>
                            {cat} <span>{n}</span>
                        </button>
                    ))}
                </div>
                <div className="lib-count">
                    {filtered.length} part{filtered.length === 1 ? '' : 's'}
                    {kicad === null && ' · loading KiCad footprints…'}
                    {kicadError && ' · KiCad library could not be loaded'}
                </div>
                <div className="lib-list">
                    {shown.map((e) => {
                        const c = e.c;
                        const alias = search.trim() && c.aka?.find(a => a.toLowerCase().includes(search.trim().toLowerCase()));
                        return (
                            <div key={e.origin + ':' + (c.source || c.name)} className="lib-item" onClick={() => onSelect(c)}
                                title={c.desc || c.name}>
                                <Thumb part={c} />
                                <div className="lib-info">
                                    <div className="lib-name">{c.name}</div>
                                    <div className="lib-val">
                                        {c.value} • {c.pins.length} pins
                                        {c.body && ` • body ${c.body.size[0]}×${c.body.size[1]}`}
                                        {' • '}<span className="lib-src">{e.origin === 'kicad' ? e.category : 'Curated'}</span>
                                    </div>
                                    {alias && <div className="lib-val">same holes as {alias}</div>}
                                </div>
                            </div>
                        );
                    })}
                    {filtered.length > shown.length && (
                        <button className="btn lib-more" onClick={() => setLimit(l => l + PAGE)}>
                            Show more ({filtered.length - shown.length} left)
                        </button>
                    )}
                </div>
                <div className="lib-credit">
                    Parts not marked Curated are generated from the{' '}
                    <a href="https://gitlab.com/kicad/libraries/kicad-footprints" target="_blank" rel="noreferrer">KiCad footprint libraries</a>
                    {' '}(CC-BY-SA 4.0 with an exception for designs using them); only through-hole parts whose pins sit on the 2.54 mm grid.
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
        .lib-modal { max-width: 640px; max-height: 86vh; }
        .lib-photo { margin-left: auto; margin-right: 8px; display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: 7px; border: 1px solid var(--blu); color: var(--blu-bright); font-size: var(--fs-sm); font-weight: 600; cursor: pointer; }
        .lib-photo:hover { background: rgba(31,111,235,.12); }
        .lib-cats { display: flex; flex-wrap: wrap; gap: 4px; flex-shrink: 0; }
        .lib-cat {
          font-size: .7em; padding: 3px 8px; border-radius: 10px; cursor: pointer;
          background: var(--bg3); border: 1px solid var(--border2); color: var(--txt1);
        }
        .lib-cat span { color: var(--txt2); }
        .lib-cat.active { border-color: var(--blu-bright); color: var(--blu-bright); }
        .lib-cat.active span { color: var(--blu-bright); opacity: .7; }
        .lib-count { font-size: .7em; color: var(--txt1); margin-top: -6px; }
        .lib-list { flex: 1; min-height: 120px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
        .lib-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 10px;
          background: var(--bg3);
          border: 1px solid var(--border2);
          border-radius: 6px;
          cursor: pointer;
          transition: .12s;
          flex-shrink: 0;
        }
        .lib-item:hover { background: var(--bg4); border-color: var(--blu); }
        .lib-swatch { width: 32px; height: 32px; border-radius: 4px; flex-shrink: 0; }
        .lib-thumb { width: 52px; height: 40px; flex-shrink: 0; background: #0a0f0c; border-radius: 6px; padding: 3px; }
        .lib-info { min-width: 0; }
        .lib-name { font-size: .85em; font-weight: 700; color: var(--txt0); overflow-wrap: anywhere; }
        .lib-val { font-size: .7em; color: var(--txt2); margin-top: 2px; }
        .lib-src { color: var(--txt1); }
        .lib-more { align-self: center; margin: 4px 0; flex-shrink: 0; }
        .lib-credit { font-size: .65em; color: var(--txt2); line-height: 1.4; }
        .lib-credit a { color: var(--txt1); }
      `}} />
        </div>
    );
}
