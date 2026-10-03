# Frequently asked questions

### What does boardroute actually do?

You describe your circuit: the parts, the position of each part's pins, and which pins are connected (the nets). boardroute places the parts on a perfboard grid, routes every connection as a wire that doesn't cross any other, and keeps shrinking the board until it can't find a smaller layout. → [Overview](01-perfboard-layout-explained.md)

### Why does it say my circuit "cannot be built on one layer"?

Because some wires would have to cross wherever the parts are placed. boardroute proves this with a planarity check before it starts searching, and names the parts and nets that form the conflict. The usual fix is a jumper wire. → [Can your circuit be built on one layer?](02-can-it-be-routed.md)

### How do I add a jumper wire?

Split one of the nets named in the notice into two names (for example `VCC` and `VCC_2`), move some of its pins to the new name, and add a two-pin part with a few holes between its legs whose pins sit on `VCC` and `VCC_2`. boardroute places the jumper like a resistor. Wires can pass under it, which is exactly what a jumper on the component side does.

### It says "no fully routed layout found", but not that it's impossible. Why?

The circuit passed the topology check, so it isn't ruled out mathematically. But the search didn't find a layout where every wire fits. The most common reason is room: a DIP chip has only two free holes between its pin rows, and some circuits need more wires between the rows than fit. Try Layout again (the search is randomised), or add a jumper wire.

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
