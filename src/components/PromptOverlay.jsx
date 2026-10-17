import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { ModalShell, Button } from './ui';

export function PromptOverlay({ isOpen, onClose }) {
  const [copied, setCopied] = useState(false);

  const promptText = `Act as an expert Electronic Design Automation (EDA) engineer. I need you to generate a circuit specification in a specific JSON format for my custom autorouting tool.

### CONCEPTUAL ARCHITECTURE
The system operates on a unit-grid (holes on a board). Your task is to define components by their physical pin layout and then "wire" them together using Net names.

### 1. COMPONENT GEOMETRY (The "Offset" System)
Every component is a collection of pins. You must define the position of every pin relative to the component's top-left corner (0,0).
- RESISTORS/DIODES: Usually two pins. For a resistor spanning 3 holes horizontally, use offsets [0,0] and [2,0].
- INTEGRATED CIRCUITS (DIP): If it has two rows of pins 3 holes apart, Row 1 pins are at [0,0], [0,1], [0,2]... and Row 2 pins are at [3,0], [3,1], [3,2]...
- MODULES (ESP32/Arduino): You must map the exact physical pinout. If the module is 7 holes wide, the left pins are at x=0 and right pins are at x=6.
- BODIES (optional): if the part's housing is larger than its pin area (relay, electrolytic capacitor, screw terminal, standing TO-220, a dev board whose PCB extends past its pin rows), add "body": { "offset": [x,y], "size": [w,h] }: the rectangle of holes the housing covers, in the same coordinates as the pin offsets (it may start at negative values). No other part may sit inside it; wires underneath are fine. 1 hole = 2.54 mm, round up. Example, 5 V relay (19 x 15.5 mm) with its coil pins at [0,0] and [0,1]: "body": { "offset": [-1,-2], "size": [8,6] }. Leave it out for resistors, diodes, DIP chips and pin headers.

### 2. LOGICAL CONNECTIVITY (Nets)
To connect two or more pins, assign them the EXACT same string in their "net" field. 
- A pin with "net": null is physically present but electrically unconnected.
- Use descriptive names like "GND", "VCC", "SIGNAL_1", "I2C_SDA".

### 3. JSON STRUCTURE
{
  "components": [
    {
      "id": "U1",
      "name": "ESP32-C3 SuperMini",
      "value": "MCU",
      "pins": [
        { "offset": [0,0], "label": "5V", "net": "5V" },
        { "offset": [0,1], "label": "GND", "net": "GND" },
        { "offset": [6,5], "label": "IO5", "net": "LED_CONTROL" }
      ],
      "body": { "offset": [0,-1], "size": [7,10] }
    },
    {
      "id": "R1",
      "name": "Resistor",
      "value": "220",
      "pins": [
        { "offset": [0,0], "label": "1", "net": "LED_CONTROL" },
        { "offset": [2,0], "label": "2", "net": "LED_ANODE" }
      ]
    }
  ]
}

### YOUR MISSION
1. Analyze the requested circuit.
2. Breakdown the components needed.
3. Calculate precise [x,y] offsets for every pin of every component to ensure they "fit" the physical dimensions.
4. Assign consistent Nets to create the electrical pathways.
5. Output ONLY the raw JSON.

REQUEST: [DESCRIBE YOUR CIRCUIT HERE]`;

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
          This application uses a specific <strong>JSON format</strong> to define circuits.
          Modern AI models (like Claude, GPT-4, or Gemini) are excellent at generating this format.
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
          Simply copy the prompt above, paste it into your favorite AI, describe your circuit, and then paste the resulting JSON back into the Circuit Definition box.
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
          word-break: break-all;
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
        @media (max-width: 768px) {
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
