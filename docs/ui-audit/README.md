# UI/UX-Audit boardroute.com (2026-11-16)

Grundlage: 124 Screenshots von 72 Zuständen der Live-Seite (Desktop 1440×900, Handy 390×844, Querformat 844×390), aufgenommen mit `tools/ui-shots.mjs` (Zweig `feat/ui-screenshots`) gegen https://boardroute.com, Stand `deploy/live-20261104`. Alle Code-Hinweise beziehen sich auf diesen Zweig, nicht auf master, der weit dahinter liegt.

Maßstab: die Skills `frontend-design` und `unslop`. Florians Vorgaben: Farben, Zustände und Wortwahl vereinheitlichen, die abgestimmten Desktop-Größen behalten, in kleinen Schritten vorgehen.

Ergänzt den älteren Audit auf dem Zweig `docs/ui-audit` (`docs/ui/AUDIT.md`). Der zählt aus dem Code alle Knopf-, Eingabe- und Radius-Varianten auf; das wird hier nicht wiederholt. Ein Punkt dort widerspricht diesem Audit: Er schlägt als Norm Beschriftungen in Großbuchstaben mit Sperrung vor („11px, 700, uppercase“). Hier gilt Satzschreibung.

Anhang:

- `notes/main-screens.md`: Hauptbildschirm, Beispiele, JSON, Wire, Compact (selbst angesehen)
- `notes/desktop-dialogs.md`: alle Dialoge am Desktop, mit Querschnitt
- `notes/mobile.md`: alle Handy- und Querformat-Zustände, mit Querschnitt
- `notes/pages.md`: statische Seiten (How it works, Teile, Datenschutz, Impressum)
- `shots/`: 24 Schlüssel-Screenshots in halber Auflösung. Die volle Serie erzeugt `node tools/ui-shots.mjs --url https://boardroute.com --out <ordner>`.

Schwere: **hoch** = stört die Bedienung oder lässt die App beliebig wirken, **mittel** = sichtbare Uneinheitlichkeit, **niedrig** = Feinschliff.

---

## 1. Gesamteindruck

Das Produkt hat etwas, was die meisten Werkzeuge nicht haben: ein echtes Material. Die verdrahtete Platine mit farbigen Leitungen, Pins und Bauteilrahmen ist präzise und schön, die Beispielkarten zeigen echte Ergebnisse, und das Kupfer-Logo kommt aus dieser Welt. Das ist der Moment, um den herum alles andere leiser werden muss.

Die Hülle um diesen Moment ist dagegen laut und zusammengesetzt:

1. **Die Grundfarben sind GitHubs Dark-Theme, eins zu eins** (`#0d1117`, `#161b22`, `#21262d`, `#238636`, `#1f6feb`, `#58a6ff`, `#8b949e`, `#484f58` in `src/index.css`). Wer GitHub kennt, erkennt es sofort. Das ist der Hauptgrund für den Eindruck „Entwicklerwerkzeug von der Stange“.
2. **Das Lauteste auf dem Bildschirm ist der Hintergrund.** Die Kupferringe füllen die ganze Arbeitsfläche in voller Sättigung, auch weit außerhalb der Platine. Bauteile, Luftlinien und Leitungen müssen dagegen ankämpfen.
3. **Jeder Zustand hat eine eigene Farbe.** Load blau, Wire grün, Compact lila, Perfect gold, Warnungen amber, Foto-Hinweis orange. Primärknöpfe sind je nach Dialog grün, blau oder lila. Dazu kommen die Netzfarben auf der Platine. Es gibt keinen Akzent, nur Bunt.
4. **Typische Generator-Merkmale:** Beschriftungen in Großbuchstaben mit Sperrung (`PARTS`, `HOLES FOOTPRINT`, `BODY`, `RECOMMENDED PROMPT`, 11 Stück allein im Export-Dialog), Meta-Zeilen mit Mittelpunkt („6 parts · 5 nets · best 8×9“), Leuchtränder bei Auswahl und Compact, ein Funkel-Icon vor „Get it from your AI“, pulsierende Schritt-Knöpfe, Fett 700–800 für fast jede Überschrift.
5. **Gleiches heißt verschieden.** Reset / Reset Workspace / Reset Project / Reset board; Reroute / Re-route; Clear (Leitungen weg) und Clear (JSON leeren); Share / Share link / Link; „Get it from your AI“ öffnet „AI prompt guide“; Component / Part; Network / Nets.

Zahlen aus dem Live-Code: rund 30 verschiedene fest geschriebene Schriftgrößen in drei Einheiten (px, rem, em), 13 Eckenradien, 54-mal `font-weight` 700–900, 19-mal `transition: all`, 77-mal `!important`, 29 eingebettete `<style>`-Blöcke. Die gemeinsamen Bausteine `src/components/ui/` (`Button`, `IconButton`, `ModalShell`, `Checkbox`, `SectionLabel`) liegen auf dem Live-Zweig, werden aber von keiner einzigen Komponente benutzt.

---

## 2. Fehler (unabhängig von der Gestaltung)

| # | Schwere | Fehler | Beleg | Ursache / Vorschlag |
|---|---|---|---|---|
| F1 | hoch | Kaputter Share-Link: Ein Erstbesucher sieht die Fehlermeldung nie. Darüber liegt der Beispiel-Dialog. | `shots/d-27-share-link-broken` | `App.jsx`: Der Effekt für den Erstbesuch überspringt die Beispiele nur bei `shareState === 'done'`, nicht bei einem Fehler. Wer einen Link zugeschickt bekommt, ist meist Erstbesucher. Fix: bei fehlgeschlagenem Link keine Beispiele öffnen. |
| F2 | hoch | Platine am Handy winzig: nach dem Laden, nach Compact und nach einem automatischen Lauf. Sie nimmt etwa 200 von 390 px ein, Beschriftungen haben 6–7 px. | `shots/m-02-…`, `m-07-after-compact` | Der Zoom wird nach dem Lauf nicht neu angepasst (der alte Audit sah das schon beim Laden). Fix: nach jedem Laden und jedem Lauf einpassen. |
| F3 | mittel | Der Hinweis zeigt den falschen Schritt: Nach „Delete all wires“ und bei einem geöffneten Share-Link steht „Now press Compact“, obwohl Wire dran ist bzw. nichts. | `notes/desktop-dialogs.md` d26, d30 | Der Hinweis folgt nicht dem tatsächlichen Zustand. |
| F4 | mittel | Querformat: Das Menü ist unten abgeschnitten, „Reset board“ halb sichtbar, kein Scroll-Hinweis. | `shots/l-38-landscape-main-menu` | Die Liste braucht eine maximale Höhe und eigenes Scrollen. |
| F5 | mittel | Export-Vorschau: Beschriftungen überlappen („100uFPower Connector“). | `shots/d-18-overlay-export` | Beschriftungen im Export ohne Kollisionsprüfung. |
| F6 | niedrig | Der Stand-in-Hinweis nennt laut Handy-Notizen das falsche Teil („capacitor“ statt „ZX-9000 flux capacitor“). | `notes/mobile.md` m28 | Noch nachzuprüfen. |
| F7 | niedrig | Der Klick auf ein Netz dimmt die anderen Netze nicht; die Auswahl ist nur ein Leuchtrand. | `shots/d-09-net-selected-board` | Siehe Paket 3. |

Drei Aufnahmen des Werkzeugs zeigen nicht, was sie sollen: `14-overlay-editor-scrolled` ist gleich `14-overlay-editor`, und `29-…-running` sowie `07-after-compact-running` (Handy) zeigen keinen Fortschrittsbalken. Das gehört ins Werkzeug, nicht in die App.

---

## 3. Befunde pro Bildschirm

Nur die wichtigsten; alles weitere steht im Anhang.

### Hauptbildschirm Desktop (`d-02`, `d-06`, `d-07`)

- **hoch** · Kupferlöcher in voller Sättigung über die ganze Fläche. → Löcher außerhalb des Platinenumrisses auf etwa 35 % Deckkraft, innerhalb voll. Dann leuchtet genau die Platine.
- **hoch** · Primärfarbe wechselt mit dem Schritt: Compact-Knopf lila mit Leuchten, „Share link“ grün, „Load circuit“ blau. → Ein Akzent für jede Hauptaktion (Abschnitt 4).
- **mittel** · Schrittleiste Load/Wire/Compact: der gesperrte Schritt „Compact“ hat etwa 15 % Kontrast und ist praktisch unsichtbar. Jeder Schritt trägt eine eigene Farbe. → Gesperrt mit 40 % Deckkraft, erledigte Schritte neutral mit Haken, der nächste Schritt im Akzent, kein Pulsieren.
- **mittel** · Rechte Symbolgruppe Wolke / Teilen / Buch / Zurücksetzen ohne Beschriftung, „Zurücksetzen“ direkt neben „Docs“. → Tooltips gibt es; zusätzlich Zurücksetzen von den anderen absetzen (Abstand oder ins Menü), Buch als „How it works“ beschriften.
- **mittel** · Kreis-Karte links: vier gleich breite Knöpfe in drei Farben (grün Examples, blau „Get it from your AI“ mit Funkel-Icon, zweimal grau). Darunter „+ New“ in sattem Grün als zweites Grün. → Ein Knopf gefüllt (die häufigste Aktion), der Rest ruhig; Funkel-Icon durch ein schlichtes Symbol ersetzen (z. B. Text- oder Chat-Symbol).
- **mittel** · Teile-Zeilen tragen vier Farbsignale: farbiger linker Rand, farbiger ID-Chip, „2P“-Chip, Stift-Kasten. Q1 in Dunkelblau auf Dunkel hat etwa 1,8:1 Kontrast. → Ein Signal: der kleine Farbpunkt des Bauteils oder der linke Rand, ID in normaler Textfarbe, „2 pins“ als ruhiger Text, Stift ohne eigenen Kasten.
- **mittel** · Rechte Kacheln PARTS/NETS/HOLES/WIRE in Großbuchstaben mit Sperrung, die „5“ blau. Die Ergebniskarte wiederholt dieselben Zahlen direkt daneben. → Satzschreibung, alle Zahlen gleiche Farbe; die Karte zeigt nur, was sich geändert hat.
- **mittel** · Netzliste VCC/GND… in Versalien, Mono, fett, mit farbigem Balken und „4P“-Chip. → Netzname normal gesetzt (Mono ist hier vertretbar, aber 500 statt fett), Farbpunkt statt Balken, „4 pins“ als ruhiger Text.
- **niedrig** · Logo: Kupfer-Wortmarke mit Schlagschatten/Leuchten, daneben das dünne „route“. → Schatten weg; die Wortmarke trägt sich selbst.
- **niedrig** · Ergebniskarte: „HOLES FOOTPRINT“ / „HOLES OF WIRE“ sind unklar und in Versalien; „–38 %“ mit Leerzeichen (deutsche Schreibweise) in englischer Oberfläche. → „Board 12 × 6 holes“, „Wire 23 holes“, „38% smaller“.
- **+ behalten:** die verdrahtete Platine selbst, die Werkzeugspalte rechts unten in Größe und Lage, der Hinweis „Next: press Wire“ als Idee.

### Erstbesuch / Beispiele (`d-01`, `m-01`)

- **mittel** · Drei Abzeichen-Farben (Starter grün, Classic blau, Bigger amber) als Pillen. → Ein neutrales Abzeichen oder nur Text.
- **mittel** · Meta-Zeile in Mono mit Mittelpunkten, am Handy etwa 2:1 Kontrast. → „6 parts, 5 nets, smallest 8 × 9“ in Sans, sekundäre Textfarbe.
- **mittel** · Vorschauen sehr unterschiedlich groß (Reihe 2 winzig), auf grünem Radialschimmer. → Einheitlicher Maßstab oder auf Kartenhöhe eingepasst, flacher Hintergrund.
- **niedrig** · „Skip, I'll describe my own circuit“ als riesiger grauer Balken, „How does it work?“ als kleiner blauer Link daneben. → Beide als ruhige Textknöpfe in einer Zeile.
- **+ behalten:** die echten Vorschauen, Titel und Untertitel.

### JSON-Editor (`d-05`, `m-05`)

- **mittel** · „Load circuit“ blau gefüllt, sonst nirgends blau als Primärfarbe.
- **mittel** · Fehlermeldung im Fuß abgeschnitten („… (line …“), keine Markierung im Text. → Zeile/Spalte vollständig, Zeile im Editor markieren.
- **mittel** · „Clear“ im Kopf leert das JSON, „Clear“ in der Kopfleiste löscht Leitungen. → Hier „Empty“ oder Papierkorb-Symbol mit Tooltip.
- **niedrig** · Am Handy jedes Array-Element auf eigener Zeile: `"offset": [0, 1]` belegt vier Zeilen, ein Bauteil 30 Zeilen. → Kurze Zahlen-Arrays einzeilig formatieren.
- **+ behalten:** die Statuszeile „Valid JSON, 6 parts, 5 nets“ in Grün.

### Dialoge im Vergleich (`d-13` bis `d-23`)

Aus `notes/desktop-dialogs.md`, Abschnitt `cross-dialog`:

- **hoch** · Fünf Kopf-Varianten: nur Titel + X; Titel + Knopf + X; Symbol + Titel + Linie + X; Chip + Titel + Mono-Meta + drei Knöpfe ohne X (Bauteil-Editor); Teilename + kleiner Untertitel + Schrittleiste ohne X (Foto). Export hat gar keinen Kopf. → Ein Kopf: Titel in Satzschreibung, optional eine Zeile Zusatz, X rechts (32 px Trefferfläche).
- **hoch** · Primärknopf: grün, blau oder gedämpftes Grün, das deaktiviert wirkt („Use footprint“); oben rechts (Editor, Foto), unten rechts (Prompt, Bestätigen) oder unten links halb breit (Export); 34–56 px hoch. → Akzentfarbe, unten rechts, 36 px; Editor und Foto dürfen oben rechts bleiben, wenn es alle Werkzeug-Dialoge so machen.
- **hoch** · Prompt-Dialog: Die eigentliche Aktion „Copy prompt“ ist ein kleiner umrandeter Knopf, der laute blaue Knopf unten heißt „Close“. → „Copy prompt“ wird der Primärknopf, „Close“ entfällt (X reicht).
- **hoch** · Bestätigen: „Delete Component“, „Reset Workspace“ in Title Case, Knopf „Confirm action“, Text „Are you sure…?“. → „Delete R1?“ / Knopf „Delete part“; „Reset the board?“ / Text sagt, was verloren geht / Knopf „Reset board“.
- **mittel** · Export: 11 Versal-Beschriftungen, vier Segmentschalter von 52 bis 90 px Breite, rund 300 px deaktivierte Optionen, „Download“ eingeklemmt am unteren Rand. → Deaktiviertes ausblenden statt grau zeigen, Segmentschalter gleich hoch, Download unten rechts mit Luft.
- **mittel** · Bibliothek: 20 Kategorie-Chips in fünf Reihen, gewählter Chip nur blau umrandet; drei verschiedene Blau im Kopf; leere Suche zeigt nur „0 parts“. → Chips einzeilig scrollbar oder als Auswahl; gewählter Chip gefüllt; leerer Zustand bietet „Draw it yourself“ und „From a photo“ an.
- **mittel** · Bauteil-Editor: drei Kopfknöpfe in drei Stilen, native weiße Checkbox, „BODY“/„PINS“ in Versalien. Foto-Dialog: zwei Nummerierungen (Schrittleiste und Abschnitte „1 · SCALE FROM ONE ROW“), oranger Hinweis-Pill, native `<select>`.
- **mittel** · Auswahl mit Leuchtrand (grün oder rot, 3–4 px), dreifach: Platine, Teile-Zeile, Netz-Zeile. → 2 px durchgehender Rand im Akzent, ohne Leuchten; andere Netze abdunkeln.
- **niedrig** · Sieben Dialogbreiten (318 bis 1200 px) ohne Raster. → Drei Breiten: klein 440, mittel 720, groß 1120.
- **+ behalten:** das Gerüst Kopf / Linie / Inhalt / Linie / Fuß von Prompt, Konto und Bestätigen als Vorlage; die Live-Vorschau im Export; der Editor-Kopf mit Chip, Name und Maßen; der gestrichelte Stand-in mit „?“.

### Handy (`m-*`, `l-*`)

Aus `notes/mobile.md`, Abschnitt `phone-wide`:

- **hoch** · Trefferflächen unter 44 px fast überall: Menü 40, Werkzeuge 40, Randreiter 24 breit, X etwa 24, Mülleimer in Pin-Zeilen 22, „Colour rings“ 22, Stand-in-Knöpfe 28.
- **hoch** · Editor und Foto: „Save“, „Add to circuit“, „Next“, „Use footprint“ oben rechts auf Blättern, die 1,6 Bildschirme lang sind. → Feste Aktionsleiste unten mit Abstand zum Home-Balken.
- **hoch** · Graue Schrift `#484f58` auf `#0d1117`/`#21262d` (1,8–2,3:1) für Zähler, Pin-Chips, Karten-Meta, Feldbeschriftungen, Foto-Tipps. → Mindestens die sekundäre Textfarbe.
- **mittel** · Vier bis fünf Muster für Dialoge: Vollbild-Blatt, zentrierte Box, Blatt von unten, Seitenschublade 86 %, Export als Mischform. → Ein Vollbild-Blatt mit gleichem Kopf; Bestätigen als Blatt von unten.
- **mittel** · Randreiter „Parts · 6“ (von unten nach oben) und „Inspector“ (von oben nach unten) gegenläufig gedreht. → Beide gleich herum, oder als zwei Knöpfe in der Werkzeugleiste.
- **mittel** · Über der Platine schweben Randreiter, Werkzeugraster (6 × 52 px), Hinweis, Ergebniskarte; das Raster springt bei Auswahl an eine andere Stelle. Hinweis „Now press Compact“ und lila Compact-Knopf in der Karte sagen gleichzeitig dasselbe. → Feste Anordnung; Hinweis ausblenden, solange die Karte dieselbe Aktion anbietet.
- **mittel** · „Parts & Circuit“ als Schubladen-Titel, darin zuerst „Circuit“: doppelte Überschrift, Reihenfolge verkehrt.
- **+ behalten:** Zeilen im Menü-Blatt (44 px, Symbol + Text), Querformat-Kopf in einer Zeile, 44-px-Drehknöpfe im Foto-Dialog.

### Statische Seiten (`d-31` bis `d-37`)

Aus `notes/pages.md`:

- **hoch** · Zeilenlänge 85–90 Zeichen (`.prose` 740 px bei 17 px). → `max-width: 38rem` (etwa 70 Zeichen).
- **hoch** · Platinen-Abbildungen am Handy etwa 330 px breit, Pins mit 6–7 px. → Waagrecht scrollbar ab 480 px Mindestbreite, oder Link „Open in boardroute“ direkt darunter.
- **mittel** · Zierrat, den die App nicht hat: unscharfer Kopf, Verlaufskasten `.try`, Schatten unter Abbildungen, Hochheben der Karten beim Überfahren, Linie über jeder h2, Versal-Beschriftungen, Mittelpunkte. → Alles weg.
- **mittel** · Fußzeile sagt „Nothing is uploaded“, die Datenschutzseite beschreibt Speichern mit Anmeldung. → Satz anpassen.
- **+ behalten:** Logo, Schriften und Farben stimmen mit der App überein; die gezeichneten Platinen in den Artikeln.

---

## 4. Gestaltungsrichtung

Nach `unslop` in fünf Zeilen:

- **Produkt:** Legt eine Bastelschaltung auf Loch- oder Streifenraster im Browser aus: verdrahten, verkleinern, ausdrucken. Für Leute, die gleich danach den Lötkolben nehmen.
- **Charakter:** genau, werkbankruhig, ein wenig warm.
- **Welt:** die Werkbank unter der Lampe: Platinenmaterial, verzinnte Kupferpads, Lötdraht, ein Messschieber. Nicht das GitHub-Dashboard.
- **Moment:** die Platine selbst. Nur sie trägt satte Farbe: Kupfer, Netzfarben, Bauteile. Alles drumherum ist grau.
- **Signatur:** **Kupfer ist der einzige Akzent.** Das Logo ist schon Kupfer. Der Primärknopf, der nächste Schritt, die Auswahl und der Fokusring nehmen dasselbe Kupfer; auf der Platine leuchtet nur die Fläche innerhalb des Umrisses (die Lampe auf dem Werkstück), der Rest des Rasters tritt zurück.

### Farbe

Eine neutrale Grauskala, leicht warm, ersetzt die GitHub-Werte. Werte zum Ausprobieren, Kontraste beim Umsetzen messen:

| Token | heute | Vorschlag | Rolle |
|---|---|---|---|
| `--bg0` | `#05070a` | `#0f0f0e` | Arbeitsfläche, ganz außen |
| `--bg2` | `#0d1117` | `#161614` | Seitenleisten, Dialoge |
| `--bg3` | `#161b22` | `#1d1d1b` | Karten, Zeilen |
| `--bg4` | `#21262d` | `#262624` | Knöpfe, Eingaben |
| `--txt0` | `#f0f6fc` | `#ecebe6` | Haupttext |
| `--txt1` | `#8b949e` | `#a3a198` | sekundär |
| `--txt2` | `#484f58` | `#7c7a72` | gedämpft (mind. 4:1 auf `--bg2`) |
| Akzent | grün / blau / lila je Schritt | Kupfer, etwa `#d08a3e`, dunkle Schrift darauf | Primärknopf, nächster Schritt, Auswahl, Fokus |
| Erfolg | `#3fb950` | gedämpftes Grün | nur „alles verdrahtet“, gültig |
| Fehler | `#f85149` | gedämpftes Rot | nur Fehler und Löschen |
| Warnung | amber + orange | ein Gelbton, klar vom Kupfer getrennt | Stand-in, Hinweise |

Netzfarben bleiben, wie sie sind, aber nur auf der Platine und als kleiner Punkt in Listen. Blau gibt es nur noch für Links auf den statischen Seiten.

**Alternative, falls das Kupfer als Knopffarbe zu warm wirkt:** Grün als einzigen Akzent behalten (heute schon der häufigste Primärknopf) und nur Blau und Lila streichen. Dann bleibt die GitHub-Anmutung, aber die Uneinheitlichkeit ist weg. Empfehlung bleibt Kupfer, weil es die App an ihr Logo und ihre Welt bindet.

### Schrift

- Inter für die ganze Oberfläche. Outfit nur noch für das Logo und die großen Ergebniszahlen. Heute konkurrieren zwei sehr ähnliche Groteskschriften um die Überschriften.
- Mono nur für Werte, die man abtippt oder vergleicht: Bauteilwerte (`10k`, `IRLZ44N`), Koordinaten, JSON.
- Skala mit sechs Stufen statt ~30 Werten: 11 / 12 / 13 / 15 / 18 / 24 px. Die heutigen Desktop-Größen (`--fs-xs` 11,5 bis `--fs-lg` 18,4) liegen fast genau darauf und bleiben optisch gleich.
- Gewichte 400 / 500 / 600; 700–800 nur noch im Logo.
- Satzschreibung überall, keine Sperrung, keine Mittelpunkte, keine Punkte am Ende kurzer Beschriftungen.

### Form und Bewegung

- Radien: 6 (Chips, kleine Knöpfe), 8 (Knöpfe, Eingaben), 12 (Karten), 14 (Dialoge). Das ist heute schon fast so; es geht ums Aufräumen der Ausreißer 3, 4, 5, 7, 9, 10.
- Auswahl und Fokus: 2 px durchgehender Kupferrand, kein Leuchten, kein Farbschatten.
- Bewegung nur als Antwort auf eine Handlung: Dialog blendet ein, Zahl zählt hoch. Weg: Pulsieren der Schritt-Knöpfe, Wippen des Hinweises, Scan-Streifen in der Kopfleiste, Leuchten des Compact-Knopfs, `transition: all`.

### Wortwahl (Glossar)

| Ding | ein Wort | statt heute |
|---|---|---|
| Leitungen löschen | Clear wires | Clear, Delete all wires |
| neu verlegen | Reroute | Re-route |
| alles zurücksetzen | Reset board | Reset, Reset Workspace, Reset Project |
| JSON leeren | Empty | Clear |
| Bauteil | part | component, Component |
| Netze | nets | Network |
| Link teilen | Share link | Share, Link |
| Prompt-Dialog | Get it from your AI (Titel gleich dem Knopf) | AI prompt guide |
| Foto-Weg | Footprint from a photo | from photo, From a photo |
| JSON-Knopf | Edit JSON | Paste JSON / Edit JSON je nach Zustand |
| Bestätigen | das Verb der Aktion („Delete part“, „Reset board“) | Confirm action |

---

## 5. Umbau-Pakete, nach Priorität

Jedes Paket ist ein eigener kleiner PR, am Desktop pixelgleich in den Größen, mit Vorher/Nachher-Screenshots aus `tools/ui-shots.mjs`. Reihenfolge so, dass jedes Paket allein sichtbar etwas bringt.

| # | Paket | Was | Umfang | Wirkung |
|---|---|---|---|---|
| **0** | **Fehler F1–F5** | Share-Link-Fehler sichtbar, Einpassen am Handy nach jedem Lauf, Hinweis folgt dem Zustand, Querformat-Menü scrollt, Export-Beschriftungen | klein, je ein Commit | sofort spürbar, unabhängig von der Richtung |
| **1** | **Farben und Zustände** | neue Grauskala in `index.css`, ein Akzent für alle Primärknöpfe, Schrittfarben raus (Schrittleiste, Hinweis, Ergebniskarte, Compact-Knopf), Erfolg/Fehler/Warnung gedämpft, gedämpfte Schrift lesbar, Leuchten und Farbschatten weg | mittel, fast nur CSS | größte Einzelwirkung: die App bekommt eine eigene Farbe |
| **2** | **Wortwahl und Beschriftung** | Glossar umsetzen, Satzschreibung statt Versalien, Mittelpunkte und Endpunkte weg, Bestätigungsdialoge nennen die Aktion, Prompt-Dialog mit „Copy prompt“ als Hauptknopf | klein bis mittel, Text und CSS | Ruhe und Verständlichkeit, kaum Risiko |
| **3** | **Ruhige Platine** | Löcher außerhalb des Umrisses abgedunkelt, Auswahl mit 2-px-Rand, andere Netze bei Netz-Auswahl abgedunkelt, Mindestgröße der Beschriftungen | mittel, `render-utils.js` / `PcbCanvas.jsx` | der Moment kommt zur Geltung |
| 4 | Dialog-Rahmen | alle Dialoge auf `ModalShell` (liegt schon da, ungenutzt): ein Kopf, X überall, Primärknopf unten rechts, drei Breiten; ein Segmentschalter, eine Checkbox, eine Eingabehöhe | groß, Dialog für Dialog | Einheitlichkeit; in vier bis fünf kleinen PRs |
| 5 | Handy | 44-px-Trefferflächen, feste Aktionsleiste unten in Editor und Foto, ein Blatt-Muster, Randreiter gleich gedreht, Werkzeugleiste fest, sichere Ränder | mittel | Bedienbarkeit am Handy |
| 6 | Seitenleisten | Kreis-Karte mit einem Hauptknopf, Teile-Zeile mit einem Farbsignal, Kacheln und Ergebniskarte ohne Doppelung, Netzliste ruhiger | klein bis mittel | Desktop-Ordnung |
| 7 | Schrift und Bewegung | sechsstufige Skala als Tokens, Gewichte 400–600, Outfit nur Logo/Zahlen, Pulsieren/Wippen/`transition: all` raus | mittel, viele Dateien | Feinschliff, technische Schuld |
| 8 | Statische Seiten | 70 Zeichen Zeilenlänge, Abbildungen am Handy, Zierrat raus, Navigation in beide Richtungen, Fußzeile korrigiert | klein, `scripts/site.css` | Lesbarkeit der Erklärseiten |

**Die drei wichtigsten:** Paket 1 (Farben und Zustände), Paket 2 (Wortwahl und Beschriftung), Paket 3 (ruhige Platine). Zusammen ändern sie den Eindruck am stärksten, berühren kaum Layout und keine Desktop-Größen. Paket 0 läuft parallel, weil die Fehler unabhängig sind.

Empfohlener erster Schritt in Paket 1, als Screenshot zum Absegnen: nur die Grauskala und der Kupfer-Akzent auf dem Hauptbildschirm, sonst nichts.
