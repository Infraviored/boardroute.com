// Generates the synthetic benchmark circuits in bench/circuits/ (04_* and up).
// 01-03 are copies of the circuits shipped with the app. Re-run after editing:
//   node bench/make-circuits.js
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'circuits');

const pin = (col, row, net, label) => ({ offset: [col, row], net: net ?? null, label });

// --- Footprints (offsets in 2.54 mm holes) ---
// `body` = holes covered by the part on the component side (no other part or jumper there),
// for parts whose housing is larger than their pin box. Same frame as the pin offsets.
const two = (id, name, value, len, a, b, la = '1', lb = '2') =>
    ({ id, name, value, pins: [pin(0, 0, a, la), pin(len, 0, b, lb)] });
const R = (id, value, a, b, len = 3) => two(id, 'Resistor', value, len, a, b);
const C = (id, value, a, b) => two(id, 'Capacitor', value, 1, a, b);
const LED = (id, a, k) => two(id, 'LED', 'Red', 1, a, k, 'A', 'K');
const DIODE = (id, value, k, a) => two(id, 'Diode', value, 3, k, a, 'K', 'A');
// 100 uF electrolytic, 6.3 mm can, 2.5 mm lead pitch
const ECAP = (id, value, a, b) => ({ ...C(id, value, a, b), body: { offset: [0, -1], size: [2, 3] } });
// 2-pole screw terminal, 5.08 mm pitch, ~10 x 7.6 mm housing (4 wide so blocks butt together)
const TERM2 = (id, value, a, b) => ({ ...two(id, 'Screw Terminal', value, 2, a, b), body: { offset: [0, -1], size: [4, 3] } });
const BTN = (id, a, b) => two(id, 'Button', '6mm', 2, a, b);
// Standing TO-220: 10.4 x 4.5 mm with the tab, leads nearer the front. bare = pins only.
const TO220 = (id, value, g, d, s, bare = false) =>
    ({ id, name: 'MOSFET', value, pins: [pin(0, 0, g, 'G'), pin(1, 0, d, 'D'), pin(2, 0, s, 'S')],
        ...(bare ? {} : { body: { offset: [-1, -1], size: [5, 2] } }) });
const header = (id, value, nets) =>
    ({ id, name: 'Header', value, pins: nets.map((n, i) => pin(0, i, n, String(i + 1))) });
const term1 = (id, value, net) => ({ id, name: 'Terminal', value, pins: [pin(0, 0, net, value)] });

// DIP-N: pins 1..N/2 down the left column, N/2+1..N up the right column (3 holes apart).
function dip(id, name, value, nets) {
    const half = nets.length / 2;
    return {
        id, name, value,
        pins: nets.map((n, i) => i < half ? pin(0, i, n, String(i + 1)) : pin(3, nets.length - 1 - i, n, String(i + 1)))
    };
}

// Dev board with two pin rows `gap` holes apart; left/right lists are top-to-bottom.
// `body`: the module's PCB where it extends past the pin rows.
function devboard(id, name, gap, left, right, body = null) {
    return {
        id, name, value: name,
        pins: [...left.map(([l, n], i) => pin(0, i, n, l)), ...right.map(([l, n], i) => pin(gap, i, n, l))],
        ...(body ? { body } : {}),
    };
}

const esp32c3 = (nets = {}) => devboard('U1', 'ESP32-C3 SuperMini', 6,
    ['5V', 'GND', '3V3', 'IO4', 'IO3', 'IO2', 'IO1', 'IO0'].map(l => [l, nets[l]]),
    ['IO5', 'IO6', 'IO7', 'IO8', 'IO9', 'IO10', 'IO20', 'IO21'].map(l => [l, nets[l]]),
    { offset: [0, -1], size: [7, 10] }); // 22.5 x 18 mm board: one hole past each end of the pin rows

const circuits = {};

// 555 astable LED blinker
circuits['04_blinker555'] = [
    dip('U1', 'NE555', 'DIP-8', ['GND', 'TH', 'OUT', 'VCC', 'CV', 'TH', 'DIS', 'VCC']),
    R('R1', '1k', 'VCC', 'DIS'),
    R('R2', '10k', 'DIS', 'TH'),
    C('C1', '10uF', 'TH', 'GND'),
    C('C2', '10nF', 'CV', 'GND'),
    R('R3', '330', 'OUT', 'LEDA'),
    LED('D1', 'LEDA', 'GND'),
    C('C3', '100nF', 'VCC', 'GND'),
    header('J1', 'Power', ['VCC', 'GND']),
];

// Dual non-inverting op-amp stage
circuits['05_opamp_dual'] = [
    dip('U1', 'LM358', 'DIP-8', ['OUT1', 'IN1N', 'IN1P', 'GND', 'IN2P', 'IN2N', 'OUT2', 'VCC']),
    R('RF1', '100k', 'OUT1', 'IN1N'),
    R('RG1', '10k', 'IN1N', 'GND'),
    R('RI1', '1k', 'SIG1', 'IN1P'),
    R('RF2', '100k', 'OUT2', 'IN2N'),
    R('RG2', '10k', 'IN2N', 'GND'),
    R('RI2', '1k', 'SIG2', 'IN2P'),
    C('C1', '100nF', 'VCC', 'GND'),
    header('JIN', 'Inputs', ['SIG1', 'SIG2', 'GND']),
    header('JOUT', 'Outputs', ['OUT1', 'OUT2', 'GND']),
    header('JPWR', 'Power', ['VCC', 'GND']),
];

// Wemos D1 mini driving an L293D
circuits['06_motor_l293d'] = [
    devboard('U1', 'Wemos D1 Mini', 8,
        [['RST'], ['A0'], ['D0', 'EN2'], ['D5', 'IN3'], ['D6', 'IN4'], ['D7', 'EN1'], ['D8'], ['3V3']],
        [['TX'], ['RX'], ['D1', 'IN1'], ['D2', 'IN2'], ['D3'], ['D4'], ['G', 'GND'], ['5V', '5V']],
        { offset: [0, -5], size: [9, 14] }), // 34.2 x 25.6 mm: the ESP-12 module extends 5 holes past RST/TX
    dip('U2', 'L293D', 'DIP-16', ['EN1', 'IN1', 'OUT1', 'GND', 'GND', 'OUT2', 'IN2', 'VM',
        'EN2', 'IN3', 'OUT3', 'GND', 'GND', 'OUT4', 'IN4', '5V']),
    TERM2('JM1', 'Motor A', 'OUT1', 'OUT2'),
    TERM2('JM2', 'Motor B', 'OUT3', 'OUT4'),
    TERM2('JP', 'VM in', 'VM', 'GND'),
    ECAP('C1', '100uF', 'VM', 'GND'),
    C('C2', '100nF', '5V', 'GND'),
];

// ESP32-C3 with LEDs, buttons and an I2C header
circuits['07_esp_io_panel'] = [
    esp32c3({ '5V': '5V', GND: 'GND', '3V3': '3V3', IO0: 'L0', IO1: 'L1', IO2: 'L2', IO3: 'B0', IO4: 'B1', IO8: 'SDA', IO9: 'SCL' }),
    R('R1', '330', 'L0', 'A0'), LED('D1', 'A0', 'GND'),
    R('R2', '330', 'L1', 'A1'), LED('D2', 'A1', 'GND'),
    R('R3', '330', 'L2', 'A2'), LED('D3', 'A2', 'GND'),
    R('R4', '10k', '3V3', 'B0'), BTN('S1', 'B0', 'GND'),
    R('R5', '10k', '3V3', 'B1'), BTN('S2', 'B1', 'GND'),
    R('R6', '4k7', '3V3', 'SDA'), R('R7', '4k7', '3V3', 'SCL'),
    header('J1', 'I2C', ['3V3', 'GND', 'SDA', 'SCL']),
    header('J2', 'Power', ['5V', 'GND']),
];

// Passive RC ladder (long, chain-like topology)
circuits['08_rc_ladder'] = (() => {
    const parts = [header('JIN', 'In', ['N0', 'GND'])];
    for (let i = 1; i <= 6; i++) {
        parts.push(R(`R${i}`, '1k', `N${i - 1}`, `N${i}`, 2));
        parts.push(C(`C${i}`, '100nF', `N${i}`, 'GND'));
    }
    parts.push(header('JOUT', 'Out', ['N6', 'GND']));
    return parts;
})();

// ESP32-C3 switching four 12 V loads (scaled-up door striker)
circuits['09_mosfet_bank4'] = (() => {
    const io = ['IO0', 'IO1', 'IO2', 'IO3'];
    const parts = [esp32c3({ GND: 'GND', '5V': '5V', IO0: 'G0IN', IO1: 'G1IN', IO2: 'G2IN', IO3: 'G3IN' })];
    io.forEach((_, i) => {
        parts.push(R(`RG${i}`, '220', `G${i}IN`, `G${i}`, 2));
        parts.push(R(`RP${i}`, '47k', `G${i}`, 'GND', 2));
        parts.push(TO220(`Q${i}`, 'IRLB8721', `G${i}`, `D${i}`, 'GND'));
        parts.push(DIODE(`D${i}`, 'SS54', '+12V', `D${i}`));
        parts.push(TERM2(`JL${i}`, `Load ${i}`, '+12V', `D${i}`));
    });
    parts.push(TERM2('JP', '12V in', '+12V', 'GND'));
    parts.push(term1('J5V', '5V', '5V'));
    return parts;
})();

// --- Counterexamples (see src/engine/topology.js) ---
// A part with pin spacing 1 acts as an edge between its nets; spacing >= 2 lets wires through.

const capGraph = (pairs) => pairs.map(([a, b]) => C(`C${a}${b}`, '100nF', a, b));
const K33 = ['A', 'B', 'C'].flatMap(a => ['X', 'Y', 'Z'].map(b => [a, b]));

// Nine capacitors joining {A,B,C} with {X,Y,Z}: K3,3 -> unroutable on one layer.
circuits['x1_caps_k33'] = capGraph(K33);

// One capacitor fewer: planar -> routable.
circuits['x2_caps_k33_minus1'] = capGraph(K33.slice(1));

// Three MOSFETs in parallel look like K3,3 but are routable: stacked 3x3, same-net pins
// touch directly (a net may run through its own pins).
circuits['x5_parallel_mosfets3'] = [
    TO220('Q1', 'IRLB8721', 'G', 'D', 'S', true),
    TO220('Q2', 'IRLB8721', 'G', 'D', 'S', true),
    TO220('Q3', 'IRLB8721', 'G', 'D', 'S', true),
];

// Ten adjacent-pin capacitors between every pair of five nets: each acts as an edge -> K5.
circuits['x3_caps_k5'] = (() => {
    const nets = ['A', 'B', 'C', 'D', 'E'];
    const parts = [];
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) parts.push(C(`C${nets[i]}${nets[j]}`, '100nF', nets[i], nets[j]));
    return parts;
})();

// The same ten parts as 3-hole resistors: wires pass between the pins -> routable.
circuits['x4_resistors_k5'] = (() => {
    const nets = ['A', 'B', 'C', 'D', 'E'];
    const parts = [];
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) parts.push(R(`R${nets[i]}${nets[j]}`, '1k', nets[i], nets[j]));
    return parts;
})();

// Perfboard wiring runs on the solder side, so wires may pass under any part body (only pins
// block). A part that really can't be routed under would set routeUnder: false explicitly.
for (const [name, components] of Object.entries(circuits)) {
    components.forEach(c => { c.routeUnder ??= true; });
    writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ components }, null, 2) + '\n');
    console.log(`${name}: ${components.length} components`);
}
