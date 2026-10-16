# Mobile Responsive Design Concept for boardroute.com

## Executive Summary

boardroute.com is a browser-only perfboard and stripboard autorouter built with React 19 and Vite. The desktop experience provides a three-column IDE layout: a left sidebar for circuit JSON and parts management, a central pan/zoom canvas displaying the perfboard routing engine, and a right sidebar for board statistics and net inspection.

Currently, on mobile viewports (e.g. iPhone 390x844, Android 360x780), the interface suffers from severe layout degradation:
1. The topbar wraps into 4–5 disjointed rows consuming ~200px (25–35% of total screen height).
2. The sidebars are stacked below the canvas in a single scrolling document (`#layout { flex-direction: column }`), causing the canvas to take only 60dvh and forcing the user to scroll off the canvas to see parts, JSON, or stats.
3. Canvas interactions lack touch pinch-to-zoom and two-finger pan, while single-finger drags conflict with vertical page scrolling.
4. Overlays and dialogs push action buttons off-screen or truncate labels, and touch targets across category chips and buttons are well below the 44px accessibility threshold.

This document analyzes the current mobile state screen-by-screen based on baseline screenshots captured in `docs/mobile/before/`, and defines the responsive architecture to make boardroute.com fluid, touch-optimized, and ergonomic on phones—while **strictly preserving the desktop experience with 0 pixel regression**.

---

## 1. Audit of Current Mobile State (Screen-by-Screen)

Screenshots were captured at **390x844** (iPhone 12/13/14), **360x780** (Android compact), and **1440x900** (Desktop reference) under `docs/mobile/before/`.

### 1.1 Main Screen & Topbar (`03_main_loaded_initial.png`, `04_main_wired.png`, `05_main_compacted.png`)
- **Reference**:
  - `docs/mobile/before/390x844/03_main_loaded_initial.png`
  - `docs/mobile/before/360x780/03_main_loaded_initial.png`
  - `docs/mobile/before/1440x900/03_main_loaded_initial.png`
- **Current Issues**:
  - **Topbar height bloat**: The topbar has a `@media (max-width: 950px)` rule that stacks into multiple rows, but on mobile screens (<400px), it wraps into 4–5 rows: Logo row, Workflow buttons (`Load`, `Wire`, `Compact`), Coach mark banner, Share/Export row, and How-it-works/Reset row.
  - **Horizontal clipping**: On 360px width, the `Compact` chevron button is ~80% clipped off the right viewport edge.
  - **Chevron broken rendering**: The chevron buttons (`clip-path: polygon(...)`) lose alignment and bleed over adjacent elements when wrapped.
  - **Coach marks collision**: The tooltip banner (`Next: press Wire to connect everything`) overlaps action buttons beneath it.

### 1.2 Layout & Viewport Architecture (`03_main_loaded_initial.png`, `07_sidebar_left.png`, `08_sidebar_right.png`)
- **Reference**:
  - `docs/mobile/before/390x844/07_sidebar_left.png`
  - `docs/mobile/before/390x844/08_sidebar_right.png`
- **Current Issues**:
  - **Stacked scrolling document**: `#ca-col` has `order: -1; height: 60dvh; min-height: 300px;`, and `#lsb` and `#rsb` follow in a single scrollable document.
  - **Disconnected experience**: The canvas scrolls off the screen when inspecting parts or nets. You cannot simultaneously see the board and select a part or inspect a net.
  - **No bottom navigation**: There is no dedicated navigation bar to quickly toggle views or access side panels.

### 1.3 Canvas Controls & Touch Gestures (`10_canvas_toolbar.png`)
- **Reference**:
  - `docs/mobile/before/390x844/10_canvas_toolbar.png`
  - `docs/mobile/before/1440x900/10_canvas_toolbar.png`
- **Current Issues**:
  - **No pinch-to-zoom**: `PcbCanvas` only attaches wheel listeners (`handleWheel`) and click handlers on zoom buttons. Pinching with two fingers does nothing or zooms the entire browser viewport.
  - **Gesture conflicts**: Single-finger drag on the canvas conflicts with the browser's native vertical page scrolling.
  - **Oversized vertical toolbar**: The 6 canvas control buttons (`#`, `Flip`, `+`, `-`, `Center`, `Auto-track`) form a 280px tall vertical column on the right edge, covering a substantial portion of the narrow canvas.
  - **Sub-44px tap targets**: Buttons are `38px × 38px`, violating touch accessibility standards.

### 1.4 Circuit JSON Drawer (`02_main_json_drawer.png`)
- **Reference**:
  - `docs/mobile/before/390x844/02_main_json_drawer.png`
- **Current Issues**:
  - **Static inline placement**: Below 700px, `.json-drawer` has `position: static; height: 60dvh; margin: 0 12px 8px 16px;`.
  - **Hidden below the canvas**: Users must scroll past the entire 60dvh canvas to reach the drawer.
  - **Virtual keyboard occlusion**: When the mobile keyboard opens, it pushes the "Load circuit" and status footer completely out of view.

### 1.5 Processing Bar (`09_bottom_panel.png`)
- **Reference**:
  - `docs/mobile/before/390x844/09_bottom_panel.png`
- **Current Issues**:
  - **Hardcoded desktop height**: `#proc-bar` is hardcoded to `height: 240px; padding: 0 40px;`. On an 844px screen, 240px consumes over 30% of the entire viewport.
  - **Horizontal overflow**: `.pb-content-wrap` has `gap: 48px` and `.pb-preview { width: 300px; }`. On a 360px screen, the preview card is completely cut off.
  - **Button ergonomics**: "Apply Current Best" has huge margins and is hard to tap reliably in a hurry.

### 1.6 Result Card (`06_result_card.png`)
- **Reference**:
  - `docs/mobile/before/390x844/06_result_card.png`
- **Current Issues**:
  - **Canvas occlusion**: Floating at `bottom: 8px` inside a 60dvh container, the result card covers almost half the visible perfboard.
  - **Button wrapping**: Action buttons (`Compact`, `Share link`, `Export`) wrap tightly on 360px screens.
  - **Control collision**: Canvas floating controls overlap the right edge of the result card.

### 1.7 First Visit & Examples Overlay (`01_first_visit.png`, `11_dialog_examples.png`)
- **Reference**:
  - `docs/mobile/before/390x844/01_first_visit.png`
  - `docs/mobile/before/390x844/11_dialog_examples.png`
- **Current Issues**:
  - **Footer text clipping**: The skip button text `"Skip, I'll describe my own circuit"` is clipped to `"Skip, I'll describe my own circui"` on 390px screens.
  - **Dense cards**: Example cards take significant vertical height; single-column cards need better touch-friendly padding.
  - **Close button**: The close icon `✕` has a tap target of only ~28px.

### 1.8 Component Library Overlay (`12_dialog_library.png`)
- **Reference**:
  - `docs/mobile/before/390x844/12_dialog_library.png`
- **Current Issues**:
  - **Micro category chips**: Category chips have `font-size: .7em; padding: 3px 8px;`, yielding tap targets of only ~22px height.
  - **Stuck tooltips**: `FastTooltips` hover events trigger on touch and stick permanently on the screen.
  - **Header crowding**: "From a photo" button wraps and squeezes against the close button.

### 1.9 Component Footprint Editor (`13_dialog_comp_editor.png`)
- **Reference**:
  - `docs/mobile/before/390x844/13_dialog_comp_editor.png`
- **Current Issues**:
  - **Canvas vs. controls ratio**: Sticky canvas at 42dvh leaves very little room for pin properties and body settings below.
  - **Pin table touch targets**: Pin input rows have 26px height inputs and 24px delete buttons that are difficult to tap accurately.

### 1.10 Footprint from a Photo (`14_dialog_photo_picker.png`, `15_dialog_photo_loaded.png`)
- **Reference**:
  - `docs/mobile/before/390x844/14_dialog_photo_picker.png`
  - `docs/mobile/before/390x844/15_dialog_photo_loaded.png`
- **Current Issues**:
  - **File picker layout**: Action buttons in the initial state wrap tightly.
  - **Side controls in loaded view**: The side panel tools (`Measure pin row`, `Mark another row`, `OCR`) are placed in a scroll container underneath a 50dvh sticky image, requiring extensive scrolling.

### 1.11 Export Dialog (`16_dialog_export.png`)
- **Reference**:
  - `docs/mobile/before/390x844/16_dialog_export.png`
- **Current Issues**:
  - **Action buttons below the fold**: The preview consumes 42% of the screen height, pushing the download buttons (`Download SVG`, `PNG`, `Print`, `Share`) off-screen into an internal scroll container.

### 1.12 Prompt & Confirm Dialogs (`18_dialog_prompt.png`, `19_dialog_confirm.png`)
- **Reference**:
  - `docs/mobile/before/390x844/18_dialog_prompt.png`
  - `docs/mobile/before/390x844/19_dialog_confirm.png`
- **Current Issues**:
  - Fixed margins and small tap targets for `Cancel` and `Confirm Action`.
  - Prompt text container pre-wrap code block has small typography.

### 1.13 Static Explainer Pages (`20_static_how_it_works_hub.png`, `21_static_how_it_works_article.png`)
- **Reference**:
  - `docs/mobile/before/390x844/20_static_how_it_works_hub.png`
  - `docs/mobile/before/390x844/21_static_how_it_works_article.png`
- **Current Issues**:
  - Navbar wraps awkwardly: logo and CTA on top, navigation links wrapping into a separate row.
  - Touch targets for inline links and footer navigation are compact.

---

## 2. Concept & Mobile Architecture

### 2.1 Breakpoint Strategy & Desktop Guarantee
- **Breakpoint**: `@media (max-width: 768px)`.
- **Desktop Guarantee**:
  - **Zero desktop CSS changes**: All mobile changes are enclosed in `@media (max-width: 768px)` or behind mobile state switches.
  - On viewports `> 768px`, every style, layout rule, width, padding, and interaction remains 100% identical to the baseline.
  - Desktop screenshots before vs. after will be validated using automated pixel-diff testing.

---

### 2.2 Mobile Shell: Full-Screen Canvas + Bottom Navigation + Drawers

Instead of a 1500px tall scrolling document, the mobile app becomes an **app-like single-screen view** where the canvas occupies 100% of the visible viewport between a compact topbar and a mobile bottom navigation bar.

#### Mobile View Architecture:
```
+------------------------------------------+
| [Logo]        [Load] [Wire] [Compact] [:]|  <-- Compact Topbar (50px)
+------------------------------------------+
|                                          |
|                                     [#]  |
|                                    [Fit] |  <-- Fullscreen Canvas (touch pan/zoom)
|             PERFBOARD CANVAS             |
|                                          |
|                                          |
| [Result Card / Bottom Panel (when active)|
+------------------------------------------+
|  [Canvas]      [Parts / JSON]    [Stats] |  <-- Bottom Navigation Bar (52px)
+------------------------------------------+
```

1. **Top Bar**:
   - Single-row layout (`height: 50px`).
   - Left: Compact logo `boardroute` (`.com` hidden on small screens).
   - Center: Equal-width workflow step buttons (`Load`, `Wire`, `Compact`) styled as a sleek segmented control with distinct status colors.
   - Right: More actions button (`⋮` or hamburger icon) that opens a mobile action sheet containing:
     - Share link (`Share2`)
     - Export dialog (`Download`)
     - Undo (`Undo2`) / Redo (`Redo2`)
     - Clear wires (`Eraser`) / Reroute (`Zap`)
     - Reset workspace (`RotateCcw`)
     - Explainer docs (`BookOpen`)

2. **Canvas (Full Screen & Gesture Driven)**:
   - Takes 100% remaining height (`height: 100%`, `overflow: hidden`, `touch-action: none`).
   - **Pinch-to-Zoom**: Two-finger pinch gesture calculates distance between touches and updates `applyCamera` smoothly centered on the gesture midpoint.
   - **Two-Finger Pan & Drag**: Two-finger drag pans the canvas without moving parts. Single-finger drag moves the selected component (or pans if started on empty space).
   - **Canvas Controls**: Collapsible floating cluster in the bottom-right corner, positioned cleanly above the bottom bar, with tap targets of 44x44px.

3. **Bottom Navigation Bar**:
   - A persistent, sleek glassmorphic navigation bar at the bottom:
     - **Board** (canvas view)
     - **Parts** (badge showing component count; opens Left Sidebar Drawer)
     - **Inspector** (opens Right Sidebar Drawer with Net & Component stats)
   - When **Parts** or **Inspector** is selected, the corresponding sidebar slides up as a smooth bottom sheet / drawer over the canvas.

4. **Sidebars as Bottom Sheets / Drawers**:
```
+------------------------------------------+
|               Top Bar                    |
+------------------------------------------+
|               Canvas                     |
|                                          |
+==========================================+  <-- Drag handle / Close
| === Parts & Circuit (Drawer) ========= X |
| [Examples]  [Get from AI]  [Edit JSON]   |
|                                          |
| 1. Power Connector (2P)             [✎]  |
| 2. Resistor 10k (2P)                [✎]  |
| 3. N-MOSFET (3P)                    [✎]  |
+------------------------------------------+
|  [Canvas]     *[Parts]*          [Stats] |
+------------------------------------------+
```
   - Left sidebar (`#lsb`) and right sidebar (`#rsb`) become slide-up bottom sheets (`height: 75dvh`, with a drag handle and close button).
   - Allows full access to the parts list, component editing, JSON editing, and network inspection while retaining the ability to quickly dismiss and view the board.

5. **JSON Editor on Mobile**:
   - Instead of an inline drawer squeezed under a scrolled canvas, the JSON editor opens as a dedicated full-screen or 85dvh modal sheet with:
     - Sticky header: "Circuit JSON", Paste, Clear, Close.
     - Flexible monospaced textarea (`font-size: 14px` to prevent iOS auto-zoom).
     - Sticky footer: Validation status badge and large 48px "Load circuit" button.

---

### 2.3 Bottom Processing Bar & Result Card

#### Processing Bar on Mobile:
```
+------------------------------------------+
| Perfect: 8x9 = 72 holes                  |
| [======================================] |
| 72 holes (-40%) · 24 wl · 0 jumpers      |
| [ Stop & Keep Best Layout ]              |
+------------------------------------------+
```
- Re-architected from the desktop 240px two-column card into a streamlined 110px mobile bottom card.
- Progress bar and live metrics in a compact horizontal layout.
- The thumbnail preview is hidden on narrow screens; the user can see the board directly updating on the canvas above!
- "Stop & Keep Best Layout" (Good enough) button is full width with a 44px tap target.

#### Result Card on Mobile:
- Positioned just above the bottom navigation bar (`bottom: 60px`).
- Compact horizontal stat row: `Width × Height`, `Holes Footprint`, `Wire Length`, `Jumpers`.
- Action buttons (`Compact`, `Share`, `Export`) arranged in an ergonomic 44px touch grid.

---

### 2.4 Modals & Dialogs (Overlays)

All modal overlays (`ExamplesOverlay`, `LibraryOverlay`, `CompEditorOverlay`, `PhotoFootprintOverlay`, `ExportOverlay`, `PromptOverlay`, `ConfirmOverlay`):
- **Full-Screen / Bottom Sheet on Mobile**:
  - `width: 100vw; height: 100dvh; max-height: 100dvh; border-radius: 0;` (or `max-height: 92dvh` with rounded top corners).
  - Sticky header with 44px touch-accessible close button (`✕`).
  - Sticky footer containing primary action buttons (`Save`, `Export`, `Use footprint`) so buttons are **never hidden below the fold**.
  - Scrollable content area with `overscroll-behavior: contain`.
- **Export Overlay**:
  - Tabbed or collapsible preview toggle so settings and export buttons remain readily accessible.
  - Download buttons fixed in a sticky bottom action bar.
- **Library Overlay**:
  - Category chips formatted as horizontal scrolling pills with `min-height: 38px`, padding `8px 14px`, and proper spacing.
  - Search input with clear button and 16px font size (avoids iOS Safari zoom on focus).
  - Component cards with >=44px tap targets.
- **Touch Target Standard**:
  - Every interactive button, chip, and input conforms to the **minimum 44x44px touch target** rule (via padding, min-height, or pseudo-element hit areas).

---

### 2.5 Touch Pan and Pinch-to-Zoom Architecture

In `PcbCanvas.jsx`:
- Track active pointer events using a touch registry:
  - When `e.pointerType === 'touch'`:
    - **1 Pointer**: If hitting a component, drag the component. If hitting empty space, single-finger pan.
    - **2 Pointers**: Pinch-to-zoom and two-finger pan.
      - Calculate distance between pointer 1 and pointer 2: $d = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}$.
      - Midpoint: $M = (\frac{x_1 + x_2}{2}, \frac{y_1 + y_2}{2})$.
      - Adjust zoom ratio: $z_{\text{next}} = z_{\text{prev}} \times \frac{d_{\text{cur}}}{d_{\text{prev}}}$.
      - Update camera atomically using the existing high-performance `applyCamera` DOM transform method.
- Add `touch-action: none` to the canvas container to prevent browser pinch-zoom and gesture interference.

---

## 3. Implementation Plan & File Touch List

### 3.1 Files to Modify:
1. `src/index.css`:
   - Mobile design tokens (e.g. `--topbar-mobile-height: 50px`, `--bottom-nav-height: 52px`).
   - Base mobile resets (`touch-action`, `-webkit-tap-highlight-color`).
2. `src/App.jsx`:
   - Mobile state management: active drawer (`null | 'parts' | 'inspector'`), more actions menu open state.
   - Mobile bottom navigation bar component rendering.
   - Updated layout container styles (`#layout`, `#ca-col`, `#lsb`, `#rsb`).
3. `src/components/Topbar.jsx`:
   - Responsive layout for `<768px`: compact logo, inline workflow chevrons, mobile overflow action button.
   - Mobile action sheet / dropdown for secondary actions (`Share`, `Export`, `Undo`, `Redo`, `Reset`, etc.).
4. `src/components/PcbCanvas.jsx`:
   - Multi-touch gesture handling (pinch-to-zoom & two-finger pan).
   - Mobile canvas controls cluster with >=44px tap targets.
5. `src/components/SidebarLeft.jsx`:
   - Bottom sheet / drawer styling on mobile with drag handle and close button.
   - JSON editor modal sheet with sticky header and footer.
   - 44px tap targets for component edit buttons.
6. `src/components/SidebarRight.jsx`:
   - Bottom sheet / drawer styling on mobile with drag handle.
   - Accordion sections and touch-friendly net lists.
7. `src/components/ProcessingBar.jsx`:
   - Mobile responsive layout (`height: auto`, single-row metrics, full-width action button).
8. `src/components/ResultCard.jsx`:
   - Mobile responsive positioning (`bottom: calc(var(--bottom-nav-height) + 10px)`).
   - Ergonomic button grid.
9. `src/components/LibraryOverlay.jsx`:
   - Mobile full-screen / sheet modal styling.
   - Touch-friendly horizontal category scroll and larger chip targets.
10. `src/components/CompEditorOverlay.jsx`:
    - Mobile layout improvements: scrollable body, sticky actions, 44px pin inputs.
11. `src/components/PhotoFootprintOverlay.jsx`:
    - Mobile layout adjustments: full height sheet, sticky image viewer, touch-friendly pin markers.
12. `src/components/ExportOverlay.jsx`:
    - Mobile preview scaling, sticky download action bar.
13. `src/components/ExamplesOverlay.jsx`:
    - Mobile single-column cards, fixed skip button text clipping.
14. `src/components/FastTooltips.jsx`:
    - Disable tooltips on touch devices (`@media (hover: none)`).
15. `scripts/site.css`:
    - Mobile navbar header refinements for `/how-it-works/`.

---

## 4. Verification & Validation Strategy

1. **Desktop Zero-Regression Check**:
   - Re-run automated Playwright capture on desktop (`1440x900`).
   - Run pixel-by-pixel image diff against `docs/mobile/before/1440x900/`.
   - Any pixel discrepancy must be zero or strictly justified.
2. **Mobile Screen Verification**:
   - Re-run automated Playwright capture on phone viewports (`390x844` and `360x780`) saving to `docs/mobile/after/`.
   - Verify every broken aspect identified in Section 1 is resolved.
3. **Lint & Build Verification**:
   - `npm run lint` must pass with zero errors.
   - `npm run build` must succeed without warnings.
