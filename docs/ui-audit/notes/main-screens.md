## d01 first-visit (Examples)
+ real board previews = the moment, good. title/sub plain.
- 3 badge colours Starter grn/Classic blu/Bigger amber pills; meta mono with middots "6 parts · 5 nets · best 8x9"
- thumbs on radial green glow; preview scale differs a lot (row 2 tiny vs row1)
- Skip = huge full-width grey bar vs small blue link "How does it work?"; 3rd row cut hard at bottom
## d02 main, example loaded
- logo: copper wordmark with glow/drop shadow, heavy next to thin "route"
- stepper Load/Wire/Compact chevrons: Compact disabled nearly invisible (~15% contrast); stepper sits on own dark box
- right icon-only cluster cloud/share/book/reset ambiguous; Export only outlined button
- Circuit card: 4 stacked full-width buttons in 3 colours (grn Examples, blu "Get it from your AI" w/ sparkle icon, grey x2) -> nothing is primary
- Parts: Library grey + New filled bright green (2nd green, competes with Examples)
- part rows: coloured left border + coloured ID chip + "2P" chip + pencil; subtitle mono; 4 colour signals per row
- right: stat tiles w/ UPPERCASE tracked labels, coloured numbers (5 blue); "none" chip; net rows UPPERCASE MONO BOLD w/ coloured left bar + "4P" chips
- canvas: copper hole rings at full saturation fill entire viewport -> loudest thing on screen is the background, parts/ratsnest get lost
- coach mark green outline bubble ok; canvas tool column 6 buttons, locate icon green (why)
- footer links Imprint/Privacy/GitHub fine
## d03 empty board
- stat "1x1 HOLES" for nothing, "–" wire; Parts empty state: dashed box, big chip icon, text wraps orphan "AI."; 
- "Paste JSON" here vs "Edit JSON" when loaded (label changes - fine but icon changes too)
- empty canvas = full copper carpet, no invitation to act on the board itself
## m01 first visit
- meta line mono very low contrast (~2:1), unreadable; only ~1.5 cards per screen; Skip big bordered bar, link centered under -> two exits stacked
## m02/m04 phone main
- board fitted tiny: parts occupy middle third, rest copper carpet (old bug2 still live); labels ~6px unreadable
- topbar: logo + kebab only; stepper 3 big chevrons, Compact invisible; Clear/Export/Share hidden in kebab
- edge tabs "Parts · 6" (reads bottom-up) vs "Inspector" (reads top-down): opposite rotation; middot again
- canvas tools 2x3 grid of 52px buttons bottom-right eats ~1/6 of board; locate icon green
- coach mark covers top board rows
## m04 parts drawer
- header "Parts & Circuit" then section "Circuit" first -> doubled heading, order mismatch
- Examples+AI side by side here, stacked on desktop; button text ~16-17px semi-bold vs body
- ID chips: Q1 navy on dark ~1.8:1, D1 magenta, RL1 olive -> net colours reused as part colours = noise; pencil in its own dark box next to "2P" chip
- list cut mid-row by footer links, no scroll hint
## d05 JSON editor (error)
- primary "Load circuit" BLUE filled (elsewhere primary = green / purple)
- error message truncated "... (line ..." in footer, no line marker in editor, no syntax colour; error also as red line in Circuit card (good)
- header "Paste" + "Clear" tiny; this "Clear" (empties JSON) vs topbar "Clear" (removes wires) - same word, two meanings
- sidebar button toggles to "Close JSON editor" with blue outline; part name truncates "Power Connectc" with fade
- editor panel sits on canvas, card has no shadow separation except blue rule lines top/bottom
## d06 after Wire (running / card)
- step colours: Load blue, Wire green, Compact purple -> 3 accent hues + net hues + copper; Compact button purple w/ glow
- coach mark now purple; result card green top border; card stats duplicate right-sidebar tiles (8x15, 36)
- card labels UPPERCASE tracked "HOLES FOOTPRINT", "HOLES OF WIRE" (unclear wording); 3 buttons equal width
+ the routed board itself (coloured traces, pin dots) is the real moment: crisp, readable
- holes still saturated; wired traces compete with hole rings of same weight
## d07 after Compact
- card: "Perfect" amber w/ trophy, top border amber; "-38 % area  13 x 9 -> 12 x 6" chip green, but Wire card said 8x15 -> numbers don't match what user saw (compares to another baseline) -> confusing
- primary in card now GREEN "Share link", in wire card PURPLE "Compact": primary colour = step colour, changes per state
- "–38 %" space before % (German style) in English UI; mono arrow string
- right tiles update; card duplicates them
## m05 JSON editor phone
- JSON pretty-printed with every array item on own line: "offset": [ 0, 1 ] over 4 lines -> one part = 30 lines; compact arrays inline
- "Valid JSON · 6 parts · 5 nets" green status good; Load circuit blue
## m06 after wire phone
+ board fitted well here
- coach "Now press Compact" + purple Compact button in card = same prompt twice on one screen
- tool row (6 x 52px) moved above card, overlaps board bottom edge; edge tabs overlap board labels
- card takes ~16% of height; result card uppercase labels again
