# Mobile audit, files 07-30 + landscape (390x844 @2x; sizes below are CSS px)

Sampled contrast: the dim grey #484f58 is used for meta text on #21262d (1.84:1) and #0d1117 (2.28:1). Body grey #8b949e gives 4.9-6:1 and is fine.

## m07-after-compact-running
- [mid] Frame shows the finished "Perfect" card and no processing bar / Stop button, so the running state is not visible -> check that the progress bar exists on phone (or the capture fired too late)
- [mid] After Compact the board shrinks to ~205px wide in a 390px canvas and sits ~85px below the centre of the free area; view is not re-fitted -> run fit-to-view after Wire/Compact finish, centred in the area above the card
- [mid] Holes outside the dashed footprint look exactly like holes inside; the board edge is only a 1.5px grey dash on saturated copper -> fade holes outside the footprint to ~25%
- [mid] Pin chips ~10px with ~6px glyphs, part tags "Power Connector", "D1 1N4007", "Q1" are 6-7px -> min 9px, hide tags when zoomed out
- [mid] "10k Ω" label prints over the "R1" tag and resistor drawing, "Power Connector" runs into "100uF" -> collision-avoid labels, put tags above the body
- [low] Step bar looks identical in every state (Load/Wire/Compact same weight, no done check) -> done = check + dim, next = filled
+ Board keeps ~545px of height above the result card; tool row sits above the card instead of over it

## m07-after-compact
- [high] Result card "Perfect" uses 4 accents (gold border+trophy+title, green "-38 % area" pill, green Share link, grey Export) -> one accent; drop the 2px coloured top stripe (slop tell) for a neutral 1px
- [mid] "Share link" is solid green (Wire's colour) in a purple Compact step; the natural next action is Export -> Export primary, Share secondary, app-wide primary colour
- [mid] Card buttons 40px high, X icon ~20px -> 44px, X hit area 44x44
- [mid] Card bottom edge ~9px from the screen edge, no safe-area inset visible -> padding-bottom: max(12px, env(safe-area-inset-bottom))
- [low] "-38 % area": space before %, German style in an English UI -> "-38% area"
- [low] Uppercase tracked labels HOLES FOOTPRINT / HOLES OF WIRE (known) -> "8 x 9 holes" sentence case 12px grey

## m07-after-compact-card
- [low] The "-38 % area" pill is the only tinted pill and looks like a button -> plain text "38% smaller"
+ Big numerals 8 x 9 / 33 are scannable

## m08-part-selected-board
- [mid] Selected part R1 gets a blurred green glow in its own colour; selection colour differs per part and nothing else dims -> one selection colour, 2px solid, no blur, dim other parts to 40%
- [mid] Action bar Rotate/Edit/Delete is 48px high (good) but Delete (red) is flush against Edit at the same size -> 12px gap + divider, or Delete only in Inspector
- [mid] Tool buttons are 40x40; they form a 2x3 grid bottom-right here but a 1x6 row above the result card in 07 -> one fixed position, 44px
- [mid] Coach mark "Now press Compact to shrink the board" overlaps the first board row; its x is 18px -> anchor under the step bar, 44px close
- [mid] "Power Connector" tag overlaps "100uF" at the left of the board
- [low] Edge tabs 24px wide x 47px, text 11px rotated opposite ways (known) -> 44px wide, horizontal icon + count badge
+ Delete is the only red item, icons are one line set

## m08-part-selected-inspector
- [mid] Drawer 334px wide with a 56px blurred board sliver (good); X is a 24px icon -> 44px hit area
- [mid] Stat tiles: labels PARTS/NETS/HOLES/WIRE uppercase tracked 11px (known), "5 NETS" in blue while others white -> all white
- [mid] "Board any x any" is cryptic, dim inputs -> "Max board size", placeholder "auto"
- [mid] Rows ID/Name/Value/Origin are 35px and look like static text although they are probably editable -> 44px rows with a visible field or chevron
- [mid] "Colour rings 5 | 4 | Off" segmented is ~22px high with 12px text -> 40-44px
- [mid] Pins rows ("1 VCC", "2 GATE") 26px high; "PINS (2)" uppercase -> "Pins, 2", 36px rows
- [high] Tags 4P / 3P / 2P in the Network list are #484f58 on #21262d = 1.84:1 -> #8b949e or write "4 pins"
- [mid] Net tiles VCC and GATE have a 2px red/green ring plus outer glow; why two nets? -> 2px ring, no glow, caption "used by R1"
- [low] Naming: "Inspector & stats", "Component", "Network", tile "NETS" -> one word (Nets, Part)
- [low] Delete is a full-width red outline equal to Rotate/Edit -> label "Delete R1"
+ Net tiles are 44px tall, left colour stripe matches the wire colour on the board

## m09-net-selected-board
- [mid] Marked net VCC is drawn thicker with a faint halo, all other wires stay full strength; hard to see at phone zoom -> dim other nets to 35%
- [low] No visible way to clear the highlight (no active state on the tool grid) -> tap empty board + "Clear highlight" chip

## m09-net-selected-inspector
- [mid] "Click a part on the board or in the Parts list." -> "Tap a part."
- [mid] "Selected" has 4 looks (red ring+glow on the tile, red pill "VCC" in the header, thick wire, green glow on part) -> one
- [low] 500px of empty drawer below the 5 tiles while the highlighted net is hidden behind it -> bottom sheet at half height so the net stays visible
+ Colour stripe + mono net names scan well

## m10-hole-coordinates
- [mid] Coordinate chips (1-8 top, A-I left) ~22px, readable, but the "Power Connector" tag lands on row I and the dashed outline is crossed -> draw tags outside the footprint
- [mid] # toggle gets a blue active ring, the mirror toggle in 11 gets amber -> same active colour
- [low] The extra holes outside the footprint have no coordinates (fine, but see the "board edge" note in 07)
+ Active state of # is visible (outline + blue icon)

## m11-solder-side
- [mid] Banner "Solder side · mirrored like the board turned over · view only" is a middot string, full width, 0 margin, wraps at the edge -> "Solder side, mirrored. View only." with 16px side margins
- [mid] Amber used for the banner and the active mirror button: 5th hue -> accent or neutral
- [low] Mirror (butterfly) icon is not self-explanatory -> label "Flip" or tooltip on first use
+ Wires/tags mirror correctly; text stays readable

## m12-overlay-examples
- [high] Card meta "6 parts · 5 nets · best 8x9" is mono #484f58 on #21262d = 1.84:1 and uses middots -> #8b949e, "6 parts, 5 nets, best 8x9"
- [mid] X at y=73 vs title at y=58: 8px misaligned -> align centre, 44x44 X
- [mid] The 3-line description pushes the first card down; last card cut mid-text without fade -> one line: "Loads unconnected. Undo restores your board."
- [mid] Preview strip has a faint green radial gradient/glow -> flat #0d1117
- [mid] Pills "Starter" (green outline), "Classic" (blue outline): two colours for a category -> one neutral pill
- [low] Cards ~250px tall, 2.3 per screen -> preview 96px so 3 fit
+ Previews show the finished layout (sells the tool); 17px titles are good

## m13-overlay-library-curated
- [mid] Header: "Component library" + outlined blue "From a photo" (40px) + X (~24px) in one row -> X 44px, move "From a photo" below the search
- [mid] Search placeholder is monospace ("Search: ESP32, DIP-8, relay…"); other inputs are sans; field 42px -> sans, 44px, drop "Search:"
- [high] Chip counts (1162, 16, 43) are #484f58 on #21262d = 1.84:1 -> #8b949e
- [mid] Chip row 40px, scrolls horizontally, first/last chips cut at the edge, no 16px inset, no fade -> padding-inline 16px + mask
- [high] Meta "30-pin · 30 pins · body 10x21 · Curated": middots, redundant "30-pin / 30 pins", "Curated" brighter than the rest -> "30 pins, body 10x21" + a real "Curated" pill
- [mid] KiCad licence footer is fixed at the bottom (~75px, 9% of the screen) -> move to a "Credits" link at the end of the list
- [mid] Thumbnails 52x40 on near-black with ~3px detail -> 56x56
+ Row height 62px, one tap per part, 17px bold names: thumb-friendly

## m13-overlay-library-scrolled
- [mid] Long KiCad names wrap at hyphens ("TO-92-" / "2_W4.0mm_Horizontal_FlatSideDown") -> overflow-wrap:anywhere, 2-line clamp, put the variant in the meta
- [mid] Category ("Transistors & regulators") wraps to a second line on every row -> hide when a chip is selected
- [low] Pinned header+search+chips ~225px, list clipped under it without a divider -> 1px divider

## m13-overlay-library-category
- [mid] Chip row is scrolled so "All 1162" is cut at x=0 and the active chip touches the right edge -> 16px inset
- [mid] Titles like "Sanyo_STK4xx-15_59.2x8.0mm_P2.54mm" wrap in file-name style -> "Sanyo STK4xx-15" + "59.2 x 8.0 mm, 2.54 pitch"
- [low] "ICs (SIP)" brackets, "Modules & dev boards" ampersands: inconsistent chip naming
+ Active chip = blue border + blue text, clear

## m13-overlay-library-search
- [mid] Search field has a 2px blue ring plus a 3-4px outer glow (double ring) -> single 2px ring
- [mid] Matched text is not highlighted -> bold "esp32" in the name
- [low] Clear X ~20px -> 44px hit area
- [low] "4 parts" is 15px grey and sits between chips and list without spacing rhythm

## m13-overlay-library-no-results
- [high] Empty state is "0 parts" and 900px of nothing -> "No part matches 'zzzzqq'" + actions "Clear search", "Draw a new part", "Footprint from a photo"
- [mid] The permanent licence footer is the only other content
- [low] On a real phone the keyboard covers the lower half; place the empty state under the chips, not centred

## m14-overlay-editor
- [high] Cancel / Save are top right (y≈75), the sheet needs ~1.6 screens, no sticky footer -> sticky bottom bar [Cancel] [Save] 48px
- [mid] Header is 2 rows (chip + name + "2-pin" meta, then undo/Cancel/Save), 16 has 1 row -> same header; actions at the bottom
- [mid] Undo, Cancel, Save are 40px -> 44+
- [high] Labels ID / Value / Colour, "BODY", "PINS 2" are #484f58 on #0d1117 = 2.28:1 and uppercase tracked -> #8b949e, sentence case
- [mid] "Pins swappable" is the native white checkbox (26px) -> same switch as in Export
- [mid] "Face out" is a bare dark box, not obviously a button, meaning unclear -> label "Pins face out" with icon
- [mid] Canvas (250px): "J1" label is hidden behind the pin chips -> put it above the body
- [mid] "Spans the pins | Larger housing" segmented in blue fill while Save is green -> one accent
- [mid] Pin rows: colour dot, 55px name field, 220px net field (40px high), trash 22px icon at low contrast -> 44px fields, 44px trash hit area
- [low] "+ Add" has ~12px text, smallest button text in the dialog
- [low] Value "2-pin" duplicates the header description and is not a value
+ Low-chroma brown rings in the editor canvas are calmer than the main board: use on the board too

## m14-overlay-editor-scrolled
- [high] Pixel-identical to 14-overlay-editor: the scroll did not move, so the lower part (pin list, bottom of sheet) was never captured -> check the sheet scrolls (body scroll lock) and re-shoot

## m15-library-add-editor
- [mid] "Back to library" (233px) + "Add to circuit" at top, 40px -> sticky bottom bar [Back] [Add to circuit]
- [high] 30-pin preview has 4-5px pin glyphs and ~6px labels ("EN", "VP", "D22"): unreadable and untappable -> pinch zoom or hide the canvas for library parts
- [mid] Square resize handles on the body (6px) are untappable -> 24px+ on touch
- [mid] 30 repeated "not connected" placeholders and grey dots -> placeholder "net", no dot until connected
- [low] Value defaults to "30-pin", ID to "E1"
+ The two button labels explain the mode well

## m16-overlay-new-part
- [mid] Header is 1 row here, 2 in 14 -> same height
- [mid] Value is an empty field without placeholder -> placeholder "10k, 100nF"
- [mid] ID chip "C7" is red while pin dots are grey; the "C7" label is hidden behind 30px pin chips -> 22px chips, label outside
- [low] "Footprint from photo" and "Picture from photo" are two near-identical full-width buttons -> one "From a photo"
+ Cancel/Save wording is clear

## m17-overlay-photo-pick
- [mid] Header: title, Cancel, disabled "Use footprint" (dim green), all 40px, no X, no step indicator -> constant header
- [mid] "Choose or take a photo" solid green 40px next to a grey "Paste" 40px -> 48px full-width primary + secondary
- [mid] URL field 40px, "Load" disabled 40px -> 44px
- [high] "GOOD PHOTOS" label and tips are #484f58 / dim on #0d1117 (2.28:1) -> #8b949e, sentence case
- [mid] Blank canvas takes ~480px for one icon and 3 controls -> compact drop zone ~240px, tips above the fold
- [low] "From straight above:" ends with a colon before the buttons

## m17-overlay-photo-frame
+ Frame handles are 28px squares with a 40px round rotate handle: the best touch targets in the set; keep
- [mid] Hint chip "Drag inside the frame to move it · outside to move the photo" has a middot and is repeated by the three bullets below -> keep one
- [mid] "Reset frame" and "Other photo" are below the fold
- [mid] Stepper pill "1 — 2" (40px tall) crowds the title -> "Step 1 of 2" text
- [low] Turn slider has 44px rotate buttons (good) but "0°" is 12px dim
+ Photo gets ~600px, controls below: good split

## m17-overlay-photo-pins
- [high] Header wraps into 2 rows on this step (title disappears, stepper centred, Cancel/Use footprint on row 2), canvas jumps ~48px vs step 1 -> fixed one-row header
- [mid] Instruction chip "Tap the first pin of a row" is solid orange -> another hue; use accent or neutral
- [mid] Photo area only ~340px, controls below need scrolling, "Find similar / Row / Align" cut at the fold; primary "Use footprint" top right -> sticky bottom bar
- [mid] Section circles "1 Scale", "2 Pins" clash with the header stepper 1-2 -> number once
- [low] "Cancel measuring" is a full-width 40px grey button that looks primary -> text link
- [low] Disabled "Use footprint" looks like a different button -> same shape, 40% opacity
+ Zoom buttons 42x41 stacked at the right: fine

## m18-overlay-export
- [high] Preview strip above a sheet titled "Export" that starts at y=272 (a third down), X mid-screen -> one full-screen sheet, title first, preview below
- [mid] "TOP VIEW" / "BOTTOM VIEW" uppercase tracked white 15px -> "Top" / "Bottom" 12px grey
- [high] Options stack too long: View, Board & coordinates, Board size, Columns, Rows, Numbers from (4 disabled and dim) -> "Options" accordion, hide disabled
- [mid] Labels VIEW / BOARD & COORDINATES / BOARD SIZE / COLUMNS / ROWS / NUMBERS FROM uppercase tracked; disabled ones at 2.17:1 -> sentence case
- [mid] "Layout 8 x 9 holes · 20.3 x 22.9 mm at 2.54 mm pitch" is a mono middot string with an orphan "pitch" -> "8 x 9 holes, 20.3 x 22.9 mm"
- [mid] "123 | ABC" segmenteds are disabled but look like active controls -> hide until the toggle is on
- [mid] Sticky footer [Download] blue 44px + [Print] grey: content peeks out at the bottom edge (x=545-660, y=1665) -> opaque footer + safe-area padding
- [mid] Download is blue, Save/Add/Share are green -> one primary colour
- [low] "Print" on a phone -> behind "More"
+ Download pinned at the bottom is the right thumb position

## m19-overlay-prompt
- [high] Title "AI prompt guide" vs the button "Get it from your AI" -> one name
- [mid] Footer text says "Circuit → Paste JSON", the drawer shows "Edit JSON" -> same word
- [mid] "RECOMMENDED PROMPT" uppercase tracked -> "Prompt"
- [mid] Code block green mono on black (terminal look), wraps mid-line ("OUT+, OUT-)"") and scrolls inside the scrolling sheet (nested scroll, last line cut) -> neutral grey text, no inner scroll
- [mid] "Copy prompt" is 39px/13px top right; the full-width blue bottom button is "Close" -> bottom primary = "Copy prompt"
- [low] "Close" duplicates the X (24px)
+ Intro is two plain sentences

## m20-overlay-account-signin
- [mid] 95% empty full-screen sheet for one input -> bottom sheet ~40% or centred box
- [mid] "Send link" is dim green disabled (~2.1:1) beside a 42px field, 40px button -> 44px, full width under the field
- [mid] Title has a cloud icon ("Save & share"); menu says "Sign in", signed-in state says "My circuits" -> one name
- [low] Helper 12px grey; "Privacy" 12px underlined link -> 14px / 44px target
- [low] "Without an account everything works as before" is vague -> "Without an account the board stays in this browser."

## m20-overlay-account-after-send
- [mid] "Use another address" is a bare 13px bold grey text, no button look, ~20px high -> 44px text button in the accent colour
- [mid] Green envelope icon is a different hue than the accent -> accent/neutral
- [low] No resend / countdown
+ Short copy, address in bold lets the user spot a typo

## m21-overlay-account-signed-in
- [mid] "Save board" is a 112px green button left-aligned under a full-width field -> field + button in one row, or full-width
- [mid] Row actions don't line up: "Share" x=497, "Link" (blue) x=427, unlink icon only on one row, trash x=687 -> fixed action grid
- [mid] Row 2 shows a filled blue "Link" next to a dim unlink icon: state not named -> "Shared" badge + "Copy link" / "Stop sharing"
- [mid] Name + date + 2 buttons + trash on a 49px row; long names will truncate -> date under the name
- [mid] "Delete account" (dim grey) sits next to "Sign out"; destructive, one miss-tap away -> separate settings row, red, confirm
- [low] Dates mix "11:42 AM" and "Nov 13"
- [low] Share/Link/trash 40px -> 44
+ Title "My circuits" + address makes the account state clear

## m22-confirm-delete-part
- [high] Title "Delete Component" (Title Case, "component") and button "Confirm action" are generic -> title "Delete R1?", buttons "Delete R1" / "Cancel"
- [mid] X in the header AND Cancel -> remove the X
- [mid] Body "Are you sure you want to delete R1?" -> "Its 2 pins and wires go too. Undo brings it back."
- [mid] Destructive button is first (top, under the thumb), Cancel below -> Cancel first or destructive second
- [mid] Centred box (357px wide) on a heavy blur: a 4th modal pattern -> same sheet as the rest
- [low] Buttons 44px, gap 8px: good
+ Backdrop dims the board so the dialog is the focus

## m23-confirm-reset
- [high] Title "Reset Workspace", menu "Reset board", body "Clear all components and wires?" -> "Reset board?", "Removes all parts and wires. Undo brings them back.", button "Reset board"
- [mid] Same issues as 22 (generic button, X + Cancel, Title Case)
- [low] Blurred empty board behind gives context
+ Two buttons only, both 44px

## m24-mobile-action-sheet
- [mid] Title "Menu & Actions" is redundant, Title Case vs "Inspector & stats" -> "Actions" or none
- [mid] Reading order breaks: Undo (col 2) and Redo (col 1, next row) are split; Reroute next to Redo -> group Undo|Redo, Reroute|Clear wires, Share|Export, Sign in|How it works, Reset last
- [mid] "Reset board" is an orphan cell with dark-red fill, empty cell beside it -> full-width row under a divider
- [mid] Icons: Reset uses a rotate-ccw arrow that looks like Undo, Reroute a lightning bolt -> Reset = trash, Reroute = route icon
- [mid] "Reroute" here, "Re-route" in the app notes, "Wire" in the step bar; "Export board" vs "Export" -> one name each
- [low] Undo/Redo have no disabled state -> 40% opacity
- [low] Last row ends 16px from the edge, no visible safe-area inset, no drag handle
+ Buttons 44px, 2 columns, icon + label, bottom sheet in thumb reach

## m25-mobile-drawers-inspector
- [mid] Same as 09-inspector with no net marked: 500px empty below five tiles; same notes (4P tags 1.84:1, blue "NETS" tile, "Board any x any")
- [low] "none" chip next to Component is a grey pill that looks interactive
+ Consistent 86% drawer with a 56px board sliver

## m25-mobile-drawers-parts
- [mid] Header "Parts & Circuit" then sections "Circuit" and "Parts 6" repeat the title -> X only in the header
- [mid] Circuit card: 4 same-level buttons, 3 treatments (Examples green tint, Get it from your AI blue tint, Edit JSON / Open project file grey and dim, look disabled) -> one outline style
- [mid] "6 parts · 5 nets" middot -> "6 parts, 5 nets"
- [mid] "Library" (grey) + "+ New" (solid green, 40px) -> both neutral, 44px
- [mid] Part rows 64px: chip + name + mono value + "2P" tag + 40px square pencil; unclear whether row tap or pencil edits -> row = select, pencil 44px, "2 pins"
- [mid] ID chips (J1 red, R1 green, Q1 navy #3a4fb5 on #1c2140 ≈ 2.5:1) low contrast (known)
- [mid] Footer "Imprint  Privacy  GitHub" 13px dim, ~20px high links -> 44px rows or move to the menu
- [low] "Flyback Diode" row is clipped hard under the footer, no fade
+ 17px bold name over a mono value: good hierarchy

## m26-share-link-loaded
- [mid] Coach "Now press Compact to shrink the board" covers the first board rows, X 18px (the same prompt is also in the result card: known)
- [mid] No sign that this came from a link and no "save a copy" -> one-line banner "Opened from a shared link"
- [low] Board fitted at ~205px on a 390px canvas (see 07)
+ Hash cleared, wired board shows immediately, no first-visit dialog

## m27-share-link-broken
- [high] The error "This share link could not be opened" is nowhere visible; only the "Pick a circuit to start with" dialog shows -> inline error in the dialog: "That share link is damaged. Pick a circuit or paste your own."
- [mid] Footer: "Skip, I'll describe my own circuit" (43px grey) and "How does it work?" (16px blue link, ~20px high) -> link 44px
- [mid] Same list as 12 but different title and text ("Pick a circuit to start with" vs "Example circuits") -> one title
- [mid] Third card is clipped at the footer divider, preview cut in half, no fade
- [low] Description is 3 lines -> one

## m28-circuit-link-standin
- [high] Notice says `X1: "capacitor" is not in the library` while the part is named "capacitor" and its value "ZX-9000 flux" (the library has capacitors) -> "ZX-9000 flux has no footprint. Placed as a 3-pin header: check the pin order."
- [mid] Notice has no action; the fix buttons are 2 taps away in the inspector -> inline "Fix" buttons or tap the part to open them
- [mid] "Check these parts" is blue (info) but the "?" badge and the inspector are amber -> one warning colour
- [mid] Notice is ~105px (12% of the screen) over the board, X 20px -> 44px, auto-collapse
- [mid] "Compacted" card: "Best found · can't go below 135 holes" wraps to 2 lines against the X, middot -> "Best found. Not below 135 holes."
- [mid] Card has 3 buttons (Compact again purple outline, Share link green solid, Export) ~39px high -> 2 buttons + overflow
- [mid] Card top stripe is purple here, gold in 29 -> neutral
- [mid] Stand-in part is tiny: "?" badge 18px, tag 7px, tap target ~28px
- [low] "Compacted" has a green check, "Perfect" a gold trophy: two icon styles
+ Dashed amber outline + "?" make the stand-in recognisable

## m28-circuit-link-standin-parts
- [mid] "stand-in — check pins" amber 12px with a spaced em dash; the row has a dashed border and a dashed teal left stripe -> small amber "Stand-in" pill
- [mid] Row name "capacitor" lowercase next to "Resistor", "Wemos D1 Mini" -> normalise display
- [mid] Footer links as in 25-parts
+ Stand-in row is findable in the list

## m28-circuit-link-standin-inspector
- [high] The three fix buttons in the amber dashed box are 28px high ("Pick from library", "Footprint from a photo", "Keep as pin header"), equal weight -> 44px, one primary
- [mid] "Footprint from a photo" here vs "Footprint from photo" in the editor and "From a photo" in the library -> one string
- [mid] Warning = dashed amber border + icon + amber text (3 signals) -> 1px solid amber left bar
- [low] "Stand-in — check pins. Not in any library, drawn as a plain pin header." repeats the notice
+ Pin names with net names and colour sticks are clear

## m29-circuit-link-auto-running
- [mid] Identical to 29-circuit-link-auto (finished "Perfect" card): the processing bar was missed; auto Wire + Compact must show "Wiring…" / "Compacting…" with Stop -> verify
- [mid] Board sits left and low (centre ~ y=900 device px vs free area centre ~755), 265px of empty copper above -> fit-to-view after the auto run
- [mid] Gold top stripe + trophy + "Perfect" (see 07)

## m29-circuit-link-auto
- [mid] "17 x 9" / "-16 % area" card, "Parts · 4" tab; 4 wire hues on a saturated copper grid: copper is the dominant colour (known)
- [low] User never sees what changed -> "Undo compact" in the card

## m38-landscape-main
+ Single-row header (logo + step bar + menu) leaves ~340px of 390px for the board, ~60% fill: best fit in the set
- [mid] Tool buttons: 2x3 grid at bottom right, 40px each, ~140px tall, cover the right edge -> 1 row of 3 (zoom +/-/fit), rest in the menu
- [mid] Coach mark (300px wide) lies over holes beside the board, X 18px
- [mid] Edge tabs 24px wide x 95px, rotated opposite ways (known)
- [mid] Wordmark ~170px wide with a glow takes a third of the header -> icon only in landscape
- [low] Menu button 40x40

## m38-landscape-main-menu
- [high] Sheet starts at y=78; title + 5 rows are taller than the 390px viewport, "Reset board" is cut in half at the bottom edge with no scroll hint -> scrollable with a fade, or 4 columns in landscape (3 rows)
- [mid] Buttons stretch to 400px each, icon far left, right half empty -> max 220px, 3-4 columns
- [mid] Title "Menu & Actions" + X cost 60px of the 312px available -> no title in landscape
- [low] Same order/icon issues as 24

## phone-wide
- [high] Primary colour is inconsistent: green (Save, Add to circuit, Save board, Send link, Choose photo, Next, Share link, + New), blue (Download, Close, From a photo, segmenteds), purple (Compact again) -> one accent for primary, neutral outlines for the rest
- [high] Four modal patterns on a phone: full-screen sheets (12, 13, 17, 19, 20), centred box (22, 23), bottom sheet (24), 86% side drawers (25), plus Export as a hybrid; X is ~24px everywhere -> one sheet pattern, 44px X top right, primary at the bottom
- [high] Primary actions in the editor/photo dialogs (Save, Add to circuit, Next, Use footprint) are top right at 40px, out of thumb reach, on sheets up to 1.6 screens long -> sticky bottom action bar with safe-area padding
- [high] Dim text #484f58 on #0d1117 / #21262d (1.84-2.28:1) is used for chip counts, 4P/3P tags, card meta, form labels (ID, Value, Colour), "Good photos" tips -> #8b949e (4.9:1+); only placeholders/disabled may be dimmer
- [high] Touch targets under 44px: menu button 40, tool buttons 40, edge tabs 24 wide, drawer/dialog X ~24, result-card buttons 40, editor buttons 40, pin-row trash 22, stand-in fix buttons 28, "Colour rings" segmented 22, inspector rows 26-35 -> every tappable item >= 44px or a 44px hit area
- [mid] UPPERCASE tracked labels spread beyond the known stat tiles: HOLES FOOTPRINT, PARTS/NETS, PINS (2), BODY, VIEW, BOARD & COORDINATES, COLUMNS, ROWS, GOOD PHOTOS, RECOMMENDED PROMPT, TOP VIEW/BOTTOM VIEW -> sentence case, 12px, #8b949e
- [mid] Middot meta strings everywhere ("6 parts · 5 nets", "… · best 8x9", "30-pin • 30 pins • body 10x21 • Curated", "Layout 8 x 9 holes · 20.3 x 22.9 mm", "Solder side · mirrored … · view only", "Best found · can't go below 135 holes"), with two glyphs (· and •) -> commas or separate chips
- [mid] Hues used for state: blue, green (Wire/primary), purple (Compact), gold (Perfect), amber (solder banner, stand-in, mirror), orange (photo hint), teal (cap), red (delete/VCC) -> one accent + one danger; net colours only on the board
- [mid] Glows/gradients: selected part green glow, selected net ring glow, search focus double ring, green radial in example previews, logo glow, backdrop blur on every modal -> 2px solid rings, flat fills
- [mid] Names for the same thing differ: Reset board / Reset Workspace; Export board / Export; Reroute / Re-route; AI prompt guide / Get it from your AI; Save & share / Sign in / My circuits; Footprint from a photo / Footprint from photo; Component / Part; Network / Nets; Paste JSON / Edit JSON
- [mid] Title Case in dialogs ("Delete Component", "Reset Workspace", "Menu & Actions", "Parts & Circuit") vs sentence case elsewhere ("Inspector & stats", "Component library", "Example circuits") -> sentence case
- [mid] Headers differ: X only (12, 13, 19, 20), Cancel only (17), X + Cancel (22, 23), undo + Cancel + Save (14); 1 row vs 2 rows (14 vs 16, 17 step 1 vs 2) -> one header: title left, X right
- [mid] Board canvas at phone zoom: labels 6-7px, pins 10px, holes loudest; tags collide (Power Connector / 100uF, 10k / R1) -> min 9px labels, collision avoidance, dim holes outside the footprint, fit-to-view after every run
- [mid] Edge tabs, tool grid, coach mark, result card and action bar all float over the board; board gets ~545px with the card, tool grid moves when a part is selected -> one fixed layout for floating controls
- [mid] Safe areas: result card 9px from the bottom edge, sheets 16px, sticky footers without visible env(safe-area-inset-bottom) -> padding on every bottom element
- [mid] Empty/error states are thin: no-results (13), broken share link (27, error invisible), stand-in notice (28) -> every error visible with a next action
- [low] Mono used for the search placeholder, net names, values, example meta, prompt, "any" inputs; sans for most other inputs -> mono only for values/IDs
- [low] Icons: one outline set, except the filled trophy and check in the result card and the amber "?" badge -> one set
- [low] Capture gaps: 14-scrolled equals 14 (no scroll), 29-running equals 29-auto, 07-running has no progress bar -> re-shoot
+ Part-row hierarchy (17px bold name, mono value, tag, edit icon) and 44px net tiles with colour stripe are good patterns
+ Bottom-sheet menu items are 44px with icon + label
+ Landscape single-row header and the 44px rotate buttons in the photo dialog are the right sizes to copy
