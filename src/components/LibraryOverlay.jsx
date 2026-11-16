import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MOBILE_MQ, isMobile, isTouch } from '../mobile.js';
import { Camera, X } from 'lucide-react';
import { compColor } from '../engine/render-utils.js';
import { ModalShell, Button } from './ui';
import { indexPart, matches, squash } from '../engine/part-lookup.js';

const PAGE = 120; // rendered rows per "show more" step; the KiCad set has ~1,100 parts

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

export function LibraryOverlay({ isOpen, onClose, onSelect, onPhoto, replaceTitle = null, initialSearch = null }) {
    const [curated, setCurated] = useState([]);
    const [kicad, setKicad] = useState(null); // null = not loaded yet
    const [kicadError, setKicadError] = useState(false);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('All');
    const [limit, setLimit] = useState(PAGE);
    const kicadRequested = useRef(false);
    const searchRef = useRef(null);

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

    // replacing a stand-in part: start with a search for its name (state adjusted while rendering)
    const [seeded, setSeeded] = useState(null);
    const seed = isOpen && initialSearch !== null ? initialSearch : null;
    if (seed !== seeded) {
        setSeeded(seed);
        if (seed !== null) { setSearch(seed); setCategory('All'); setLimit(PAGE); }
    }

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
        <ModalShell isOpen onClose={onClose} maxWidth="720px" className="lib-modal" ariaLabel={replaceTitle || 'Part library'}>
            <ModalShell.Header title={replaceTitle || 'Part library'} onClose={onClose} />
            <ModalShell.Body className="lib-body">
                <div className="lib-search-row">
                    <div className="lib-search">
                        {/* no autofocus on touch: it would pop up the keyboard over the list */}
                        <input
                            ref={searchRef}
                            type="text"
                            className="ui-input"
                            placeholder={isMobile() ? 'Search: ESP32, DIP-8, relay…' : 'Search, e.g. ESP32, DIP-8, TO-220, relay…'}
                            value={search}
                            onChange={(e) => setQuery(e.target.value)}
                            autoFocus={!isTouch()}
                        />
                        {search && (
                            <button type="button" className="lib-clear" onClick={() => { setQuery(''); searchRef.current?.focus(); }} aria-label="Clear search" title="Clear search">
                                <X size={15} />
                            </button>
                        )}
                    </div>
                    {onPhoto && (
                        <Button icon={<Camera size={14} />} onClick={onPhoto} className="lib-photo" title="Photo, pasted image or URL of the part: pins and size are read from it">
                            Footprint from a photo
                        </Button>
                    )}
                </div>
                <div className="lib-cats">
                    {[['All', entries.length], ...categories].map(([cat, n]) => (
                        <button key={cat} className={'lib-cat' + (cat === category ? ' active' : '')} onClick={() => pickCategory(cat)}>
                            {cat} <span>{n}</span>
                        </button>
                    ))}
                </div>
                <div className="lib-count">
                    {filtered.length} part{filtered.length === 1 ? '' : 's'}
                    {kicad === null && ', loading KiCad footprints…'}
                    {kicadError && ', KiCad library could not be loaded'}
                </div>
                <div className="lib-list">
                    {kicad !== null && filtered.length === 0 && (
                        <div className="lib-empty">
                            <p>{search.trim() ? <>Nothing matches &ldquo;{search.trim()}&rdquo;.</> : 'Nothing in this category.'}</p>
                            {onPhoto && <Button icon={<Camera size={14} />} onClick={onPhoto}>From a photo</Button>}
                        </div>
                    )}
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
                        <Button className="lib-more" onClick={() => setLimit(l => l + PAGE)}>
                            Show more ({filtered.length - shown.length} left)
                        </Button>
                    )}
                </div>
            </ModalShell.Body>
            <ModalShell.Footer align="left" className="lib-credit">
                <span>
                    Parts not marked Curated are generated from the{' '}
                    <a href="https://gitlab.com/kicad/libraries/kicad-footprints" target="_blank" rel="noreferrer">KiCad footprint libraries</a>
                    {' '}(CC-BY-SA 4.0 with an exception for designs using them); only through-hole parts whose pins sit on the 2.54 mm grid.
                </span>
            </ModalShell.Footer>

            <style dangerouslySetInnerHTML={{
                __html: `
        .lib-modal { width: calc(100% - 32px); height: min(720px, calc(100vh - 48px)); }
        .lib-modal .lib-body { display: flex; flex-direction: column; gap: 12px; overflow: hidden; }
        .lib-search-row { display: flex; gap: 8px; flex-shrink: 0; }
        .lib-search { position: relative; flex: 1; min-width: 0; }
        .lib-search input { width: 100%; padding-right: 36px; font-family: inherit; }
        .lib-clear { position: absolute; right: 2px; top: 50%; transform: translateY(-50%); width: 28px; height: 28px; display: grid; place-items: center; padding: 0; border: 0; border-radius: var(--radius-sm); background: none; color: var(--txt1); cursor: pointer; }
        .lib-clear:hover { color: var(--txt0); background: var(--ui-ghost-hover); }
        .lib-search-row .lib-photo { flex: none; height: 32px; }
        .lib-cats { display: flex; flex-wrap: nowrap; gap: 6px; flex-shrink: 0; overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin; }
        .lib-cat {
          flex: none; white-space: nowrap; font: inherit; font-size: var(--fs-xs); font-weight: 600; height: 24px; padding: 0 10px; border-radius: var(--radius-full); cursor: pointer;
          background: var(--ui-neutral); border: 1px solid var(--border); color: var(--txt1);
          transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
        }
        .lib-cat span { color: var(--txt2); font-weight: 500; }
        .lib-cat:hover { background: var(--ui-neutral-hover); color: var(--txt0); }
        .lib-cat.active { border-color: transparent; color: var(--acc-hover); background: var(--acc-subtle); }
        .lib-cat.active span { color: var(--acc-hover); opacity: .8; }
        .lib-count { font-size: var(--fs-xs); color: var(--txt1); margin-top: -4px; }
        .lib-list { flex: 1; min-height: 120px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
        .lib-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 12px;
          background: var(--ui-neutral);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: background 0.12s ease, border-color 0.12s ease;
          flex-shrink: 0;
        }
        .lib-item:hover { background: var(--ui-neutral-hover); border-color: var(--border2); }
        .lib-item:active { background: var(--ui-neutral-active); }
        .lib-thumb { width: 52px; height: 40px; flex-shrink: 0; background: #0a0f0c; border-radius: var(--radius-md); padding: 4px; }
        .lib-info { min-width: 0; }
        .lib-name { font-size: var(--fs-md); font-weight: 600; color: var(--txt0); overflow-wrap: anywhere; }
        .lib-val { font-size: var(--fs-xs); color: var(--txt2); margin-top: 2px; }
        .lib-src { color: var(--txt1); }
        .lib-more { align-self: center; margin: 4px 0; flex-shrink: 0; }
        .lib-empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 32px 16px; text-align: center; color: var(--txt1); font-size: var(--fs-sm); }
        .lib-empty p { margin: 0; }
        .ui-modal-footer.lib-credit { font-size: var(--fs-xs); color: var(--txt2); line-height: 1.4; }
        .lib-credit a { color: var(--txt1); }

        @media ${MOBILE_MQ} {
          .lib-modal { width: 100vw; height: 100dvh; max-height: 100dvh; max-width: 100vw !important; border-radius: 0; border: 0; }
          .lib-search-row { flex-direction: column; }
          .lib-search-row .lib-photo { height: 40px; }
          .lib-search input { padding-right: 44px; }
          .lib-clear { width: 40px; height: 40px; right: 0; }
          .lib-cats { margin: 0 -20px; padding: 0 20px 6px; }
          .lib-cat { height: 40px; padding: 0 14px; font-size: var(--fs-sm); }
          .lib-item { min-height: 52px; padding: 10px 12px; }
          .lib-more, .lib-empty .ui-btn { min-height: 44px; }
          .ui-modal-footer.lib-credit { padding-bottom: max(14px, env(safe-area-inset-bottom, 0px)); }
        }
      `}} />
        </ModalShell>
    );
}
