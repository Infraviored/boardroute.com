export const TEMPLATE = {
    components: [
        {
            id: 'J1', name: 'Power', value: '2-pin',
            pins: [{ offset: [0, 0], net: 'VCC', label: '+' }, { offset: [0, 1], net: 'GND', label: '-' }]
        },
        {
            id: 'R1', name: 'Resistor', value: '10k',
            pins: [{ offset: [0, 0], net: 'VCC', label: '1' }, { offset: [2, 0], net: 'GATE', label: '2' }]
        },
        {
            id: 'Q1', name: 'N-MOSFET', value: 'IRLZ44N',
            pins: [{ offset: [0, 0], net: 'GATE', label: 'G' },
            { offset: [1, 0], net: 'DRAIN', label: 'D' },
            { offset: [2, 0], net: 'SOURCE', label: 'S' }],
            body: { offset: [-1, -1], size: [5, 2] } // standing TO-220, tab towards row -1
        },
        {
            id: 'RL1', name: 'Relay', value: '5V coil',
            pins: [{ offset: [0, 0], net: 'VCC', label: 'A' }, { offset: [0, 1], net: 'DRAIN', label: 'B' }],
            body: { offset: [-1, -2], size: [8, 6] } // 19 x 15.5 mm housing
        },
        {
            id: 'C1', name: 'Cap', value: '100uF',
            pins: [{ offset: [0, 0], net: 'VCC', label: '+' }, { offset: [1, 0], net: 'GND', label: '-' }],
            body: { offset: [0, -1], size: [2, 3] } // 6.3 mm electrolytic can
        },
        {
            id: 'D1', name: 'Diode', value: '1N4007',
            pins: [{ offset: [0, 0], net: 'SOURCE', label: 'K' }, { offset: [1, 0], net: 'GND', label: 'A' }]
        }
    ],
    connections: [
        { net: 'VCC', comment: 'J1+ → R1[1], RL1[A], C1+' },
        { net: 'GND', comment: 'J1- → C1-, D1[A]' },
        { net: 'GATE', comment: 'R1[2] → Q1[G]' },
        { net: 'DRAIN', comment: 'Q1[D] → RL1[B]' },
        { net: 'SOURCE', comment: 'Q1[S] → D1[K]' }
    ]
};

// Optional physical body on the component side: { offset: [col, row], size: [w, h] } in holes,
// in the same frame as the pin offsets. Returns [col0, row0, col1, row1] (inclusive) or null.
function parseBody(body) {
    if (!body || typeof body !== 'object') return null;
    const off = Array.isArray(body.offset) ? body.offset : [body.offset?.col ?? 0, body.offset?.row ?? 0];
    const size = Array.isArray(body.size) ? body.size : [body.size?.w, body.size?.h];
    const [c, r] = off.map(v => Math.round(Number(v) || 0));
    const [w, h] = size.map(v => Math.round(Number(v)));
    if (!(w >= 1 && h >= 1)) return null;
    return [c, r, c + w - 1, r + h - 1];
}

// The part's footprint (w x h) is the bounding box of its pins and its optional body. The
// body only matters on the component side (other parts, jumper wires); solder-side wires
// still pass under it unless routeUnder is false.
export function processTemplate(data) {
    if (!data.components?.length) return null;

    return data.components.map((cd, idx) => {
        if (!cd.pins?.length) return null;
        const offsets = cd.pins.map(p =>
            Array.isArray(p.offset) ? [...p.offset] : [p.offset?.col || 0, p.offset?.row || 0]);

        const colValues = offsets.map(o => o[0]);
        const rowValues = offsets.map(o => o[1]);
        let minCol = Math.min(...colValues);
        let minRow = Math.min(...rowValues);
        let maxCol = Math.max(...colValues);
        let maxRow = Math.max(...rowValues);
        const body = parseBody(cd.body);
        if (body) {
            minCol = Math.min(minCol, body[0]); minRow = Math.min(minRow, body[1]);
            maxCol = Math.max(maxCol, body[2]); maxRow = Math.max(maxRow, body[3]);
        }

        const normalizedOffsets = offsets.map(off => [off[0] - minCol, off[1] - minRow]);

        return {
            id: cd.id || ('C' + (idx + 1)),
            name: cd.name || '?',
            value: cd.value || '',
            color: cd.color || null,
            // Wiring runs on the solder side, so wires may pass under a part unless it says otherwise.
            routeUnder: cd.routeUnder !== false,
            offsets: normalizedOffsets,
            pinNets: cd.pins.map(p => p.net || null),
            pinLbls: cd.pins.map(p => p.label || p.lbl || String(idx + 1)),
            w: maxCol - minCol + 1,
            h: maxRow - minRow + 1,
            boardOffset: [minCol, minRow],
        };
    }).filter(Boolean);
}

// `body` of a placed component for the circuit JSON: its whole w x h box when that is larger
// than the pins' bounding box, else null. Pins are written relative to the box origin
// (dCol/dRow), so this stays exact in whatever rotation the part currently has.
// Trade-off: the export writes the full box because pins are exported in the rotated frame,
// preserving the exact visual/blocking envelope in the current orientation.
export function bodyOf(c) {
    if (!c.pins?.length || !c.w || !c.h) return null;
    let minC = Infinity, minR = Infinity, maxC = -Infinity, maxR = -Infinity;
    for (const p of c.pins) {
        minC = Math.min(minC, p.dCol); maxC = Math.max(maxC, p.dCol);
        minR = Math.min(minR, p.dRow); maxR = Math.max(maxR, p.dRow);
    }
    if (minC === 0 && minR === 0 && maxC === c.w - 1 && maxR === c.h - 1) return null;
    return { offset: [0, 0], size: [c.w, c.h] };
}

export function generateJSONFromState(components) {
    const json = { components: [] };
    components.forEach(c => {
        const compJson = {
            id: c.id,
            name: c.name || '',
            value: c.value || '',
            ...(c.color ? { color: c.color } : {}),
            pins: c.pins.map(p => ({
                offset: [p.dCol, p.dRow],
                net: p.net,
                label: p.lbl || ''
            }))
        };
        if (c.routeUnder === false) compJson.routeUnder = false;
        const body = bodyOf(c);
        if (body) compJson.body = body;
        json.components.push(compJson);
    });

    // Reconstruct connections document for readability
    const connectionsMap = new Map();
    components.forEach(c => {
        c.pins.forEach(p => {
            if (p.net) {
                if (!connectionsMap.has(p.net)) connectionsMap.set(p.net, []);
                connectionsMap.get(p.net).push(`${c.id}[${p.lbl}]`);
            }
        });
    });
    const connections = [];
    for (const [net, pts] of connectionsMap.entries()) {
        if (pts.length > 1) {
            connections.push({ net, comment: pts.join(' → ') });
        }
    }
    json.connections = connections;
    return json;
}
