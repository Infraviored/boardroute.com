# Code Review: Part Picture & Photo Dialog UI

**Target:** `origin/feat/part-picture` compared against `origin/feat/board-size`  
**Merge Base:** `7fa55cce70739499e55b25e50c1ea1a3a86684af`  
**Commit Under Review:** `b5ff7d6` (*feat: picture-only mode, drag the photo outside the frame, part pictures in the export*)  
**Status on `origin/master`:** Branch commit `b5ff7d6` is not yet merged into `origin/master`. Findings are evaluated against `origin/master`.

---

## 1. Review Scope & Methodology

Review was conducted deterministically using `ocr delegate preview` and `ocr delegate rule`.
- **Reviewable files examined:**
  - `src/App.jsx`
  - `src/components/CompEditorOverlay.jsx`
  - `src/components/ExportOverlay.jsx`
  - `src/components/PhotoFootprintOverlay.jsx`
  - `src/engine/engine.js`
  - `src/engine/render-utils.js`
  - `tools/place-and-link.js` (inspected for compatibility; unchanged in diff)
- **Rule source:** OCR Rule Group 1 (`**/*.{ts,js,tsx,jsx,mjs,cjs}`). No custom repository rule files (`rule.json`, `.ocr/rule.json`, `.agents/**/rule.json`) were present in the repository.

---

## 2. Detailed Focus Area Analysis

### 2.1 PhotoFootprintOverlay Picture Mode
- **Aspect-Locked Frame (`aspect = picture ? footprint.w / footprint.h : 0`):**
  - Initialization: In `startFrame(W, H, aspect)`, the initial bounding box respects `w / h === aspect` while fitting inside `0.6 * PW` and `0.6 * PH`.
  - Resize Handles: In `onFrameMove`, when `aspect` is active, dragging edge or corner handles enforces proportional resizing (`h = w / aspect` or `w = h * aspect`).
  - Anchor Invariance: The offsets `cu` and `cv` correctly anchor the opposite edge or corner in frame-local space (`fixed + sx * w / 2`), ensuring the stationary side does not drift during sizing.
  - Pin Preview in Frame Mode: When `picture` is true, green rings (`rgba(63,185,80,.8)`) are mapped to `fromFrame(frame, (c + 0.5) * frame.w / footprint.w - frame.w / 2, (r + 0.5) * frame.h / footprint.h - frame.h / 2)`. This provides a visual alignment guide during step 1 framing.
- **Fixed Pins in Align Mode:**
  - Upon transitioning to step 2 in picture mode, `measure` is initialized to `{ kind: 'grid', pitch0: pitch }` with `grid.pitch = frameWidth / footprint.w` and pins set to `footPins(mirror)`.
  - In `onPointerDown`, `t('data-pin')` checks `!measure || (measure.kind === 'scale' && measure.b)`. Because `measure.kind === 'grid'`, pin dragging is disabled and pointer interactions fall through to grid/view panning (`drag.grid = true`).
  - In `onPointerUp`, tap events verify `measure.kind !== 'grid'`. Pin creation, deletion, and selection are disabled, keeping pins locked in place.
- **`cutOut` with Mirroring:**
  - When "Photo shows the underside" is checked in picture mode, `mirror` state is toggled and target pins are mirrored across columns (`footprint.w - 1 - c`), allowing the user to align the underside photo directly with the mirrored pin positions.
  - In `cutOut(state, grid, body, mirror)`, `if (mirror) ctx.setTransform(-1, 0, 0, 1, W, 0)` is applied prior to inverse grid mapping. This flips the canvas horizontally across `W = body.w * S`, restoring the extracted WebP texture to top-side orientation so it matches the board's top-view pin coordinates.

### 2.2 Pan Outside the Frame (Frame/View Math)
- In step 1 `onFrameDown`, pointer coordinates `(u, v)` are computed relative to the frame center via `toFrame(frame, p.x, p.y)`. If outside `|u| <= frame.w / 2` and `|v| <= frame.h / 2`, drag mode becomes `'pan'`.
- In `onFrameMove`:
  $$\Delta x = \frac{e.clientX - drag.sx}{drag.z}, \quad \Delta y = \frac{e.clientY - drag.sy}{drag.z}$$
  Both the frame center `f.cx - \Delta x, f.cy - \Delta y` and viewBox `drag.v[0] - \Delta x, drag.v[1] - \Delta y` are offset by the identical delta.
  Because screen position is $X_{\text{screen}} = (X_{\text{svg}} - V_x) \cdot \text{zoom}$, the term $(c_x - \Delta x) - (v_x - \Delta x) = c_x - v_x$ remains constant. The frame remains stationary on the user's display while the background photo moves 1:1 with the pointer.
- On `onFrameUp`, `glideTo(fitView(frame))` animates smoothly to recenter and fit the frame.

### 2.3 CompEditorOverlay `applyPhoto` Image-Only Box
- In `applyPhoto({ pins, body, image })`, when `!pins` (picture-only mode from `PhotoFootprintOverlay`), `image` is stored as:
  $$\text{image}: \{ \text{src}: image.src, \text{turn}: 0, \text{box}: \{ x: foot.x, y: foot.y, w: foot.w, h: foot.h \}, \text{base}: \{ w: foot.w, h: foot.h \} \}$$
- On save, `recordFromImage` transforms `image.box` relative to `foot`:
  $$box.x = img.box.x - foot.x = 0, \quad box.y = img.box.y - foot.y = 0$$
  The recorded footprint size `fw: foot.w, fh: foot.h` and pin offsets `offs` match the saved component footprint.
- On reopen, `imageFromRecord` evaluates `photoTurn(comp, rec)`. Since `comp.w === rec.fw` and `comp.h === rec.fh` and pin offsets match, `photoTurn` returns `0`, rendering the image overlay with zero offset drift.

### 2.4 Export Photos (Solder-Side Mirror & `photoTurn` Filter)
- In `ExportOverlay.jsx`, `photos` is memoized to filter `partImages`:
  ```javascript
  if (partImages?.[c.id] && photoTurn(c, partImages[c.id]) >= 0) out[c.id] = partImages[c.id];
  ```
  Parts whose footprint pins changed since the photo was taken return `photoTurn < 0` and are excluded from export, matching board canvas behavior.
- In `src/engine/render-utils.js`:
  - `generatePrunedSVG` passes `mirrorPhoto: isBottom` (`side === 'bottom'`) to `renderCompSVG`.
  - In `renderCompSVG`:
    ```javascript
    if (pic) out += `<g opacity="${opts.photoOpacity ?? 0.3}"${opts.mirrorPhoto ? ` transform="translate(${(2 * c.ox + c.w) * SP} 0) scale(-1 1)"` : ''}>${pic}</g>`;
    ```
    For solder side, `c.ox` is already mirrored to `mCenter - c.ox - c.w` in `displayComps`. The horizontal transform `X' = (2 * c.ox + c.w) * SP - X` mirrors the photo horizontally across the component's bounding box without altering vertical coordinates, matching the physical rear perspective of through-hole components.

### 2.5 `engine.repairPart` Early Return
- In `src/engine/engine.js`:
  ```javascript
  // nothing broke (a new picture, a renamed pin): keep the wiring as it is
  if (!overlaps() && complete()) return true;
  ```
- **Overlap check:** `overlaps()` validates bounding box separation against all other components. If overlap exists, `!overlaps()` is false, and early exit is prevented.
- **Connectivity check:** `complete()` verifies `nc.done === nc.total` via `netCompletion(this.components, this.wires)`. If any net wire was severed or unrouted, `complete()` is false, and early exit is prevented.
- When neither condition is violated (e.g. updating a component image, changing a pin label, or re-saving an unchanged footprint), `repairPart` returns `true` immediately without disrupting existing wires or running costly rip-up/reroute passes.

### 2.6 `tools/place-and-link.js`
- Inspected CLI script `tools/place-and-link.js`.
- Confirmed zero diff between `origin/feat/board-size` and `origin/feat/part-picture`.
- The tool reads circuits or share links and runs `routeFixed(components)`. Because share links do not store binary `partImages` (which are persisted locally via `pcb_part_images` / project JSON files), `tools/place-and-link.js` is unaffected.

---

## 3. Findings

### Finding 1: Pre-existing Unrouted Nets Trigger Unnecessary Reroute on Metadata Edit
- **Location:** [src/engine/engine.js:472](file:///home/flo/docker-projects/boardroute.com/.wt/review-pr-30-part-picture-photo-dialog-ui/src/engine/engine.js#L472)
- **Severity / Category:** Low — Maintainability / Performance
- **Status:** FIXED on `feat/part-picture` (STILL LIVE on `origin/master`)
- **Description:**
  `repairPart(id)` checked board-wide completion via `complete() = (nc.done === nc.total)`.
- **Concrete Failure Scenario:**
  1. The user has a layout with at least one unrouted or failed net on an unrelated component (e.g. `R2` has an open connection, so `nc.done < nc.total`).
  2. The user opens the editor for component `U1` and only updates its picture via "Picture from photo", leaving pins and position untouched.
  3. `mergeBoard` runs, followed by `await engine.repairPart('U1')`.
  4. Although `U1` did not cause any net breakages or overlaps, `complete()` evaluated to `false` due to `R2`.
  5. As a result, the early return was bypassed, attempting shifts and re-routing.
- **Resolution:**
  Implemented `compNetsConnected(comp, components, wires)` in `src/engine/engine.js`. The early return now scopes connectivity validation strictly to nets that have pins on the edited component, ensuring unrelated open nets elsewhere on the board do not prevent early return.

---

## 4. Coverage Summary

- **Covered:**
  - `src/App.jsx`: Prop forwarding of `partImages` to `ExportOverlay`.
  - `src/components/CompEditorOverlay.jsx`: Picture mode invocation, button state toggling, `applyPhoto` handling for image-only updates, and footprint bounding box synchronization.
  - `src/components/ExportOverlay.jsx`: `partImages` filtering via `photoTurn`, UI checkbox toggling, options passing to `generateBoardSVG` and `generateCombinedSVG`.
  - `src/components/PhotoFootprintOverlay.jsx`: Dual-mode workflow (`footprint` vs `picture`), aspect-locked framing, pan math outside the frame, green pin preview circles, step 2 align mode pin locking, mirror transformation in `cutOut`.
  - `src/engine/engine.js`: `repairPart` early exit guard, overlap detection, net completion verification.
  - `src/engine/render-utils.js`: `renderCompSVG` solder-side mirror transform matrix and photo opacity options, `generatePrunedSVG` integration.
  - `tools/place-and-link.js`: Evaluated for share link schema compatibility.
- **Not Covered / Excluded:**
  - Non-code documentation changes in `CLAUDE.md` (excluded from review rules per file extension policy).
