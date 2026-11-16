# Static pages audit (desktop 1440, mobile 390). Values from scripts/site.css.

## d31-page-how-it-works (hub)
- [mid] Hub h1 "Your AI designs the circuit. boardroute lays it out." is word-for-word card 1 and the first TOC entry; the page never calls itself "How it works" -> h1 "How boardroute works", one-sentence lead, card 1 gets its own title.
- [mid] Heading letter-spacing -0.03em on Outfit 800 (.hero h1) squeezes word gaps: "designsthecircuit" reads as one word -> font-weight 700, letter-spacing -0.01em, word-spacing 0.05em.
- [mid] Lead paragraph (1.15rem, centered) is 4 lines on desktop, 8 lines on mobile, centered -> text-align left on mobile; max-width 60ch.
- [low] Mobile h1 breaks "Your AI designs the / circuit. / boardroute lays it out." with an orphan -> text-wrap: balance, or each sentence in a display:block span.
- [low] Cards: 8 cards in 3 columns leave an empty cell in row 3; hover translateY(-2px), radius 14px -> 2 columns (minmax(360px,1fr)), drop translateY (keep border-color change), radius 8px.
- [low] Green number badge (28px circle, bg4) is decoration -> plain txt2 number before the title, or remove.
- [low] Figure caption "Try this circuit in the autorouter ->" is 0.88rem blue inside grey text, easy to miss -> button-style secondary link below the figure.
- [mid] Copy "Every AI assistant knows thousands of parts ... boardroute is that missing half" is a pitch -> "Describe a circuit as JSON (your AI can write it). boardroute places the parts on a perfboard, routes every connection without crossings and shrinks the board."
+ Hero figure is the real product output (555 blinker, 8x7 holes), shows what the tool does in one screen. Keep.
+ Card descriptions are short and concrete.

## d32-page-article
- [high] Line length: .prose max-width 740px at 17px gives about 85-90 characters per line ("You describe your parts and which pins belong together. boardroute decides where" is 83) -> max-width 38rem (about 650px, 70ch).
- [mid] Double rule under "In short": hr plus h2 border-top, with 2.2em margin and 0.6em padding, gives two lines ~100px apart with an empty band -> remove `.prose h2 { border-top; padding-top }`, use margin 2.4em 0 0.6em; keep hr only where authored.
- [mid] Every h2 carries a rule; reads like a ledger -> same fix, spacing only.
- [mid] Uppercase tracked labels: .toc-title ("HOW IT WORKS", "ON THIS PAGE", 0.75rem, 0.08em) and .pager span ("PREVIOUS", "NEXT", 0.78rem, 0.06em) -> sentence case, 0.85rem txt2, no text-transform.
- [mid] Middle-dot meta "How it works · Part 2 of 8" (.crumbs) -> "How it works / Part 2 of 8", first item a visible link.
- [mid] In-text links are #58a6ff on #b1bac4 text, no underline: only hue differs -> `.prose a { text-decoration: underline; text-underline-offset: 3px; text-decoration-color: rgba(88,166,255,.45) }`.
- [mid] "-> Can your circuit be built on one layer?" arrow links wrap badly on mobile and are glued to the end of FAQ sentences -> own line, "Read: Can your circuit be built on one layer?", no arrow glyph.
- [high] Mobile board figure: svg is ~330 CSS px wide so pin numbers and labels ("C2 10nF", "J1 Power") render at ~6-7px, unreadable -> `figure.board svg { min-width: 480px }` inside an overflow-x:auto wrapper, or at least a "Open this circuit in the autorouter" link under it; raise label font size in the figure renderer.
- [low] figure.board `filter: drop-shadow(0 8px 28px rgba(0,0,0,.55))` is a halo on a near-black page -> remove; the board has its own border.
- [mid] h3 is 1.2rem (20px) against 17px body ("1. Check whether it's possible at all" reads as bold body) -> 1.3rem/600, margin-top 2em.
- [low] h1 2.7rem/46px: 2 lines desktop, 4 lines mobile for "From circuit to perfboard: how boardroute finds a compact layout" -> mobile clamp(1.6rem, 7vw, 2.7rem) and shorter title.
- [mid] Mobile: TOC hidden under 900px (`display:none`), the 8-article series has no navigation except pager and footer -> `<details><summary>On this page</summary>` above the article, 44px summary.
- [low] Pager on mobile: 2 cards side by side, "Your AI designs the circuit, boardroute lays it out" wraps to 4 lines -> single column under 640px.
- [low] `.try` box uses `linear-gradient(135deg, green .16, blue .08)` plus green border -> flat var(--bg2), 1px var(--border); the green button stays the only color.
- [low] `pre code { letter-spacing: .15em }` (made for ASCII boards) spreads every code block -> only for ASCII-board blocks.
- [low] "In short" is a bold line, not a heading, bullets are body size -> callout: bg2, 1px border, radius 8px, 0.95rem.
- [low] Copy: "tells you which parts are to blame instead of searching forever" -> "names the parts that make it impossible".
+ Sticky TOC with current page marked by green 2px bar plus "On this page" list: clear.
+ Body 17px/1.7, paragraph margin 1.1em comfortable; h1/h2 scale 46/28px has clear steps.
+ Numbered rules with bold lead-ins ("Wires can't cross.") skim well.
+ Prev/next pager and closing "Try it yourself" CTA give a clear route into the app.

## d33-page-article-faq
- [high] "Is the result optimal?" answer is one paragraph of ~14 lines (about 1,000 characters) -> 3 short paragraphs: answer first ("Sometimes provably, often not."), then the lower bound, then the 555 example.
- [mid] "Where do the parts in the Library come from?" is ~11 lines with licence text inside -> separate "Credits" line.
- [mid] 16 questions ungrouped, no question list; TOC shows articles, not questions -> h2 groups ("Layouts and jumpers", "Library and parts", "Your data") shown in the right TOC.
- [mid] Question h3 (1.2rem/600) is the same weight as bold in answers -> 1.25rem, margin-top 1.8em.
- [low] Answers end with " -> Overview" inline; wraps mid-sentence on mobile (see d32).
- [low] Straight quotes around "cannot be built on one layer" / "no fully routed layout found" -> typographic quotes or code style for exact UI messages.
- [low] Breadcrumb "Part 7 of 8" for a FAQ -> just "How it works".
+ Questions are phrased like users ask ("Can I avoid jumpers?"); answers start with the answer.
+ "Does my circuit leave my computer?" is direct.

## d34-page-parts (index)
- [mid] Entries run name and detail together: "ESP32 DevKit V1 30-pin, 30 pins", "Wemos D1 Mini ESP8266, 16 pins" read as one phrase; "30-pin, 30 pins" is redundant -> row with link left, detail right in txt2 0.9rem ("ESP8266, 16 pins"), min-height 44px, border-bottom var(--border).
- [mid] No count or search: ~1,150 footprints exist in the app, the index shows 21 -> "21 parts with pinouts here. The app library has about 1,150 footprints." plus link "Search the library in the autorouter".
- [mid] Section h2s have border-top and ~100px of space -> 56px, no rule.
- [low] Intro mentions parts.txt and llms.txt unexplained -> "Plain-text list for AI assistants: parts.txt. How to write a circuit: llms.txt."
- [low] Mobile rows ~34px tall and "ESP32-C3 SuperMini ESP32-C3, 16 / pins" leaves an orphan word -> 44px rows, detail on its own line on narrow widths.
+ Grouped by category with plain headings; h1 says exactly what the page is.

## d35-page-part (Wemos D1 Mini)
- [high] Pin table "# | Pin name" is 50/50 width over 650px with 16 rows and no other information; it repeats the figure -> add a "Function" column (D1 = GPIO5, SCL ...), `#` column 3rem, or two side-by-side lists like the real board.
- [mid] Footprint figure: pin labels are ~11px on desktop and ~8px on mobile in dark pills; 5 empty hole rows above the pins are unexplained -> labels 12px minimum, caption "Green outline is the part body; wires can run under it" (if true).
- [mid] JSON example: every array element on its own line (28 lines for 3 connections) plus letter-spacing .15em -> one connection per line (`["U1.A0", "R1.1"],`), ~8 lines; add a 44px copy button top right.
- [mid] "Open in boardroute ->" is a plain text link below the code, but it is the page's purpose -> green `.cta` button "Open this circuit in the autorouter", also right under the figure.
- [low] Breadcrumb "Parts · Microcontroller boards": middle dot, items do not look like links -> "Parts / Microcontroller boards", underlined.
- [low] Intro `Write it as "Wemos D1 Mini" in the "parts" of a boardroute circuit` has double straight quotes -> "Use `Wemos D1 Mini` as the part name in your circuit."
- [low] Pin chips ~13px on mobile -> 0.95rem.
- [low] No size line -> add "9 x 16 holes at 2.54 mm".
+ Footprint SVG next to the pin list is what someone searching "D1 Mini perfboard pinout" needs; pin names in monospace are right.

## d36-page-privacy
- [high] Measure: legal-page max-width 780px at 17px = about 90 chars/line -> 38rem (70ch).
- [mid] "The sign-in link is sent by Brevo ..." is 9 lines with five facts (Brevo, sharing, IP rate limit, deletion, legal basis) -> short list; "Legal basis: Art. 6(1)(b) GDPR" as its own txt2 line per section.
- [low] No "Last updated" date -> txt2 line under h1.
- [low] Rules above each h2 make 7 sections feel like 4 screens -> no rules, margin 2em.
- [low] Cookie names `__Host-br_session` in pills taller than the line -> `line-height:1`, padding 0 .3em.
+ "Short version:" lead, concrete numbers (14 days, 180 days, 20 minutes), no hedging: good copy.
+ Plain h1/h2 only, no decoration.

## d37-page-imprint
- [mid] Address runs together on one line: "Florian Schneider c/o Online-Impressum.de #37276 Europaring 90 53757 Sankt Augustin Germany" -> one line each (name / c/o / street / postcode city / country).
- [low] Mobile breaks "§ / 18 (2) MStV" -> non-breaking space after §.
- [low] 780px measure (~90 chars) -> 38rem.
- [low] Footer repeats "Imprint · Privacy" with a middle dot on this very page.
+ Short, complete; mailto link visibly blue.

## Header / footer (all pages)
- [mid] Mobile header is two rows (~112 CSS px: logo + CTA, then nav), sticky with blur, covers 13% of an 844px screen while reading -> position: static under 640px, or one row with nav moved to footer.
- [mid] Nav shows no current page (on FAQ, "FAQ" is not marked) -> aria-current, txt0 colour, 2px green underline.
- [mid] Footer: logo/tagline top-left, "PARTS" top-right, "HOW IT WORKS" below-left, empty right half -> one row, three columns (Product / How it works / Legal).
- [mid] Uppercase tracked footer headings `.site-foot h4 { text-transform: uppercase; letter-spacing: .06em }` -> sentence case 0.9rem/600.
- [low] "Imprint · Privacy" with middle dot -> two links in a list.
- [mid] Footer has no GitHub link and no "Open the autorouter" link, the app footer has Imprint, Privacy, GitHub -> add both.
- [mid] Tagline "Free perfboard autorouter that runs in your browser. Nothing is uploaded." contradicts privacy page/FAQ (signed-in users save circuits on the server) -> "Free perfboard autorouter. Runs in your browser; circuits stay on your device unless you save them to an account."
- [low] Header `rgba(13,17,23,.88)` + `backdrop-filter: blur(12px)` -> solid var(--bg2); app header is flat.
- [low] CTA label "Open the autorouter ->" carries a text arrow -> drop the arrow.
+ CTA always visible in the header, solid green #238636, 8px radius, same as the app's primary button.
+ Logo artwork (board tile + "route") identical to the app.

## site-vs-app
+ Same logo, same palette tokens (--bg0 #05070a, --bg2 #0d1117, green #238636, blue #58a6ff), Outfit headings + Inter body, copied from src/index.css: the pages read as the same product at first glance.
- [mid] Site is cold blue-grey; the app's identity is the warm copper board and logo, which the site uses only inside figures -> keep roles: green = primary action, blue = links, copper only in logo/figures. Add no further accent.
- [mid] Radii differ: app buttons ~8px, site cta 8px, table-wrap/pre 10px, try box 12px, cards 14px, code 5px -> one scale: 8px containers, 4px inline code.
- [mid] Effects only on the site: backdrop blur header, gradient .try, figure drop-shadow, card hover translateY -> remove all four.
- [mid] Uppercase tracked labels on the site (toc-title, pager span, footer h4) -> sentence case; the app's stat tiles "PARTS/NETS/HOLES" use the same pattern, align in the app audit.
- [mid] Middle-dot meta: "Part 2 of 8", "Parts · Microcategory", "Imprint · Privacy"; the app has "6 parts · 5 nets" -> " / " in breadcrumbs, separate footer links, "6 parts, 5 nets" in the app.
- [mid] Navigation is one-way in practice: site header CTA opens the app, but the app reaches the pages only through a book icon (no label) and a footer of Imprint/Privacy/GitHub; the site logo's target is not obvious -> title "How it works" on the app's book icon; site logo links to the app (and say so with title="Open the autorouter") or to the hub, not ambiguous.
- [low] Heading weight: site Outfit 800 with tight tracking vs app headings 600-700 -> max 700 on the site.
- [low] Copy tone: app is short and imperative ("Next: press Wire to connect everything"); site pitches ("the missing half") -> bring the site to the app's plain tone.
