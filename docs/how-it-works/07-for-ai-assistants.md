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

The circuit description is the same short JSON that *Get it from your AI* asks for: each part by name ("resistor", "LED", "Wemos D1 Mini") and which pins are connected. No footprints and no positions: boardroute takes the footprints from its library of about 1,150 through-hole parts and places everything itself.

This example puts a red LED with a 220 Ω resistor on pin D5 of a Wemos D1 Mini:

```json
{"parts":[{"id":"U1","part":"Wemos D1 Mini"},{"id":"R1","part":"resistor","value":"220"},{"id":"D1","part":"LED","value":"red"}],
 "nets":{"LED":["U1.D5","R1.1"],"LED_A":["R1.2","D1.A"],"GND":["U1.GND","D1.K"]}}
```

[Open it in boardroute](https://boardroute.com/#circuit=%7B%22parts%22%3A%5B%7B%22id%22%3A%22U1%22%2C%22part%22%3A%22Wemos%20D1%20Mini%22%7D%2C%7B%22id%22%3A%22R1%22%2C%22part%22%3A%22resistor%22%2C%22value%22%3A%22220%22%7D%2C%7B%22id%22%3A%22D1%22%2C%22part%22%3A%22LED%22%2C%22value%22%3A%22red%22%7D%5D%2C%22nets%22%3A%7B%22LED%22%3A%5B%22U1.D5%22%2C%22R1.1%22%5D%2C%22LED_A%22%3A%5B%22R1.2%22%2C%22D1.A%22%5D%2C%22GND%22%3A%5B%22U1.GND%22%2C%22D1.K%22%5D%7D%7D)

## What happens when you click it

1. boardroute loads the parts. Your previous board stays one *Undo* away.
2. It runs **Wire** until every connection is routed, then **Compact** until it stops finding a smaller board.
3. The circuit description is in the editor (*Circuit → Edit JSON*), so you can change a part and run it again.
4. If a part or pin name is unknown, a message names each problem instead of guessing.

## Asking your assistant for a link

Assistants that browse may find [llms.txt](https://boardroute.com/llms.txt) on their own. To be sure, add this line to your request:

```
Describe the circuit in the JSON format of https://boardroute.com/llms.txt and give me the boardroute link.
```

If the assistant can't open web pages, use *Get it from your AI* in the app: it gives you the full prompt, and you paste the JSON answer into boardroute yourself. Very long links can get cut off in some chat apps; the JSON in the answer is the fallback.

→ [Your AI designs the circuit, boardroute lays it out](00-ai-designs-boardroute-lays-out.md) · [FAQ](06-faq.md)
