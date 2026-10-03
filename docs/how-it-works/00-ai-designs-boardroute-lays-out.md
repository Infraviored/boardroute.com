# Your AI designs the circuit, boardroute lays it out

**In short**

- AI assistants like ChatGPT, Claude or Gemini know thousands of parts and how to wire them into a working circuit. What they can't do is arrange those parts on a perfboard.
- boardroute is that missing half. Your AI writes the circuit description; boardroute places the parts, routes every wire without crossings, and shrinks the board.
- No account, no upload: it runs in your browser.

---

## The half your AI already does well

Ask an AI assistant for "an ESP32 that switches a 12 V door strike" and it will suggest a logic-level MOSFET, a gate resistor, a pull-down and a flyback diode, and it will tell you which pin goes where. It knows the pinout of the ESP32-C3 SuperMini, the spacing of a DIP-8 socket and why the diode has to sit across the coil. That's the hard knowledge, and it has become free.

## The half it can't

Turning that list into a board you can solder is a different kind of problem. Every part needs a position and an orientation, every connection needs a path through the holes, and no two paths may cross, because a single-sided perfboard is flat. Then the whole thing should be small. That is a search over millions of arrangements, not a question with a written answer, and language models are bad at it: ask one to draw a perfboard layout and you get crossing wires, parts on top of each other, or a board three times larger than it needs to be.

That search is what boardroute does.

## How the two halves fit together

1. **Describe your circuit to your AI.** In the app, *How do I obtain this?* gives you a ready-made prompt. Paste it into your assistant together with what you want to build. The AI answers with a short JSON description: each part, the position of its pins, and which pins are connected.
2. **Paste the JSON into boardroute and press Load.** The parts appear on the board, not yet connected.
3. **Press Wire.** boardroute rearranges the parts until every connection is wired. Usually that takes a second or two.
4. **Press Compact.** boardroute keeps rearranging and shrinking until it stops finding a smaller board. You watch it work, the panel at the bottom shows the best result so far.
5. **Solder it.** The top view shows where each part goes, the bottom view where the wires run. If the circuit can't be built on one layer at all, boardroute says so, names the parts responsible, and adds as few jumper wires as possible.

Not sure yet? The app opens with a choice of example circuits, from a six-part relay driver to a 23-part MOSFET bank.

## Why not let the AI do everything?

Because the two jobs need different tools. Choosing parts and connections is knowledge, and AI is excellent at knowledge. Arranging parts is optimisation: try an arrangement, measure it, change it, millions of times, and keep only what is provably valid. A layout boardroute reports as wired obeys the rules of the board by construction: no wire runs through a foreign pin, no two wires cross, no two parts overlap. That is exactly where AI drawings tend to go wrong.

→ [From circuit to perfboard: how the search works](01-perfboard-layout-explained.md) · [FAQ](06-faq.md)
