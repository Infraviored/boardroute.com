// Runs analyzeTopology off the main thread: extracting the K5/K3,3 certificate of a
// non-planar circuit runs one planarity test per edge and can take seconds on circuits with
// large blocking (routeUnder: false) parts.
import { analyzeTopology } from './topology.js';

self.onmessage = (e) => {
    try {
        const { planar, certificate } = analyzeTopology(e.data.defs);
        self.postMessage({ planar, certificate });
    } catch (err) {
        self.postMessage({ error: String(err?.message || err) });
    }
};
