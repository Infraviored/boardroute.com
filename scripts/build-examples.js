// Writes public/examples.json: the example circuits offered in the app's "Examples" picker
// (and on first visit), each with the best layout the benchmark has found as a preview.
// Circuits come from bench/circuits, previews from bench/best. Re-run after the benchmark
// finds better layouts or when adding an example:
//   node scripts/build-examples.js
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// id -> benchmark circuit, shown in this order
const EXAMPLES = [
    { id: 'relay-driver', src: '01_default', title: 'Relay driver', level: 'Starter',
        blurb: 'A MOSFET switches a relay coil, with a flyback diode and a buffer capacitor. Six parts, the quickest way to see all three steps.' },
    { id: 'esp32-led', src: '02_simple_esp', title: 'ESP32-C3 with an LED', level: 'Starter',
        blurb: 'A microcontroller board, one LED with its resistor, and power. Shows how wires run under a module.' },
    { id: 'blinker-555', src: '04_blinker555', title: '555 LED blinker', level: 'Classic',
        blurb: 'The classic astable 555 timer: three resistors, three capacitors, an LED and a header around a DIP-8 chip.' },
    { id: 'door-strike', src: '03_door_striker', title: 'Door strike controller', level: 'Classic',
        blurb: 'An ESP32-C3 switches a 12 V door strike through a logic-level MOSFET, with gate and pull-down resistors.' },
    { id: 'opamp-dual', src: '05_opamp_dual', title: 'Dual op-amp amplifier', level: 'Classic',
        blurb: 'An LM358 with two gain stages: six resistors, a decoupling capacitor and three headers.' },
    { id: 'esp32-io-panel', src: '07_esp_io_panel', title: 'ESP32 I/O panel', level: 'Bigger',
        blurb: 'Three LEDs and two buttons with their resistors around an ESP32-C3 SuperMini. Fifteen parts.' },
    { id: 'mosfet-bank', src: '09_mosfet_bank4', title: '4-channel MOSFET bank', level: 'Bigger',
        blurb: 'Four switched outputs with gate resistors, pull-downs, flyback diodes and screw terminals. 23 parts: give Compact a minute.' },
    { id: 'motor-l293d', src: '06_motor_l293d', title: 'Motor driver (L293D)', level: 'Tricky',
        blurb: 'A Wemos D1 mini drives two motors. Too many wires must pass between the DIP-16 rows, so boardroute adds a few jumper wires.' },
    { id: 'caps-k5', src: 'x3_caps_k5', title: 'Puzzle: ten capacitors', level: 'Tricky',
        blurb: 'A capacitor between every pair of five nets. No arrangement wires this on one layer; boardroute proves it and adds exactly one jumper.' },
];

const examples = EXAMPLES.map(({ src, ...meta }) => {
    const circuit = JSON.parse(readFileSync(join(ROOT, 'bench', 'circuits', `${src}.json`), 'utf-8'));
    const bestPath = join(ROOT, 'bench', 'best', `${src}.json`);
    let preview = null;
    if (existsSync(bestPath)) {
        const L = JSON.parse(readFileSync(bestPath, 'utf-8'));
        const value = Object.fromEntries(circuit.components.map(c => [c.id, c.value || '']));
        const name = Object.fromEntries(circuit.components.map(c => [c.id, c.name || c.id]));
        // shape expected by render-utils (absolute pin coordinates)
        preview = {
            components: L.components.map(c => ({ ...c, name: name[c.id], value: value[c.id], pins: c.pins.map(p => ({ ...p, col: c.ox + p.dCol, row: c.oy + p.dRow })) })),
            wires: L.wires,
        };
        const xs = L.components.flatMap(c => [c.ox, c.ox + c.w - 1]).concat(L.wires.flatMap(w => w.path.map(p => p.col)));
        const ys = L.components.flatMap(c => [c.oy, c.oy + c.h - 1]).concat(L.wires.flatMap(w => w.path.map(p => p.row)));
        preview.width = Math.max(...xs) - Math.min(...xs) + 1;
        preview.height = Math.max(...ys) - Math.min(...ys) + 1;
        preview.jumpers = L.wires.filter(w => w.jumper).length;
    }
    const nets = new Set(circuit.components.flatMap(c => c.pins.map(p => p.net).filter(Boolean)));
    return { ...meta, parts: circuit.components.length, nets: nets.size, circuit, preview };
});

writeFileSync(join(ROOT, 'public', 'examples.json'), JSON.stringify(examples));
console.log(`public/examples.json: ${examples.length} examples`);
