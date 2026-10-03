# How wires find their way: the negotiating router

**In short**

- Each wire is found with a shortest-path search across the grid of holes, similar to how a navigation app finds a route through a city.
- Instead of laying wires one by one and hoping the early ones don't block the late ones, all nets **negotiate**: holes that several nets want become more expensive every round until the conflict dissolves.
- When a part moves, only the broken branches of its wires are re-routed. That makes each step fast enough to try thousands of placements per second.

---

## One wire: a navigation search

Connecting two pins is a shortest-path problem on a grid. boardroute uses A* (pronounced "A-star"), the same family of algorithms that finds routes in navigation apps and paths for characters in video games. It explores holes outward from the start, always preferring holes that are both close to the start and, judging by straight-line distance, close to the goal. It never steps into a hole that holds another net's pin.

Each step costs one unit, and each turn costs a little extra. That small turn penalty is why boardroute's wires prefer long straight runs with few bends, which are easier to build with bare wire.

## Many pins: growing a tree

A net with five pins doesn't need four separate wires from one pin to each other pin. It needs a *tree*: a branching shape that touches every pin. boardroute grows it one branch at a time. It starts at one pin, finds the nearest unconnected pin, and from then on treats the whole existing tree as the starting point. The next branch can leave the tree from any hole along it. That is how a ground net ends up as one long spine with short stubs to each pin, rather than a star of separate wires.

## The problem with first come, first served

The simplest way to route a whole board is to take the nets in some order and route each one as well as possible. It works on easy boards and fails in a frustrating way on dense ones: the first net takes the most direct path, straight through the only gap the fifth net could have used. Change the order and a different net gets stuck. With ten nets there are millions of orders, and no good way to know which one works.

The old engine routed this way, with each wire treating the earlier ones as solid walls.

## Negotiation

boardroute's router borrows an idea from chip design. PathFinder, an algorithm published by McMurchie and Ebeling in 1995 for programmable logic chips, routes everything at once and lets wires **share** holes at first, for a price:

1. **Round one:** every net takes its best path. Sharing a hole with another net costs a small penalty, so nets share only if the detour would be long.
2. **After each round:** every hole that is still shared gets more expensive. The *present* cost rises for everyone, and the hole also gets a *history* cost that sticks, a memory that this spot is contested.
3. **Next round:** only the nets involved in a conflict re-route. A net that has a cheap way around now takes it. A net that really needs the hole keeps it, because for it the detour is even more expensive.

After a few rounds the conflicts usually dissolve. It works like congestion pricing on roads: drivers with good alternatives switch routes, and the ones who really need the bridge keep it.

## A measure, not just a verdict

The negotiation has a second benefit that matters more than its routing quality. When a placement can't be routed, the router doesn't just say "failed". It reports *how many holes are still contested* and how many pins can't be reached at all. One contested hole is nearly there. Twenty is far off.

That number is what guides the placement search ([next article](04-shrinking-the-board.md)). A search that only hears "works / doesn't work" is blind on a dense board, because almost everything fails. A search that hears "three conflicts … two … one … zero" can follow the signal.

## Repair instead of starting over

The placement search moves one part at a time, thousands of times. Re-routing the whole board after each move would be wasteful: moving one resistor doesn't change most of the wiring.

So when a part moves, boardroute keeps every wire branch that is still valid: it doesn't pass through a pin that is now in the way, and it still ends on a pin of its own net. It throws away only the broken branches and regrows them from what's left. For a large ground net that touches a dozen parts, that means one short new branch instead of a whole new tree. In our measurements this repair was the single biggest speed-up in the engine.

Repairs can leave odd shapes behind, like a dangling stub that used to lead to a pin that has since moved, or two branches of the same net forming a loop. The router trims dangling ends as it goes and rebuilds every net as a clean tree before a layout is shown to you.

→ Next: [Making the board small](04-shrinking-the-board.md)
