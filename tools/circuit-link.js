// node tools/circuit-link.js <circuit.json> [origin]
// Prints a boardroute.com/#circuit=... link for a circuit (short or full format), the kind an AI
// chat can hand out. The page lays it out by itself (Wire, then Compact).
import fs from 'fs';
import { circuitLink } from '../src/circuit-link.js';

const [file, origin] = process.argv.slice(2);
if (!file) { console.error('usage: node tools/circuit-link.js <circuit.json> [origin]'); process.exit(2); }
console.log(circuitLink(JSON.parse(fs.readFileSync(file, 'utf-8')), origin));
