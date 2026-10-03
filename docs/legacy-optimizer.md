# Legacy optimizer (pre-2026-10 pipeline)

> This describes the original Route → Compact → Optimize pipeline (`optimizer.js`, `optimizer-algorithms.js`). The app now uses the box solver described in [architecture.md](architecture.md); this file is kept for reference.


This document serves as a technical deep-dive into the engine and mathematics powering boardroute.com. The core of this project is an advanced, heuristic-driven constraint solver and placement engine that simultaneously handles 2D bin packing, pathfinding, and graph optimization algorithms to lay out components and route wired connections on a discrete boardroute.com grid.

## Core Objective

The solver aims to find the global minimum of a highly non-convex, multi-objective cost function:

`E_total = W_f * failed_routes + W_a * area + W_p * perimeter + W_w * wire_length`

Since finding the absolute minimum for standard placement and routing (which is an NP-Hard problem akin to the Traveling Salesperson, Steiner Tree, and 2D Bin Packing) is computationally infeasible in polynomial time, we employ a hybrid metaheuristic approach combining Simulated Annealing, greedy local search, graph-based pathfinding, and topographical plateau exploration.

---

## 1. Initial State & Representation

The boardroute.com grid is represented as a discrete 2D coordinate system. 
- **Components** define bounding boxes (`w` x `h`) and local pin offsets.
- **Nets** represent topological graphs of pins that must be electrically connected.
- **Treadmill Coordinate System:** The global coordinate space is conceptually infinite. To counteract coordinate drift during continuous optimization, the entire system utilizes a center-of-mass "treadmill" translation algorithm. After any major global mutation, the bounding box of the active layout is calculated, and all atomic coordinates (components and wire paths) are translated simultaneously such that the bounding box center maps perfectly to `(0, 0)`.

---

## 2. Component Placement Engine

The placement engine's job is to arrange the component bounding boxes such that the resultant geometry maximizes the probability of successful routing while minimizing physical board real estate.

### Simulated Annealing (SA)

We utilize Simulated Annealing as the baseline macro-optimizer for placement.
1. **State Generation:** Randomly select a component and apply a transformation:
   - Translation step: `(dx, dy)` up to a max magnitude.
   - Rotation step: 90, 180, or 270 degrees.
2. **Energy Function (HPWL):** Calculating full pathfinding for every micro-movement is too expensive. Instead, the Annealer evaluates the Half-Perimeter WireLength (HPWL). The HPWL calculates the bounding box of all pins connected to a net and sums the half-perimeters `(width + height)` of these boxes. This serves as a rapid, lower-bound mathematical approximation of the final Steiner Tree routing length.
3. **Acceptance Probability:** A proposed perturbation is always accepted if it decreases the HPWL (`ΔE < 0`). If it increases the cost, it is accepted with a probability defined by the Boltzmann distribution: `P = e^(-ΔE / T)`, where `T` is the geometric cooling temperature.
4. **Hard Constraints:** Any perturbation that physically overlaps two component bodies is immediately rejected to maintain physical validity (unless overlapping is intentionally authorized).

### Local Micro-Mutations and Deep Scrambles

Since Simulated Annealing cools down, it eventually becomes rigid. To prevent the layout from getting trapped in local minima:
- **Micro Search:** If the global score stagnates, we randomly select a subset (e.g., 15%) of components and apply localized rotations or 1-unit nudges, searching for greedy instant improvements in the surrounding state space.
- **Deep Scramble / Macro Mutation:** If stagnation crosses a deep threshold, the solver forcefully translates all components by a wider randomized vector `[-3, +3]`, effectively "shaking" the entire board configuration to kick the system out of a deep local minimum.

---

## 3. The Pathfinding Router

Whenever the placement engine proposes a new topological candidate, the routing engine takes over to construct the physical traces.

### Discrete A* / Lee Algorithm

Routing is fundamentally an execution of the discrete A* search algorithm combined with a breadth-first search wave-propagation approach on the grid.
1. **Heuristics:** The A* node heuristic heavily weights Manhattan distance toward the target pin.
2. **Routing Costs:** 
   - Moving one grid space costs `1` baseline.
   - Moving through a cell already occupied by another net is strictly forbidden (infinite cost).
   - Moving under a component body is prohibited unless the component explicitly holds a `routeUnder` flag.
3. **Multi-Point Nets:** For nets containing more than two pins, the router solves a Minimum Spanning Tree approximation. It routes the first two closest pins, marks the newly generated path as "active" for that net, and then treats the entire geometric line segment as a valid target for the next closest unrouted pin in the net.

---

## 4. Advanced Geometric & Topological Solvers

Between placement and routing steps, the engine applies specialized algorithms directly to the topological structure. All passes that move individual components use **incremental routing** — only the nets touching moved components are ripped up and re-routed, rather than re-routing the entire board from scratch.

### Recursive Push Packing
As the layout routes successfully, it inherently holds "slack" space. The Push Packer greedily analyzes the centroid of the board and systematically applies inward gravity vectors to outer components. If moving a component inward causes an overlap, it uses a recursive push pattern, effectively shifting columns or rows of components simultaneously toward the center to tightly compress the physical footprint.

### Affinity Packing (Wire Loop Resolution)
Detects component pairs sharing ≥2 nets (high topological affinity) that ended up far apart. When two tightly-connected components are separated, their shared-net wires must route long detours ("loops") around obstacles. This pass generates candidate positions by targeting pin-to-pin proximity (Manhattan distance 1-2) for shared nets, and moves the smaller component adjacent to the larger one. This resolves wire loops early so subsequent geometric passes work on a better topology.

### Orthogonal Rotate Optimize (`tryRotateOptimize`)
Iterates sequentially over every component and tests all four 90-degree orthogonal orientations. It permanently commits to the orientation that locally maximizes the successful wire completion and minimizes wire length.

### Wire-Driven Shrink (`tryShrinkAlongWires`)
Instead of blind push-packing, this algorithm calculates the mathematical vectors of the physical wire paths. It evaluates the tension/distance between connected components and attempts to translate the components directly along the axis of their traces, reeling them in to eliminate unnecessary zig-zag geometries.

### Topological Wire Absorption
Iteratively pulls components along their connected wire paths toward their connections. For each pin, follows the actual wire path direction and moves the component 1 step along it. The cell was already occupied by the wire, so the move is provably safe and wirelength monotonically improves. Repeats until no more progress, "peeling the onion" from the outside in — creating internal free space for subsequent compaction passes.

### Targeted Chain Compaction (TCC)
A sliding-puzzle-style optimizer that finds multi-step component relocations to shrink the bounding box. For each boundary component (small first, few-nets first), it tries to move it inward. If a blocker is in the way, it recursively searches for positions to relocate the blocker (and the blocker's blocker, up to depth 2) into nearby free space or air gaps. Routing is checked only once at the end of a successful sequence. Can temporarily grow the BB by +1 for a blocker if the net result is still a BB reduction.

---

## 5. Plateau Exploration

The energy landscape of discrete grid routing is highly step-like—it produces massive "plateaus" where hundreds of different component placements yield the exact same physical wire length, area, and routing completion. 

Standard gradient descent algorithms fail on plateaus because there is no defined downward slope to follow. 
`doPlateauExplore` activates when standard mutations fail sequentially. It systematically branches out into adjacent state definitions:
1. It calculates the neighborhood of the current optimal state by permuting single components.
2. It fully routes these neighbors.
3. It filters neighbors tightly. It explicitly accepts new states that have *identical* area and perimeter, even if the internal wirelength is very slightly worse.
4. By hopping between these mathematically equivalent area states, the system walks across the "flat" top of the plateau until it blindly uncovers the edge of a new gradient descent valley resulting in a suddenly smaller bounding box.

---

## Summary of the Optimization Loop

1. **Initialize:** `placeInitial` populates the board around `(0,0)`.
2. **Anneal:** Fast HPWL placement estimation via Simulated Annealing.
3. **Primary Route:** Full A* execution across all nets.
4. **Search Loop (Epochs × Iterations):**

   | # | Pass | Trigger | Routing |
   |---|------|---------|---------|
   | 1 | **Micro Search** — nudge/rotate ~15% of components randomly | Every iteration | Full re-route |
   | 2 | **Deep Scramble** — randomize all positions within ±3 | `stagnation ≥ 12` | Full re-route |
   | 3 | **Simulated Annealing** — HPWL-based placement pass | Every 10th iter or `stagnation ≥ 8` | Full re-route |
   | 4 | **Recursive Push Packing** — inward gravity with chain-push | Every iteration | Incremental |
   | 5 | **Affinity Packing** — pair up components sharing ≥2 nets | Every iteration | Incremental |
   | 6 | **Rotate Optimize** — test all 4 orientations per component | Every iteration | Incremental |
   | 7 | **Global Nudge** — translate all components ±1 in each direction | Every iteration | Full re-route |
   | 8 | **Wire-Driven Shrink** — pull boundary components along wire tension vectors | Every iteration | Incremental |
   | 9 | **Wire Absorption** — slide components along their actual wire paths | Every iteration | Incremental |
   | 10 | **Chained Compaction (TCC)** — sliding-puzzle boundary shrink | Every iteration | Incremental |
   | 11 | **Plateau Exploration** — BFS over equal-area states | `stagnation ≥ threshold` | Incremental |

5. **Evaluate:** If `scoreState()` mathematically beats the globally cached optimal state (based on routing % → area → perimeter → wire length), cache the new state map.
6. **Plateau / Break:** If stagnation triggers, execute Plateau Exploration to traverse the flat energy topology. Return the absolute best state discovered.
