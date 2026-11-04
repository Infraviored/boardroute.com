import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { ModalShell, Button } from './ui';
import { MOBILE_MQ } from '../mobile.js';

export function PromptOverlay({ isOpen, onClose }) {
  const [copied, setCopied] = useState(false);

  const promptText = `You turn a circuit description into JSON for boardroute, a perfboard layout tool. Answer with ONLY the JSON.

EXAMPLE
{
  "parts": {
    "U1": "Wemos D1 Mini",
    "R1": "resistor, 220",
    "D1": "LED, red",
    "Q1": "TO-220, IRLZ44N",
    "J1": "screw terminal 2, 12V in",
    "U2": "MP1584 buck module (IN+, IN-, OUT+, OUT-)"
  },
  "connections": [
    ["U1.D5", "R1.1"],
    ["R1.2", "D1.A"],
    ["J1.1", "U2.IN+"],
    ["U2.OUT+", "U1.5V"],
    ["U1.GND", "D1.K", "Q1.3", "J1.2", "U2.IN-", "U2.OUT-"]
  ]
}

PARTS: "ID": "part name, value". The value (220, 10k, 100nF, red, IRLZ44N) is optional.
CONNECTIONS: each list is a group of pins that are wired together. A pin is ID.PIN.
PIN: the name printed on the part (D5, GND, 3V3) or the pin number (1, 2, 3).
No coordinates or sizes: boardroute knows the footprints and places everything itself.

PART NAMES
- resistor (pins 1, 2), capacitor (1, 2), electrolytic capacitor (+, -), crystal (1, 2), push button (1, 2)
- LED and diode: pins A and K (K = cathode: short leg, the side with the ring)
- TO-92 and TO-220 (transistors, MOSFETs, regulators): pins 1, 2, 3 in datasheet order (BC547: 1=C 2=B 3=E; IRLZ44N: 1=G 2=D 3=S; 7805: 1=IN 2=GND 3=OUT)
- potentiometer (1, 2 = wiper, 3), buzzer (+, -)
- pin header N, e.g. "pin header 4" (pins 1..N); "pin header 2x3" for two rows
- screw terminal N (pins 1..N): use it for every cable that leaves the board
- DIP-N for a bare chip, e.g. "DIP-8, NE555" (pins 1..N in datasheet order)
- Modules, with the pin names printed on them: Wemos D1 Mini, ESP32 DevKit V1, ESP32-C3 SuperMini, ESP32-S2 Mini, Arduino Nano, DHT11, Relay SRD-05VDC (COM, NO, NC, A1, A2), LCD 16x2
- Any other module (sensor board, converter, display): its name, then its pins in order in brackets, as U2 above. Give each pin a different name.
- More parts and their pin names: https://boardroute.com/parts.txt

CHECK: every ID in "connections" is in "parts"; every pin of a resistor, capacitor, LED and diode is connected; every powered part has GND and its supply.

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
