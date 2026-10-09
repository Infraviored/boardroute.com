// Runs the photo -> footprint detection off the main thread (about a second on a phone).
import { detectFootprint } from './photo-footprint.js';

self.onmessage = (e) => {
    try {
        const res = detectFootprint(e.data);
        const transfer = res.image ? [res.image.data.buffer] : [];
        self.postMessage({ ok: true, res }, transfer);
    } catch (err) {
        self.postMessage({ ok: false, error: String(err?.message || err) });
    }
};
