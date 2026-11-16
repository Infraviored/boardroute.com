# Desktop dialogs and states 08-30

## d08-part-selected-board / d08-part-selected-inspector
- [high] Selected part R1 is marked by a 3-4 px bright green outline + green glow on the board AND a green outlined row in Parts AND a green outlined GATE/net row in Network: three loud green frames compete, and green is also the Wire step/New colour -> one selection signal only: 2 px neutral-white (or the single accent) ring, no glow, same ring on the list row.
- [high] Selected R1 row in Parts has a green glow (box-shadow) around the whole row -> remove the glow, use a 1 px accent border plus the surface step.
- [mid] The coachmark "Now press Compact to shrink the board" (purple border, purple word) still floats over the top of the board while a part is selected and the board is already wired; it covers the first row of holes and sits under the purple Compact tab -> dismiss on first user action, and give it the neutral dialog surface (no purple border).
- [mid] Inspector header "Resistor" + chip "R1" + chevron: the R1 chip is blue-outlined while the ID chip in the list is green, same thing in two colours -> one chip style (neutral).
- [mid] Action row Rotate / Edit / Delete: Delete is red text on red-tinted fill, Rotate/Edit neutral; three different widths (Rotate ~125 px, Edit ~100, Delete ~120) -> equal width or content width with equal padding, Delete as neutral until hover.
- [mid] "Colour rings  5 | 4 | Off" segmented control is tiny (about 40 px tall at 2x = 20 css px, text ~11 px) next to 15 px field rows; "5" active blue fill is the only blue in the panel -> same height as other controls (28 px), neutral selected state.
- [mid] "PINS (2)" and "Network" show two different heading styles: "PINS (2)" is UPPERCASE small grey, "Network" is bold 17 px with icon -> sentence case "Pins 2" at the same role as sub-labels.
- [mid] Values (R1, Resistor, 10k, (4, 6)) in a mono face at ~20 px, bigger than the labels and bigger than the Parts list text; mono for names/values without a reason -> sans for name, mono only for coordinates and pin names.
- [low] "Board any × any" row: "any" fields are almost invisible (grey on grey, ~2:1) and the "×" is dimmer still -> real input border and #8b949e minimum text.
- [low] Pin rows "1 VCC", "2 GATE" have 2 px coloured bars on the left plus right-aligned net names; right-aligned text 300 px away from its pin number is hard to track -> put net name next to the number or add zebra/hairline.
- [low] Net list chips "4P / 3P / 2P" are a fourth style of count chip (boxed, darker) vs the grey "6" circle on Parts and "5" on Network -> one count style.
+ Stat tiles + progress bar + "All connections wired" status line is a clear summary.
+ Inspector sections collapse with a chevron, consistent between Component and Network.

## d09-net-selected-board / d09-net-selected-inspector
- [high] Selected net VCC: red 2 px frame + glow on the net row, and the selected-component header reads "Component none" while the Network header shows a red "VCC" chip; the net highlight on the board is only the thin red wires, which are hard to tell from the other wires (GND blue, GATE green are equally bright) -> dim all other nets to ~30 % when one is marked; that is the whole point of the selection.
- [mid] In the inspector screenshot (09-...-inspector) the red frame on VCC differs from the green frame on GATE in 08 (net frame colour = net colour). Net colours are data colours, fine, but the frame glow is not -> no glow.
- [mid] Empty state "Click a part on the board or in the Parts list." ends with a period, 2-line wrap, grey ~#8b949e on #0d1117 at ~14 px; fine contrast but every other label in the panel has no period -> make it "Select a part on the board or in the list" and keep.
- [low] "none" chip next to Component and the VCC chip next to Network: chips are 3 sizes (none 70 px, VCC 60 px, 5 count 36 px) -> same height, same radius.
- [low] Net rows (VCC 4P ...) have the label in mono bold ~22 px, taller rows (62 px at 2x = 31 css px) than part rows' secondary lines; looks heavy -> 14 px semibold sans.

## d10-hole-coordinates
- [mid] Row letters A-I and column numbers 1-8 sit in dark rounded pills with a round dark badge per label, bold white ~20 px: they outshout the copper holes and wire pins -> plain 12 px labels in the secondary text colour, no per-label badges.
- [mid] Column "5" and a few row letters render brighter/bolder than their neighbours (looks like an inconsistent tick or hover state) -> mark every 5th deliberately or make all equal.
- [low] The "#" hole-coordinates toggle gets a blue outline when on, the solder-side toggle gets amber in d11: two different active colours for sibling buttons -> one active style.
- [low] Label "J1 Power Connector" is drawn over pin K of D1 -> labels need collision handling.

## d11-solder-side
- [mid] Pill "Solder side · mirrored like the board turned over · view only" is amber text on dark-amber with a middle-dot string -> "Solder side view (mirrored, read-only)" on the neutral surface.
- [mid] Amber means three things now: copper, the mirror toggle active state, and this pill -> use the one accent for active toggles.
- [low] Labels collide: "100uF" and "J1 Power Connector" overlap ("100uFPower Connector"); same in the export preview (d18).

## d12-overlay-examples
- [high] Card footer meta "6 parts · 5 nets · best 8x9" is mono ~13 px in very dim grey (about 2.3:1 on #161b22) with middle dots -> sans, secondary text colour, "6 parts, 5 nets, best 8x9".
- [mid] Tag chips Starter (green), Classic (blue), Bigger (amber): three outline colours borrowing success/info/warning meaning for a plain category -> one neutral chip.
- [mid] Each card thumbnail has a radial green gradient vignette (visible bottom-left) -> flat #0d1117.
- [mid] Intro "Loads the circuit unconnected and replaces the current board (Undo brings it back). The picture shows the best layout found so far." is two lines at 20 px with a parenthesis -> "Replaces the current board. Undo brings it back."
- [low] Third card row is cut off with no fade or scroll hint.
- [low] Card titles are 24 px display font, descriptions 20 px: description is larger than the Parts list text elsewhere (16 px); fine in a dialog but the card with 2 lines leaves a blank line before the meta (cards 5, 6).
+ Large cards with real board previews are the best content in the product; keep.
+ Title left, X top right, same as the first-visit dialog (d27).

## d13-overlay-library-curated / -scrolled / -category / -search / -no-results
- [high] Header: "From a photo" is a blue-outlined button 16 px left of the close X; the same blue is on the search focus ring and "All 1162" chip: three blue things in one header -> neutral secondary button; move it next to the search field.
- [high] Search field autofocus ring is a 3 px bright blue ring with glow, placeholder "Search, e.g. ESP32, DIP-8, TO-220, relay..." in mono -> sans placeholder, 2 px ring without glow.
- [high] Category chips: 20 pills wrap into 5 rows (~190 px) before any result; selected chip ("ICs (SIP) 7") is only a blue outline without fill and is hard to find among 20 -> one scrolling row or a select; selected = filled neutral chip.
- [mid] Result rows: name bold 20 px white, meta "30-pin • 30 pins • body 10x21 • Curated" has bullet separators and says "30-pin" and "30 pins" twice -> "30 pins, body 10x21", show "Curated" as a small chip on the right.
- [mid] "Curated" and the category name are brighter grey than the rest of the meta line: two differently coloured words in one string -> same colour or chip.
- [mid] Raw KiCad ids shown in full bold: "TO-92-2_W4.0mm_Horizontal_FlatSideDown", "Sanyo_STK4xx-15_59.2x8.0mm_P2.54mm" -> replace underscores with spaces, weight 500, truncate with ellipsis plus title.
- [mid] Scrolled shot: the first row is cut mid-text directly under the "1162 parts" counter with no divider -> sticky header with hairline.
- [mid] No-results state is a blank 200 px with only "0 parts" -> "No part matches 'zzzzqq'. Try a package like DIP-8, or draw a new part." with a New part button.
- [low] Two X glyphs in the same column (field clear at x 1675, dialog close at x 1689) with different sizes -> different style for the field clear.
- [low] Footer licence text is always visible, 2 lines, with an underlined grey link; it is the only underlined link (account dialog uses a blue underlined "Privacy") -> one link style.
+ Thumbnails per part (shape and pins) are very helpful, constant 44 px.
+ Row heights equal (54 px).

## d14-overlay-editor / d14-overlay-editor-scrolled
- [high] Header buttons: Undo (ghost, dim), Cancel (outlined dark), Save (green fill): three styles, three widths. Primary colour is green here, "Add to circuit" green (d15), "Use footprint" dull green (d17), but Export "Download" is BLUE (d18) and the Prompt dialog "Close" is BLUE (d19) -> one primary colour for every dialog.
- [high] The two screenshots are identical: the panel does not scroll for 2 pins and leaves ~380 px empty; for 30 pins (d15) the pin list is cut at the bottom edge without scrollbar or fade -> scroll fade or own scrollbar.
- [mid] Header meta "2-pin  2 x 1 holes · 5.1 x 2.5 mm" mixes sans ("2-pin") and mono, with a middle dot -> sans secondary, "2 x 1 holes, 5.1 x 2.5 mm".
- [mid] Section labels "BODY" and "PINS 2" are UPPERCASE tracked, field labels (ID, Value, Colour) are sentence case -> sentence case for all.
- [mid] Control heights differ: ID/Value inputs ~44 px, pin inputs ~42 px, "Face out" ~40, "Add" ~40 with 12 px text, "Footprint from photo" 50 px with 16 px text -> one 32 px control height, one text size.
- [mid] "Pins swappable" uses a native white checkbox (brightest object in the panel) and "Face out" is a separate small button on the same row -> custom dark checkbox, "Face out" own row.
- [mid] Segmented "Spans the pins | Larger housing": active segment is saturated blue (#1f6feb), brighter than anything else -> neutral raised segment.
- [mid] "Footprint from photo" and "Picture from photo": two full-width ghost buttons, near-identical names, camera vs image icon -> one "From a photo" menu, or a one-line hint under each.
- [low] Pin trash icons are ~2:1 contrast and ~16 px -> 24 px target, #8b949e.
- [low] Hint "Drag pins · arrows move the selected pin · Del removes it" is 13 px dim grey with middle dots, ~2.5:1 -> secondary colour, "Drag pins. Arrow keys move the selected pin. Delete removes it."
- [low] Zoom jumps 6x between a 2-pin part (80 px holes, 60 px pins, 12 px red frame) and the 30-pin part (12 px holes): the small-part view is huge and loud -> cap zoom, 2 px outline.
+ Header carries identity (chip, name, meta) and all actions; reads as editing one thing. Keep this pattern.
+ Pin rows have a colour dot linked to the net.

## d15-library-add-editor
- [high] "Add to circuit" (green) with "Back to library" beside it and no Cancel/X: user cannot leave without going back -> add X, make Back a left-aligned text button.
- [mid] Hint text "Drag the outline to the housing size. Other parts and jumpers stay out; wires still pass underneath." (semicolon, two ideas) -> "Drag the outline to the housing size. Wires still run underneath."
- [mid] "not connected" in pin rows is rendered in the same colour as typed values, so placeholder and value look alike -> dim placeholder or a dash.
- [mid] 30-pin grid is small, pin labels (EN, VP, 33) ~8 px, unreadable; 60 % of the canvas empty -> fit-to-canvas.

## d16-overlay-new-part
- [mid] Title "New part" with chip "C7" (crimson outline), value field empty without placeholder, no name field -> placeholder "10k", add Name.
- [mid] Pin discs "1" "2" are 60 px grey with 40 px numerals, heavier than anything else -> scale down.
- [low] Same Cancel/Save, UPPERCASE and control-height findings as d14.

## d17-overlay-photo-pick / -frame / -pins
- [high] Header differs from all other dialogs: camera icon, title = part name ("Power Connector"), lowercase subtitle "footprint from a photo" -> title "Footprint from a photo", part name as subtitle (like the editor).
- [high] "Use footprint" (steps 0 and 2) is a dull dark green that looks like disabled but is clickable in step 2 and "Next" in step 1 is bright green -> one clear primary, real disabled style (grey fill, grey text) when not allowed.
- [high] Pick step has two greens: "Choose or take a photo" (36 px, green fill) and "Use footprint" (green) -> only the choose button is primary, header button disabled grey.
- [mid] Bottom of right panel: "Other photo" sits at y 1304 in Frame and y 1347 in Pins, with "Undo / Clear pins" added; "Reset frame" is in the middle -> fixed footer position for the same buttons.
- [mid] Stepper: done step "1" is a green circle with a number (should be a check), active is a blue circle in a pill, connector 30 px grey -> check mark, neutral colours.
- [mid] Pins step has a second numbering (1 Scale, 2 Pins, 3 Outline and names) inside a dialog whose stepper already says 1 Frame, 2 Pins -> remove the inner numbers.
- [mid] Solid orange pill "Tap the first pin of a row" is the loudest element in the dialog; orange is copper/warning -> neutral coachmark.
- [mid] "GOOD PHOTOS" is UPPERCASE tracked, bullets, one 4-line sentence with parenthetical; in the Frame step the same advice is a collapsed "Tips for good photos" with a triangle -> sentence case, one treatment.
- [mid] Frame step explains the same drag rules twice (right panel 3 bullets with middle dots and bottom caption "Drag inside the frame to move it · outside to move the photo") -> once.
- [mid] Turn slider thumb is bright blue, "0°" is tiny grey at the far right, two 44 px round buttons -> neutral thumb, show value next to the label.
- [mid] Native `<select>` "text: auto" (system chrome) and native checkboxes (blue-filled when checked) look unlike every other control; "Photo shows the underside" has an icon, "Photo as the part's picture" does not -> custom controls, icons on both or neither.
- [mid] URL field placeholder "...or an image URL" starts with a literal "..." and the "Load" button is dim (looks disabled) -> "Image URL", Load enabled when text exists.
- [low] "Find similar / Row / Align" disabled buttons are ~2:1 and look like active dim buttons -> one disabled style used everywhere.
- [low] Zoom buttons (magnifier +/-, corners) use different icons than the board's own zoom control (+, -, fit).
+ Two-column layout (photo left, steps right) with a stepper makes a complex flow understandable.

## d18-overlay-export
- [high] Only dialog with a different structure: left preview + right options panel, X in the right panel's header, primary "Download" is BLUE (28 px bold, 1/2 width) with "Print" outlined beside it, at the very bottom edge (y 1442 of 1512, no bottom padding, cut close to the dialog border) -> same header/footer pattern as other dialogs, accent colour, 16 px padding below.
- [high] Preview titles "TOP VIEW" / "BOTTOM VIEW" are UPPERCASE 40 px bold; and the right panel has 10 UPPERCASE tracked section labels (VIEW, BOARD & COORDINATES, BOARD SIZE, COLUMNS, ROWS, NUMBERS FROM, ORIGIN, SOLDER SIDE (PRINT ON THE BACK), COLOURS, PRINT SIZE, FORMAT) -> sentence case, 14 px semibold; the ones that are really field labels (Columns, Rows, Numbers from, Origin) are in the same style as section headings, no hierarchy.
- [high] Panel is 11 sections tall in 1440x900: the lower part is cut off, "Download" is only reachable because it is pinned; "Share link" and "project file" mentioned in the brief are not visible -> split into tabs (Image / Print) and show only the relevant options; 8 of the options are greyed out while "Show hole coordinates" is off (COLUMNS, ROWS, NUMBERS FROM, ORIGIN, SOLDER SIDE group), taking 300 px for nothing -> hide until enabled.
- [mid] Disabled controls (123 ABC, 1 0, origin 2x2 grid, toggles) at ~1.6:1 contrast; origin grid is 4 tiny squares, the selected one with a blue dot -> readable disabled state, bigger origin picker.
- [mid] Three segmented controls with different geometry: View (Top | Solder side | Both, 3 equal), Colours (3 cells, two-line labels "Dark (screen)" "Light (paper)" "Black & white" 70 px tall), Print size (Actual size | Fill the page | Custom, 56 px), Format (SVG (vector) | PNG (image), 56 px). Heights 52/90/56/56 px -> one height, one-line labels.
- [mid] Active segment is saturated blue fill in all four; same blue as the Download button so selection and primary action look identical -> neutral selected segment, accent only on Download.
- [mid] Toggles: two switches ("Show hole coordinates", "Coordinates on every pin") are grey pills ~50 px with a dark knob, state off/on barely distinguishable (off = grey knob left) -> clear on state (accent track).
- [mid] Mono info lines: "Layout 8 x 9 holes · 20.3 x 22.9 mm at 2.54 mm pitch" mono with middle dot, wraps into 2 lines; "Auto: board = layout footprint (8 x 9 holes)." trailing period, "1 hole = 2.54 mm. Print always uses the light colours. Black & white printer? Pick Black & white." three sentences -> short single lines.
- [mid] Board size fields "auto x auto" are 90 px grey boxes where the word "auto" is the value (not a placeholder), so it cannot be told whether it is editable -> placeholder "Auto".
- [low] Preview: "J1 Power Connec100uF" label overlaps "100uF" (top view) and "100uFPower Connector" (bottom view): the exported picture itself has overlapping text -> fix in the generator.
- [low] Preview checkerboard transparency background at full area is busy next to the dark panel.
+ Live preview of the export with both sides is excellent; keep.
+ Download/Print pair with icons at the bottom is the right place for the action.

## d19-overlay-prompt
- [high] Title "AI prompt guide" but the button that opens it says "Get it from your AI" -> same name in both places ("Get it from your AI").
- [high] Primary "Close" is a BLUE filled button in a footer bar, bottom right; no other dialog has "Close" as the only footer action and this blue is the only filled blue dialog button besides "Download" -> the real primary action is "Copy prompt", which is a small outlined 12 px button at the top right of the code block; make Copy the filled accent button, and drop the footer Close (X exists).
- [high] Code block text is bright green on black (#3fb950-like, mono 20 px) = terminal cliche, and the "RECOMMENDED PROMPT" label above is UPPERCASE tracked -> code text in the primary text colour, sentence case "Prompt".
- [mid] Intro 3 lines at 20 px "Your AI only has to name the parts and say which pins connect: the footprints come from the library, and boardroute places everything itself. Any chatbot can do it, also a small or free one." long and with a colon + "also a small or free one" -> "Ask any chatbot to describe your circuit in this format."
- [mid] Footer instruction "Simply copy the prompt above, paste it into your favorite AI, describe your circuit, and then paste the JSON it writes under Circuit → Paste JSON." uses an arrow and "Paste JSON", but the sidebar button is called "Edit JSON" (no Paste JSON anywhere) -> name the real button.
- [mid] Code block is a fixed-height scroller (about 14 lines) with no scrollbar/fade, text cut mid-JSON at the bottom; the user cannot tell there is more -> visible scrollbar and fade.
- [low] "Copy prompt" icon is a double-square at 20 px with 12 px label (smaller than the Close label 18 px) -> equal button scale.
+ Clear header + body + footer structure with hairline dividers; this is the cleanest dialog frame (matches Save & share and confirms); make it the reference.

## d20-overlay-account-signin / -after-send
- [high] Primary "Send link" is a muted dark-green button with dim text (looks disabled while the field is empty, acceptable) but when enabled is green; in My circuits "Save board" is green; Export "Download" is blue; Prompt "Close" is blue -> one primary colour.
- [mid] Title "Save & share" while the toolbar icon is a cloud, the other titles are "My circuits" and the toolbar has a separate Share icon (three-dot share) -> cloud = account, share = link: the title "Save & share" mixes the two; call it "Account" or "Save your circuits".
- [mid] Intro "Keep your circuits on boardroute.com and share them with a short link. No password: we mail you a link to sign in." 2 sentences + colon; ok but "No password:" fragment -> "Keep your circuits and share them with a short link. We email you a sign-in link, no password."
- [mid] Privacy note "Without an account everything works as before; the board stays in this browser. Privacy" is 13 px dim grey, with the underlined blue "Privacy" link -> fine; semicolon -> two sentences.
- [mid] After-send state: green envelope icon (36 px, green outline) + "We sent a sign-in link to florian@example.com." trailing period, "Open it in this browser to sign in here. It works once and for 20 minutes." 13 px dim, "Use another address" as a 13 px bold white text link with no affordance -> the dialog is 280 px tall and jumps size vs the first state (height 360 -> 385) and the title moves up 12 px; keep a constant height.
- [mid] The brief said the shot is without a mail API: the dialog shows the success state even so; the error state ("could not send, try again") is not captured: check it exists and says what to do.
- [low] Header has a cloud icon before the title in these dialogs (20 px) while other dialogs (Examples, Library, Prompt, Confirm) have none -> either all or none.
- [low] Email field 58 px high, "Send link" 52 px high, not equal; the field has no visible label, only placeholder "you@example.com" -> label.
+ Same header (icon title X) / hairline / body structure as prompt and confirm; compact and readable.

## d21-overlay-account-signed-in
- [high] Row actions are inconsistent: row 1 "Share" (outlined grey pill) + trash, row 2 "Link" (BLUE filled pill) + a broken-link icon + trash, row 3 "Share" + trash. Same slot has two labels (Share vs Link), the blue fill marks an already-shared state with the loudest colour in the dialog, and the unshare icon appears without a tooltip in view -> "Copy link" (accent text) for shared rows and a quiet "Stop sharing" in a menu; use the same label for the same action everywhere ("Share link" is used in the result card, "Share" here).
- [mid] "Save board" green button vs "Name of this circuit" field: heights 58 vs 52 px, and button label says "Save board" while the dialog says "circuits" -> "Save circuit".
- [mid] Row dates "11:42 AM", "Nov 13", "Oct 17" are 13 px dim and right-aligned at three different x positions (1394, 1361, 1407) because the action area width changes -> fixed column.
- [mid] Footer: "Delete account" is a plain dim bold text on the left, destructive and unstyled, same weight as "Sign out" (outlined button with icon) -> Delete account in red text but smaller/separate; Sign out secondary.
- [mid] Folder icon in front of each circuit (20 px outline) is generic; row separators are hairlines inside a rounded box, ok.
- [low] Header email "florian@example.com" in grey 20 px sits next to the title: ok but truncation not shown for long addresses -> ellipsis.
+ List rows are compact (68 px) with name left and actions right; good scan pattern.

## d22-confirm-delete-part / d23-confirm-reset
- [high] Title Case titles "Delete Component", "Reset Workspace" -> sentence case "Delete R1?" and "Reset workspace?" (and the sidebar/toolbar call it "Reset", the dialog "Reset Workspace", the brief says "Reset Project": three names for one action).
- [high] Destructive button says "Confirm action" in red text on a red-tinted fill: says nothing -> "Delete R1" / "Reset workspace"; same word as the title and the button that opened it (the inspector says "Delete", toolbar says "Reset").
- [high] Body copy "Are you sure you want to delete R1?" is a filler question, and the reset body "Clear all components and wires?" uses "Clear", the word that already means two things in the toolbar -> "R1 and its wires will be removed. You can undo this." / "This removes all parts and wires. You can undo this." (is it undoable? say so, or say it is not).
- [mid] Button order: Cancel (neutral dark, left) then Confirm (right) - correct, but Cancel is the heavier-looking button (bold white on grey) while the destructive one is the muted red; both 36 px high, 12 px padding; the width differs (62 vs 104 css px) -> fine, keep order, give destructive a solid red fill or keep outline but real label.
- [mid] Both dialogs have an X in the header AND a Cancel: redundant; the X is fine but pick one pattern for confirms (no X).
- [low] Dialog width 318 css px vs 470 (account) vs 503 (prompt) vs 537 (library): four widths for the simple dialogs -> two sizes (small 320 / medium 480).
- [low] Delete shot: the selected R1 row behind is blurred; the red confirm is the only coloured element, good.
+ Header / hairline / body / hairline / right-aligned footer structure with Cancel left of primary: keep as the dialog standard.

## d26-share-link-loaded
- [mid] Opened from a share link: the coachmark "Now press Compact to shrink the board" is shown on top of the layout although the board is already wired and compacted (8x9 board, wired) -> only show the hint when the next step is actually pending (and then say what the step is).
- [mid] Stat tile "8x9 HOLES" and the board-size input "any x any" below: the board is already 8x9 but fields say "any", the user cannot tell what any means -> "Auto".
- [low] Same findings as d08: copper rings at full saturation dominate; no indication the circuit was loaded from a link (no toast "Opened from a share link").

## d27-share-link-broken
- [high] The screenshot shows the full "Pick a circuit to start with" examples dialog and no error: the damaged-link notice "This share link could not be opened" is not visible at all (either gone before the capture or hidden behind the dialog) -> show the error inside or above the dialog, e.g. an inline message "This share link is damaged. Pick a circuit or paste your JSON."; verify it is not lost.
- [mid] Dialog title "Pick a circuit to start with" vs the later dialog "Example circuits" for the same content; intro "Each one loads unconnected. Press Wire to connect everything, then Compact to shrink the board. The picture shows how small it can get." three sentences, trailing periods -> shorten.
- [mid] Footer: "Skip, I'll describe my own circuit" is a full-width (1510 px) dark button and "How does it work?" a blue link at the right; the skip button is the widest element and uses a comma clause -> "Start with my own circuit" as a normal-width secondary, link stays.
- [mid] Footer is separated from the card grid only by the clipped third row of cards (cards cut at 1370 with no fade) -> hairline + fade.
- [low] The title "Pick a circuit to start with" ends with a preposition; "Choose an example" is plainer.

## d28-circuit-link-standin / d28-circuit-link-standin-inspector
- [high] Notice "Check these parts" is a blue card (blue 2 px border, blue 28 px title) 1075 css px wide that covers the top 150 px of the board; yet the stand-in part itself is marked amber (dashed amber outline, amber "?" badge, amber "stand-in — check pins") -> notice must use the same amber, not the info blue, and be a toast at the top/corner that auto-fades or docks above the canvas.
- [mid] Notice body: `X1: "capacitor" is not in the library, placed as a 3-pin header (VIN, GND, SIG). Check the pin order, or replace it with a library part.` is long, 2 sentences, includes the raw id -> "X1 'capacitor' is not in the library. It is drawn as a 3-pin header; check the pins or pick a library part."
- [mid] Parts row for X1: dashed teal border, amber line "stand-in — check pins" (em dash), then mono "ZX-9000 flux": 3 lines of different colours/fonts in a 56 px row where other rows have 2; and the row is a different shape (dashed) -> keep dashed, but one line "Stand-in, check pins" as a chip.
- [mid] Inspector warning box: amber dashed border, warning triangle icon, text "Stand-in — check pins. Not in any library, drawn as a plain pin header." duplicates the notice and the parts row (3 times the same message) -> once in the inspector; buttons below "Pick from library", "Footprint from a photo", "Keep as pin header" are 3 stacked full-width ghost buttons of equal weight with no primary; the likely-best action is Pick from library -> make it primary, others text buttons.
- [mid] "Footprint from a photo" here vs "Footprint from photo" in the editor (d14) vs "From a photo" in the library header: three names for the same action -> "Footprint from photo" everywhere.
- [mid] Result card "Perfect" (gold top border, trophy icon, "Smallest possible board, proven") with a gold 3 px top edge + green "-6 % area" badge with green number + green "Share link" button: gold, green, green in one 560 px card; plus UPPERCASE "HOLES FOOTPRINT" / "HOLES OF WIRE" under 40 px numerals -> single accent, sentence case, "Share link" and "Export" equal-height buttons (they are 56 px, ok) but only one primary.
- [mid] "Share link" (card, green) vs "Share" (account list) vs the toolbar icon share (unlabelled) -> same word.
- [low] Parts list: "Wemos D1 Mini 16P" – the part name is cut so the 16P chip hugs the text with 6 px gap, while other rows have 24 px -> reserve chip space.
- [low] The stand-in pin labels "VIN GND SIG" at ~8 px on a 28 px tall pill are unreadable at 1x.
+ Stand-in part is clearly distinguishable (dashed outline + "?" badge); keep, only recolour consistently.

## d29-circuit-link-auto-running / d29-circuit-link-auto
- [high] The two screenshots look identical (both show the finished "Perfect" card) -> the "running" state with the processing bar was not captured (or the run finished); cannot judge the auto-run progress UI; verify the processing bar shows which step (Wire then Compact) and has a Stop button.
- [mid] The "Perfect" card keeps the gold edge, trophy, "Smallest possible board, proven" claim; "-16 % area" badge green with "14 x 13 -> 17 x 9": the arrow shows 14x13 (182 holes) to 17x9 (153): ok, but the badge shows a mono small line with arrows "→" and "×" -> sentence "was 14 x 13".
- [mid] Parts list: U1 "Wemos D1 Mini" row, name cut-off "Wemos D1 Mini" + 16P chip, subtitle "ESP8266" mono; SW1 "Button" row has no subtitle so the row is shorter (68 px vs 98 px) and its ID chip "SW1" is wider than others -> keep row height constant; ID chip fixed width.
- [mid] After auto Wire+Compact no coachmark is shown, correct, but the Component panel says "none" with "Click a part on the board or in the Parts list." (period) while the board is complete -> fine.
- [low] Part "LEDA" and "BTN" net names are mono bold 22 px all caps; names come from the circuit; sentence-case not possible but size is heavy (see d09).

## d30-undo-redo-empty
- [high] After "Delete all wires" the coachmark still says "Now press Compact to shrink the board" while the correct next step is Wire (status line says "Not wired yet", index says Wire is next) -> coachmark must follow the state: "Now press Wire to connect the parts".
- [mid] Toolbar: undo/redo icons look equally active after deleting wires (redo should be enabled, undo enabled) and nothing tells that the wires can be restored; no toast "Wires deleted. Undo" -> toast with Undo.
- [mid] Stat tile "– WIRE" shows a dash in 40 px as the value; "Not wired yet" below with no progress (empty bar track nearly invisible at #161b22 on #0d1117) -> "0" and a visible empty track.
- [mid] Ratsnest lines (thin dashed brown, ~1 px, ~25 % opacity) are nearly invisible against the copper background; these are the only hint of what Wire will connect -> brighter 1.5 px dashed in the net colour at 60 %.
- [low] Wire tab has no highlight as next step (all three tabs look the same except coloured top bars) although the brief says Wire is next.
- [low] The "Clear" toolbar button is the thing that deleted the wires? ("Delete all wires" in the brief) -> the button is labelled "Clear" and the result is "Not wired yet": rename to "Delete wires" (known double meaning).

## cross-dialog
- Header styles: five variants. (1) Title only 24 px left, X right (Examples, first visit); (2) title + blue-outlined action button + X (Library); (3) icon + title + X with hairline (Save & share, My circuits, AI prompt guide has no icon but hairline); (4) chip + title + mono meta + 3 buttons, no X (Component editor); (5) icon + part name + lowercase subtitle + stepper + buttons, no X (Photo); (6) Export: no top header, title and X inside the right panel. Fix: one header = title (sentence case) + optional one-line secondary + X; actions in a footer or in the header, not both.
- Close buttons: X is 26-32 px in Examples, Library, Prompt, Account, Confirm, Export (right-aligned, plain thin glyph, no hover surface); the editor and photo dialogs have none (Cancel instead); the Prompt dialog adds a second "Close" button; Confirm dialogs have both X and Cancel. Fix: every dialog X top right, same size (32 px hit target); Cancel only where something is discarded.
- Primary button colour and position: green (Save, Add to circuit, Use footprint, Choose or take a photo, Send link, Save board, Share link), blue (Download, Close in prompt, Link in account), dull red (Confirm action), blue-outline (From a photo). Position: top right in editor/photo, bottom right in prompt/confirm, bottom-left half width in Export. Sizes: 34-56 px high. Fix: one accent for all primaries, bottom right (or header right for the editor/photo), 36 px high; destructive = red label naming the action.
- Input styles: search/email/name fields are dark (#0d1117) with 1 px border and 52-58 px height, editor inputs 42-44 px, export "auto" fields 40 px grey; placeholders vary (mono in Library, sans in account, "..." in photo); focus ring is a 3 px bright blue glow in Library, 1 px elsewhere. Fix: one 36 px field, sans placeholder, 2 px accent focus ring without glow.
- Segmented controls: editor (2 cells, blue fill, 48 px), export (4 controls, 52-90 px, blue fill), inspector Colour rings (3 cells, 20 px, blue fill), library category chips (pill outline, no fill). Fix: one segmented component (32 px, neutral selected cell), and chips for filters with a filled selected state.
- Checkboxes and toggles: native white checkbox (editor "Pins swappable"), native blue checked checkbox (photo), switch pills (export), none custom. Fix: one custom checkbox, one switch with clear on-state.
- Label casing: UPPERCASE tracked in Export (11 labels), editor (BODY, PINS), photo (GOOD PHOTOS), prompt (RECOMMENDED PROMPT), result card, stat tiles; sentence case in titles and field labels; Title Case in Confirm titles ("Delete Component", "Reset Workspace"). Fix: sentence case everywhere.
- Copy: same action, different words: Reset / Reset Workspace / Reset Project; Delete vs Clear vs "Delete all wires"; Share vs Share link vs Link; Footprint from photo vs from a photo vs From a photo; "Get it from your AI" vs "AI prompt guide"; "Pick a circuit to start with" vs "Example circuits"; Save board vs My circuits. Trailing periods on labels/hints: "Click a part on the board or in the Parts list.", "Auto: board = layout footprint (8 x 9 holes).". Middle dots in meta strings in almost every dialog (editor header, hint lines, card meta, banner).
- Radii and widths: dialogs 12-14 px radius, inner buttons 6-8 px, chips full pill, cards 10 px: roughly nested, fine. Dialog widths: 318, 470, 503, 537, 1000, 1100, 1200 css px with no scale.
- Backdrop: blur + dark scrim is used everywhere (good) but the blur leaves copper holes glowing orange behind small dialogs, which distracts in Confirm/Account.
+ Keep: Header / hairline / body / hairline / footer frame of the Prompt, Account and Confirm dialogs as the base; the Examples cards; the live Export preview; the editor header identity pattern.
