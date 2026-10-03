# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

boardroute.com — a browser-only perfboard/stripboard autorouter: React 19 + Vite frontend, pure-JS placement/routing engine, no backend. State persists in `localStorage` (`pcb_board_state`, `pcb_json_input`, `pcb_workflow_step`, sidebar widths).

## Commands

```bash
npm run dev       # Vite dev server
npm run build     # vite build + scripts/build-site.js into dist/ (goes through the server's buildlock shim automatically)
npm run build:site  # only regenerate the static explainer pages (needs an existing dist/)
npm run lint      # eslint .
npm run preview   # serve dist/
```

There is no unit test suite; solver quality is measured with the benchmark in `bench/` (Node, no build step):

```bash
node bench/run.js box --quick                 # 3 hard boards x 4 seeds x 15 s, ~15 s wall clock -- iterate here
node bench/run.js box --quick --opt pSmart=80 # A/B a solver tunable (keys = the V object in boxsolver.js)
node bench/run.js box                         # full set, 5 seeds x 60 s (~6 min with --jobs 12)
node bench/run.js app                         # exactly what the UI runs (topology check + jumper policy)
node bench/run.js legacy                      # the old UI pipeline (placeAndRoute -> optimize -> plateau)
node bench/report.js bench/results/a.json bench/results/b.json   # side-by-side table
node bench/topology.js [--blocking]           # which circuits are provably unroutable on one layer
node bench/show.js 04_blinker555              # ASCII view of the best known layout (bench/best/)
node bench/make-circuits.js                   # regenerate bench/circuits/04_* .. x*_
```

- Score = geometric mean of area / `bench/reference.json` over all runs (unrouted = 2). The reference is frozen on purpose so scores stay comparable across experiments; don't update it casually. Quick-set differences below ~0.05 are noise (time budgets cut runs at different points).
- Every result is checked by `bench/validate.js`, which deliberately shares no code with the engine. A solver that "wins" with an invalid layout shows `!` in the table.
- Runs use a seeded `Math.random` (bench/worker.js); runs are parallel processes, so don't run two benchmarks at once (time budgets would compete for CPU), and don't edit solver sources while one runs (each worker imports them fresh).
- `bench/circuits/` uses `routeUnder: true` everywhere: on perfboard the wiring is on the solder side, so only pins block. `x*_` are constructed (un)routability cases.

The old engine can also be exercised with the repro script (imports `src/engine/optimizer.js` directly under Node):

```bash
node problems/repro.js                         # compact + optimize problems/simple_pcb_optimizer/pcb_circuit_ai.json
node tools/analyze_layout.js <layout.json>     # bounding box + which components sit on each edge
```

`problems/*/` holds saved real-world layouts (often an `-ai` vs `-human` pair) used as optimization benchmarks.

**Website around the app:** `/` is the app (`index.html` carries the SEO meta, JSON-LD and a static intro inside `#root` that React replaces on mount). `scripts/build-site.js` turns `docs/how-it-works/0*.md` into static, crawlable pages at `/how-it-works/<slug>/` (slug = file name without the number), plus `/how-it-works/` (hub), `sitemap.xml` and `robots.txt`; styles in `scripts/site.css`. Article titles/summaries come from the table in `docs/how-it-works/README.md`. A Markdown comment `<!-- board: <name> | <caption> -->` becomes an SVG of `docs/how-it-works/figures/<name>.json` drawn with the app's `generateBoardSVG` (a code block right after it is the text fallback and gets replaced). These pages don't exist under `npm run dev`; check them with `npm run build && npm run preview`. `public/og-image.png` is the social preview image.

**Analytics:** self-hosted, cookie-free GoatCounter (container `goatcounter`, compose in `../goatcounter/`, SQLite in `../goatcounter/data/`), proxied by the host nginx at `https://boardroute.com/stats/` (dashboard, own login) — the count script is included in `index.html` and every generated page. It ignores localhost. The app also sends events (`goatcounter.count({ event: true })`) for Layout/Refine runs.

**Deploy:** served as static files by the host nginx. `dist/` is registered in `../nginx/webroot-domains.conf`; build + publish with
`cd ../nginx && ./nginx.sh deploy boardroute.com` (copies to `nginx/webroot/boardroute`).

## Architecture

### Engine (`src/engine/`) — UI-independent

- `engine.js` — `AutorouterEngine`, the headless facade the UI talks to. Holds `components`, `wires`, `cols/rows`, and optimizer `config`; reports back via callbacks set with `setCallbacks({ onStateChange, onProgress, onStatusUpdate, onBestSnapshot })`. Cancellation is cooperative through `gCancelRequested` / `checkCancel`. `mergeBoard()` reconciles an edited component JSON with the existing board (keeps positions, repairs wires) instead of re-placing everything.
- `templates.js` — `processTemplate()` converts the user-facing circuit JSON (`components[].pins[{offset:[col,row], net, label}]`, optional `routeUnder`) into internal component defs (normalized `offsets`, `pinNets`, `pinLbls`, `w`, `h`). `generateJSONFromState()` goes the other way. `public/default.json` and `TEMPLATE` show the format.
- `grid.js` — occupancy grid with bitflags `BLOCKED_COMP | BLOCKED_PIN | BLOCKED_WIRE`.
- `router.js` — A*/Lee router. `route()` routes all nets (multi-pin nets grow from existing net geometry, MST-style); `incrementalReroute(components, wires, movedComps)` rips up and re-routes only nets touching moved components — most optimizer passes depend on this for speed.
- `placer.js` — component geometry primitives (`moveComp`, `rotateComp90InPlace`, overlap checks) and HPWL-based simulated annealing (`anneal`).
- `initial-placement.js` — `placeInitial` / `makeComp`.
- `optimizer.js` — the two top-level loops: `compactBoard()` (epochs × iterations running the pass pipeline) and `optimizeBoard()`.
- `optimizer-algorithms.js` — the individual passes (push packing, affinity packing, rotate optimize, wire-driven shrink, wire absorption, chained compaction/TCC, plateau exploration) plus scoring.
- `state-utils.js` — `saveComps`/`restoreComps` snapshots; passes speculatively mutate components in place and restore on failure.
- `render-utils.js` — pure SVG string generators (board, wires, ratsnest, export) and hit-testing; `SP = 28` px grid pitch. `colors.js` derives stable net/component colors.

- `solver/` — the box solver (`solveBox`) behind the UI's Layout/Refine steps (`engine.layout()`, run in `solver.worker.js`; the legacy pipeline above is kept but unused by the UI):
  - `boxrouter.js` — negotiated-congestion (PathFinder-style) router inside a fixed W×H box. Nets may temporarily share cells at rising cost; the result's `overuse`/`miss` measure how far a placement is from routable. Warm starts `salvage()` the valid part of each net's previous Steiner tree and only re-route the broken branches -- this partial repair is the main speed lever (profiling: A* in `routeNet` is ~60 % of runtime).
  - `boxsolver.js` — fix the box, simulated-anneal placement against overlap + routing violations until legal, crop to the footprint, delete a row/column, repeat; restart after repeated failures. Start placement comes from a cheap wire-length (HPWL) anneal. Moves: shift, rotate, swap, random jump and the dominant "smart jump" (put a pin next to another pin of the same net). Metropolis draws its random number first so overlapping moves are rejected exactly without routing. All tunables live in the `V` object and can be set per benchmark run with `--opt`. Jumper wires are a router step (straight hop over 1–4 holes without parts) enabled by `V.jumpers` / `V.jumperAfterMs`; they come out as wires with `jumper: true`.
  - `model.js` — numeric circuit model (4 precomputed rotations matching `rotateComp90InPlace`) and `toEngine()` back to engine components/wires.
- `topology.js` — proves a circuit unroutable on one layer: contract every net's copper (wires + its pins) to a vertex, keep part bodies/pin clusters as grid graphs; the result must be planar for ANY placement. Non-planar → returns a K5/K3,3 certificate naming parts and nets. Planarity is necessary, not sufficient: it ignores capacity (e.g. `06_motor_l293d` is planar but its DIP-16 corridor of 2 holes is too narrow; with 3 holes it routes).

Key invariants:
- **Scoring is lexicographic** (`scoreState` / `isScoreBetter`): routing completion → area → perimeter → wire length. A pass is accepted only if it beats the current best.
- **Treadmill coordinates:** the grid is effectively unbounded (callers pass huge `cols/rows`, e.g. `1000000`); after global mutations everything is recentred around the origin (`recenterComponents`).
- The legacy passes run on the main thread (the box solver runs in a Web Worker); long loops yield with `await new Promise(r => setTimeout(r, 0))` so the UI stays responsive. Keep that pattern when adding long-running passes.

`docs/architecture.md` is the detailed write-up of the algorithms and pass schedule; the other `docs/*.md` are research notes.

### UI (`src/`)

- `App.jsx` owns all app state (board, workflow step, selection, active pin for manual routing, undo history, overlays) and a single `AutorouterEngine` instance; components are presentational and call back into `App`.
- `components/PcbCanvas.jsx` — zoom/pan canvas rendering the SVGs from `render-utils.js`; camera auto-framing physics tuned in `engine/config.js` (`CAMERA_CONFIG`).
- Overlays: `CompEditorOverlay` (component footprint editor), `LibraryOverlay` (loads `public/component_database.json`), `ExportOverlay` (pruned board export via `generatePrunedSVG`), `PromptOverlay`, `ConfirmOverlay`.

### Not part of the app

- `legacy/` — the pre-React vanilla-JS version; not imported anywhere.
- `logger.js` — tiny CommonJS HTTP logger (port 3001) from old benchmarking; with `"type": "module"` it must be renamed to `.cjs` to run.
