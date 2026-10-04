import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AutorouterEngine } from './engine/engine.js';
import { PcbCanvas } from './components/PcbCanvas.jsx';
import { Topbar } from './components/Topbar.jsx';
import { SidebarLeft } from './components/SidebarLeft.jsx';
import { SidebarRight } from './components/SidebarRight.jsx';
import { ProcessingBar } from './components/ProcessingBar.jsx';
import { LibraryOverlay } from './components/LibraryOverlay.jsx';
import { CompEditorOverlay } from './components/CompEditorOverlay.jsx';
import { PromptOverlay } from './components/PromptOverlay.jsx';
import { ConfirmOverlay } from './components/ConfirmOverlay.jsx';
import { ExportOverlay } from './components/ExportOverlay.jsx';
import { ExamplesOverlay } from './components/ExamplesOverlay.jsx';
import { ResultCard } from './components/ResultCard.jsx';
import { decodeShare, shareFromHash, shareUrl } from './engine/share.js';
import { TEMPLATE, processTemplate, generateJSONFromState, bodyOf } from './engine/templates.js';
import { getAllNets } from './engine/router.js';
import { scoreState } from './engine/metrics.js';
import { netCompletion } from './engine/net-completion.js';
import { useBoardView } from './hooks/useBoardView.js';

function App() {
  // --- ENGINE ---
  const engine = useMemo(() => {
    const saved = localStorage.getItem('pcb_board_state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return new AutorouterEngine(parsed.cols || 30, parsed.rows || 20);
      } catch (e) {
        console.warn("Failed to parse saved board state for engine", e);
      }
    }
    return new AutorouterEngine(30, 20);
  }, []);

  // --- STATE ---
  const [board, setBoard] = useState(() => {
    const saved = localStorage.getItem('pcb_board_state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Boards saved before v2 had routeUnder=false as an implicit default, not a choice.
        if (localStorage.getItem('pcb_model_version') !== '2') {
          (parsed.components || []).forEach(c => { c.routeUnder = true; });
        }
        return {
          components: parsed.components || [],
          wires: parsed.wires || [],
          cols: parsed.cols || 30,
          rows: parsed.rows || 20,
          tick: 0
        };
      } catch (e) {
        console.warn("Failed to parse saved board state", e);
      }
    }
    return { components: [], wires: [], cols: 30, rows: 20, tick: 0 };
  });

  const [workflowStep, setWorkflowStep] = useState(() => {
    const saved = localStorage.getItem('pcb_workflow_step');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [snapCounter, setSnapCounter] = useState(0);

  const [jsonInput, setJsonInput] = useState(() => {
    return localStorage.getItem('pcb_json_input') || '';
  });

  // Sync the restored board to the engine on first load. Only the initial board is wanted here;
  // later changes originate in the engine itself and flow back through onStateChange.
  const [initialBoard] = useState(board);
  useEffect(() => {
    engine.setState({
      components: initialBoard.components,
      wires: initialBoard.wires,
      cols: initialBoard.cols,
      rows: initialBoard.rows
    });
  }, [engine, initialBoard]);

  // Persist to localStorage
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem('pcb_board_state', JSON.stringify({
        components: board.components,
        wires: board.wires,
        cols: board.cols,
        rows: board.rows
      }));
    }, 500);
    return () => clearTimeout(timer);
  }, [board.components, board.wires, board.cols, board.rows]);

  useEffect(() => {
    localStorage.setItem('pcb_json_input', jsonInput);
  }, [jsonInput]);

  useEffect(() => { localStorage.setItem('pcb_model_version', '2'); }, []);

  useEffect(() => {
    localStorage.setItem('pcb_workflow_step', workflowStep.toString());
  }, [workflowStep]);

  // Sync board components back to JSON
  useEffect(() => {
    if (board.components.length === 0) return;
    const nets = getAllNets(board.components);
    const doc = {
      components: board.components.map(c => ({
        id: c.id,
        name: c.name,
        value: c.value,
        ...(c.color ? { color: c.color } : {}),
        ...(c.routeUnder === false ? { routeUnder: false } : {}),
        pins: c.pins.map(p => ({
          offset: [p.dCol, p.dRow],
          label: p.lbl,
          net: p.net || ''
        })),
        ...(bodyOf(c) ? { body: bodyOf(c) } : {})
      })),
      connections: nets.map(n => ({
        net: n.net,
        count: n.pins.length
      }))
    };
    // Setting an identical string is a no-op for React, so no comparison with jsonInput is needed.
    setJsonInput(JSON.stringify(doc, null, 2));
  }, [board.components, board.tick]);

  const [status, setStatus] = useState({ title: '', progress: 0, best: null, isProcessing: false, isInitial: false });
  const [selectedId, setSelectedId] = useState(null);
  const [selectedNet, setSelectedNet] = useState(null);
  const [hoveredNet, setHoveredNet] = useState(null);
  const [bestSnapshot, setBestSnapshot] = useState(null);
  const [notice, setNotice] = useState(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  // Summary card after a finished Wire/Compact run; shown only while the board is unchanged
  // since (its tick matches the board's), so any edit, undo or new run hides it.
  const [resultCard, setResultCard] = useState(null);
  const [boardView, setBoardView] = useBoardView();

  // Modal states
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [examples, setExamples] = useState([]);
  const [examplesOpen, setExamplesOpen] = useState(null); // null | 'first' | 'browse'
  // Shown in the Circuit card while an example is loaded; kept across reloads.
  const [exampleTitle, setExampleTitle] = useState(() => { try { return localStorage.getItem('pcb_example_title'); } catch { return null; } });
  useEffect(() => {
    try { if (exampleTitle) localStorage.setItem('pcb_example_title', exampleTitle); else localStorage.removeItem('pcb_example_title'); } catch { /* storage unavailable */ }
  }, [exampleTitle]);
  const [editingComp, setEditingComp] = useState(null);
  const [confirmData, setConfirmData] = useState({ isOpen: false, type: null, targetId: null });
  const [activePin, setActivePin] = useState(null);
  const [previewPath, setPreviewPath] = useState(null);

  // History
  // The restored board is the first history entry, so Undo can always get back to it
  // (e.g. after loading an example over it).
  const [history, setHistory] = useState(() => board.components.length
    ? [JSON.stringify({ components: board.components, wires: board.wires, cols: board.cols, rows: board.rows })] : []);
  const [historyIndex, setHistoryIndex] = useState(() => (board.components.length ? 0 : -1));

  // Resizing
  const [lsbWidth, setLsbWidth] = useState(() => {
    const saved = localStorage.getItem('pcb_lsb_width');
    return saved ? parseInt(saved, 10) : 280;
  });
  const [rsbWidth, setRsbWidth] = useState(() => {
    const saved = localStorage.getItem('pcb_rsb_width');
    return saved ? parseInt(saved, 10) : 240;
  });
  const [isResizingL, setIsResizingL] = useState(false);
  const [isResizingR, setIsResizingR] = useState(false);

  useEffect(() => {
    localStorage.setItem('pcb_lsb_width', lsbWidth.toString());
  }, [lsbWidth]);
  useEffect(() => {
    localStorage.setItem('pcb_rsb_width', rsbWidth.toString());
  }, [rsbWidth]);

  const handlePointerMove = useCallback((e) => {
    if (isResizingL) {
      setLsbWidth(Math.max(180, Math.min(600, e.clientX)));
    } else if (isResizingR) {
      setRsbWidth(Math.max(180, Math.min(600, window.innerWidth - e.clientX)));
    }
  }, [isResizingL, isResizingR]);

  const handlePointerUp = useCallback(() => {
    setIsResizingL(false); setIsResizingR(false);
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
  }, []);

  useEffect(() => {
    if (isResizingL || isResizingR) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    }

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isResizingL, isResizingR, handlePointerMove, handlePointerUp]);

  const saveHistory = useCallback(() => {
    const snap = JSON.stringify({ components: engine.components, wires: engine.wires, cols: engine.cols, rows: engine.rows });
    const next = history.slice(0, historyIndex + 1);
    next.push(snap);
    if (next.length > 30) next.shift();
    setHistory(next);
    setHistoryIndex(next.length - 1);
  }, [engine, history, historyIndex]);

  const handleLoadTemplate = useCallback(() => {
    setWorkflowStep(0);
    setExampleTitle(null);
    setJsonInput(JSON.stringify(TEMPLATE, null, 2));
    const defs = processTemplate(TEMPLATE);
    engine.initializeBoard(defs);
    setWorkflowStep(1); setSnapCounter(c => c + 1); saveHistory();
  }, [engine, saveHistory]);

  // Parse the circuit JSON; problems become a visible notice instead of a silent no-op.
  const parseCircuit = useCallback(() => {
    let data;
    try { data = JSON.parse(jsonInput); } catch (e) {
      setNotice({ kind: 'error', title: 'The circuit description is not valid JSON', text: `${e.message}. Ask your AI to output only the raw JSON, or fix it under Circuit → Edit JSON.` });
      return null;
    }
    let defs = null;
    try { defs = processTemplate(data); } catch (e) { console.error(e); }
    if (!defs?.length) {
      setNotice({ kind: 'error', title: 'No parts found', text: 'The JSON needs a "components" list, each part with an "id" and its "pins" (offset, net, label).' });
      return null;
    }
    for (const d of defs) {
      const seen = new Set();
      for (const [col, row] of d.offsets) {
        const k = `${col},${row}`;
        if (seen.has(k)) {
          setNotice({ kind: 'error', title: `Part ${d.id} has two pins in the same hole`, text: 'Each pin needs its own offset. Fix the offsets of this part, then try again.' });
          return null;
        }
        seen.add(k);
      }
    }
    return defs;
  }, [jsonInput]);

  const handleLoadCircuit = useCallback(() => {
    const defs = parseCircuit();
    if (!defs) return false;
    setNotice(null);
    engine.mergeBoard(defs);
    setWorkflowStep(1); setSnapCounter(c => c + 1); saveHistory();
    return true;
  }, [engine, parseCircuit, saveHistory]);

  // Wire (step 2): fresh placement, rearranged only until every net is connected.
  // Compact (step 3): shrink from the current board (also after moving parts by hand).
  const runLayout = useCallback(async (refine) => {
    const defs = parseCircuit();
    if (!defs) return;
    setWorkflowStep(refine ? 3 : 2);
    setNotice(null);
    setResultCard(null);
    const start = refine && engine.wires.length ? scoreState(engine.components, engine.wires) : null;
    // usage statistics: how many layouts people actually run (GoatCounter event, no personal data)
    window.goatcounter?.count?.({ path: refine ? 'compact' : 'wire', title: `${defs.length} parts`, event: true });
    setStatus(prev => ({ ...prev, isProcessing: true, isInitial: false, progress: 0, best: null, mode: refine ? 'compact' : 'wire' }));
    let res = null;
    try {
      res = await engine.layout(defs, refine ? { refine: true } : { firstOnly: true });
    } finally {
      setStatus(prev => ({ ...prev, isProcessing: false, isInitial: false, best: null }));
      setBestSnapshot(null);
    }
    const cert = res?.topology?.certificate;
    const jumperText = (n) => `${n} jumper wire${n === 1 ? '' : 's'}`;
    if (res && !res.found && engine.gCancelRequested) {
      setNotice({ kind: 'info', title: 'Stopped before a layout was found', text: 'Press Wire again and give it a little longer.' });
    } else if (res && !res.found) {
      setNotice({
        kind: 'warn',
        title: 'No fully routed layout found',
        text: cert
          ? `Parts ${cert.parts.join(', ')} and nets ${cert.nets.join(', ')} form a ${cert.type} structure, so wires have to cross somewhere, and even with jumper wires no complete layout turned up. Try Wire again.`
          : 'The search found no layout where every wire fits, even with jumper wires. Try Wire again, or give parts with many pins more room between their pin rows.',
      });
    } else if (res?.jumpers > 0) {
      setNotice({
        kind: 'info',
        title: `Layout needs ${jumperText(res.jumpers)}`,
        text: cert
          ? `This circuit cannot be built on one layer without crossings: parts ${cert.parts.join(', ')} and nets ${cert.nets.join(', ')} form a ${cert.type} structure. boardroute added ${jumperText(res.jumpers)}, drawn as arcs: insulated wire on the component side, bridging over the wiring underneath.`
          : `No layout without crossings turned up, most likely because some wires don't fit between closely spaced pins. boardroute added ${jumperText(res.jumpers)}, drawn as arcs: insulated wire on the component side, bridging over the wiring underneath.`,
      });
    }
    if (res?.found) {
      const s = scoreState(engine.components, engine.wires);
      setResultCard({
        mode: refine ? 'compact' : 'wire', tick: engine.tick,
        width: s.width, height: s.height, area: s.area, wl: s.wl,
        jumpers: engine.wires.filter(w => w.jumper && !w.failed).length,
        start: start && { width: start.width, height: start.height, area: start.area },
        optimal: res.optimal, bound: res.bound,
      });
    }
    setSnapCounter(c => c + 1); saveHistory();
  }, [engine, parseCircuit, saveHistory]);

  const handleShareLink = useCallback(() => {
    window.goatcounter?.count?.({ path: 'share-create', event: true });
    return shareUrl(engine.components, engine.wires);
  }, [engine]);

  const handleStepClick = useCallback(async (step) => {
    if (step === 0) { engine.setState({ components: [], wires: [] }); setWorkflowStep(0); }
    else if (step === 1) handleLoadCircuit();
    else if (step === 2) runLayout(false);
    else if (step === 3) runLayout(true);
  }, [handleLoadCircuit, runLayout, engine]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const prev = JSON.parse(history[historyIndex - 1]);
      engine.setState(prev); setHistoryIndex(historyIndex - 1);
    }
  }, [history, historyIndex, engine]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const next = JSON.parse(history[historyIndex + 1]);
      engine.setState(next); setHistoryIndex(historyIndex + 1);
    }
  }, [history, historyIndex, engine]);

  const handleRouteOnly = useCallback(async () => {
    setStatus(prev => ({ ...prev, isProcessing: true }));
    try { await engine.routeOnly(); } finally { setStatus(prev => ({ ...prev, isProcessing: false })); }
    saveHistory();
  }, [engine, saveHistory]);

  const handleClearWires = useCallback(() => { engine.setState({ wires: [] }); saveHistory(); }, [engine, saveHistory]);
  const handleMoveComp = useCallback((id, ox, oy) => engine.moveComponent(id, ox, oy), [engine]);
  const handleRotateComp = useCallback((id) => { engine.rotateComponent(id); saveHistory(); }, [engine, saveHistory]);

  const handleManualRoute = useCallback(async (start, end, path) => {
    if (!path) { setPreviewPath(null); return; }
    const netA = start.pin.net;
    let netB = (typeof end === 'object' && end !== null) ? end.pin.net : (typeof end === 'string' ? end : null);
    let targetNet = netA || netB;
    if (!targetNet) {
      const netsList = getAllNets(board.components);
      let i = 1; while (netsList.some(n => n.net === `NET_${i}`)) i++;
      targetNet = `NET_${i}`;
    }
    if (netA && netB && netA !== netB) { engine.mergeNets(netB, netA); targetNet = netA; }
    else {
      engine.updatePinNet(start.compId, start.pinIdx, targetNet);
      if (typeof end === 'object' && end !== null) engine.updatePinNet(end.compId, end.pinIdx, targetNet);
    }
    if (path.some(p => p.isCrossing)) await engine.route();
    else engine.addManualWire(targetNet, path);
    setPreviewPath(null); saveHistory();
  }, [board.components, engine, saveHistory]);

  const handlePreviewRoute = useCallback(async (startPin, currentPos, targetNet = null) => {
    setActivePin(startPin);
    if (!startPin || !currentPos) { setPreviewPath(null); return; }
    setPreviewPath(await engine.previewManualRoute(startPin, currentPos, targetNet));
  }, [engine]);

  const requestDelete = useCallback(() => {
    if (activePin) setConfirmData({ isOpen: true, type: 'pin', targetId: `${activePin.compId}.${activePin.pin.lbl}`, activePin });
    else if (selectedId) setConfirmData({ isOpen: true, type: 'comp', targetId: selectedId });
    else if (selectedNet) setConfirmData({ isOpen: true, type: 'net', targetId: selectedNet });
  }, [activePin, selectedId, selectedNet]);

  const handleConfirmDelete = useCallback(() => {
    if (confirmData.type === 'pin' && confirmData.activePin) { 
      const p = confirmData.activePin;
      engine.updatePinNet(p.compId, p.pinIdx, ''); 
      handleRouteOnly(); 
    }
    else if (confirmData.type === 'comp') { engine.deleteComponent(confirmData.targetId); setSelectedId(null); }
    else if (confirmData.type === 'net') { engine.deleteWire(confirmData.targetId); setSelectedNet(null); }
    else if (confirmData.type === 'reset') handleLoadTemplate();
    setConfirmData({ isOpen: false, type: null, targetId: null }); saveHistory();
  }, [confirmData, engine, handleRouteOnly, handleLoadTemplate, saveHistory]);

  const handleReset = useCallback(() => setConfirmData({ isOpen: true, type: 'reset', targetId: 'board' }), []);
  const handleAddFromLibrary = useCallback((compDef) => {
    const newId = `C${board.components.length + 1}`;
    // footprint = pins + optional body, pin offsets relative to its origin
    const def = processTemplate({ components: [{ ...compDef, id: newId }] })?.[0];
    if (!def) return;
    let cx = 5, cy = 5;
    if (board.components.length > 0) {
      let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
      board.components.forEach(c => { minC = Math.min(minC, c.ox); maxC = Math.max(maxC, c.ox + c.w); minR = Math.min(minR, c.oy); maxR = Math.max(maxR, c.oy + c.h); });
      cx = Math.floor((minC + maxC) / 2) + Math.floor(Math.random() * 5); cy = Math.floor((minR + maxR) / 2) + Math.floor(Math.random() * 5);
    }
    const newComp = { id: newId, name: compDef.name, value: compDef.value, color: compDef.color || null, routeUnder: def.routeUnder, w: def.w, h: def.h, ox: cx, oy: cy, pins: def.offsets.map(([dc, dr], i) => ({ dCol: dc, dRow: dr, col: cx + dc, row: cy + dr, lbl: def.pinLbls[i], net: '' })) };
    engine.setState({ components: [...board.components, newComp], wires: [] });
    setIsLibraryOpen(false); setSelectedId(newId); saveHistory();
  }, [board.components, engine, saveHistory]);

  const handleSaveEdit = useCallback(async (updated) => { 
    if (!editingComp) return;
    const isExisting = board.components.some(c => c.id === editingComp.id);
    const newComps = isExisting
      ? board.components.map(c => c.id === editingComp.id ? updated : c)
      : [...board.components, updated]; // new part from the "New" button; mergeBoard places it
    
    // 1. Two-way sequence: Update text
    const newJson = generateJSONFromState(newComps);
    setJsonInput(JSON.stringify(newJson, null, 2));
    
    // 2. Safely merge it back to engine memory
    const defs = processTemplate(newJson);
    if (defs) {
        engine.mergeBoard(defs);
        // Automatically attempt to fix broken wires
        setStatus(prev => ({ ...prev, isProcessing: true }));
        try { await engine.routeOnly(); } finally { setStatus(prev => ({ ...prev, isProcessing: false })); }
    }
    
    setIsEditorOpen(false); 
    setEditingComp(null);
    saveHistory(); 
  }, [board.components, engine, saveHistory, editingComp]);

  const handleExportState = useCallback(() => {
    const state = { components: board.components, wires: board.wires, cols: board.cols, rows: board.rows };
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'pcb_circuit.json'; a.click();
    URL.revokeObjectURL(url);
  }, [board]);

  const handleImportState = useCallback(() => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          if (parsed.components) {
            const cols = parsed.cols || board.cols;
            const rows = parsed.rows || board.rows;
            engine.setState({ components: parsed.components, wires: parsed.wires || [], cols, rows });
            saveHistory();
          }
        } catch (err) { console.error(err); }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [engine, saveHistory, board.cols, board.rows]);

  useEffect(() => {
    engine.setCallbacks({
      onStateChange: (newState) => setBoard(prev => ({ ...prev, ...newState })),
      onProgress: (p, t, detail) => setStatus(prev => ({ ...prev, progress: p, title: t, detail })),
      onStatusUpdate: (upd) => setStatus(prev => ({ ...prev, ...upd })),
      onBestSnapshot: (snapshot) => {
        const safeWires = snapshot.wires.map(w => ({ ...w, path: w.path ? w.path.map(pt => ({ ...pt })) : null }));
        const safeComps = snapshot.components.map(c => ({ ...c, pins: c.pins ? c.pins.map(p => ({ ...p })) : [] }));
        setBestSnapshot({ components: safeComps, wires: safeWires });
      }
    });
  }, [engine]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); handleUndo(); }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); handleRedo(); }
      if (e.key === 'Delete' || e.key === 'Backspace') { 
          if (document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'INPUT') { 
              e.preventDefault(); 
              if (activePin) {
                  // Open confirm dialog
                  requestDelete(); 
                  // Instantly exit routing mode visually
                  setActivePin(null); 
                  setPreviewPath(null);
              } else {
                  requestDelete(); 
              }
          } 
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, requestDelete, activePin, engine, handleRouteOnly]);

  // Single-key shortcuts: W wire, C compact, R rotate the selected part, F fit the board into
  // view, B flip to the solder side. Ignored while typing and with modifier keys.
  const [viewSide, setViewSide] = useState('top');
  const toggleCoords = useCallback(() => setBoardView(v => ({ ...v, showCoords: !v.showCoords })), [setBoardView]);
  const toggleSide = useCallback(() => {
    setViewSide(s => {
      const next = s === 'top' ? 'bottom' : 'top';
      if (next === 'bottom') {
        setActivePin(null);
        setPreviewPath(null);
      }
      return next;
    });
    setSnapCounter(c => c + 1);
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;
      if (document.querySelector('.overlay-bg, .json-drawer')) return; // a dialog is open
      const k = e.key.toLowerCase();
      if (k === 'b') toggleSide();
      else if (k === 'h') toggleCoords();
      else if (k === 'f') setSnapCounter(c => c + 1);
      else if (status.isProcessing) return;
      else if (k === 'w' && workflowStep >= 1) runLayout(false);
      else if (k === 'c' && workflowStep >= 2) runLayout(true);
      else if (k === 'r' && selectedId && viewSide === 'top') handleRotateComp(selectedId);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSide, toggleCoords, status.isProcessing, workflowStep, runLayout, selectedId, viewSide, handleRotateComp]);

  // Example circuits load bare (no wires): placed on the board, all three steps still to do.
  const loadExample = useCallback((ex) => {
    setExamplesOpen(null);
    setNotice(null);
    setExampleTitle(ex.title);
    setJsonInput(JSON.stringify(ex.circuit, null, 2));
    engine.initializeBoard(processTemplate(ex.circuit));
    setWorkflowStep(1); setSnapCounter(c => c + 1); saveHistory();
    window.goatcounter?.count?.({ path: `example-${ex.id}`, title: ex.title, event: true });
  }, [engine, saveHistory]);

  const closeExamples = useCallback(() => {
    // Skipping the first-visit picker still leaves a circuit to edit
    if (examplesOpen === 'first' && !engine.components.length) handleLoadTemplate();
    setExamplesOpen(null);
  }, [examplesOpen, engine, handleLoadTemplate]);

  // First visit: offer the examples. /?example=<id> (links from the explainer pages) loads one directly.
  const [firstVisit] = useState(() => !localStorage.getItem('pcb_board_state'));
  const [examplesError, setExamplesError] = useState(false);
  useEffect(() => {
    fetch('/examples.json').then(r => r.json()).then(setExamples)
      .catch(err => { console.error('examples.json', err); setExamplesError(true); });
  }, []);
  // Share link (#b=..., see engine/share.js): takes precedence over the saved board, ?example=
  // and the first-visit picker. Loaded like an example, so Undo returns to the previous board.
  const [shareValue] = useState(() => shareFromHash(window.location.hash));
  const [shareState, setShareState] = useState(shareValue ? 'pending' : 'none'); // none | pending | done | failed
  const loadShare = useCallback((value) => decodeShare(value).then(({ components, wires }) => {
    engine.setState({ components, wires });
    setNotice(null);
    setExampleTitle(null);
    setWorkflowStep(wires.length ? 2 : 1); setSnapCounter(c => c + 1); saveHistory();
    setShareState('done');
    window.goatcounter?.count?.({ path: 'share-open', title: `${components.length} parts`, event: true });
  }).catch(err => {
    console.error('share link', err);
    setNotice({ kind: 'error', title: 'This share link could not be opened', text: `${err.message ? err.message[0].toUpperCase() + err.message.slice(1) : 'Unknown error'}. Ask for the link again, and make sure it was copied completely.` });
    setShareState('failed');
  }).finally(() => {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }), [engine, saveHistory]);
  const shareStarted = useRef(false);
  useEffect(() => {
    if (!shareValue || shareStarted.current) return;
    shareStarted.current = true;
    loadShare(shareValue);
  }, [shareValue, loadShare]);
  // A link pasted into a tab that already shows boardroute only changes the fragment (no reload).
  useEffect(() => {
    const onHash = () => { const v = shareFromHash(window.location.hash); if (v) loadShare(v); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [loadShare]);

  const examplesStarted = useRef(false);
  useEffect(() => {
    if (shareState === 'pending' || examplesStarted.current || (!examples.length && !examplesError)) return;
    examplesStarted.current = true;
    if (shareState === 'done') return;
    const wanted = new URLSearchParams(window.location.search).get('example');
    const ex = wanted && examples.find(e => e.id === wanted);
    if (ex) {
      loadExample(ex);
      window.history.replaceState(null, '', window.location.pathname);
    } else if (firstVisit) {
      if (examples.length) setExamplesOpen('first'); else handleLoadTemplate();
    }
  }, [examples, examplesError, firstVisit, loadExample, handleLoadTemplate, shareState]);

  const stats = useMemo(() => {
    const nets = getAllNets(board.components); const score = scoreState(board.components, board.wires);
    const nc = netCompletion(board.components, board.wires);
    const routedNum = board.wires.filter(w => !w.failed).length;
    const jumpers = board.wires.filter(w => w.jumper && !w.failed).length;
    return { components: board.components.length, nets: nets.length, routed: routedNum, failed: board.wires.filter(w => w.failed).length, wireLength: score.wl, footprint: `${score.width}×${score.height}`, area: score.area, completion: board.wires.length > 0 && nc.total > 0 ? Math.round((nc.done / nc.total) * 100) : null, jumpers };
  }, [board]);

  const netsMap = useMemo(() => {
    const m = {}; board.components.forEach(c => c.pins.forEach(p => { if (p.net) { if (!m[p.net]) m[p.net] = []; m[p.net].push(p); } }));
    return m;
  }, [board.components]);

  const selectedComp = useMemo(() => board.components.find(c => c.id === selectedId), [board.components, selectedId]);
  const activeNets = useMemo(() => {
    const list = new Set(); if (hoveredNet) list.add(hoveredNet); if (selectedNet) list.add(selectedNet); if (selectedComp) selectedComp.pins.forEach(p => { if (p.net) list.add(p.net); });
    return Array.from(list);
  }, [hoveredNet, selectedNet, selectedComp]);

  return (
    <div className="app-main" style={{ '--lsb-width': `${lsbWidth}px`, '--rsb-width': `${rsbWidth}px` }}>
      <Topbar
        workflowStep={workflowStep} onStepClick={handleStepClick} onUndo={handleUndo} onRedo={handleRedo}
        onClearWires={handleClearWires} onReset={handleReset} onRouteOnly={handleRouteOnly} onExportSVG={() => setIsExportOpen(true)}
        onShareLink={handleShareLink} hasLayout={board.components.length > 0}
        hasWires={board.wires.length > 0} isProcessing={status.isProcessing}
      />
      <div id="layout">
        <SidebarLeft
          onOpenPrompt={() => setIsPromptOpen(true)}
          onOpenExamples={() => setExamplesOpen('browse')}
          onOpenFile={handleImportState}
          jsonInput={jsonInput} setJsonInput={setJsonInput}
          exampleTitle={exampleTitle}
          onLoadCircuit={(edited) => { const ok = handleLoadCircuit(); if (ok && edited) setExampleTitle(null); return ok; }}
          components={board.components} selectedId={selectedId}
          onSelectComponent={(id) => { setSelectedId(id); if (id) setSelectedNet(null); }}
          onOpenLibrary={() => setIsLibraryOpen(true)}
          onAddNewComponent={() => {
            // The editor needs a component to edit; start from a blank 2-pin part with a free id.
            const ids = new Set(board.components.map(c => c.id));
            let n = board.components.length + 1; while (ids.has(`C${n}`)) n++;
            setEditingComp({ id: `C${n}`, name: 'New part', value: '', w: 2, h: 1, routeUnder: true,
              pins: [{ lbl: '1', net: '', dCol: 0, dRow: 0 }, { lbl: '2', net: '', dCol: 1, dRow: 0 }] });
            setIsEditorOpen(true);
          }}
          onEditComponent={(id) => { setEditingComp(board.components.find(x => x.id === id)); setIsEditorOpen(true); }}
        />
        <div className="resizer l" onMouseDown={(e) => { e.preventDefault(); setIsResizingL(true); }}></div>
        <div id="ca-col">
          {notice && (
            <div className={`notice-banner ${notice.kind}`} role="alert">
              <div className="notice-body">
                <div className="notice-title">{notice.title}</div>
                <div className="notice-text">{notice.text}</div>
              </div>
              <button className="notice-close" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
            </div>
          )}
          <main id="ca">
            <PcbCanvas
              components={board.components} wires={board.wires} cols={board.cols} rows={board.rows}
              selectedId={selectedId} onSelect={(id) => { setSelectedId(id); if (id) setSelectedNet(null); }}
              onSelectNet={(net) => { setSelectedNet(net); if (net) setSelectedId(null); }}
              activeNets={activeNets} activePin={activePin} onMove={handleMoveComp} onRotate={handleRotateComp} onMoveEnd={saveHistory}
              onManualRoute={handleManualRoute} onPreviewRoute={handlePreviewRoute} previewPath={previewPath}
              tick={board.tick} isProcessing={status.isProcessing || !!status.results} isInitialProcessing={status.isInitial}
              workflowStep={workflowStep} snapCounter={snapCounter}
              boardView={boardView}
              side={viewSide} onToggleSide={toggleSide} onToggleCoords={toggleCoords}
              conflicts={status.isProcessing ? board.conflicts : null}
            />
          </main>
          {resultCard && resultCard.tick === board.tick && !status.isProcessing && (
            <ResultCard
              key={resultCard.tick}
              result={resultCard}
              onClose={() => setResultCard(null)}
              onCompact={() => runLayout(true)}
              onExport={() => setIsExportOpen(true)}
              onShare={handleShareLink}
            />
          )}
          <ProcessingBar
            status={status}
            bestSnapshot={bestSnapshot}
            onGoodEnough={() => {
              // Indicate to the user that we are restoring the best-known state.
              setStatus(prev => ({ ...prev, title: 'Restoring best state...', isProcessing: true }));

              // Finally, cancel the engine to stop any ongoing optimization.
              engine.cancel();
              // Apply the best snapshot to the engine, if available.
              if (bestSnapshot && bestSnapshot.components && bestSnapshot.wires) {
                engine.setState({ components: bestSnapshot.components, wires: bestSnapshot.wires });
              } else {
                setStatus({ title: '', progress: 0, best: null, isProcessing: false, isInitial: false, results: null });
              }

              // Clear the best snapshot so it is not reused unintentionally.
              setBestSnapshot(null);
            }}
          />
        </div>
        <div className="resizer r" onMouseDown={(e) => { e.preventDefault(); setIsResizingR(true); }}></div>
        <SidebarRight stats={stats} selectedComp={selectedComp} nets={netsMap}
          hoveredNet={hoveredNet} setHoveredNet={setHoveredNet}
          selectedNet={selectedNet} setSelectedNet={setSelectedNet}
          activeNets={activeNets}
        />
      </div>
      <ExamplesOverlay isOpen={!!examplesOpen} firstVisit={examplesOpen === 'first'} examples={examples} onClose={closeExamples} onSelect={loadExample} />
      <LibraryOverlay isOpen={isLibraryOpen} onClose={() => setIsLibraryOpen(false)} onSelect={handleAddFromLibrary} />
      <CompEditorOverlay key={editingComp?.id} isOpen={isEditorOpen} component={editingComp} onClose={() => setIsEditorOpen(false)} onSave={handleSaveEdit} />
      <PromptOverlay isOpen={isPromptOpen} onClose={() => setIsPromptOpen(false)} />
      <ConfirmOverlay
        isOpen={confirmData.isOpen}
        title={confirmData.type === 'pin' ? 'Disconnect Pin' : confirmData.type === 'comp' ? 'Delete Component' : confirmData.type === 'net' ? 'Delete Net' : confirmData.type === 'reset' ? 'Reset Workspace' : 'Confirm Action'}
        message={confirmData.type === 'pin' ? `Are you sure you want to disconnect ${confirmData.targetId}?` : confirmData.type === 'comp' ? `Are you sure you want to delete ${confirmData.targetId}?` : confirmData.type === 'net' ? `Are you sure you want to clear wires for net ${confirmData.targetId}?` : confirmData.type === 'reset' ? 'Clear all components and wires?' : 'Proceed?'}
        onConfirm={handleConfirmDelete} onCancel={() => setConfirmData({ isOpen: false, type: null, targetId: null })}
      />
      <ExportOverlay isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} components={board.components} wires={board.wires} bestSnapshot={bestSnapshot} boardView={boardView} setBoardView={setBoardView}
        onSaveProject={handleExportState} onShareLink={handleShareLink} />
      <style dangerouslySetInnerHTML={{
        __html: `
        .app-main { display: flex; flex-direction: column; height: 100vh; width: 100vw; overflow: hidden; background: var(--bg0); }
        #layout { display: flex; flex: 1; overflow: hidden; min-height: 0; }
        #ca-col { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; position: relative; overflow: hidden; }
        #ca { flex: 1; position: relative; background: #050706; overflow: hidden; border-radius: 4px; margin: 4px; box-shadow: inset 0 0 40px rgba(0,0,0,0.8); min-height: 0; }
        .resizer { width: 4px; cursor: col-resize; position: relative; z-index: 20; transition: background 0.2s; display: flex; justify-content: center; flex-shrink: 0; }
        .resizer::after { content: ''; width: 1px; height: 100%; background: var(--border); transition: background 0.2s; }
        .resizer:hover::after, .resizer.active::after { background: var(--blu-bright); width: 2px; }
        .resizer.l { margin-right: -2px; margin-left: -2px; }
        .resizer.r { margin-left: -2px; margin-right: -2px; }
        .notice-banner { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 50; width: min(640px, calc(100% - 32px)); display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 8px; background: var(--glass-bg); backdrop-filter: blur(12px); border: 1px solid var(--border); box-shadow: 0 8px 32px rgba(0,0,0,0.45); }
        .notice-banner.error { border-color: #f85149; }
        .notice-banner.warn { border-color: #d29922; }
        .notice-banner.info { border-color: var(--blu-bright); }
        .notice-banner.info .notice-title { color: var(--blu-bright); }
        .notice-body { flex: 1; min-width: 0; }
        .notice-title { font-weight: 600; margin-bottom: 4px; }
        .notice-banner.error .notice-title { color: #ff7b72; }
        .notice-banner.warn .notice-title { color: #e3b341; }
        .notice-text { font-size: 12px; line-height: 1.5; color: var(--txt1); }
        .notice-close { background: none; border: none; color: inherit; font-size: 18px; line-height: 1; cursor: pointer; opacity: 0.7; }
        .notice-close:hover { opacity: 1; }
        /* Phone: the fixed-width sidebars would squeeze the canvas to zero width. Stack the
           canvas on top and let both sidebars follow at full width in one scrolling column. */
        @media (max-width: 700px) {
          .app-main { height: 100dvh; }
          #layout { flex-direction: column; overflow-y: auto; }
          #ca-col { order: -1; flex: none; height: 60dvh; min-height: 300px; }
          #lsb, #rsb { width: auto; flex: none; border-left: none; border-right: none; border-top: 1px solid var(--border); }
          .resizer { display: none; }
        }
      `}} />
    </div>
  );
}
export default App;
