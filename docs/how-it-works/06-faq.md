# Frequently asked questions

### What does boardroute actually do?

You describe your circuit: the parts, the position of each part's pins, and which pins are connected (the nets). boardroute places the parts on a perfboard grid, routes every connection as a wire that doesn't cross any other, and keeps shrinking the board until it can't find a smaller layout. → [Overview](01-perfboard-layout-explained.md)

### Why does it say my circuit "cannot be built on one layer"?

Because some wires would have to cross wherever the parts are placed. boardroute proves this with a planarity check before it starts searching, and names the parts and nets that form the conflict. It then adds jumper wires itself, as few as it can. → [Can your circuit be built on one layer?](02-can-it-be-routed.md)

### What are the arcs on my board?

Jumper wires: short pieces of insulated wire on the component side that bridge over the wiring underneath. boardroute adds them only when a circuit can't be built without crossings, or when no layout without them turned up within ten seconds. Solder each one into its two holes and bend it over the wires it crosses.

### Can I avoid jumpers?

Often, by changing one footprint: a capacitor with 5 mm lead spacing instead of 2.54 mm lets wires pass between its legs, which can break the pattern that forces a crossing. The notice names the parts involved.

### It says "no fully routed layout found". Why?

The search found no layout where every wire fits, even with jumper wires. This is rare. Try Wire again (the search is randomised), or give parts with many pins more room, for example a wider DIP socket.

### Can wires run under parts?

Yes, by default. On a perfboard the wiring is on the solder side, so a part body is no obstacle, only its legs are. If a part can't be routed under, add `"routeUnder": false` to it in the circuit description, and its whole outline will be kept clear.

### Why do I get a different layout each time I press Wire?

The search is randomised. Each run explores differently and can end at a different, equally good or slightly larger, layout. If you want to try for a smaller board, press **Compact** to keep searching from the current result, or **Wire** and then **Compact** for a fresh attempt.

### How long does a layout take?

Usually a few seconds for small circuits and up to a minute for large ones. The search stops by itself when it stops finding smaller layouts. You can stop it at any time with **Apply Current Best**.

### Is the result optimal?

Sometimes provably, often not. boardroute knows a hard lower bound: the part bodies can't overlap, so the board must have room to pack all of them, each turned one way or the other. An exact packing search finds the smallest box where that is possible (a circuit that needs a crossing also gets room for one jumper wire). When a layout reaches that bound, the result card says **Perfect** and the search stops, because nothing smaller exists. That happens with boards dominated by big parts, like a relay driver. Otherwise the card shows the bound next to the result. The bound ignores the wires, so for wire-heavy circuits the true minimum can be well above it: for the 555 blinker the bound is 40 holes, the best layout we know uses 56, and nobody knows the real minimum. Finding the provably smallest layout in general is far too expensive for circuits of real size; in our benchmark a typical run ends within a few percent of the best layout ever found for that circuit. → [How we measure progress](05-measuring-progress.md)

### Can I move parts by hand?

Yes. Drag a part, rotate it, and then press **Compact**. The search starts from your arrangement, repairs any wires your change broke, and tries to shrink around it.

### Where do the parts in the Library come from?

A short curated list (ESP32 boards, common chips, relays, terminals) sits on top. Below it are about 1,100 through-hole footprints generated from the official [KiCad footprint libraries](https://gitlab.com/kicad/libraries/kicad-footprints): DIP and SIP chips, TO-220 and TO-92 packages, resistors, capacitors, headers, sockets, relays, terminal blocks, buttons, DC/DC modules and dev boards like the Arduino Nano or Raspberry Pi Pico. Only footprints whose pins all land on the 2.54 mm perfboard grid are included, so a part with 3.5 mm or 2.0 mm pin spacing is missing on purpose. Where the KiCad drawing shows a body larger than the pins (a relay housing, a capacitor can, a standing TO-220), the part blocks those holes too. The KiCad libraries are licensed under CC-BY-SA 4.0 with an exception that leaves your own designs unaffected; thanks to the KiCad library team for them.

### Does my circuit leave my computer?

No. boardroute runs entirely in your browser. The layout search runs in a background thread on your own machine, and nothing is uploaded.

### Does it work for stripboard (Veroboard)?

Not yet. Stripboard has copper strips that connect whole rows of holes, which turns layout into a different puzzle. boardroute currently models perfboard: separate pads, connected only where you put wire or solder.

### Why does boardroute prefer long straight wires?

Every bend costs the router a little extra, so among equally short paths it picks the one with the fewest bends. Straight runs are easier to build with bare wire and easier to check against the screen.

### What's the difference between Wire and Compact?

**Wire** starts from scratch: a fresh placement, rearranged only until every connection is wired. **Compact** shrinks the board starting from what's on it now, including any changes you made by hand.
