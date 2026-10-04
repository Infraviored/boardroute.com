# Making the board small: the packing search

**In short**

- boardroute doesn't minimise area directly. It fixes a board size, searches until everything fits, then removes a row or column and searches again.
- The search is simulated annealing: try a small change, keep it if it helps, sometimes keep it even if it hurts, and become pickier over time.
- The most useful change is surprisingly simple: put a pin right next to another pin of the same net. A connection between neighbouring holes needs no wire at all.

---

## Why not just "make it smaller"?

The obvious approach is to score every layout by its area and keep nudging parts to lower the score. The old engine did this with a dozen specialised passes: push parts toward the centre, pull them along their wires, rotate them, slide blockers out of the way, and so on.

The trouble is that area is a bad compass. Most small moves don't change the board's outline at all, so the score stays flat while the layout gets better or worse inside. And when a move does shrink the outline, it often breaks a wire, which drops the layout back to "not fully routed". The search spends its time on a plateau with no slope to follow.

## A better question: does it fit?

boardroute turns the problem around. It fixes the board to a size, say 12 × 10 holes, and asks only: *is there any arrangement where every part fits and every wire can be routed inside this rectangle?*

That question has a good compass. A layout that doesn't fit yet can be scored by *how badly* it doesn't fit:

| Problem | Weight |
|---|---|
| A pin that can't be reached at all | high |
| Two parts overlapping (per overlapping hole) | high |
| A hole two nets still fight over (from the [router](03-how-wires-negotiate.md)) | medium |
| Total wire length | tiny, only breaks ties |

Zero problems means it fits. Every step toward zero is visible, even when the outline doesn't move.

## The search: shake and settle

To drive the problem count to zero, boardroute uses **simulated annealing**, a method named after the way metal is slowly cooled to let its crystals settle. In each step it:

1. picks a part (preferably one involved in a problem) and changes it a little,
2. routes the board again (or rather, [repairs](03-how-wires-negotiate.md#repair-instead-of-starting-over) the wiring),
3. keeps the change if the problem score went down, and
4. sometimes keeps it even if the score went *up*.

Point 4 is the key. A search that only ever accepts improvements walks into the nearest dead end and stays there. Accepting some setbacks lets it climb out of a dead end and find a better valley behind it. Early on the search is generous about setbacks ("hot"). Over time it becomes strict ("cold") and settles into a solution.

### The moves

| Move | What it does |
|---|---|
| **Smart jump** | Picks one of the part's nets and moves the part so that one of its pins lands right next to another pin of that net. Rotation is sometimes changed too. |
| Shift | Moves the part one or two holes. |
| Rotate | Turns the part by 90°, 180° or 270°. |
| Swap | Exchanges the positions of two parts. |
| Jump | Moves the part to a random spot. |

The smart jump came out of the benchmark. Adding it improved the results on every test board, and the more often it was used, the better, up to the point where it makes up more than a third of all moves. It works because neighbouring pins of the same net are the cheapest connection there is: no wire, no space used, nothing to cross.

We also tried "push" moves that shove neighbouring parts along like a row of books. They made results worse, so they're off.

### A shortcut: roll the dice first

Each step normally needs a routing pass, which is the expensive part. But many proposed moves make two parts overlap, and overlap is cheap to detect. boardroute draws its "accept a setback?" random number *before* routing. If the overlap alone already makes the move worse than the random threshold allows, the move is rejected without routing it. The outcome is exactly the same as routing first. It just skips work whose result is already known. That gives 20 to 35 % more moves per second.

## Shrinking

The full search goes like this:

1. **Rough placement.** Parts are spread over a generous square and pulled together by a quick wire-length estimate, keeping a one-hole gap around each part. This takes milliseconds and gives the real search a sensible start.
2. **Find a first fit** in that generous box.
3. **Crop** the box to the parts and wires actually used. That's often a free reduction.
4. **Remove a row or column.** boardroute tries several candidate lines and starts from the one whose removal causes the fewest problems. Parts beyond the line slide over by one hole.
5. **Search until it fits again.** If it does, record the new best layout and go back to step 3.
6. **If it gets stuck**, try the other direction, then give the search more time, and after repeated failures **restart** from a fresh rough placement aimed near the best size found so far. A fresh start often finds an arrangement the old one could never reach.

The app's **Wire** step stops at the first layout where every net is connected. **Compact** keeps going: every time a smaller layout is found, the app shows it. The search stops on its own when it hasn't improved for a while. How long it waits grows with the circuit: about 1.2 seconds per part, at least 3 and at most 15 seconds, and never less than half the time it took to find the last improvement. Large boards keep improving for longer, so they get more patience. We tuned these numbers by replaying the benchmark runs: the search now stops after about 19 seconds on average, small circuits after a few seconds, and the boards are nearly as small as after a full minute.

## Knowing when to stop

Before searching, boardroute computes the smallest area any layout could possibly have. Wires are left out of this calculation, because they can run under parts; what remains is a packing puzzle: the part bodies may not overlap, so every board must have room for all of them side by side, each part turned one way or the other. boardroute tries boxes in order of size. Most fail a quick test (too little area, or some part doesn't fit); the rest go to an exact search that tries every way of packing the parts into that box, with shortcuts that discard a partial packing as soon as more holes would have to stay empty than the box can spare. The first box that has a packing gives the bound. For a circuit that needs a crossing, one jumper wire is packed too, since it needs a straight run of three holes with no part on them.

The packing is what makes this stronger than adding up the part areas. In the L293D motor driver, the part bodies cover 202 holes and a 12×17 box (204 holes) would hold that much area on paper, but the search shows that no box below 216 holes has room for all of them: the 9×14 module leaves strips too narrow for the rest. The search has a fixed effort budget (well under a tenth of a second); if it runs out before deciding a box, the bound stays at that box, which is still safe because every smaller box has been ruled out.

If the search reaches this bound (with no jumper wires, or exactly one for a circuit that needs a crossing), the layout is provably perfect and the search stops at once. The app marks it as **Perfect**. Because the wires are ignored, the bound is only reachable by boards where the parts pack tightly and the wiring fits underneath them; for wire-heavy circuits the real minimum is often well above it, and boardroute can't prove where.

## Starting from your layout

**Compact** (the app's third step) runs this search starting from the current board instead of a rough placement: the parts keep their positions and rotations, the box is set to fit them with one hole to spare, and shrinking continues from there. If you moved a part by hand, the engine first repairs whatever your move broke, then tries to shrink around it. If your arrangement can't be repaired, it falls back to a fresh start.

→ Next: [How we measure progress](05-measuring-progress.md)
