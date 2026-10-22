import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AutorouterEngine } from './engine/engine.js';
import { PcbCanvas } from './components/PcbCanvas.jsx';
import { Topbar } from './components/Topbar.jsx';
import { SidebarLeft } from './components/SidebarLeft.jsx';
import { SidebarRight } from './components/SidebarRight.jsx';
import { ProcessingBar } from './components/ProcessingBar.jsx';
import { LibraryOverlay } from './components/LibraryOverlay.jsx';
import { CompEditorOverlay } from './components/CompEditorOverlay.jsx';
import { FastTooltips } from './components/FastTooltips.jsx';
import { PromptOverlay } from './components/PromptOverlay.jsx';
import { ConfirmOverlay } from './components/ConfirmOverlay.jsx';
import { ExportOverlay } from './components/ExportOverlay.jsx';
import { ExamplesOverlay } from './components/ExamplesOverlay.jsx';
import { ResultCard } from './components/ResultCard.jsx';
import { AccountOverlay } from './components/AccountOverlay.jsx';
import { cloud, signInFromHash } from './cloud.js';
import { decodeShare, shareFromHash, shareUrl, validateBoardData } from './engine/share.js';
import { TEMPLATE, processTemplate, generateJSONFromState, bodyOf, swapJSON, swapGroups, EDGE_SIDES, isBands } from './engine/templates.js';
import { getAllNets } from './engine/router.js';
import { scoreState } from './engine/metrics.js';
import { netCompletion } from './engine/net-completion.js';
import { useBoardView } from './hooks/useBoardView.js';
import { normalizeBoardView, photoTurn } from './engine/render-utils.js';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// localStorage write that never throws; null/undefined removes the key
function persist(key, value) {
  try {
    if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, value);
  } catch { /* storage unavailable */ }
}

const CONFIRM_CLOSED = { isOpen: false, type: null, targetId: null };
const CONFIRM_TEXT = {
  pin: ['Disconnect Pin', id => `Are you sure you want to disconnect ${id}?`],
  comp: ['Delete Component', id => `Are you sure you want to delete ${id}?`],
  net: ['Delete Net', id => `Are you sure you want to clear wires for net ${id}?`],
  reset: ['Reset Workspace', () => 'Clear all components and wires?'],
};

// first free id of the form <prefix><n>, counting up from `start`
function freeId(components, prefix, start = 1) {
  const ids = new Set(components.map(c => c.id));
  let n = start; while (ids.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

function App() {
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
        const rawComps = parsed.components || [];
        const components = rawComps.map(c => {
          const next = { ...c };
          const s = swapGroups(c);
          if (s) next.swap = s; else delete next.swap;
          return next;
        });
        return {
          components,
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

  const [engine] = useState(() => new AutorouterEngine(board.cols, board.rows));

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
      try {
        localStorage.setItem('pcb_board_state', JSON.stringify({
          components: board.components,
          wires: board.wires,
          cols: board.cols,
          rows: board.rows
        }));
      } catch (e) {
        console.warn('board state not saved', e);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [board.components, board.wires, board.cols, board.rows]);

  useEffect(() => persist('pcb_json_input', jsonInput), [jsonInput]);
  useEffect(() => persist('pcb_model_version', '2'), []);
  useEffect(() => persist('pcb_workflow_step', workflowStep.toString()), [workflowStep]);

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
        ...(swapJSON(c) !== undefined ? { swap: swapJSON(c) } : {}),
        ...(c.edge >= 0 ? { edge: EDGE_SIDES[c.edge] } : {}),
        ...(isBands(c.bands) ? { bands: c.bands } : {}),
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
  // Optional account (cloud.js): who is signed in, and which saved circuit the board came from
  // (Save overwrites that one; loading anything else forgets it)
  const [account, setAccount] = useState(null);
  const accountRef = useRef(account);
  useEffect(() => { accountRef.current = account; }, [account]);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [cloudCurrent, setCloudCurrent] = useState(() => { try { return JSON.parse(localStorage.getItem('pcb_cloud_current')) || null; } catch { return null; } });
  useEffect(() => persist('pcb_cloud_current', cloudCurrent ? JSON.stringify(cloudCurrent) : null), [cloudCurrent]);
  // Summary card after a finished Wire/Compact run; shown only while the board is unchanged
  // since (its tick matches the board's), so any edit, undo or new run hides it.
  const [resultCard, setResultCard] = useState(null);
  const [boardView, setBoardView] = useBoardView();
  const [mobileDrawer, setMobileDrawer] = useState(null); // null | 'parts' | 'inspector'
  // phone: a swipe in from a screen edge opens that side's panel; swiping it back closes it
  useEffect(() => {
    if (!window.matchMedia?.('(max-width: 768px)').matches) return;
    let start = null;
    const down = (e) => {
      const t = e.touches[0], w = window.innerWidth;
      if (document.querySelector('.overlay-bg')) { start = null; return; }
      start = { x: t.clientX, y: t.clientY, edge: t.clientX < 24 ? 'left' : t.clientX > w - 24 ? 'right' : null };
    };
    const up = (e) => {
      if (!start) return;
      const t = e.changedTouches[0], dx = t.clientX - start.x, dy = t.clientY - start.y, s0 = start;
      start = null;
      if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return;
      setMobileDrawer(d => {
        if (!d && s0.edge === 'left' && dx > 0) return 'parts';
        if (!d && s0.edge === 'right' && dx < 0) return 'inspector';
        if (d === 'parts' && dx < 0) return null;
        if (d === 'inspector' && dx > 0) return null;
        return d;
      });
    };
    window.addEventListener('touchstart', down, { passive: true });
    window.addEventListener('touchend', up, { passive: true });
    return () => { window.removeEventListener('touchstart', down); window.removeEventListener('touchend', up); };
  }, []);

  // Modal states
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [examples, setExamples] = useState([]);
  const [examplesOpen, setExamplesOpen] = useState(null); // null | 'first' | 'browse'
  // Shown in the Circuit card while an example is loaded; kept across reloads.
  const [exampleTitle, setExampleTitle] = useState(() => { try { return localStorage.getItem('pcb_example_title'); } catch { return null; } });
  useEffect(() => persist('pcb_example_title', exampleTitle || null), [exampleTitle]);
  const [editingComp, setEditingComp] = useState(null);
  const [editorMode, setEditorMode] = useState('edit'); // 'edit' | 'add' (from the Library)
  // part pictures (from "Footprint from a photo"), by component id; kept out of the circuit JSON
  // so the text the AI reads stays small. Stored on their own; WebP data URLs of ~20-60 KB.
  const [partImages, setPartImages] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pcb_part_images')) || {}; } catch { return {}; }
  });
  const warnedPicturesQuota = useRef(false);
  useEffect(() => {
    try {
      localStorage.setItem('pcb_part_images', JSON.stringify(partImages));
    } catch (e) {
      console.warn('part pictures not saved', e);
      if (!warnedPicturesQuota.current) {
        warnedPicturesQuota.current = true;
        setNotice({ kind: 'warn', title: 'Part pictures could not be stored (browser storage full)' });
      }
    }
  }, [partImages]);
  // Prune pictures for parts no longer on the board
  useEffect(() => {
    const valid = new Set(board.components.map(c => c.id));
    setPartImages(prev => {
      let changed = false;
      const next = {};
      for (const [id, img] of Object.entries(prev)) {
        if (valid.has(id)) next[id] = img;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [board.components]);
  const [editorPhoto, setEditorPhoto] = useState(null);  // 'pick': open the editor with the photo dialog
  const [confirmData, setConfirmData] = useState(CONFIRM_CLOSED);
  const [activePin, setActivePin] = useState(null);
  const [previewPath, setPreviewPath] = useState(null);

  // History
  // The restored board is the first history entry, so Undo can always get back to it
  // (e.g. after loading an example over it).
  const [history, setHistory] = useState(() => board.components.length
    ? [JSON.stringify({ components: board.components, wires: board.wires, cols: board.cols, rows: board.rows, cloudCurrent })] : []);
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
  const [resizing, setResizing] = useState(null); // null | 'l' | 'r'

  useEffect(() => persist('pcb_lsb_width', lsbWidth.toString()), [lsbWidth]);
  useEffect(() => persist('pcb_rsb_width', rsbWidth.toString()), [rsbWidth]);

  useEffect(() => {
    document.body.style.cursor = resizing ? 'col-resize' : 'default';
    document.body.style.userSelect = resizing ? 'none' : 'auto';
    if (!resizing) return;
    const move = (e) => {
      if (resizing === 'l') setLsbWidth(Math.max(180, Math.min(600, e.clientX)));
      else setRsbWidth(Math.max(180, Math.min(600, window.innerWidth - e.clientX)));
    };
    const up = () => setResizing(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [resizing]);

  const saveHistory = useCallback((current = cloudCurrent) => {
    const snap = JSON.stringify({ components: engine.components, wires: engine.wires, cols: engine.cols, rows: engine.rows, cloudCurrent: current });
    const next = history.slice(0, historyIndex + 1);
    next.push(snap);
    if (next.length > 30) next.shift();
    setHistory(next);
    setHistoryIndex(next.length - 1);
  }, [engine, history, historyIndex, cloudCurrent]);

  const handleLoadTemplate = useCallback(() => {
    setExampleTitle(null);
    setCloudCurrent(null);
    setPartImages({});
    setJsonInput(JSON.stringify(TEMPLATE, null, 2));
    const defs = processTemplate(TEMPLATE);
    engine.initializeBoard(defs);
    setWorkflowStep(1); setSnapCounter(c => c + 1); saveHistory(null);
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
      // a board size set in the sidebar / board settings is the target
      const bv = normalizeBoardView(boardView);
      const target = bv.boardCols || bv.boardRows ? { cols: bv.boardCols, rows: bv.boardRows } : null;
      // Wire only connects; the board limit applies to Compact
      res = await engine.layout(defs, refine ? { refine: true, target } : { firstOnly: true });
    } finally {
      setStatus(prev => ({ ...prev, isProcessing: false, isInitial: false, best: null }));
      setBestSnapshot(null);
    }
    const cert = res?.topology?.certificate;
    const jumperText = (n) => `${n} jumper wire${n === 1 ? '' : 's'}`;
    if (res && !res.found && engine.gCancelRequested) {
      setNotice({ kind: 'info', title: 'Stopped before a layout was found', text: 'Press Wire again and give it a little longer.' });
    } else if (res && !res.found && refine && res.target) {
      setNotice({ kind: 'warn', title: 'No layout fits the board', text: 'Compact found no fully wired layout within the board limit. The board stays as it was. Try Compact again, or make the board bigger.' });
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
  }, [engine, parseCircuit, saveHistory, boardView]);

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

  const goHistory = useCallback((delta) => {
    const i = historyIndex + delta;
    if (i < 0 || i >= history.length) return;
    const snap = JSON.parse(history[i]);
    engine.setState(snap);
    setCloudCurrent(snap.cloudCurrent || null);
    setHistoryIndex(i);
  }, [history, historyIndex, engine]);
  const handleUndo = useCallback(() => goHistory(-1), [goHistory]);
  const handleRedo = useCallback(() => goHistory(1), [goHistory]);

  const handleRouteOnly = useCallback(async () => {
    setStatus(prev => ({ ...prev, isProcessing: true }));
    try { await engine.routeOnly(); } finally { setStatus(prev => ({ ...prev, isProcessing: false })); }
    saveHistory();
  }, [engine, saveHistory]);

  const handleClearWires = useCallback(() => { engine.setState({ wires: [] }); saveHistory(); }, [engine, saveHistory]);
  const handleMoveComp = useCallback((id, ox, oy) => engine.moveComponent(id, ox, oy), [engine]);
  const handleRotateComp = useCallback((id) => { engine.rotateComponent(id); saveHistory(); }, [engine, saveHistory]);
  const handleSetBands = useCallback((id, n) => { engine.setBands(id, n); saveHistory(); }, [engine, saveHistory]);

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
    setConfirmData(CONFIRM_CLOSED); saveHistory();
  }, [confirmData, engine, handleRouteOnly, handleLoadTemplate, saveHistory]);

  const handleReset = useCallback(() => setConfirmData({ isOpen: true, type: 'reset', targetId: 'board' }), []);
  const handleAddFromLibrary = useCallback((compDef, photo = null) => {
    // a free id: name initial + number (R3, C2, U1, ...)
    const prefix = (compDef.name || 'P').replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase() || 'P';
    const newId = freeId(board.components, prefix);
    // footprint = pins + optional body, pin offsets relative to its origin
    const def = processTemplate({ components: [{ ...compDef, id: newId }] })?.[0];
    if (!def) return;
    // next to the existing parts (one hole gap), never on top of them; wiring stays as it is
    let cx = 5, cy = 5;
    if (board.components.length > 0) {
      cx = Math.max(...board.components.map(c => c.ox + c.w)) + 1;
      cy = Math.min(...board.components.map(c => c.oy));
    }
    const s = swapGroups(compDef) || swapGroups(def);
    const newComp = { id: newId, name: compDef.name, value: compDef.value, color: compDef.color || null, routeUnder: def.routeUnder, ...(s ? { swap: s } : {}), ...(def.edge >= 0 ? { edge: def.edge } : {}), w: def.w, h: def.h, ox: cx, oy: cy, pins: def.offsets.map(([dc, dr], i) => ({ dCol: dc, dRow: dr, col: cx + dc, row: cy + dr, lbl: def.pinLbls[i], net: '' })) };
    // Show it big in the editor first (pins, nets, body can be adjusted); "Add to circuit" adds it.
    setIsLibraryOpen(false);
    setEditorPhoto(photo);
    setEditorMode('add');
    setEditingComp(newComp);
    setIsEditorOpen(true);
  }, [board.components]);

  const handleSaveEdit = useCallback(async (edited) => {
    if (!editingComp) return;
    // the picture goes to its own store; the part itself stays plain
    const { image, ...updated } = edited;
    setPartImages(prev => {
      const next = { ...prev };
      delete next[editingComp.id];
      if (image) next[updated.id] = image;
      return next;
    });
    if (editorMode === 'add') {
      const comp = { ...updated, pins: updated.pins.map(p => ({ ...p, col: updated.ox + p.dCol, row: updated.oy + p.dRow })) };
      engine.setState({ components: [...board.components, comp], wires: board.wires });
      setIsEditorOpen(false); setEditingComp(null); setEditorMode('edit');
      setSelectedId(comp.id); saveHistory();
      return;
    }
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
        // Keep the board whole: re-wire, and if the changed part no longer fits where it was,
        // nudge or turn it a little (engine.repairPart)
        setStatus(prev => ({ ...prev, isProcessing: true }));
        let whole = true;
        try { whole = await engine.repairPart(updated.id); } finally { setStatus(prev => ({ ...prev, isProcessing: false })); }
        if (!whole && engine.wires.length) setNotice({ kind: 'warn', title: `${updated.id} no longer fits where it was`, text: 'Some connections broke. Press Compact to rearrange the board around the changed part.' });
    }
    
    setIsEditorOpen(false); 
    setEditingComp(null);
    saveHistory(); 
  }, [board.components, board.wires, engine, saveHistory, editingComp, editorMode]);

  // the project file: board plus the pictures of its parts (also what an account saves)
  const boardData = useCallback(() => {
    const pictures = Object.fromEntries(board.components.filter(c => partImages[c.id]).map(c => [c.id, partImages[c.id]]));
    return { components: board.components, wires: board.wires, cols: board.cols, rows: board.rows, ...(Object.keys(pictures).length ? { partImages: pictures } : {}) };
  }, [board, partImages]);
  const handleExportState = useCallback(() => {
    const state = boardData();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'pcb_circuit.json'; a.click();
    URL.revokeObjectURL(url);
  }, [boardData]);

  const handleImportState = useCallback(() => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          const valid = validateBoardData(parsed);
          if (valid) {
            const cols = valid.cols || board.cols;
            const rows = valid.rows || board.rows;
            engine.setState({ components: valid.components, wires: valid.wires, cols, rows });
            setPartImages(valid.partImages || {});
            setCloudCurrent(null);
            saveHistory(null);
          } else {
            setNotice({ kind: 'error', title: 'This circuit could not be read' });
          }
        } catch (err) {
          console.error(err);
          setNotice({ kind: 'error', title: 'This circuit could not be read' });
        }
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
      if ((e.key === 'Delete' || e.key === 'Backspace') && document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        requestDelete();
        // leave routing mode at once; the confirm dialog keeps the pin
        if (activePin) { setActivePin(null); setPreviewPath(null); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, requestDelete, activePin]);

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

  // after a whole board was put on the engine (example, share link, saved circuit)
  const boardLoaded = useCallback((step, { title = null, current = null } = {}) => {
    setNotice(null);
    setExampleTitle(title);
    setCloudCurrent(current);
    setWorkflowStep(step); setSnapCounter(c => c + 1); saveHistory(current);
  }, [saveHistory]);

  // Example circuits load bare (no wires): placed on the board, all three steps still to do.
  const loadExample = useCallback((ex) => {
    setExamplesOpen(null);
    setPartImages({});
    setJsonInput(JSON.stringify(ex.circuit, null, 2));
    engine.initializeBoard(processTemplate(ex.circuit));
    boardLoaded(1, { title: ex.title });
    window.goatcounter?.count?.({ path: `example-${ex.id}`, title: ex.title, event: true });
  }, [engine, boardLoaded]);

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
  // a circuit shared from an account: /?c=<slug>
  const [sharedSlug] = useState(() => new URLSearchParams(window.location.search).get('c'));
  const [shareState, setShareState] = useState(shareValue || sharedSlug ? 'pending' : 'none'); // none | pending | done | failed
  const loadShare = useCallback((value) => decodeShare(value).then(({ components, wires }) => {
    engine.setState({ components, wires });
    // Pictures are not in share links. Keep the ones that still fit a part of the same id and
    // footprint (opening a link to your own board must not throw its photos away), drop the rest.
    setPartImages(prev => {
      const next = {};
      for (const c of components) if (prev[c.id] && photoTurn(c, prev[c.id]) >= 0) next[c.id] = prev[c.id];
      return next;
    });
    boardLoaded(wires.length ? 2 : 1);
    setShareState('done');
    window.goatcounter?.count?.({ path: 'share-open', title: `${components.length} parts`, event: true });
  }).catch(err => {
    console.error('share link', err);
    setNotice({ kind: 'error', title: 'This share link could not be opened', text: `${err.message ? err.message[0].toUpperCase() + err.message.slice(1) : 'Unknown error'}. Ask for the link again, and make sure it was copied completely.` });
    setShareState('failed');
  }).finally(() => {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }), [engine, boardLoaded]);
  // a saved circuit(from the account dialog or a /?c= link) onto the board
  const applySaved = useCallback((rawData, current = null) => {
    const data = validateBoardData(rawData);
    if (!data) {
      setNotice({ kind: 'error', title: 'This circuit could not be read' });
      return false;
    }
    const { components, wires, cols, rows, partImages } = data;
    engine.setState({ components, wires, ...(cols ? { cols, rows } : {}) });
    setPartImages(partImages || {});
    boardLoaded(wires.length ? 2 : 1, { current });
    return true;
  }, [engine, boardLoaded]);
  const shareStarted = useRef(false);
  useEffect(() => {
    if (shareStarted.current) return;
    if (shareValue) { shareStarted.current = true; loadShare(shareValue); return; }
    if (!sharedSlug) return;
    shareStarted.current = true;
    cloud.shared(sharedSlug).then(({ data }) => {
      if (!applySaved(data, null)) {
        setShareState('failed');
        return;
      }
      setShareState('done');
      window.goatcounter?.count?.({ path: 'shared-open', title: `${data.components.length} parts`, event: true });
    }).catch(err => {
      setNotice({ kind: 'error', title: 'This shared circuit could not be opened', text: err.code === 'NOT_FOUND' ? 'Its owner stopped sharing it or deleted it.' : err.message });
      setShareState('failed');
    }).finally(() => window.history.replaceState(null, '', window.location.pathname + window.location.hash));
  }, [shareValue, loadShare, sharedSlug, applySaved]);

  // Account: who is signed in; a sign-in link (#signin=<token>) from the mail signs in here
  useEffect(() => {
    const signIn = () => {
      const t = signInFromHash(window.location.hash);
      if (!t) return false;
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      cloud.verify(t).then(r => {
        const prev = accountRef.current;
        if (!prev || prev.email !== r.email) setCloudCurrent(null);
        setAccount(r);
        setIsAccountOpen(true);
      })
        .catch(err => setNotice({ kind: 'error', title: 'Sign-in failed', text: err.code === 'BROWSER_MISMATCH' ? 'Open the link in the same browser you requested it from' : err.message }));
      return true;
    };
    if (!signIn()) cloud.me().then(setAccount).catch(() => { /* no API (local dev without the server) */ });
    window.addEventListener('hashchange', signIn);
    return () => window.removeEventListener('hashchange', signIn);
  }, []);
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

  const netsMap = useMemo(() => {
    const m = {}; board.components.forEach(c => c.pins.forEach(p => { if (p.net) { if (!m[p.net]) m[p.net] = []; m[p.net].push(p); } }));
    return m;
  }, [board.components]);

  const stats = useMemo(() => {
    const score = scoreState(board.components, board.wires);
    const nc = netCompletion(board.components, board.wires);
    const routedNum = board.wires.filter(w => !w.failed).length;
    const jumpers = board.wires.filter(w => w.jumper && !w.failed).length;
    return { components: board.components.length, nets: Object.keys(netsMap).length, routed: routedNum, failed: board.wires.filter(w => w.failed).length, wireLength: score.wl, footprint: `${score.width}×${score.height}`, area: score.area, completion: board.wires.length > 0 && nc.total > 0 ? Math.round((nc.done / nc.total) * 100) : null, jumpers };
  }, [board, netsMap]);

  const selectComp = useCallback((id) => { setSelectedId(id); if (id) setSelectedNet(null); }, []);

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
        account={account} onAccount={() => setIsAccountOpen(true)}
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
          onSelectComponent={selectComp}
          onOpenLibrary={() => setIsLibraryOpen(true)}
          onAddNewComponent={() => {
            setEditorPhoto(null);
            setEditorMode('edit');
            // The editor needs a component to edit; start from a blank 2-pin part with a free id.
            setEditingComp({ id: freeId(board.components, 'C', board.components.length + 1), name: 'New part', value: '', w: 2, h: 1, routeUnder: true,
              pins: [{ lbl: '1', net: '', dCol: 0, dRow: 0 }, { lbl: '2', net: '', dCol: 1, dRow: 0 }] });
            setIsEditorOpen(true);
          }}
          onEditComponent={(id) => { setEditorMode('edit'); setEditorPhoto(null); const c = board.components.find(x => x.id === id); setEditingComp(c && partImages[id] ? { ...c, image: partImages[id] } : c); setIsEditorOpen(true); }}
          mobileOpen={mobileDrawer === 'parts'}
          onCloseDrawer={() => setMobileDrawer(null)}
        />
        <div className="resizer l" onMouseDown={(e) => { e.preventDefault(); setResizing('l'); }}></div>
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
              components={board.components} wires={board.wires} cols={board.cols} rows={board.rows} partImages={partImages}
              selectedId={selectedId} onSelect={selectComp}
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
        <div className="resizer r" onMouseDown={(e) => { e.preventDefault(); setResizing('r'); }}></div>
        <SidebarRight stats={stats} selectedComp={selectedComp} nets={netsMap} onSetBands={handleSetBands}
          hoveredNet={hoveredNet} setHoveredNet={setHoveredNet}
          selectedNet={selectedNet} setSelectedNet={setSelectedNet}
          activeNets={activeNets}
          mobileOpen={mobileDrawer === 'inspector'}
          onCloseDrawer={() => setMobileDrawer(null)}
          boardView={boardView} setBoardView={setBoardView}
          components={board.components} wires={board.wires}
        />
        <div className={`mobile-drawer-backdrop ${mobileDrawer ? 'active' : ''}`} onClick={() => setMobileDrawer(null)} />
      </div>
      {/* phone: Parts slides in from the left, Inspector from the right (edge handle or swipe) */}
      <button className={`mobile-edge left ${mobileDrawer ? 'hide' : ''}`} onClick={() => setMobileDrawer('parts')} aria-label="Open parts">
        <ChevronRight size={14} /><span>Parts{board.components.length ? ` · ${board.components.length}` : ''}</span>
      </button>
      <button className={`mobile-edge right ${mobileDrawer ? 'hide' : ''}`} onClick={() => setMobileDrawer('inspector')} aria-label="Open inspector">
        <span>Inspector</span><ChevronLeft size={14} />
      </button>
      <ExamplesOverlay isOpen={!!examplesOpen} firstVisit={examplesOpen === 'first'} examples={examples} onClose={closeExamples} onSelect={loadExample} />
      <FastTooltips />
      <LibraryOverlay isOpen={isLibraryOpen} onClose={() => setIsLibraryOpen(false)} onSelect={(c) => handleAddFromLibrary(c)}
        onPhoto={() => handleAddFromLibrary({ name: 'Module', value: '', pins: [{ offset: [0, 0], label: '1' }, { offset: [1, 0], label: '2' }] }, 'pick')} />
      <CompEditorOverlay key={editingComp?.id} isOpen={isEditorOpen} component={editingComp} onClose={() => { setIsEditorOpen(false); if (editorMode === 'add') { setEditorMode('edit'); setIsLibraryOpen(true); } }} onSave={handleSaveEdit} netNames={Object.keys(netsMap).sort()} mode={editorMode} photo={editorPhoto} />
      <PromptOverlay isOpen={isPromptOpen} onClose={() => setIsPromptOpen(false)} />
      <ConfirmOverlay
        isOpen={confirmData.isOpen}
        title={CONFIRM_TEXT[confirmData.type]?.[0] ?? 'Confirm Action'}
        message={CONFIRM_TEXT[confirmData.type]?.[1](confirmData.targetId) ?? 'Proceed?'}
        onConfirm={handleConfirmDelete} onCancel={() => setConfirmData(CONFIRM_CLOSED)}
      />
      <AccountOverlay isOpen={isAccountOpen} onClose={() => setIsAccountOpen(false)} account={account} setAccount={setAccount}
        current={cloudCurrent} setCurrent={setCloudCurrent} hasBoard={board.components.length > 0} getBoardData={boardData}
        onOpenCircuit={(c) => applySaved(c.data, { id: c.id, name: c.name })} />
      <ExportOverlay isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} components={board.components} wires={board.wires} bestSnapshot={bestSnapshot} boardView={boardView} setBoardView={setBoardView}
        onSaveProject={handleExportState} onShareLink={handleShareLink} partImages={partImages} />
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

        .mobile-drawer-backdrop, .mobile-edge { display: none; }

        @media (max-width: 768px) {
          .app-main {
            height: 100dvh;
            width: 100vw;
            position: fixed;
            overflow: hidden;
          }
          #layout {
            flex-direction: row;
            overflow: hidden;
            position: relative;
            flex: 1;
            min-height: 0;
          }
          #ca-col {
            flex: 1;
            height: 100%;
            min-width: 0;
            min-height: 0;
            order: 0;
          }
          #ca {
            margin: 0;
            border-radius: 0;
            height: 100%;
          }
          .resizer { display: none !important; }

          /* Edge handles for the side panels */
          .mobile-edge {
            position: fixed; top: 50%; z-index: 130;
            display: flex; align-items: center; justify-content: center; gap: 4px;
            height: 96px; width: 24px; padding: 0;
            background: var(--bg2); border: 1px solid var(--border2); color: var(--txt1);
            font-family: 'Outfit', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: .04em;
            writing-mode: vertical-rl; cursor: pointer;
            transform: translateY(-50%); transition: opacity .2s;
            box-shadow: 0 4px 16px rgba(0,0,0,.45);
          }
          .mobile-edge.left { left: 0; border-left: 0; border-radius: 0 10px 10px 0; }
          .mobile-edge.right { right: 0; border-right: 0; border-radius: 10px 0 0 10px; }
          .mobile-edge.left span { transform: rotate(180deg); }
          .mobile-edge.hide { opacity: 0; pointer-events: none; }

          /* Backdrop */
          .mobile-drawer-backdrop {
            display: block;
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(3px);
            z-index: 140;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.25s ease;
          }
          .mobile-drawer-backdrop.active {
            opacity: 1;
            pointer-events: auto;
          }

          /* Sidebars as side panels */
          #lsb, #rsb {
            position: fixed !important;
            top: 0 !important;
            bottom: 0 !important;
            height: 100dvh !important;
            max-height: none !important;
            width: min(86vw, 360px) !important;
            border: 1px solid var(--border2) !important;
            background: var(--bg2) !important;
            box-shadow: 0 0 36px rgba(0,0,0,0.6) !important;
            z-index: 150 !important;
            transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1) !important;
            pointer-events: none;
            overflow-y: auto !important;
            overscroll-behavior: contain;
          }
          #lsb { left: 0 !important; right: auto !important; border-left: 0 !important; border-radius: 0 14px 14px 0 !important; transform: translateX(-105%) !important; }
          #rsb { right: 0 !important; left: auto !important; border-right: 0 !important; border-radius: 14px 0 0 14px !important; transform: translateX(105%) !important; }
          #lsb.mobile-open, #rsb.mobile-open {
            transform: translateX(0) !important;
            pointer-events: auto !important;
          }
        }
      `}} />
    </div>
  );
}
export default App;
