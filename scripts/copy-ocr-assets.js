// Copies the OCR engine (tesseract.js worker + LSTM wasm builds) and the English model into
// public/ocr/, so the app serves them itself: no third-party CDN, and nothing is fetched until
// someone actually reads pin labels. Runs before `dev` and `build`; public/ocr/ is not committed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public', 'ocr');
const nm = (...p) => path.join(root, 'node_modules', ...p);
const files = [
    [nm('tesseract.js', 'dist', 'worker.min.js'), 'worker.min.js'],
    // tesseract.js picks one of these by CPU features (OEM = LSTM only)
    [nm('tesseract.js-core', 'tesseract-core-lstm.wasm.js'), 'tesseract-core-lstm.wasm.js'],
    [nm('tesseract.js-core', 'tesseract-core-simd-lstm.wasm.js'), 'tesseract-core-simd-lstm.wasm.js'],
    [nm('tesseract.js-core', 'tesseract-core-relaxedsimd-lstm.wasm.js'), 'tesseract-core-relaxedsimd-lstm.wasm.js'],
    // integer "best" model: ~3 MB, good on short labels
    [nm('@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz'), 'eng.traineddata.gz'],
];
fs.mkdirSync(out, { recursive: true });
for (const [src, name] of files) {
    const dst = path.join(out, name);
    if (fs.existsSync(dst) && fs.statSync(dst).size === fs.statSync(src).size) continue;
    fs.copyFileSync(src, dst);
}
console.log(`OCR assets in public/ocr (${files.length} files)`);
