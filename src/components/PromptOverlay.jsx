import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { ModalShell, Button } from './ui';
import { MOBILE_MQ } from '../mobile.js';

export function PromptOverlay({ isOpen, onClose }) {
  const [copied, setCopied] = useState(false);

  const promptText = `You turn a circuit description into JSON for a perfboard layout tool. Answer with ONLY the JSON, no text before or after it.

FORMAT (a complete example)
{
  "parts": [
    { "id": "U1", "part": "Wemos D1 Mini", "value": "ESP8266" },
    { "id": "R1", "part": "resistor", "value": "220" },
    { "id": "D1", "part": "LED", "value": "red" },
    { "id": "Q1", "part": "TO-220", "value": "IRLZ44N" },
    { "id": "J1", "part": "screw terminal 2", "value": "12V in" }
  ],
  "nets": {
    "GND": ["U1.GND", "D1.K", "Q1.3", "J1.2"],
    "PWM": ["U1.D5", "R1.1"],
    "LED_A": ["R1.2", "D1.A"]
  }
}

RULES
1. "parts": every physical part once. "id" is short and unique: R1, R2, C1, D1, Q1, U1, J1. "part" is what it is (use the list below). "value" is the type or value: 220, 10k, 100nF, 1N4007, IRLZ44N.
2. "nets": each net has a name and the list of pins connected to it. A pin is written PART_ID.PIN, for example "U1.D5" or "R1.2".
3. PIN is the name printed on the part (D5, GND, 3V3, VIN) or the pin number (1, 2, 3).
4. A pin belongs to at most one net. Leave unused pins out.
5. Do NOT give coordinates, sizes or positions. The tool knows every footprint and places the parts itself.

PART NAMES THAT ALWAYS WORK
- resistor: pins 1, 2
- capacitor (ceramic or film): pins 1, 2
- electrolytic capacitor: pins + and -
- LED: pins A (anode, long leg) and K (cathode)
- diode: pins A and K (K = the side with the ring)
- TO-92 (small transistor): pins 1, 2, 3 in datasheet order, e.g. BC547: 1 = C, 2 = B, 3 = E
- TO-220 (MOSFET, power transistor, voltage regulator): pins 1, 2, 3 in datasheet order, e.g. IRLZ44N: 1 = G, 2 = D, 3 = S; 7805: 1 = IN, 2 = GND, 3 = OUT
- push button: pins 1, 2
- potentiometer: pins 1, 2 (wiper), 3
- crystal: pins 1, 2
- buzzer: pins + and -
- pin header N, e.g. "pin header 4": pins 1 to N ("pin header 2x5" for two rows)
- screw terminal N, e.g. "screw terminal 2": pins 1 to N. Use it for every cable that leaves the board (power input, motor, LED strip, speaker, sensor on a cable).
- DIP-N for chips without a module, e.g. "DIP-8" for an NE555: pins 1 to N in datasheet order
- Modules (use the pin names printed on the board): Wemos D1 Mini, ESP32 DevKit V1, ESP32-C3 SuperMini, ESP32-S2 Mini, Arduino Nano, NE555 Timer, LM358 Op-Amp, L293D Motor Driver, LCD 16x2, DHT11, Relay SRD-05VDC (pins COM, NO, NC, A1, A2)
Other names are looked up in a large KiCad footprint library, e.g. "DIP-14" or "BarrelJack".

A MODULE THAT IS NOT IN THE LIST (e.g. a small buck converter board)
Use "pin header N" with N = its number of pins, and give its pin names in order:
{ "id": "U2", "part": "pin header 4", "value": "Mini560 5V", "labels": ["IN+", "IN-", "OUT+", "OUT-"] }
Then use those names in the nets: "U2.OUT+".

CHECK BEFORE ANSWERING
- every part id used in "nets" exists in "parts"
- every pin name exists on that part
- no pin appears in two nets
- both pins of every resistor, capacitor, diode and LED are in a net (a resistor in series needs a net on each side)
- every part that needs power is connected to GND and its supply

CIRCUIT: [DESCRIBE YOUR CIRCUIT HERE]`;

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(promptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="600px"
      ariaLabel="AI prompt guide"
      className="prompt-modal-shell"
    >
      <ModalShell.Header
        title="AI prompt guide"
        onClose={onClose}
      />

      <ModalShell.Body className="prompt-modal-body">
        <p className="prompt-intro-text">
          Your AI only has to name the parts and say which pins connect: the footprints come from the library, and boardroute places everything itself.
          Any chatbot can do it, also a small or free one.
        </p>

        <div className="prompt-box-label">
          <span>Recommended prompt</span>
          <Button
            size="sm"
            variant={copied ? 'primary' : 'secondary'}
            icon={copied ? <Check size={13} /> : <Copy size={13} />}
            onClick={handleCopy}
            className="prompt-copy-btn"
          >
            {copied ? 'Copied to clipboard' : 'Copy prompt'}
          </Button>
        </div>

        <div className="prompt-scroll-container">
          <pre className="prompt-pre">{promptText}</pre>
        </div>

        <div className="prompt-hint-text">
          Simply copy the prompt above, paste it into your favorite AI, describe your circuit, and then paste the JSON it writes under Circuit → Paste JSON.
        </div>
      </ModalShell.Body>

      <ModalShell.Footer>
        <Button variant="accent" onClick={onClose}>
          Close
        </Button>
      </ModalShell.Footer>

      <style dangerouslySetInnerHTML={{
        __html: `
        .prompt-modal-body {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .prompt-intro-text {
          font-size: 0.9em;
          color: var(--txt1);
          line-height: 1.45;
          margin: 0;
        }
        .prompt-intro-text strong {
          color: var(--txt0);
        }
        .prompt-box-label { 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          font-size: var(--fs-xs); 
          font-weight: 700; 
          letter-spacing: 0.08em;
          text-transform: uppercase; 
          color: var(--txt1);
          margin-top: 6px;
        }
        .prompt-copy-btn {
          border-radius: var(--radius-md);
        }
        .prompt-scroll-container {
          background: #050505;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 12px;
          max-height: 250px;
          overflow-y: auto;
        }
        .prompt-pre {
          margin: 0;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          font-family: 'Consolas', monospace;
          font-size: 0.82em;
          color: var(--grn-bright);
          line-height: 1.5;
        }
        .prompt-hint-text {
          font-size: var(--fs-xs);
          color: var(--txt1);
          line-height: 1.4;
        }
        @media ${MOBILE_MQ} {
          .prompt-modal-shell {
            width: 100vw;
            max-width: 100vw;
            height: 100dvh;
            max-height: 100dvh;
            border-radius: 0;
          }
          .prompt-modal-body {
            flex: 1;
            min-height: 0;
          }
          .prompt-scroll-container {
            max-height: none;
            flex: 1;
          }
          .prompt-modal-shell .ui-modal-footer .ui-btn {
            width: 100%;
            min-height: 44px;
          }
        }
        `
      }} />
    </ModalShell>
  );
}
