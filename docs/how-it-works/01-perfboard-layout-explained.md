# From circuit to perfboard: how boardroute finds a compact layout

**In short**

- You describe your parts and which pins belong together. boardroute decides where every part goes, how it is rotated, and where every wire runs.
- The goal is the smallest board on which every connection is made without two wires crossing. Shorter wires break ties.
- Before searching, boardroute checks whether your circuit can be built on one layer at all. If it can't, it tells you which parts are to blame instead of searching forever.

---

## The puzzle

A perfboard is a grid of holes, 2.54 mm (0.1 inch) apart. Parts sit on top with their legs through the holes. The wiring runs underneath on the solder side: bent legs, bare wire and solder bridges, all from hole to hole.

That gives a small set of rules:

1. **Wires can't cross.** Two wires in the same hole are a short circuit.
2. **Pins block.** A wire can't pass through a hole taken by another net's pin.
3. **Wires may pass under parts.** The wiring is on the other side of the board, so a part body is no obstacle. Only its legs are. (Some parts really can't be routed under; you can mark those.)
4. **Parts can go anywhere and turn in 90° steps.** They just can't overlap.

The question boardroute answers: *where do the parts go, and where do the wires run, so that the board is as small as possible?*

## Why this is hard

It looks like a puzzle you could solve by hand, and for five parts you often can. But the numbers grow fast. Take nine parts on a 10 × 10 area. Each part has about 100 positions and 4 rotations, so there are roughly 400⁹ ≈ 10²³ ways to place them, more than the number of grains of sand on Earth. And for every placement, finding wires that don't cross is a puzzle of its own.

No program can try them all. A good program has to search cleverly, and it should know when to stop.

## Three ideas

boardroute's layout engine is built on three ideas. Each has its own article.

### 1. Check whether it's possible at all

Some circuits cannot be wired on one layer, no matter how cleverly the parts are arranged. It is the same reason you can't connect three houses to water, gas and electricity without two lines crossing. boardroute runs a mathematical check (a planarity test) before it starts. If the circuit fails, boardroute knows a jumper wire is needed, places as few as it can, and tells you which parts and nets caused the conflict.

→ [Can your circuit be built on one layer?](02-can-it-be-routed.md)

### 2. Wires that negotiate

Simple routers lay wires one after another, first come, first served. The first wire takes the shortest path even if it blocks everything after it. boardroute's router lets wires *share* holes at first and then makes contested holes more expensive, round after round, until the wires that have alternatives step aside. This also tells the rest of the engine how close a placement is to working, not just "works / doesn't work".

→ [How wires find their way](03-how-wires-negotiate.md)

### 3. Fix the board size, then shrink it

Instead of juggling board size, wire length and connectivity all at once, boardroute asks a simpler question: *does everything fit on a board of exactly this size?* It shuffles parts until the answer is yes. Then it removes a row or column and asks again. The last size that worked is your layout.

→ [Making the board small](04-shrinking-the-board.md)

## What you see in the app

1. **Load** reads your circuit description and puts the parts on the board.
2. **Wire** rearranges the parts until every connection is wired, and stops there. Usually that takes a second or two. The result works, but it isn't small yet.
3. **Compact** shrinks the board, starting from what's on screen. The board updates whenever a smaller layout is found, and the panel at the bottom shows the current best size and wire length. The search stops by itself once it stops making progress (small circuits within seconds, large ones in up to a minute). **Apply Current Best** stops it early. Press Compact again for more search time, or after you moved parts by hand to let the engine tidy up around your choice.

If the circuit can't be built on one layer, or the wires simply don't fit between closely spaced pins, boardroute adds jumper wires and a blue notice says how many and why. Jumpers are drawn as arcs over the wiring. If even that fails, a yellow notice explains the most likely reason.

The search runs in a background thread in your browser. Nothing is uploaded, and the page stays responsive while it works.

## An example

Here is a classic 555 LED blinker: the timer chip, three resistors, three capacitors, an LED and a power header. Nine parts, seven nets. boardroute's best layout uses 8 × 7 = 56 holes:

<!-- board: blinker555 | The 555 blinker on 8 × 7 = 56 holes. Each colour is one net; pins are circles, wires run between them on the solder side. -->
```
B b b b B f f F
g g g G B F A f
g C A a a a a f
G C F f f f f f
G C C C F E G g
G C D D · e E g
g g g g g g g g
```

In the text version each letter is a net (G = VCC, C = GND, F = threshold, B = discharge, and so on): capital letters are pins, small letters are wire, `·` is a part body without a pin. Notice how many pins sit directly next to a pin of the same net. Those connections need no wire at all, and the search actively looks for them.

The previous version of the engine never managed to wire this circuit completely.

→ [How we measure progress](05-measuring-progress.md) · [FAQ](06-faq.md)
