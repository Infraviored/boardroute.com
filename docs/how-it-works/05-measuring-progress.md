# How we know it got better: the benchmark

**In short**

- Every change to the layout engine is measured on a fixed set of 14 circuits, several times each, with a fixed time limit.
- Every result is checked by an independent validator that shares no code with the engine, so a bug can't make a broken layout look like a win.
- Compared to the previous engine, the new one wires every test circuit that is known to be wireable, and its boards are up to half the size.

---

## Why measure at all

Layout search is full of ideas that sound good and don't work. Pushing parts toward the centre, trying every rotation, routing big nets first: each is plausible, and each can make results worse on some boards. The only way to know is to measure, on enough boards, enough times.

## The test set

The 14 test circuits fall into three groups:

- **Real projects.** The demo circuit, a small ESP32 LED circuit, a door strike controller, a 555 blinker, a dual op-amp amplifier, an L293D motor driver, an ESP32 panel with LEDs, buttons and I2C pull-ups, an RC filter chain, and a four-channel MOSFET switch with 23 parts.
- **Circuits that are known to be impossible** on one layer (the ten-capacitor K5 and the nine-capacitor utilities puzzle from [the routability article](02-can-it-be-routed.md)). A good engine should recognise them instead of searching forever.
- **Look-alikes that are possible**, such as the same circuits with one part removed or with wide-spaced resistors, and three transistors in parallel.

Each circuit is run five times with different random seeds, for 60 seconds each. Random seeds matter because the search is randomised. One lucky run proves nothing, the typical result does.

## The referee

Every layout an engine produces goes through a separate validator before it counts. The validator knows only the rules of the board (no overlapping parts, no crossing wires, no wire through a foreign pin, every pin of a net connected) and checks them from scratch. It deliberately shares no code with the engine. This caught real problems: the old engine occasionally finished with a wire running over a foreign pin, and an early version of the new router once let two nets share a hole after a repair.

## Results

Typical board area (median of five runs, in holes) after 60 seconds. "—" means no fully wired layout was found in any run.

| Circuit | Parts | Old engine | New engine | Best ever found |
|---|---|---|---|---|
| Demo circuit | 6 | 16 | 15 | 15 |
| ESP32 + LED | 5 | 70 | 70 | 70 |
| Door strike controller | 9 | 84 | 77 | 77 |
| 555 blinker | 9 | — | 63 | 56 |
| Dual op-amp | 11 | 80 (1 of 5 runs) | 64 | 60 |
| ESP32 panel | 15 | 286 (2 of 5 runs) | 143 | 132 |
| RC filter chain | 14 | 66 | 36 | 35 |
| 4-channel MOSFET switch | 23 | — | 168 | 154 |
| Ten resistors, five nets | 10 | 56 | 40 | 40 |

Across all circuits that can be wired, a typical run of the new engine ends about 3 % above the best layout we have ever found for that circuit. The old engine ended 46 % above it on average, with each run that never produced a fully wired board counted as twice the best size.

It also got faster. After 15 seconds the new engine is already about where its own first version was after a full minute.

The L293D motor driver was the open case: neither engine could wire it without crossings. As described in [the routability article](02-can-it-be-routed.md), it most likely doesn't fit between the rows of a standard DIP-16. With automatic jumper wires the app now wires it in every run, typically on 209 holes with two jumpers. The two impossible capacitor circuits get a layout with exactly one jumper each (25 and 30 holes), which is the minimum.

## What helped and what didn't

The benchmark decided which ideas made it into the engine:

| Idea | Effect |
|---|---|
| Repairing broken wire branches instead of re-routing whole nets | Large gain, the biggest single improvement |
| Smart jumps (pin next to a pin of the same net) | Large gain on every board |
| Rough placement by wire length before the real search | Clear gain on large boards |
| Rejecting overlapping moves without routing | 20–35 % more moves per second, same results |
| A thorough second routing attempt for placements with only one or two conflicts | Small gain |
| More negotiation rounds per move | Worse: each move gets slower, and more moves beat better-checked moves |
| Push moves (shove neighbours along) | Worse, removed |
| Emptying a border row gradually instead of deleting it | No clear difference, not used |

## Limits

- "Best ever found" is not the same as optimal. For most circuits nobody knows the true minimum. A smaller layout may exist.
- The search is randomised, so two runs can give different boards. Pressing Compact again, or starting over with Wire, sometimes finds a smaller one.
- The test set is small. If you have a circuit where boardroute does badly, it would make a good addition.

→ [FAQ](06-faq.md)
