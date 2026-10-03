# boardroute.com: Intelligent Perfboard AutoRouter

boardroute.com is a sophisticated web-based EDA tool specifically designed for prototyping on discrete perforated boards (perfboards/stripboards). It combines a modern React-based frontend with a powerful, heuristic-driven routing and placement engine.

![perfboard-autorouter-demo](https://via.placeholder.com/800x450/0d1117/58a6ff?text=boardroute.com+AutoRouter+Interface)

---

## 🚀 Overview

boardroute.com solves the complex problem of arranging electronic components and routing their connections on a standard 2.54mm grid. Unlike traditional PCB tools, it is optimized for the constraints of "through-hole" prototyping, where space is at a premium and every wire must navigate a discrete matrix of pins.

### Key Features
- **One-click layout:** places, routes and packs the whole circuit, streaming every smaller layout it finds to the screen. Runs in a Web Worker, entirely in the browser.
- **Routability check:** proves up front when a circuit can't be built on one layer (planarity test) and names the parts and nets that cause it.
- **Negotiating router:** nets share contested holes at rising cost until conflicts dissolve (PathFinder-style), with partial repair of wire trees when a part moves.
- **Fixed-box packing search:** simulated annealing inside a fixed board size, then shrink row by row.
- **Benchmark suite:** 14 reference circuits, an independent validator, and a quick mode for iterating on the engine (`bench/`).

---

## 🛠️ Technology Stack

- **Frontend:** React 19, Vite, Lucide React (Icons).
- **Styling:** Vanilla CSS with a custom-built premium dark-mode design system.
- **Engine:** Pure JavaScript optimization core (no heavy external dependencies).
- **Persistence:** LocalStorage-based state recovery for camera, board, and workflow progress.

---

## 🚦 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- [npm](https://www.npmjs.com/)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/Infraviored/Perfboard-AutoRouter.git
   cd Perfboard-AutoRouter
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

---

## 🧠 How the layout engine works

Explained for users, published at [boardroute.com/how-it-works](https://boardroute.com/how-it-works/) (generated from [docs/how-it-works/](docs/how-it-works/README.md) by `scripts/build-site.js` on every build):

1. [From circuit to perfboard](docs/how-it-works/01-perfboard-layout-explained.md): the rules and the three ideas behind the engine
2. [Can your circuit be built on one layer?](docs/how-it-works/02-can-it-be-routed.md): planarity, walls of pins, jumper wires
3. [How wires find their way](docs/how-it-works/03-how-wires-negotiate.md): the negotiating router
4. [Making the board small](docs/how-it-works/04-shrinking-the-board.md): the packing search
5. [How we know it got better](docs/how-it-works/05-measuring-progress.md): benchmark and results
6. [FAQ](docs/how-it-works/06-faq.md)

Technical reference: [docs/architecture.md](docs/architecture.md). The previous optimizer pipeline is documented in [docs/legacy-optimizer.md](docs/legacy-optimizer.md).

### Benchmark

```bash
node bench/run.js box --quick     # ~15 s: 3 hard boards x 4 seeds, for iterating
node bench/run.js box             # full set: 14 circuits x 5 seeds x 60 s
node bench/topology.js            # which circuits are provably unroutable
node bench/show.js 04_blinker555  # ASCII view of the best known layout
```

| Typical board area after 60 s (holes) | Old engine | New engine |
|---|---|---|
| 555 blinker (9 parts) | not routed | 63 |
| ESP32 panel (15 parts) | 286 | 143 |
| RC filter chain (14 parts) | 66 | 36 |
| 4-channel MOSFET switch (23 parts) | not routed | 168 |

---

Built with ❤️ by the boardroute.com Team.
