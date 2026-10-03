import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
    SP,
    generateBackgroundSVG,
    generateWiresSVG,
    generateRatsnestSVG,
    renderCompSVG,
    generateBoundingBoxSVG,
    computeBoardFrame,
    generateCoordinatesSVG,
    coordGutters,
    hitComp,
    hitPin,
    hitWire,
    netColor
} from "../engine/render-utils.js";
import { CAMERA_CONFIG } from "../engine/config.js";
import {
    Plus,
    Minus,
    Maximize,
    Crosshair
} from 'lucide-react';
const TRACKING_MODES = { NONE: 'none', SNAP: 'snap', LIVE: 'live' };
const { SNAP } = TRACKING_MODES;

export function PcbCanvas({
    components,
    wires,
    cols,
    rows,
    selectedId,
    onSelect,
    activeNets,
    onMove,
    onRotate,
    onMoveEnd,
    tick,
    isProcessing,
    isInitialProcessing,
    workflowStep,
    snapCounter,
    onManualRoute,
    onPreviewRoute,
    previewPath,
    onSelectNet,
    activePin,
    boardView = null, // physical board outline + hole coordinates (see useBoardView)
    customComponentsSvg // Optional prop if we want to override
}) {
    const svgRef = useRef(null);
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
    const [camera, setCamera] = useState(() => {
        const saved = localStorage.getItem('pcb_camera_state');
        if (saved) {
            try {
                const s = JSON.parse(saved);
                s.z = Math.min(Math.max(s.z || 1, 0.1), 10.0);
                return s;
            } catch (e) {
                console.warn("Failed to parse camera state:", e);
            }
        }
        return { x: 0, y: 0, z: 1 };
    });
    const [isPanning, setIsPanning] = useState(false);
    const lastPos = useRef({ x: 0, y: 0 });
    const [draggingId, setDraggingId] = useState(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [routingPos, setRoutingPos] = useState(null); // Local mouse tracking for routing

    const hasInitializedFit = useRef(!!localStorage.getItem('pcb_camera_state'));

    // Persist camera
    useEffect(() => {
        const timer = setTimeout(() => {
            localStorage.setItem('pcb_camera_state', JSON.stringify(camera));
        }, 500);
        return () => clearTimeout(timer);
    }, [camera]);

    const getMousePos = (e) => {
        if (!svgRef.current) return { x: 0, y: 0 };
        const rect = svgRef.current.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const handlePointerDown = (e) => {
        const pos = getMousePos(e);
        const worldY = (pos.y - camera.y) / camera.z;
        const worldX = (pos.x - camera.x) / camera.z;
        const col = Math.floor(worldX / SP);
        const row = Math.floor(worldY / SP);

        const pinHit = hitPin(col, row, components);
        const wireHit = hitWire(col, row, wires);
        const compHit = hitComp(col, row, components);

        // 1. If in routing mode (activePin is set) and hit a pin OR a wire, commit the route
        if (activePin && (pinHit || wireHit)) {
            if (pinHit) {
                // Only commit if it's a DIFFERENT pin
                if (pinHit.compId !== activePin.compId || pinHit.pinIdx !== activePin.pinIdx) {
                    onManualRoute?.(activePin, pinHit, previewPath);
                    onPreviewRoute?.(null);
                }
            } else if (wireHit) {
                onManualRoute?.(activePin, wireHit.net, previewPath);
                onPreviewRoute?.(null);
            }
            return;
        }

        // 2. Clicked while NOT in routing mode
        if (pinHit && selectedId === pinHit.compId) {
            // Already selected and hitting a pin: start routing immediately
            setRoutingPos({ col, row });
            setDraggingId(null);
            onPreviewRoute?.(pinHit, { col, row });
        } else if (compHit) {
            // New component or body click: select only (allows drag)
            setDraggingId(compHit.id);
            setDragOffset({ x: worldX - compHit.ox * SP, y: worldY - compHit.oy * SP });
            onSelect?.(compHit.id);
            // If we were routing and clicked another component, cancel routing
            if (activePin) {
                onPreviewRoute?.(null);
            }
        } else {
            // Empty space: Pan and Reset ALL
            setIsPanning(true);
            lastPos.current = pos;
            onSelect?.(null);
            onSelectNet?.(null);
            onPreviewRoute?.(null);
        }
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e) => {
        const pos = getMousePos(e);
        const worldY = (pos.y - camera.y) / camera.z;
        const worldX = (pos.x - camera.x) / camera.z;
        const col = Math.floor(worldX / SP);
        const row = Math.floor(worldY / SP);

        if (activePin) {
            if (!routingPos || routingPos.col !== col || routingPos.row !== row) {
                setRoutingPos({ col, row });
                const targetWire = hitWire(col, row, wires);
                onPreviewRoute?.(activePin, { col, row }, targetWire?.net);
            }
        } else if (draggingId) {
            const nx = Math.round((worldX - dragOffset.x) / SP);
            const ny = Math.round((worldY - dragOffset.y) / SP);
            onMove?.(draggingId, nx, ny);
        } else if (isPanning) {
            const newP = {
                x: camera.x + (pos.x - lastPos.current.x),
                y: camera.y + (pos.y - lastPos.current.y)
            };
            setCamera(prev => ({ ...prev, x: newP.x, y: newP.y }));
            lastPos.current = pos;
            simPan.current = { ...newP };
        }
    };

    const handlePointerUp = (e) => {
        if (draggingId) onMoveEnd?.();
        setDraggingId(null);
        setIsPanning(false);
        const target = e.currentTarget;
        if (target && target.hasPointerCapture && target.hasPointerCapture(e.pointerId)) {
            target.releasePointerCapture(e.pointerId);
        }
    };

    // Keyboard ESC to cancel routing
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape' && activePin) {
                onPreviewRoute?.(null);
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [activePin, onPreviewRoute]);

    const handleMouseDown = (e) => {
        if (e.button === 2 && draggingId) {
            onRotate?.(draggingId);
            e.preventDefault();
            e.stopPropagation();
        }
    };

    const [trackingMode, setTrackingMode] = useState(TRACKING_MODES.NONE);
    const [isAutoTracking, setIsAutoTracking] = useState(true);

    useEffect(() => {
        if (!svgRef.current) return;
        const resizeObs = new ResizeObserver(entries => {
            const entry = entries[0];
            if (entry) {
                setViewportSize({
                    width: Math.round(entry.contentRect.width),
                    height: Math.round(entry.contentRect.height)
                });
            }
        });
        resizeObs.observe(svgRef.current);
        return () => resizeObs.disconnect();
    }, []);

    // Physical board frame (outline + hole coordinates). Only computed when the user opted in,
    // so the default canvas is unchanged.
    const showBoardLayer = !!(boardView && (boardView.showCoords || boardView.boardCols || boardView.boardRows));
    const boardFrame = useMemo(() => {
        void tick;
        return showBoardLayer ? computeBoardFrame(components, wires, boardView) : null;
    }, [showBoardLayer, components, wires, boardView, tick]);

    const bounds = useMemo(() => {
        if (components.length === 0 && wires.length === 0) {
            return { minCol: 0, minRow: 0, maxCol: cols, maxRow: rows };
        }
        let minCol = Infinity, minRow = Infinity, maxCol = -Infinity, maxRow = -Infinity;
        for (const c of components) {
            minCol = Math.min(minCol, c.ox);
            minRow = Math.min(minRow, c.oy);
            maxCol = Math.max(maxCol, c.ox + c.w);
            maxRow = Math.max(maxRow, c.oy + c.h);
        }
        for (const w of wires) {
            if (!w.path) continue;
            for (const p of w.path) {
                minCol = Math.min(minCol, p.col);
                minRow = Math.min(minRow, p.row);
                maxCol = Math.max(maxCol, p.col);
                maxRow = Math.max(maxRow, p.row);
            }
        }
        if (boardFrame) {
            // Frame the whole physical board plus its label strips, not just the layout.
            const g = coordGutters(boardFrame, boardView);
            const ext = (px) => Math.ceil(px / SP);
            minCol = Math.min(minCol, boardFrame.c0 - ext(g.left));
            minRow = Math.min(minRow, boardFrame.r0 - ext(g.top));
            maxCol = Math.max(maxCol, boardFrame.c0 + boardFrame.cols - 1 + ext(g.right));
            maxRow = Math.max(maxRow, boardFrame.r0 + boardFrame.rows - 1 + ext(g.bottom));
        }
        if (minCol === maxCol) maxCol += 1;
        if (minRow === maxRow) maxRow += 1;
        return { minCol, minRow, maxCol, maxRow };
    }, [components, wires, cols, rows, boardFrame, boardView]);

    const snapLockRef = useRef(null);
    const lastSnapStep = useRef(0);
    const lastSnapCounter = useRef(0);
    const wasProcessing = useRef(false);

    const startSnap = useCallback(() => {
        if (!bounds) return;
        const targetCX = (bounds.minCol + bounds.maxCol + 1) / 2 * SP;
        const targetCY = (bounds.minRow + bounds.maxRow + 1) / 2 * SP;
        const bbW = (bounds.maxCol - bounds.minCol + 1) * SP;
        const bbH = (bounds.maxRow - bounds.minRow + 1) * SP;

        const viewport = viewportSize;
        if (viewport.width === 0) return; // Prevent infinity zoom on initial load

        // Normalize: Match updatePhysics behavior by using full height for consistent centering
        const fitZoom = Math.min(
            (viewport.width * CAMERA_CONFIG.TARGET_COVERAGE) / bbW,
            (viewport.height * CAMERA_CONFIG.TARGET_COVERAGE) / bbH,
            CAMERA_CONFIG.MAX_ZOOM_FIT
        );

        snapLockRef.current = { targetCX, targetCY, fitZoom };
        setTrackingMode(SNAP);
    }, [bounds, viewportSize]);

    useEffect(() => {
        const isMilestone = (workflowStep === 1 || workflowStep === 2) && workflowStep !== lastSnapStep.current;
        const isCounterJump = snapCounter !== lastSnapCounter.current;
        const justFinished = wasProcessing.current && !isProcessing;

        // Conditions for an automatic snap
        const shouldSnap = isMilestone || isCounterJump || justFinished || isInitialProcessing || (!hasInitializedFit.current && bounds);

        let snapStarted = false;
        if (shouldSnap && viewportSize.width > 0) {
            startSnap();
            snapStarted = true;
            hasInitializedFit.current = true;
            lastSnapStep.current = workflowStep;
            lastSnapCounter.current = snapCounter;
        }

        // Live Mode Detection
        const isAiphase = (workflowStep === 3 || workflowStep === 4) || (isProcessing && !isInitialProcessing);
        const shouldBeLive = isAiphase && isProcessing && isAutoTracking;

        if (shouldBeLive && trackingMode !== TRACKING_MODES.LIVE && !draggingId && trackingMode !== TRACKING_MODES.SNAP) {
            setTrackingMode(TRACKING_MODES.LIVE);
        } else if (!shouldBeLive && trackingMode === TRACKING_MODES.LIVE && !snapStarted) {
            // When processing ends, `trackingMode` here is still the stale LIVE value; switching
            // to NONE would override the SNAP that startSnap() just requested, leaving the camera
            // wherever live tracking happened to stop instead of framing the final layout.
            setTrackingMode(TRACKING_MODES.NONE);
        }

        wasProcessing.current = isProcessing;
        if (workflowStep === 0) {
            lastSnapStep.current = 0;
            lastSnapCounter.current = 0;
            hasInitializedFit.current = false;
            localStorage.removeItem('pcb_camera_state');
        }
    }, [workflowStep, snapCounter, isInitialProcessing, isProcessing, isAutoTracking, draggingId, bounds, viewportSize, startSnap, trackingMode]);

    const zoomVelRef = useRef(0);
    const panVelRef = useRef({ x: 0, y: 0 });
    const smoothCenterRef = useRef({ x: 0, y: 0 });
    const targetBoundsRef = useRef(null);
    const lastTimeRef = useRef(0);
    const simPan = useRef({ x: camera.x, y: camera.y });
    const simZoom = useRef(camera.z);

    const lastUpdateKeyRef = useRef("");
    const zoomCountRef = useRef(0);
    const panCountRef = useRef(0);

    useEffect(() => { targetBoundsRef.current = bounds; }, [bounds]);


    const updatePhysics = useCallback((time) => {
        if (!svgRef.current) return;
        if (!lastTimeRef.current) lastTimeRef.current = time;
        const dt = Math.min((time - lastTimeRef.current) / 1000, 0.1);
        lastTimeRef.current = time;

        const viewport = viewportSize;
        if (viewport.width === 0) {
            return;
        }

        const isSnap = trackingMode === TRACKING_MODES.SNAP;
        const isLive = trackingMode === TRACKING_MODES.LIVE;
        const shouldApplyPhysics = isAutoTracking && (isSnap || isLive) && !isPanning && !draggingId;

        if (shouldApplyPhysics) {
            let targetCX, targetCY, fitZoom;
            const b = targetBoundsRef.current;

            if (isSnap && snapLockRef.current) {
                targetCX = snapLockRef.current.targetCX;
                targetCY = snapLockRef.current.targetCY;
                fitZoom = snapLockRef.current.fitZoom;
            } else if (b) {
                targetCX = (b.minCol + b.maxCol + 1) / 2 * SP;
                targetCY = (b.minRow + b.maxRow + 1) / 2 * SP;
                const bbW = (b.maxCol - b.minCol + 1) * SP;
                const bbH = (b.maxRow - b.minRow + 1) * SP;
                // Normalize: Always use full viewport height for camera math to keep LOAD/ROUTE identical
                fitZoom = Math.min(
                    (viewport.width * CAMERA_CONFIG.TARGET_COVERAGE) / bbW,
                    (viewport.height * CAMERA_CONFIG.TARGET_COVERAGE) / bbH,
                    CAMERA_CONFIG.MAX_ZOOM_FIT
                );
            } else {
                return;
            }

            const curZ = simZoom.current;
            let nextZ = curZ;

            // 1. DERIVE NEXT ZOOM
            let zoomAcc = 0;
            if (isSnap || zoomCountRef.current > CAMERA_CONFIG.ZOOM_VIOLATION_THRESHOLD) {
                zoomAcc = (fitZoom - curZ) * CAMERA_CONFIG.ZOOM_STRENGTH;
            }
            const zoomDamping = Math.pow(CAMERA_CONFIG.ZOOM_DAMPING, dt);
            zoomVelRef.current = (zoomVelRef.current + zoomAcc * dt) * zoomDamping;
            nextZ = curZ + zoomVelRef.current * dt;

            // 2. DERIVE NEXT PAN (Using nextZ for Snap to prevent wobble)
            if (isSnap) {
                // Snap mode: Use full viewport for initial placement consistency across Load/Route
                simPan.current.x = viewport.width / 2 - targetCX * nextZ;
                simPan.current.y = viewport.height / 2 - targetCY * nextZ;
                smoothCenterRef.current = { x: targetCX, y: targetCY };
            } else {
                const worldCX = smoothCenterRef.current.x;
                const worldCY = smoothCenterRef.current.y;

                // Adaptive Viewport: Dodge the bottom bar if it's there
                const pbHeight = isProcessing ? 240 : 0;
                const targetAvailableHeight = viewport.height - pbHeight;

                const targetViewportCX = viewport.width / 2;
                const targetViewportCY = targetAvailableHeight / 2;

                const bbW = (b.maxCol - b.minCol + 1) * SP;
                const bbH = (b.maxRow - b.minRow + 1) * SP;

                // Track against the current available area
                const currentCoverage = Math.max((bbW * curZ) / viewport.width, (bbH * curZ) / targetAvailableHeight);
                const errorX = targetViewportCX - (worldCX * curZ + simPan.current.x);
                const errorY = targetViewportCY - (worldCY * curZ + simPan.current.y);

                const deadzoneX = viewport.width * CAMERA_CONFIG.PAN_DEADZONE_X;
                const deadzoneY = targetAvailableHeight * CAMERA_CONFIG.PAN_DEADZONE_Y;

                const isZoomViolated = currentCoverage > CAMERA_CONFIG.ZOOM_OUT_THRESHOLD || currentCoverage < CAMERA_CONFIG.ZOOM_IN_THRESHOLD;
                const isPanViolated = Math.abs(errorX) > deadzoneX || Math.abs(errorY) > deadzoneY;

                const updateKey = `zV:${isZoomViolated}-pV:${isPanViolated}-b:${b.minCol},${b.minRow}`;
                if (updateKey !== lastUpdateKeyRef.current) {
                    zoomCountRef.current = isZoomViolated ? zoomCountRef.current + 1 : 0;
                    panCountRef.current = isPanViolated ? panCountRef.current + 1 : 0;
                    lastUpdateKeyRef.current = updateKey;
                }

                let panAccX = 0, panAccY = 0;
                if (panCountRef.current > CAMERA_CONFIG.PAN_VIOLATION_THRESHOLD) {
                    panAccX = errorX * CAMERA_CONFIG.PAN_STRENGTH;
                    panAccY = errorY * CAMERA_CONFIG.PAN_STRENGTH;
                }

                const panDamping = Math.pow(CAMERA_CONFIG.PAN_DAMPING, dt);
                panVelRef.current.x = (panVelRef.current.x + panAccX * dt) * panDamping;
                panVelRef.current.y = (panVelRef.current.y + panAccY * dt) * panDamping;

                simPan.current.x += panVelRef.current.x * dt;
                simPan.current.y += panVelRef.current.y * dt;
                smoothCenterRef.current.x += (targetCX - smoothCenterRef.current.x) * CAMERA_CONFIG.CENTER_FOLLOW_STRENGTH * dt;
                smoothCenterRef.current.y += (targetCY - smoothCenterRef.current.y) * CAMERA_CONFIG.CENTER_FOLLOW_STRENGTH * dt;
            }

            // 3. COMMIT ATOMIC STATE
            simZoom.current = nextZ;
            setCamera({ x: simPan.current.x, y: simPan.current.y, z: simZoom.current });

            if (isSnap && Math.abs(fitZoom - simZoom.current) < 0.001) {
                setTrackingMode(TRACKING_MODES.NONE);
                snapLockRef.current = null;
            }
        }
    }, [trackingMode, isAutoTracking, isPanning, draggingId, viewportSize, isProcessing]);


    useEffect(() => {
        let rAF;
        const loop = (time) => {
            if (isAutoTracking && (trackingMode !== TRACKING_MODES.NONE)) {
                updatePhysics(time);
                rAF = requestAnimationFrame(loop);
            }
        };

        if (isAutoTracking && (trackingMode !== TRACKING_MODES.NONE)) {
            lastTimeRef.current = performance.now();
            rAF = requestAnimationFrame(loop);
        } else {
            zoomVelRef.current = 0;
            panVelRef.current = { x: 0, y: 0 };
            lastTimeRef.current = 0;
        }
        return () => {
            if (rAF) cancelAnimationFrame(rAF);
        };
    }, [isAutoTracking, trackingMode, updatePhysics]);


    const background = useMemo(() => generateBackgroundSVG(cols, rows, bounds), [cols, rows, bounds]);
    // `tick` is load-bearing: the engine mutates the components/wires arrays in place and only
    // bumps tick, so the array references alone don't change when the board does.
    // `tick` is load-bearing: the engine mutates the components/wires arrays in place and only
    // bumps tick, so the array references alone don't change when the board does. Each memo
    // reads tick explicitly so the dependency is real (an exhaustive-deps suppression would
    // also switch off the React Compiler lint rules for this whole component).
    const wiresSvg = useMemo(() => { void tick; return generateWiresSVG(wires, activeNets); }, [wires, activeNets, tick]);
    const ratsnestSvg = useMemo(() => { void tick; return generateRatsnestSVG(components, wires); }, [components, wires, tick]);
    const renderedComponentsSvg = useMemo(() => { void tick; return customComponentsSvg || components.map(c => renderCompSVG(c, c.id === selectedId, activePin)).join(''); }, [components, selectedId, activePin, tick, customComponentsSvg]);
    const boundingBoxSvg = useMemo(() => { void tick; return generateBoundingBoxSVG(components, wires); }, [components, wires, tick]);
    // Coordinate text grows when zoomed out so it stays readable; quantised so zooming doesn't
    // regenerate the layer on every frame.
    const coordScale = Math.min(3, Math.max(1, Math.round(4 / (camera.z || 1)) / 4));
    const coordsSvg = useMemo(() => {
        void tick;
        return generateCoordinatesSVG({ frame: boardFrame, view: boardView, components, scale: coordScale, dimOutside: true });
    }, [boardFrame, boardView, components, coordScale, tick]);

    // Re-frame the camera when the board settings change the visible extent.
    const boardKey = boardFrame ? `${boardView.boardCols}x${boardView.boardRows}+${boardView.margin}:${boardView.showCoords}` : '';
    const lastBoardKey = useRef(boardKey);
    useEffect(() => {
        if (boardKey === lastBoardKey.current || viewportSize.width === 0) return;
        lastBoardKey.current = boardKey;
        startSnap();
    }, [boardKey, startSnap, viewportSize.width]);

    // Wheel zoom. Registered natively with { passive: false }: React attaches onWheel as a
    // passive listener, so preventDefault() there only logs an error and the page (or the
    // stacked phone layout) scrolls along while zooming.
    const containerRef = useRef(null);
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onWheel = (e) => {
            e.preventDefault();
            const rect = svgRef.current?.getBoundingClientRect();
            if (!rect) return;
            const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            const curZ = simZoom.current || 1;
            const curP = simPan.current;
            const newZ = Math.min(Math.max(curZ * delta, 0.1), 10.0);
            const newP = {
                x: pos.x - (pos.x - curP.x) * (newZ / curZ),
                y: pos.y - (pos.y - curP.y) * (newZ / curZ)
            };
            setCamera({ x: newP.x, y: newP.y, z: newZ });
            simPan.current = { ...newP };
            simZoom.current = newZ;
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, []);


    return (
        <div ref={containerRef} className={`canvas-container ${isProcessing ? 'pb-active' : ''}`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp} onMouseDown={handleMouseDown} onContextMenu={(e) => e.preventDefault()} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', cursor: activePin ? 'crosshair' : (isPanning || draggingId ? 'grabbing' : 'crosshair'), background: '#050706', touchAction: 'none', '--pb-height': '240px' }}>
            <svg ref={svgRef} width="100%" height="100%" style={{ display: 'block' }}>
                <g transform={`translate(${camera.x}, ${camera.y}) scale(${camera.z})`}>
                    <g id="main-content">
                        <g dangerouslySetInnerHTML={{ __html: background }} />
                        {coordsSvg.board && <g dangerouslySetInnerHTML={{ __html: coordsSvg.board }} />}
                        <g dangerouslySetInnerHTML={{ __html: wiresSvg }} />
                        <g dangerouslySetInnerHTML={{ __html: ratsnestSvg }} />
                        <g dangerouslySetInnerHTML={{ __html: renderedComponentsSvg }} />
                        <g dangerouslySetInnerHTML={{ __html: boundingBoxSvg }} />
                        {coordsSvg.labels && <g dangerouslySetInnerHTML={{ __html: coordsSvg.labels }} />}

                        {activePin && (
                            <g className="routing-preview-layer">
                                {(() => {
                                    const segments = [];
                                    let current = [];
                                    let currentCrossing = false;

                                    // Start point
                                    if (previewPath && previewPath.length > 0) {
                                        current.push(previewPath[0]);
                                        currentCrossing = false; // Initial segment is from pin, usually clean
                                    }

                                    for (let i = 1; previewPath && i < previewPath.length; i++) {
                                        const pt = previewPath[i];
                                        const prev = previewPath[i - 1];
                                        const isCross = pt.isCrossing;

                                        if (isCross !== currentCrossing) {
                                            // Close current, start new
                                            segments.push({ path: current, isCrossing: currentCrossing });
                                            current = [prev, pt];
                                            currentCrossing = isCross;
                                        } else {
                                            current.push(pt);
                                        }
                                    }
                                    segments.push({ path: current, isCrossing: currentCrossing });

                                    return segments.map((seg, i) => (
                                        <polyline
                                            key={i}
                                            points={seg.path.map(pt => `${pt.col * SP + SP / 2},${pt.row * SP + SP / 2}`).join(' ')}
                                            fill="none"
                                            stroke={seg.isCrossing ? '#ff2222' : netColor(activePin.pin.net)}
                                            strokeWidth="5"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeDasharray={seg.isCrossing ? "5 5" : ""}
                                            style={{
                                                pointerEvents: 'none',
                                                filter: `drop-shadow(0 0 8px ${seg.isCrossing ? '#ff2222' : netColor(activePin.pin.net)})`
                                            }}
                                        />
                                    ));
                                })()}
                            </g>
                        )}
                    </g>
                </g>
            </svg>

            <div className="canvas-controls">
                <button className="cbtn" onClick={() => {
                    const nextZ = Math.min(Math.max(simZoom.current * 1.15, 0.1), 10.0);
                    const rect = svgRef.current.getBoundingClientRect();
                    const cx = rect.width / 2;
                    const cy = rect.height / 2;
                    const curZ = simZoom.current;
                    const curP = simPan.current;
                    // eslint-disable-next-line react-hooks/immutability
                    simPan.current = {
                        x: cx - (cx - curP.x) * (nextZ / curZ),
                        y: cy - (cy - curP.y) * (nextZ / curZ)
                    };
                    simZoom.current = nextZ;
                    setCamera({ ...simPan.current, z: nextZ });
                }} title="Zoom In">
                    <Plus size={18} />
                </button>
                <button className="cbtn" onClick={() => {
                    const nextZ = Math.min(Math.max(simZoom.current * 0.87, 0.1), 10.0);
                    const rect = svgRef.current.getBoundingClientRect();
                    const cx = rect.width / 2;
                    const cy = rect.height / 2;
                    const curZ = simZoom.current;
                    const curP = simPan.current;
                    // eslint-disable-next-line react-hooks/immutability
                    simPan.current = {
                        x: cx - (cx - curP.x) * (nextZ / curZ),
                        y: cy - (cy - curP.y) * (nextZ / curZ)
                    };
                    simZoom.current = nextZ;
                    setCamera({ ...simPan.current, z: nextZ });
                }} title="Zoom Out">
                    <Minus size={18} />
                </button>
                <button className="cbtn" onClick={() => setTrackingMode(TRACKING_MODES.SNAP)} title="Center Board">
                    <Maximize size={18} />
                </button>
                <button className="cbtn" onClick={() => {
                    const next = !isAutoTracking;
                    setIsAutoTracking(next);
                    if (!next) setTrackingMode(TRACKING_MODES.NONE);
                }} title={isAutoTracking ? "Disable Auto-Tracking" : "Enable Auto-Tracking"} style={{ color: isAutoTracking ? 'var(--grn-bright)' : 'inherit' }}>
                    <Crosshair size={18} />
                </button>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                .canvas-container { user-select: none; -webkit-user-select: none; }
                .canvas-controls { position: absolute; right: 20px; bottom: 20px; display: flex; flex-direction: column; gap: 8px; z-index: 10; transition: bottom 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
                .canvas-container.pb-active .canvas-controls { bottom: calc(20px + var(--pb-height)); }
                .cbtn { 
                  width: 38px; 
                  height: 38px; 
                  background: var(--glass-bg); 
                  backdrop-filter: blur(8px);
                  border: 1px solid var(--border); 
                  border-radius: 10px; 
                  color: var(--txt1); 
                  cursor: pointer; 
                  display: flex; 
                  align-items: center; 
                  justify-content: center; 
                  transition: all 0.2s; 
                  box-shadow: var(--shadow-premium);
                }
                .cbtn:hover { 
                  background: var(--bg4); 
                  color: var(--txt0);
                  transform: scale(1.05);
                  border-color: var(--border2);
                }
                .cbtn:active { transform: scale(0.95); }
                .pcb-comp { transition: filter 0.2s ease; }
                .pcb-comp:hover { filter: brightness(1.2); }
            `}} />
        </div>
    );
}
