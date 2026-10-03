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

The search found no layout where every wire fits, even with jumper wires. This is rare. Try Layout again (the search is randomised), or give parts with many pins more room, for example a wider DIP socket.

### Can wires run under parts?

Yes, by default. On a perfboard the wiring is on the solder side, so a part body is no obstacle, only its legs are. If a part can't be routed under, add `"routeUnder": false` to it in the circuit description, and its whole outline will be kept clear.

### Why do I get a different layout each time I press Layout?

The search is randomised. Each run explores differently and can end at a different, equally good or slightly larger, layout. If you want to try for a smaller board, press **Refine** to keep searching from the current result, or press **Layout** again for a fresh attempt.

### How long does a layout take?

Usually a few seconds for small circuits and up to a minute for large ones. The search stops by itself when it stops finding smaller layouts. You can stop it at any time with **Apply Current Best**.

### Is the result optimal?

Not guaranteed. Finding the provably smallest layout is far too expensive for circuits of real size. In our benchmark, a typical run ends within a few percent of the best layout ever found for that circuit. → [How we measure progress](05-measuring-progress.md)

### Can I move parts by hand?

Yes. Drag a part, rotate it, and then press **Refine**. The search starts from your arrangement, repairs any wires your change broke, and tries to shrink around it.

### Does my circuit leave my computer?

No. boardroute runs entirely in your browser. The layout search runs in a background thread on your own machine, and nothing is uploaded.

### Does it work for stripboard (Veroboard)?

Not yet. Stripboard has copper strips that connect whole rows of holes, which turns layout into a different puzzle. boardroute currently models perfboard: separate pads, connected only where you put wire or solder.

### Why does boardroute prefer long straight wires?

Every bend costs the router a little extra, so among equally short paths it picks the one with the fewest bends. Straight runs are easier to build with bare wire and easier to check against the screen.

### What's the difference between Layout and Refine?

**Layout** starts from scratch: a fresh rough placement, then the full search. **Refine** starts from what's on the board now, including any changes you made by hand.
