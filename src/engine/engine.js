import { route, incrementalReroute } from './router.js';
import { Grid } from './grid.js';
import { compactBoard, optimizeBoard } from './optimizer.js';
import { scoreState, recenterComponents } from './optimizer-algorithms.js';
import { placeInitial } from './initial-placement.js';
import { anneal, moveComp, rotateComp90InPlace } from './placer.js';
import { saveComps, restoreComps, completion } from './state-utils.js';
import { analyzeTopology } from './topology.js';
import { solveBox } from './solver/boxsolver.js';

/**
 * AutorouterEngine - A "Headless" wrapper for the PCB autorouting logic.
 * This class encapsulates state and provides a clean API for the UI.
 */
export class AutorouterEngine {
    constructor(cols = 30, rows = 20) {
        this.components = [];
        this.wires = [];
        this.cols = cols;
        this.rows = rows;
        this.config = {
            maxEpochs: 1,
            maxIters: 100,
            maxTimeMs: 25000,
            saTrigger: 5,
            plateauTrigger: 8,
            deepStagnation: 12
        };

        this.gCancelRequested = false;
        // Stop after stallMsPerPart · parts without improvement (clamped to stallMinMs..stallMaxMs).
        // Calibrated by replaying the benchmark traces: near full-minute quality, ~19 s average.
        this.layoutConfig = { budgetMs: 60000, stallMsPerPart: 1200, stallMinMs: 3000, stallMaxMs: 15000, jumperAfterMs: 10000 };
        this.activeWorker = null;

        // Callbacks for UI updates
        this.onStateChange = null;
        this.onProgress = null;
        this.onStatusUpdate = null;
        this.onBestSnapshot = null;
        this.tick = 0;
    }

    setCallbacks({ onStateChange, onProgress, onStatusUpdate, onBestSnapshot }) {
        if (onStateChange) this.onStateChange = onStateChange;
        if (onProgress) this.onProgress = onProgress;
        if (onStatusUpdate) this.onStatusUpdate = onStatusUpdate;
        if (onBestSnapshot) this.onBestSnapshot = onBestSnapshot;
    }

    setState(newState) {
        if (newState.components) this.components = newState.components;
        if (newState.wires) this.wires = newState.wires;
        if (newState.cols) this.cols = newState.cols;
        if (newState.rows) this.rows = newState.rows;
        this.tick++;
        this.notify();
    }

    notify() {
        this.onStateChange?.({
            components: this.components,
            wires: this.wires,
            cols: this.cols,
            rows: this.rows,
            tick: this.tick
        });
    }

    cancel() {
        this.gCancelRequested = true;
        this.activeWorker?.postMessage({ type: 'stop' });
    }

    /**
     * Place, route and pack in one go with the box solver (src/engine/solver/).
     * Runs in a Web Worker when available, inline otherwise (Node, tests).
     * With `refine`, the search starts from the current layout instead of from scratch.
     * Jumper wires are allowed right away if the circuit provably can't be built on one
     * layer, otherwise only once no jumper-free layout turned up within jumperAfterMs.
     * Returns { found, score, jumpers, topology } (topology.certificate when non-planar).
     */
    async layout(compDefs, { refine = false } = {}) {
        if (!compDefs?.length) return null;
        this.gCancelRequested = false;

        const topo = analyzeTopology(compDefs);
        const variant = topo.planar ? { jumperAfterMs: this.layoutConfig.jumperAfterMs } : { jumpers: 1 };

        const t0 = performance.now();
        const { budgetMs, stallMsPerPart, stallMinMs, stallMaxMs } = this.layoutConfig;
        const stallMs = Math.max(stallMinMs, Math.min(stallMaxMs, stallMsPerPart * compDefs.length));
        let found = false, jumpers = 0;
        // Keep results where the parts were, so the camera doesn't have to chase them.
        let cx = 0, cy = 0;
        if (this.components.length) {
            const xs = this.components.flatMap(c => [c.ox, c.ox + c.w]), ys = this.components.flatMap(c => [c.oy, c.oy + c.h]);
            cx = Math.round((Math.min(...xs) + Math.max(...xs)) / 2);
            cy = Math.round((Math.min(...ys) + Math.max(...ys)) / 2);
        }
        const onBest = (components, wires, metrics) => {
            found = true;
            jumpers = metrics.jumpers || 0;
            recenterComponents(components, wires);
            components.forEach(c => moveComp(c, c.ox + cx, c.oy + cy));
            wires.forEach(w => w.path.forEach(pt => { pt.col += cx; pt.row += cy; }));
            this.components = components;
            this.wires = wires;
            this.tick++;
            this.notify();
            this.onBestSnapshot?.({ components, wires });
            this.onStatusUpdate?.({ best: metrics });
        };
        const onProgress = (elapsed) => {
            const best = found ? scoreState(this.components, this.wires) : null;
            this.onProgress?.(Math.min(100, (elapsed / budgetMs) * 100),
                best ? `Packing… best ${best.width}×${best.height} = ${best.area} holes` : 'Searching for a first routable layout…');
        };
        const initial = refine && this.components.length ? this.components : null;
        this.onStatusUpdate?.({ title: refine ? 'Refining layout…' : 'Searching for a first routable layout…', best: null });

        if (typeof Worker !== 'undefined') {
            await new Promise((resolve) => {
                const worker = new Worker(new URL('./solver/solver.worker.js', import.meta.url), { type: 'module' });
                this.activeWorker = worker;
                const finish = () => { worker.terminate(); this.activeWorker = null; resolve(); };
                worker.onmessage = (e) => {
                    const m = e.data;
                    if (m.type === 'best') onBest(m.components, m.wires, m.metrics);
                    else if (m.type === 'progress') onProgress(m.elapsed);
                    else if (m.type === 'done') finish();
                };
                worker.onerror = (err) => { console.error('Solver worker failed', err); finish(); };
                worker.postMessage({ type: 'solve', defs: compDefs, initial, budgetMs, stallMs, variant });
                if (this.gCancelRequested) worker.postMessage({ type: 'stop' });
            });
        } else {
            let lastBest = null;
            await solveBox(compDefs, {
                budgetMs, initial, variant,
                shouldStop: () => this.gCancelRequested || (lastBest !== null && performance.now() - lastBest > Math.max(stallMs, (lastBest - t0) * 0.5)),
                onBest: (c, w, m) => { lastBest = performance.now(); onBest(c, w, m); },
                onProgress: () => onProgress(performance.now() - t0),
            });
        }
        this.notify();
        return { found, jumpers, topology: topo, score: found ? scoreState(this.components, this.wires) : null };
    }

    async optimize() {
        this.gCancelRequested = false;
        const options = {
            onProgress: this.onProgress,
            onStatusUpdate: this.onStatusUpdate,
            checkCancel: () => this.gCancelRequested,
            onStateChange: (state) => {
                this.components = state.components;
                this.wires = state.wires;
                this.tick++;
                this.notify();
            },
            onBestSnapshot: (snapshot) => { this.onBestSnapshot?.(snapshot); }
        };

        const res = await compactBoard(
            this.components,
            this.wires,
            this.cols,
            this.rows,
            this.config,
            options
        );

        if (res.improved) {
            this.wires = res.wires;
        }
        this.notify();
        return res;
    }

    async plateau() {
        this.gCancelRequested = false;
        const options = {
            onProgress: this.onProgress,
            onStatusUpdate: this.onStatusUpdate,
            checkCancel: () => this.gCancelRequested,
            onStateChange: (state) => {
                this.components = state.components;
                this.wires = state.wires;
                this.tick++;
                this.notify();
            },
            onBestSnapshot: (snapshot) => { this.onBestSnapshot?.(snapshot); }
        };

        const res = await optimizeBoard(
            this.components,
            this.wires,
            this.cols,
            this.rows,
            options
        );

        if (res.improved) {
            this.wires = res.wires;
        }
        this.notify();
        return res;
    }

    async routeOnly() {
        this.gCancelRequested = false;
        const testWires = await route(
            this.components,
            this.cols,
            this.rows,
            (p, m) => this.onProgress?.(p * 100, m),
            () => this.gCancelRequested,
            this.wires
        );
        this.wires = testWires;
        this.notify();
        return scoreState(this.components, testWires);
    }

    async route() {
        this.gCancelRequested = false;
        this.onStatusUpdate?.({ title: 'Rerouting...', isProcessing: true });
        const manualOnly = this.wires.filter(w => w.manual);
        const res = await route(
            this.components,
            this.cols,
            this.rows,
            (p, m) => this.onProgress?.(p * 100, m),
            () => this.gCancelRequested,
            manualOnly
        );
        this.wires = res;
        this.onStatusUpdate?.({ isProcessing: false });
        this.notify();
        return res;
    }

    async placeAndRoute(compDefs) {
        if (!compDefs || compDefs.length === 0) {
            return;
        }

        this.gCancelRequested = false;
        const maxAttempts = 100;
        let bestWires = null;
        let bestComps = null;
        let bestCompletion = 0;

        this.onStatusUpdate?.({ title: 'Initializing...' });
        this.onProgress?.(0, 'Starting placement...');

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            if (this.gCancelRequested) break;

            this.onStatusUpdate?.({ title: `Attempt ${attempt}/${maxAttempts}` });

            // 1. Initial random placement centered around 0,0
            const currentComponents = placeInitial(compDefs, 0, 0);
            recenterComponents(currentComponents, null);

            // 2. Simulated Annealing
            await anneal(currentComponents, this.cols, this.rows, (p, s) => {
                recenterComponents(currentComponents, null);
                this.onProgress?.(p * 100, `[${attempt}/${maxAttempts}] SA — ${s}`);
            }, () => this.gCancelRequested);

            if (this.gCancelRequested) break;

            // 3. Routing
            const candidateWires = await route(
                currentComponents, this.cols, this.rows,
                (p, s) => { this.onProgress?.(p * 100, `[${attempt}/${maxAttempts}] Route — ${s}`); },
                () => this.gCancelRequested
            );
            recenterComponents(currentComponents, candidateWires);

            const c = completion(candidateWires);
            if (c > bestCompletion) {
                bestCompletion = c;
                bestWires = candidateWires;
                bestComps = saveComps(currentComponents);

                // Push best so far to preview bar
                const hydratedComps = currentComponents.map(comp => ({
                    ...comp,
                    pins: comp.pins.map(p => ({ ...p, col: comp.ox + p.dCol, row: comp.oy + p.dRow }))
                }));
                this.onBestSnapshot?.({ components: hydratedComps, wires: candidateWires });
            }

            if (c === 1.0) break; // Found 100% solution
        }

        if (bestComps) {
            const startScore = scoreState(this.components, this.wires);
            this.components = placeInitial(compDefs, this.cols, this.rows); // Reset structure
            restoreComps(this.components, bestComps);
            this.wires = bestWires;

            this.notify();
            const finalScore = scoreState(this.components, this.wires);
            return { score: finalScore, startScore };
        }
        return null;
    }

    moveComponent(id, ox, oy) {
        const c = this.components.find(x => x.id === id);
        if (c) {
            moveComp(c, ox, oy);
            if (this.wires.length > 0) {
                this.updateIncrementalWires(c);
            }
            this.components = [...this.components];
            this.tick++;
            this.notify();
        }
    }

    rotateComponent(id) {
        const c = this.components.find(x => x.id === id);
        if (c) {
            rotateComp90InPlace(c);
            if (this.wires.length > 0) {
                this.updateIncrementalWires(c);
            }
            this.components = [...this.components];
            this.tick++;
            this.notify();
        }
    }

    updateIncrementalWires(movedComp) {
        const { wires } = incrementalReroute(this.components, this.wires, movedComp);
        this.wires = wires;
    }

    async previewManualRoute(startPin, currentPos, targetNet = null) {
        // Fast A* for single path
        let minCol = Infinity, maxCol = -Infinity, minRow = Infinity, maxRow = -Infinity;
        this.components.forEach(c => {
            minCol = Math.min(minCol, c.ox); maxCol = Math.max(maxCol, c.ox + c.w - 1);
            minRow = Math.min(minRow, c.oy); maxRow = Math.max(maxRow, c.oy + c.h - 1);
        });
        const pad = 15;
        const gridMinC = Math.min(minCol - pad, startPin.pin.col, currentPos.col);
        const gridMinR = Math.min(minRow - pad, startPin.pin.row, currentPos.row);
        const gridCols = Math.max(maxCol - minCol + pad * 2, Math.abs(currentPos.col - gridMinC) + pad, Math.abs(startPin.pin.col - gridMinC) + pad);
        const gridRows = Math.max(maxRow - minRow + pad * 2, Math.abs(currentPos.row - gridMinR) + pad, Math.abs(startPin.pin.row - gridMinR) + pad);

        const grid = new Grid(gridCols, gridRows, gridMinC, gridMinR);
        this.components.forEach(c => grid.registerComp(c));

        const startNet = startPin.pin.net;
        const startIndices = new Set([grid.idx(startPin.pin.col, startPin.pin.row)]);
        const targetIndices = [grid.idx(currentPos.col, currentPos.row)];

        this.wires.forEach(w => {
            if (!w.failed && w.path) {
                const isStartNet = startNet && w.net === startNet;
                const isTargetNet = targetNet && w.net === targetNet;

                if (isStartNet || isTargetNet) {
                    // Same net: don't block. Also add as valid start/end points
                    w.path.forEach(pt => {
                        if (grid.inBounds(pt.col, pt.row)) {
                            const kidx = grid.idx(pt.col, pt.row);
                            if (isStartNet) startIndices.add(kidx);
                            if (isTargetNet) targetIndices.push(kidx);
                        }
                    });
                } else {
                    grid.markWire(w.path);
                }
            }
        });

        const res = grid.astarMultiTarget(startIndices, targetIndices, true);
        return res ? res.path : null;
    }

    initializeBoard(compDefs) {
        this.components = placeInitial(compDefs, this.cols, this.rows);
        this.wires = [];
        this.notify();
    }

    mergeBoard(compDefs) {
        if (!compDefs || compDefs.length === 0) {
            this.components = [];
            this.wires = [];
            this.notify();
            return;
        }

        const newIDs = new Set(compDefs.map(d => d.id));
        const oldIDs = new Set(this.components.map(c => c.id));

        const missingOld = [...oldIDs].filter(id => !newIDs.has(id));
        const addedNew = [...newIDs].filter(id => !oldIDs.has(id));

        const renameMap = new Map();
        if (missingOld.length === 1 && addedNew.length === 1) {
            renameMap.set(addedNew[0], missingOld[0]); // map newID -> oldID
        }

        // 1. Remove missing components that aren't renames
        for (const id of missingOld) {
            if (!Array.from(renameMap.values()).includes(id)) {
                this.deleteComponent(id);
            }
        }

        // 2. Add / Update components
        compDefs.forEach(def => {
            const searchId = renameMap.get(def.id) || def.id;
            const oldComp = this.components.find(c => c.id === searchId);
            if (!oldComp) {
                // Add new
                const freshComps = placeInitial([def], this.cols, this.rows);
                if (freshComps && freshComps.length > 0) {
                    this.components.push(freshComps[0]); 
                }
            } else {
                // Update in-place
                oldComp.id = def.id; // Apply rename if occurred
                oldComp.name = def.name;
                oldComp.value = def.value;
                oldComp.routeUnder = def.routeUnder;

                const incomingPins = def.offsets.map((off, idx) => ({
                    dCol: off[0],
                    dRow: off[1],
                    net: def.pinNets[idx],
                    lbl: def.pinLbls[idx]
                }));

                const oldPinsMap = new Map();
                oldComp.pins.forEach(p => oldPinsMap.set(`${p.dCol},${p.dRow}`, p));

                const dimensionsChanged = (oldComp.w !== def.w || oldComp.h !== def.h);
                if (dimensionsChanged) {
                    oldComp.w = def.w;
                    oldComp.h = def.h;
                }

                // Detect topological changes
                const changedCoords = new Set();
                incomingPins.forEach(inp => {
                    const key = `${inp.dCol},${inp.dRow}`;
                    const oldP = oldPinsMap.get(key);
                    if (!oldP || oldP.net !== inp.net || oldP.lbl !== inp.lbl) {
                        changedCoords.add(key);
                    }
                });
                oldPinsMap.forEach((oldP, key) => {
                    if (!incomingPins.find(inp => inp.dCol === oldP.dCol && inp.dRow === oldP.dRow)) {
                        changedCoords.add(key);
                    }
                });

                if (changedCoords.size > 0 || dimensionsChanged) {
                    oldComp.pins = incomingPins.map(inp => ({
                        col: oldComp.ox + inp.dCol,
                        row: oldComp.oy + inp.dRow,
                        dCol: inp.dCol,
                        dRow: inp.dRow,
                        net: inp.net,
                        lbl: inp.lbl
                    }));

                    // Rip-up wires attached to shifted/changed pins
                    const oldAbsCoords = Array.from(changedCoords).map(key => {
                        const [dc, dr] = key.split(',').map(Number);
                        return `${oldComp.ox + dc},${oldComp.oy + dr}`;
                    });
                    const oldAbsSet = new Set(oldAbsCoords);

                    this.wires = this.wires.map(w => {
                        if (!w.path) return w;
                        const startsAtChanged = oldAbsSet.has(`${w.path[0].col},${w.path[0].row}`);
                        const endsAtChanged = oldAbsSet.has(`${w.path[w.path.length - 1].col},${w.path[w.path.length - 1].row}`);
                        if (startsAtChanged || endsAtChanged) {
                            return { ...w, failed: true, path: [w.path[0], w.path[w.path.length - 1]] };
                        }
                        return w;
                    });
                }
            }
        });

        // Cleanup orphaned wires
        this.wires = this.wires.filter(w => {
            const pinCount = this.components.reduce((acc, c) => acc + c.pins.filter(p => p.net === w.net).length, 0);
            return pinCount >= 2;
        });

        this.tick++;
        this.notify();
    }

    deleteComponent(id) {
        // Collect all nets associated with the component being deleted
        const comp = this.components.find(c => c.id === id);
        const affectedNets = new Set();
        if (comp && Array.isArray(comp.pins)) {
            comp.pins.forEach(p => {
                if (p && p.net) {
                    affectedNets.add(p.net);
                }
            });
        }

        // Remove the component itself
        this.components = this.components.filter(c => c.id !== id);

        // For nets touched by this component, remove wires if the net
        // no longer has at least two pins remaining on the board.
        if (affectedNets.size > 0) {
            const netPinCounts = new Map();

            // Recompute pin counts for affected nets across remaining components
            this.components.forEach(c => {
                if (!Array.isArray(c.pins)) return;
                c.pins.forEach(p => {
                    if (!p || p.net == null) return;
                    if (!affectedNets.has(p.net)) return;
                    const current = netPinCounts.get(p.net) || 0;
                    netPinCounts.set(p.net, current + 1);
                });
            });

            // Drop wires whose nets have fewer than 2 remaining pins
            this.wires = this.wires.filter(w => {
                if (!w || w.net == null) return true;
                if (!affectedNets.has(w.net)) return true;
                const count = netPinCounts.get(w.net) || 0;
                return count >= 2;
            });

            // Cleanup: For nets that still exist, remove any wires that terminate at 
            // the exact coordinates where the deleted component's pins were.
            if (comp && Array.isArray(comp.pins)) {
                const removedCoords = new Set(comp.pins.map(p => `${p.col},${p.row}`));
                this.wires = this.wires.map(w => {
                    if (!affectedNets.has(w.net) || !w.path) return w;
                    const startsAtRemoved = removedCoords.has(`${w.path[0].col},${w.path[0].row}`);
                    const endsAtRemoved = removedCoords.has(`${w.path[w.path.length - 1].col},${w.path[w.path.length - 1].row}`);
                    if (startsAtRemoved || endsAtRemoved) {
                        return { ...w, failed: true, path: [w.path[0], w.path[w.path.length - 1]] };
                    }
                    return w;
                });
            }
        }
        this.tick++;
        this.notify();
    }

    deleteWire(net) {
        this.wires = this.wires.filter(w => w.net !== net);
        this.tick++;
        this.notify();
    }

    updatePinNet(compId, pinIdx, net) {
        const c = this.components.find(x => x.id === compId);
        if (c && c.pins[pinIdx]) {
            c.pins[pinIdx].net = net;
            this.tick++;
            this.notify();
        }
    }

    addManualWire(net, path) {
        this.wires.push({ net, path, failed: false, manual: true });
        this.tick++;
        this.notify();
    }

    mergeNets(oldNet, newNet) {
        if (!oldNet || !newNet || oldNet === newNet) return;
        // Update pins
        this.components.forEach(c => {
            c.pins.forEach(p => {
                if (p.net === oldNet) p.net = newNet;
            });
        });
        // Update wires
        this.wires.forEach(w => {
            if (w.net === oldNet) w.net = newNet;
        });
        this.tick++;
        this.notify();
    }
}
