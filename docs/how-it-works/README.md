# How boardroute works

User-facing explanations of the layout engine. `npm run build` publishes them as static pages at https://boardroute.com/how-it-works/<slug>/ (slug = file name without the number; see `scripts/build-site.js`). Plain Markdown; the only site-specific markup is `<!-- board: <figure> | <caption> -->`, which becomes a rendered board from `figures/`. The table below drives the page titles and descriptions.

| # | Article | One-line summary |
|---|---|---|
| 1 | [From circuit to perfboard](01-perfboard-layout-explained.md) | The rules of perfboard layout, why it's hard, and the three ideas behind the engine. |
| 2 | [Can your circuit be built on one layer?](02-can-it-be-routed.md) | The three-utilities puzzle, walls of pins, the planarity check, and what to do when a circuit fails it. |
| 3 | [How wires find their way](03-how-wires-negotiate.md) | Shortest-path search, Steiner trees, negotiated congestion, and repairing instead of re-routing. |
| 4 | [Making the board small](04-shrinking-the-board.md) | Fixed-size search, simulated annealing, smart jumps, and shrinking row by row. |
| 5 | [How we know it got better](05-measuring-progress.md) | The benchmark, the independent validator, results against the previous engine. |
| 6 | [FAQ](06-faq.md) | Short answers to common questions. |

Search terms these pages cover: perfboard layout, protoboard layout, perfboard autorouter, single-sided routing, perfboard design tool, can a circuit be routed on one layer, planar graph, utilities puzzle, jumper wire placement, automatic jumper wires, simulated annealing placement, PathFinder routing.

Numbers in articles 1, 2 and 5 come from the benchmark in `bench/` (run of 2026-10-03, 5 seeds × 60 s per circuit). Re-check them when the engine changes: `node bench/report.js bench/baselines/legacy-60s.json bench/baselines/box-v3-60s.json bench/baselines/app-jumpers-60s.json` (the last one is the app's policy with automatic jumper wires).
