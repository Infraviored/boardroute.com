// Writes dist/parts.txt: the parts boardroute knows by name and their pin names, for AI
// assistants (linked from llms.txt and the AI prompt). Every name is fed back through
// resolveCircuit; the build fails when one does not resolve to that part.
//
//   node scripts/build-parts.js [outDir]     (default: dist)
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { partsTxt, checked, skipped } from './parts-lib.js';

const OUT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'), process.argv[2] || 'dist');
const text = partsTxt();
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'parts.txt'), text);
console.log(`parts.txt: ${(Buffer.byteLength(text) / 1024).toFixed(1)} KB, ${text.split('\n').length} lines, ${checked.n} names checked, ${skipped.length} KiCad names skipped as duplicates -> ${OUT}`);
