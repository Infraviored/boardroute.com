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

---

## 5. Consistency Audit (Desktop and Mobile)

While the desktop landing view (canvas, topbar, sidebars) provides a cohesive, functional aesthetic, an in-depth audit across the frontend reveals significant stylistic and architectural inconsistencies in sub-menus, dialog overlays, buttons, inputs, typography, and inline styling.

### 5.1 Frontend Inconsistency Inventory

#### A. Button Styles, Sizes, and Variants
Across the 12 UI files, at least 14 distinct button classes and button patterns exist with conflicting heights, paddings, and radii:

| Class / Location | File & Line | Height / Padding | Border Radius | Background / Border | Typographic Styling | Screenshot Reference |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `.tbtn` (Topbar action) | `src/components/Topbar.jsx:338-360` | `height: 34px`, `padding: 6px 12px` | `8px` | `var(--bg4)`, `border: 1px solid var(--border)` | `font-size: .82em`, `font-weight: 500` | `1440x900/03_main_loaded_initial.png` |
| `.flow-btn` (Topbar workflow) | `src/components/Topbar.jsx:367-375` | `height: 34px`, `min-width: 90px` | `8px 0 0 8px` / chevron clip | Custom gradients, glow transitions | `font-size: .85em`, `font-weight: 700` | `1440x900/03_main_loaded_initial.png` |
| `.mobile-more-btn` (Topbar mobile) | `src/components/Topbar.jsx:513-524` | `36px × 36px` | `8px` | `var(--bg4)`, `border: 1px solid var(--border)` | Icon only (`20px`) | `390x844/03_main_loaded_initial.png` |
| `.mas-btn` (Mobile action sheet) | `src/components/Topbar.jsx:578-605` | `min-height: 44px`, `padding: 12px 14px` | `10px` | `var(--bg3)`, `border: 1px solid var(--border)` | `font-family: 'Outfit'`, `0.88rem`, `600` | `390x844/17_dialog_share.png` |
| `.cc-btn` (Circuit actions) | `src/components/SidebarLeft.jsx:316-340` | `padding: 7px 10px` (variable height) | `8px` | `var(--bg4)`, `border: 1px solid var(--border)` | `font-size: var(--fs-sm)`, `font-weight: 700` | `1440x900/07_sidebar_left.png` |
| `.tplbtn` (Parts library/add) | `src/components/SidebarLeft.jsx:561-585` | `padding: 6px 10px`, `min-width: 80px` | `8px` | `var(--bg3)`, `border: 1px solid var(--border)` | `font-size: var(--fs-xs)`, `font-weight: 600` | `1440x900/07_sidebar_left.png` |
| `.edit-mini-btn` (Component card) | `src/components/SidebarLeft.jsx:686-702` | `24px × 24px` | `5px` | `transparent`, `border: 1px solid transparent` | Icon only (`13px`) | `1440x900/07_sidebar_left.png` |
| `.canvas-btn` / `.cbtn` (Canvas bar) | `src/components/PcbCanvas.jsx:217-235` | `38px × 38px` (desktop), `44px × 44px` (mobile) | `6px` | `var(--bg3)`, `border: 1px solid var(--border)` | Icon only (`16px` / `18px`) | `1440x900/10_canvas_toolbar.png` |
| `.lib-photo` (Photo footprint CTA) | `src/components/LibraryOverlay.jsx:163-164` | `height: 28px`, `padding: 0 10px` | `7px` | `none`, `border: 1px solid var(--blu)` | `font-size: var(--fs-sm)`, `font-weight: 600` | `1440x900/12_dialog_library.png` |
| `.lib-cat` (Category pill) | `src/components/LibraryOverlay.jsx:166-172` | `padding: 3px 8px` (height ~22px) | `6px` | `var(--bg3)`, `border: 1px solid var(--border)` | `font-size: .7em`, `font-weight: 600` | `1440x900/12_dialog_library.png` |
| `.ce-btn` (Comp editor action) | `src/components/CompEditorOverlay.jsx:344-349` | `height: 30px`, `padding: 0 14px` | `7px` | `var(--bg4)`, `border: 1px solid var(--border2)` | `font-size: var(--fs-sm)`, `font-weight: 600` | `1440x900/13_dialog_comp_editor.png` |
| `.ce-add` (Add pin button) | `src/components/CompEditorOverlay.jsx:368` | `height: 24px`, `padding: 0 8px` | `6px` | `var(--bg4)`, `border: 1px solid var(--border2)` | `font-size: var(--fs-xs)`, `font-weight: 600` | `1440x900/13_dialog_comp_editor.png` |
| `.ex-btn` (Export action) | `src/components/ExportOverlay.jsx:160-162` | `padding: 10px` (height ~40px) | `8px` | `var(--bg4)`, `border: 1px solid var(--border2)` | `font: inherit`, `font-weight: 600` | `1440x900/16_dialog_export.png` |
| `.c-btn` (Confirm modal button) | `src/components/ConfirmOverlay.jsx:55-66` | `padding: 10px 24px` (height ~42px) | `10px` | `var(--bg4)`, `border: 1px solid var(--border2)` | `font-family: 'Inter'`, `0.85em`, `700` | `1440x900/19_dialog_confirm.png` |
| `.copy-btn` (Prompt copy) | `src/components/PromptOverlay.jsx:119-126` | `padding: 6px 12px` | `4px` | `var(--bg2)`, `border: 1px solid var(--border)` | `font-size: 0.9em` | `1440x900/18_dialog_prompt.png` |
| `.rc-btn` (Result card button) | `src/components/ResultCard.jsx:87-105` | `height: 32px`, `padding: 0 12px` | `6px` | `var(--bg3)`, `border: 1px solid var(--border)` | `font-size: 0.8rem`, `font-weight: 600` | `1440x900/06_result_card.png` |

#### B. Border Radii Discrepancies
There is no unified radius scale. Different components pick arbitrary border-radius values:
- `4px`: `.lib-swatch` (`LibraryOverlay.jsx:188`), `.copy-btn` (`PromptOverlay.jsx:120`).
- `5px`: `.ce-seg button` (`CompEditorOverlay.jsx:364`), `.ce-icon` (`CompEditorOverlay.jsx:374`), `.edit-mini-btn` (`SidebarLeft.jsx:689`).
- `6px`: `.canvas-btn` (`PcbCanvas.jsx:219`), `.lib-cat` (`LibraryOverlay.jsx:167`), `.ce-add` (`CompEditorOverlay.jsx:368`), `.rc-btn` (`ResultCard.jsx:88`), `.prompt-scroll-container` (`PromptOverlay.jsx:131`).
- `7px`: `.lib-photo` (`LibraryOverlay.jsx:163`), `.ce-btn` (`CompEditorOverlay.jsx:344`), `.ce-seg` (`CompEditorOverlay.jsx:363`), `.pf-url input` (`PhotoFootprintOverlay.jsx:717`).
- `8px`: `.tbtn` (`Topbar.jsx:344`), `.cc-btn` (`SidebarLeft.jsx:323`), `.tplbtn` (`SidebarLeft.jsx:563`), `.ex-btn` (`ExportOverlay.jsx:160`), `.ex-seg` (`ExportOverlay.jsx:150`).
- `10px`: `.c-btn` (`ConfirmOverlay.jsx:57`), `.mas-btn` (`Topbar.jsx:586`), `.lib-card` (`LibraryOverlay.jsx:177`).
- `12px` / `14px` / `16px` for modal shells: `ConfirmOverlay` uses `border-radius: 12px`, `CompEditorOverlay` and `PhotoFootprintOverlay` use `border-radius: 14px`, `LibraryOverlay` and `ExportOverlay` use `border-radius: 16px`.

#### C. Color and Semantic Token Inconsistencies
- **Primary / Affirmative Color**:
  - `Topbar.jsx` uses `var(--grn-bright, #3fb950)` with glowing drop-shadows.
  - `ProcessingBar.jsx` uses `var(--grn, #238636)`.
  - `CompEditorOverlay.jsx:348` and `ExportOverlay.jsx:161` use `var(--grn)` with `:hover { background: #2a9a40; }` (hardcoded hex instead of token).
  - `ConfirmOverlay.jsx:76` uses `var(--err-bright)` for confirmation actions.
  - `PromptOverlay.jsx:83` uses `var(--blu-bright)`.
- **Borders & Backgrounds**:
  - Some components use `var(--border)` (`rgba(255,255,255,0.08)`), others use `var(--border2)` (`rgba(255,255,255,0.14)`), others use `rgba(255,255,255,0.15)` or `rgba(31,111,235,0.25)`.
  - Background surface steps jump unpredictably between `var(--bg0)` through `var(--bg5)` and ad-hoc semi-transparent rgba strings (e.g. `rgba(31, 111, 235, 0.12)`, `rgba(63, 185, 80, 0.1)`).

#### D. Typography & Icon Sizing
- **Font Sizes**: Mixed units without a single source of truth:
  - Relative: `0.7em`, `0.82em`, `0.85em`, `0.9em`, `0.8rem`, `0.85rem`, `0.88rem`, `1.1rem`.
  - Absolute: `13px`, `14px`, `16px`.
  - Variables: `var(--fs-xs)` (11px), `var(--fs-sm)` (12px), `var(--fs-md)` (14px).
  - Fonts: Headings alternate between `'Outfit', sans-serif`, `'Inter', sans-serif`, and system font. Monospaced sections alternate between `ui-monospace, Consolas, monospace`, `'JetBrains Mono', monospace`, and `'Consolas', monospace`.
- **Icon Sizing**:
  - `Lucide` icons are sized ad-hoc: 13px (`CompEditorOverlay.jsx:321`), 15px (`ExportOverlay.jsx:126`), 16px (`Topbar.jsx:134`), 18px (`Topbar.jsx:180`), 20px (`Topbar.jsx:154`).

#### E. Dialog Shells, Headers, and Footers
Each dialog modal re-invents its container shell, header layout, and close button:
- **`LibraryOverlay.jsx`**: `.lib-modal` (max-width 640px, padding 20px, absolute `.close-btn` at top-right 14px).
- **`ExamplesOverlay.jsx`**: `.examples-modal` (max-width 860px, padding 24px, no header close button, only overlay click, escape, or skip button).
- **`ExportOverlay.jsx`**: `.export-modal` (max-width 1200px, padding 0, flex row 2-column preview/sidebar, sticky action footer, no visible top-right close icon).
- **`CompEditorOverlay.jsx`**: `.ce-modal` (max-width 1120px, padding 0, `.ce-head` with title, ID chip, size, and inline button actions "Back to library", "Cancel", "Done").
- **`ConfirmOverlay.jsx`**: `.confirm-modal` (max-width 380px, padding 32px, `.modal-header` with `✕` button, `.modal-footer` with Cancel / Danger buttons).
- **`PromptOverlay.jsx`**: `.prompt-modal` (max-width 640px, padding 20px, `.modal-header` with `✕` button, full-width bottom confirm button).

#### F. Inputs, Selects, Checkboxes, and Segmented Controls
- **Inputs**:
  - `CompEditorOverlay.jsx:357`: `.ce-side input:not([type=color]) { height: 28px; padding: 0 8px; border-radius: 6px; font-size: 13px; }`.
  - `PhotoFootprintOverlay.jsx:717`: `.pf-url input { height: 30px; padding: 0 8px; border-radius: 7px; font-size: 13px; }`.
  - `SidebarLeft.jsx` JSON editor: `<textarea>` with `'JetBrains Mono', monospace`.
  - `PromptOverlay.jsx:136`: `.prompt-pre` with `'Consolas', monospace`.
- **Segmented Controls**:
  - `CompEditorOverlay.jsx:363`: `.ce-seg` (`background: var(--bg0); border-radius: 7px; padding: 2px; gap: 2px;`) with `.ce-seg button` (`padding: 5px; border-radius: 5px;`).
  - `ExportOverlay.jsx:150`: `.ex-seg` (`background: var(--bg0); border-radius: 8px; padding: 2px; gap: 2px;`) with `.ex-seg button` (`padding: 7px 6px; border-radius: 6px;`).
- **Checkboxes & Hints**:
  - `ExportOverlay.jsx:155`: `.ex-check { display: flex; gap: 8px; align-items: center; font-size: var(--fs-sm); }`.
  - `PhotoFootprintOverlay.jsx:738`: `.pf-check { display: flex; gap: 6px; align-items: center; font-size: var(--fs-sm); }`.
  - Hints alternate between `.ex-hint` (`var(--fs-xs)`, `var(--txt2)`), `.ce-hint` (`var(--fs-xs)`, line-height 1.4), and raw `<p>` elements.

#### G. CSS Architecture: Per-Component `<style>` Blocks vs `index.css`
- **Current Issue**: Every component injects its own `<style dangerouslySetInnerHTML={{ __html: ... }}>` directly into the DOM tree during render.
- **Consequences**:
  - High duplication of common utilities (modal overlays, headers, button states, focus rings).
  - CSS precedence bugs depending on component mounting order.
  - Inability to share design tokens cleanly across modals without copy-pasting.

---

### 5.2 Shared UI Modularisation Proposal

To solve these inconsistencies without disturbing the desktop landing view, we propose introducing a focused set of shared UI components under `src/components/ui/` backed by a semantic design token layer in `src/index.css`.

#### A. Design Tokens (`src/index.css`)
Establish strict semantic scales:
```css
/* --- UI Sizing & Radii Tokens --- */
--btn-h-xs: 24px;   /* micro badges, pin edit icons */
--btn-h-sm: 28px;   /* secondary compact chips, category pills */
--btn-h-md: 34px;   /* standard controls (matches topbar .tbtn) */
--btn-h-lg: 42px;   /* dialog primary CTA buttons (>=44px on mobile) */

--radius-xs: 4px;   /* swatches, badges */
--radius-sm: 6px;   /* compact inputs, small buttons */
--radius-md: 8px;   /* standard buttons, cards, segment controls */
--radius-lg: 12px;  /* small dialogs, notification cards */
--radius-xl: 16px;  /* full modals, bottom sheets */

/* --- Semantic Intent Colors --- */
--ui-accent: var(--accent);          /* brand highlight */
--ui-primary: var(--grn);            /* affirmative primary (Wire, Apply, Save) */
--ui-primary-hover: #2a9a40;
--ui-primary-border: var(--grn-bright);
--ui-danger: var(--err-bright);      /* destructive (Delete, Reset) */
--ui-danger-bg: rgba(248, 81, 73, 0.1);
--ui-neutral: var(--bg4);            /* standard secondary buttons */
--ui-neutral-hover: var(--bg3);
--ui-neutral-border: var(--border);
```

#### B. Component Primitives Set (`src/components/ui/`)
1. **`Button.jsx`**:
   - `variant`: `'primary'` (green CTA), `'secondary'` (neutral outline), `'ghost'` (borderless), `'danger'` (red destructive), `'accent'` (blue action).
   - `size`: `'sm'` (28px), `'md'` (34px, standard), `'lg'` (42px).
   - Props: `icon`, `disabled`, `loading`, `fullWidth`, `title`.
2. **`IconButton.jsx`**:
   - Standardized square icon action with built-in accessibility title and tooltip hook.
   - Sizes: `'sm'` (24px, 14px icon), `'md'` (32px, 16px icon), `'lg'` (40px / 44px mobile, 18px/20px icon).
3. **`ModalShell.jsx`**:
   - Handles backdrop blur, portal mounting, click-outside dismissal, Escape key listener, and mobile full-screen / sheet mode.
   - Standard sub-components: `ModalShell.Header` (consistent title, optional subtitle, standardized close button), `ModalShell.Body`, `ModalShell.Footer` (sticky action bar).
4. **`SegmentedControl.jsx`**:
   - Unifies `.ce-seg` and `.ex-seg`.
   - Accessible keyboard tab switching, 8px outer radius, 6px pill radius.
5. **`Field.jsx` & `Input.jsx`**:
   - Unified label, helper hint, error state, and input styling (`height: 32px`, 6px radius, `var(--bg0)` background).
6. **`Checkbox.jsx`**:
   - Custom styled checkbox with consistent 16px square indicator, checkmark svg, and aligned label.
7. **`SectionHeader.jsx` & `Hint.jsx`**:
   - Standard uppercase category label (`var(--fs-xs)`, `letter-spacing: .06em`, `var(--txt2)`).

#### C. Migration Order & Phasing
To guarantee zero regression on the core workflow, components are migrated in four strictly decoupled phases:

1. **Phase 1: Design Tokens & Primitives Foundation**
   - Add sizing, radius, and semantic intent variables to `src/index.css`.
   - Implement `Button`, `IconButton`, `ModalShell`, `SegmentedControl`, `Field`, `Checkbox` in `src/components/ui/`.
   - Run zero-regression check against desktop reference.
2. **Phase 2: Leaf & Simple Dialogs**
   - Migrate `src/components/ConfirmOverlay.jsx` (adopts `ModalShell`, `Button`).
   - Migrate `src/components/PromptOverlay.jsx` (adopts `ModalShell`, `Button`).
   - Migrate `src/components/ResultCard.jsx` (adopts `Button`, `IconButton`).
   - Verify modal behavior and screenshots.
3. **Phase 3: Complex Overlays**
   - Migrate `src/components/ExportOverlay.jsx` (adopts `ModalShell`, `SegmentedControl`, `Checkbox`, `Button`).
   - Migrate `src/components/LibraryOverlay.jsx` (adopts `ModalShell`, `Button`).
   - Migrate `src/components/CompEditorOverlay.jsx` (adopts `SegmentedControl`, `Field`, `Button`, `IconButton`).
4. **Phase 4: Shell Integration (Desktop & Mobile Consistency)**
   - Unify `SidebarLeft.jsx` and `SidebarRight.jsx` button variants with the shared primitives.
   - Refactor `Topbar.jsx` action sheet (`.mas-btn`) to reuse the unified button definitions.

---

### 5.3 PhotoFootprintOverlay Conflict Analysis & Reconciliation

#### A. Background of PR #21 (`fix/photo-crop-first`)
In PR #21 (branch `origin/fix/photo-crop-first`), `PhotoFootprintOverlay.jsx` was extensively rewritten:
- The component grew from 644 to 948 lines, internalizing the crop-first workflow, live grid alignment, pin count estimation, and computer vision utilities directly within the component.
- PR #21 added an early mobile responsive media query at lines 745–752:
  ```css
  @media (max-width: 760px) {
      .pf-modal { width: 100vw; height: 100dvh; max-height: none; border-radius: 0; border: 0; }
      .pf-body { display: flex; flex-direction: column; overflow-y: auto; }
      .pf-view { flex: none; height: 55dvh; position: sticky; top: 0; z-index: 2; }
      .pf-side { border-left: 0; overflow: visible; }
      .ce-size { display: none; }
      .pf-modal .ce-head h3 { font-size: var(--fs-sm); }
  }
  ```

#### B. Audit of PR #22's Changes on Master
In PR #22, our mobile responsive changes to `PhotoFootprintOverlay.jsx` modified the older master version:
1. Standardized breakpoint to `@media (max-width: 768px)` (aligning with the global 768px standard instead of 760px).
2. Reduced `.pf-view` sticky height from `50dvh`/`55dvh` down to `40dvh`.
   - *Rationale*: At `55dvh`, on a 780px or 844px mobile viewport, the sticky image preview leaves only ~300px for the controls. Users were forced into excessive vertical scrolling to reach pin marking and OCR buttons. `40dvh` leaves ample room for immediate tool interactions.
3. Added touch-target accessibility rules:
   ```css
   .pf-side .ce-btn { min-height: 40px; }
   .pf-modal .ce-head .ce-btn { min-height: 36px; }
   ```

#### C. Reconciliation Recipe for PR #21 and PR #22
When merging or rebasing `feat/mobile-responsive` on top of `fix/photo-crop-first`:
1. **Source Code**: Accept `origin/fix/photo-crop-first`'s entire JavaScript logic, hooks, state machines, and canvas rendering without modifications.
2. **CSS Patch**: In `src/components/PhotoFootprintOverlay.jsx`, update lines 745–752 to apply the mobile ergonomic rules:
   ```diff
   - @media (max-width: 760px) {
   + @media (max-width: 768px) {
         .pf-modal { width: 100vw; height: 100dvh; max-height: none; border-radius: 0; border: 0; }
         .pf-body { display: flex; flex-direction: column; overflow-y: auto; }
   -     .pf-view { flex: none; height: 55dvh; position: sticky; top: 0; z-index: 2; }
   +     .pf-view { flex: none; height: 40dvh; position: sticky; top: 0; z-index: 2; }
         .pf-side { border-left: 0; overflow: visible; }
   +     .pf-side .ce-btn { min-height: 40px; }
         .ce-size { display: none; }
         .pf-modal .ce-head h3 { font-size: var(--fs-sm); }
   +     .pf-modal .ce-head .ce-btn { min-height: 36px; }
     }
   ```
This provides a clean, conflict-free resolution that incorporates the algorithmic advancements from PR #21 with the mobile ergonomic improvements from PR #22.

