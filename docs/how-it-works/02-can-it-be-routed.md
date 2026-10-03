# Can your circuit be built on one layer?

**In short**

- Some circuits cannot be wired on a single-sided perfboard, however you arrange the parts. This is a fact of geometry, not a weakness of the software.
- boardroute checks this before searching. If your circuit fails, it names the parts and nets that form the conflict.
- Simple rule of thumb: a part whose pins sit in neighbouring holes acts like a fixed link between its nets. A part with a free hole between its pins is invisible to the check, because wires can pass between its legs.

---

## The three-utilities puzzle

There is an old riddle: three houses each need a line to the water works, the gas works and the power station. Can you draw all nine lines without any two crossing? You can't, and mathematicians proved it long ago. The pattern of three-connected-to-three, called K3,3, simply can't be drawn flat. Neither can five points that are all connected to each other (K5). And in 1930 Kazimierz Kuratowski showed that these two patterns are the *only* reasons a network can't be drawn flat: every network that can't be drawn without crossings contains one of them, perhaps stretched out.

A single-sided perfboard is a flat drawing. So if your circuit contains one of these patterns, it can't be built without a jumper wire. The search can't change that. What matters is finding out which part of the circuit has the pattern.

## What blocks a wire on a perfboard

To turn a circuit into "a network that must be drawn flat", we need to know what a wire can and cannot get past.

- **A pin blocks the hole it sits in.** No wire of another net can pass through it.
- **Two pins in neighbouring holes form a wall.** There is no hole between them for a wire to pass through. A row of header pins, one side of a DIP chip, or a capacitor with 2.54 mm lead spacing are all walls.
- **Pins with a free hole between them are not a wall.** A resistor bent to 10 mm spacing has three holes between its legs. Wires can pass under it as if it weren't there.
- **A net can run through its own pins.** Two neighbouring pins of the same net are already connected; the copper goes straight from one to the next.
- **Part bodies don't block**, because the wiring is on the other side. A part that does block (for example something mounted flat with pads underneath) can be marked with `"routeUnder": false`, and then its whole outline counts as a wall.

## The check

boardroute builds a small network from your circuit:

1. Every **net** becomes a single dot. Think of shrinking all the copper of that net, wires and pins together, into one point.
2. Every **wall** stays what it is: a chain of holes. Where a wall contains a pin, the chain passes through that net's dot.

If your circuit can be built, then the finished board is a flat drawing of this network, because shrinking copper together never creates a crossing. So if the network **can't** be drawn flat, no placement and no board size will ever work. boardroute tests this with a planarity algorithm and, if the test fails, extracts the smallest offending piece (a stretched K5 or K3,3). The parts and nets in that piece are what you see in the red notice.

This check takes milliseconds, so it always runs before the search.

## Examples

**Ten capacitors, five nets.** Take five nets A to E and put a 2.54 mm ceramic capacitor between every pair. That's ten capacitors. Each one is a wall linking two nets, and the result is five dots all connected to each other: K5. Not buildable on one layer.

**The same with resistors.** Replace the capacitors with 10 mm resistors. Now wires can pass between every pair of legs, the parts are invisible to the check, and boardroute finds a layout of 40 holes.

**Nine capacitors, the utilities puzzle.** Nets A, B, C on one side, X, Y, Z on the other, a capacitor for every pair: K3,3, not buildable. Remove any one capacitor and it becomes buildable (20 holes).

**Three transistors in parallel.** Three TO-220 transistors with all gates, all drains and all sources connected looks exactly like the utilities puzzle: three walls (the transistors), three nets. But it *is* buildable. Stand the transistors side by side and each net runs straight across through its own pins:

```
S S S
D D D
G G G
```

This is why the check shrinks each net *together with its pins*: a net may pass through its own pins, and the check must allow that.

**The DIP chip that runs out of room.** An L293D motor driver next to a Wemos D1 mini passes the check, yet boardroute never found a layout in twenty minutes of searching. The reason is room, not topology: a standard DIP-16 has only two free holes between its pin rows, and this circuit needs to send more wires between the rows than fit. With the rows widened by one hole, a layout is found every time. The planarity check can't see this kind of capacity problem, so in that case you get the yellow notice instead of the red one.

## What to do when a circuit can't be built

- **Add a jumper wire.** A short insulated wire on the component side can hop over other wiring. In the circuit description, split one of the named nets into two (for example `GND` and `GND_B`, moving some of its pins to the new name) and add the jumper as a two-pin part with a few holes between its legs, one leg on `GND` and one on `GND_B`. boardroute places it like any other part, and wires can pass under it.
- **Change a footprint.** Bending a capacitor's legs to 5 mm, or using a resistor instead of a wire link, turns a wall into a part wires can pass. Often one changed part is enough to break the pattern.
- **Check DIP chips with many signals.** If several nets have to reach pins on both sides of a chip, there may not be enough room between the rows. A jumper over the chip usually solves it.

## Rules of thumb

| Situation | Effect on the check |
|---|---|
| Two-pin part, pins in neighbouring holes (ceramic cap, LED, 2-pin header) | Acts as a fixed link between its two nets |
| Two-pin part with at least one free hole between the pins (most resistors, diodes) | Invisible: wires pass between the legs |
| Pin header, DIP side, transistor in a row | A wall: a chain of linked nets in pin order |
| Same net on neighbouring pins | Free connection, no wire needed |
| Part marked `"routeUnder": false` | Its whole outline is a wall |

→ Next: [How wires find their way](03-how-wires-negotiate.md)
