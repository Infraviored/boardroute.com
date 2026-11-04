# Links from AI assistants

**In short**

- An AI assistant can answer "lay this out on perfboard" with a link. Click it, and boardroute opens the circuit, wires it and shrinks the board, with no copying and pasting.
- The link carries the circuit in the part after `#`, so it never reaches a server. Nothing is stored until you save it yourself.
- Instructions for AI assistants are at [boardroute.com/llms.txt](https://boardroute.com/llms.txt). Assistants that can read web pages pick it up from there; for the others, paste the prompt below.

---

## What the link looks like

```
https://boardroute.com/#circuit=<circuit description, URL-encoded>
```

The circuit description is the same short JSON that *Get it from your AI* asks for: each part by name ("resistor, 220", "LED, red", "Wemos D1 Mini") and which pins are wired together, as short lists like `["U1.D5", "R1.1"]`. No footprints and no positions: boardroute takes the footprints from its library of about 1,150 through-hole parts and places everything itself.

This example puts a red LED with a 220 Ω resistor on pin D5 of a Wemos D1 Mini:

```json
{"parts":{"U1":"Wemos D1 Mini","R1":"resistor, 220","D1":"LED, red"},
 "connections":[["U1.D5","R1.1"],["R1.2","D1.A"],["D1.K","U1.GND"]]}
```

[Open it in boardroute](https://boardroute.com/#circuit=%7B%22parts%22%3A%7B%22U1%22%3A%22Wemos%20D1%20Mini%22%2C%22R1%22%3A%22resistor%2C%20220%22%2C%22D1%22%3A%22LED%2C%20red%22%7D%2C%22connections%22%3A%5B%5B%22U1.D5%22%2C%22R1.1%22%5D%2C%5B%22R1.2%22%2C%22D1.A%22%5D%2C%5B%22D1.K%22%2C%22U1.GND%22%5D%5D%7D)

## What happens when you click it

1. boardroute loads the parts. Your previous board stays one *Undo* away.
2. It runs **Wire** until every connection is routed, then **Compact** until it stops finding a smaller board.
3. The circuit description is in the editor (*Circuit → Edit JSON*), so you can change a part and run it again.
4. A part boardroute doesn't know never stops the circuit: it becomes a pin header with the pins the AI named, and a note asks you to check it.

## Asking your assistant for a link

Assistants that browse may find [llms.txt](https://boardroute.com/llms.txt) on their own. To be sure, add this line to your request:

```
Describe the circuit in the JSON format of https://boardroute.com/llms.txt and give me the boardroute link.
```

If the assistant can't open web pages, use *Get it from your AI* in the app: it gives you the full prompt, and you paste the JSON answer into boardroute yourself. Very long links can get cut off in some chat apps; the JSON in the answer is the fallback.

→ [Your AI designs the circuit, boardroute lays it out](00-ai-designs-boardroute-lays-out.md) · [FAQ](06-faq.md)
