# Button-printer: multi-image + links to sibling tools

Date: 2026-07-17
Status: Approved (design)

## Context

The main `button-printer/` app (repo root) is single-image: one `CanvasController`,
`handleImageSelect` reads `files[0]`, and `generatePrintLayout` fans one `imageState` across
every button cell. The sibling `square-label-printer/` already added a multi-image "slot" model
(each image with its own crop + a repeat quantity) that the user likes. This change brings that
capability to the main button tool, plus adds navigation links from the button page to the two
sibling apps.

Two user-confirmed decisions:
1. **Auto-fill evenly** — image quantities default so the images divide the sheet evenly, and
   recompute when an image is added/removed or the button size changes; one image still fills the
   whole sheet (matching today's behavior). Any quantity can be manually overridden.
2. **Links on the main page only** — an "Other tools" block on the button page pointing at the two
   subfolders; the subfolders themselves are **not** modified.

Everything below is confined to `button-printer/` (repo root `js/`, `css/`, `index.html`). No
shared cross-folder modules (each app stays self-contained, per the repo pattern). No alignment
grid / position correction (square-label-specific; out of scope).

## Why the renderer barely changes

`renderPrintLayout` (`js/printGenerator.js:167`) already reads `buttonSize` from the page-level
`layout` (line 171) and only `{image, scale, offsetX, offsetY}` from `btn.imageState` (line 197) —
never `imageState.buttonSize`. So the renderer is already per-cell capable. `buttonSize` is
coupled into `imageState` in exactly one spot: `generatePrintLayout`'s input
(`const { buttonSize } = imageState`, `js/printGenerator.js:69`). That is the seam we cut.

## Data model

```js
// app.js state
let slots = [];            // { id, image, name, scale, offsetX, offsetY, quantity, manual }
let activeSlotId = null;   // which slot the shared canvas is editing
let nextSlotId = 1;
let currentSizeKey = '1.25'; // unchanged; page-level button size
```

- One `CanvasController` edits whichever slot is active (same pattern as square-label). `buttonSize`
  stays page-level on the controller (drives the crop guides).
- `manual` = the user has typed a quantity for this slot (pins it); otherwise the slot is "auto".

### Auto-fill-evenly algorithm

```
totalCells = calculateButtonsPerPage(getButtonSize(currentSizeKey), US_LETTER).total  // grid or hex
manualSum  = Σ slot.quantity where slot.manual
autoSlots  = slots where !slot.manual
remaining  = max(0, totalCells - manualSum)
base       = floor(remaining / autoSlots.length)      // if autoSlots.length > 0
extra      = remaining - base * autoSlots.length       // give +1 to the first `extra` auto slots
→ each auto slot.quantity = base (+1 for the first `extra` of them)
```

Recompute this on: **add image**, **remove image**, **button-size change**. Manual quantities are
left as-is; auto slots absorb the remainder. If `autoSlots` is empty and the manual sum ≠ total,
nothing auto-adjusts — the indicator just warns.

Note the total for hex sizes uses the hex `total` (neither current size declares `layout:'hex'`,
so both sizes use the grid path today; the code still reads whichever `total` applies).

### Cell expansion

```
buildCellStates():
  saveActiveTransform()                 // capture the live crop of the active slot first
  cells = []
  for slot of slots:                    // grouped order: image1×qty, image2×qty, …
    for i in 0..slot.quantity, while cells.length < totalCells:
      cells.push({ image, scale, offsetX, offsetY })
  return cells                          // length ≤ totalCells; renderer blanks the rest
```

## Module changes (all under `button-printer/`)

- **`js/printGenerator.js`**
  - `generatePrintLayout(cellStates, buttonSize, paperSize = US_LETTER, cal = 1.0)` — compute the
    grid/hex positions exactly as now, but assign `cellStates[i]` to each cell (row-major;
    `null`/absent → blank). Dispatch to the hex variant on `buttonSize.layout === 'hex'`.
  - `generateHexPrintLayout(cellStates, buttonSize, paperSize, cal)` — same signature change.
  - `renderPrintLayout` — near-unchanged (already uses `layout.buttonSize` + `btn.imageState`); the
    only edit is a one-line guard to skip a `null`/imageless cell.
- **`js/canvasController.js`**
  - Add `setImageState({image, scale, offsetX, offsetY})` — load a slot's image + transform without
    resetting the crop (contrast with `setImage`, which resets/fits a brand-new image).
  - Add `clearImage()` — drop the active image and re-render empty.
  - `setButtonSize`, guides, pan/wheel, `getImageState` stay. Transform write-back is lazy (the app
    calls `saveActiveTransform()` before switching slots / previewing / printing), so no new
    callbacks are required; `onScaleChange` additionally triggers a save.
- **`js/app.js`** — the substantive rework, porting square-label's structure:
  - `handleImageSelect` loops `Array.from(e.target.files)`, `await loadImage` each, pushes an auto
    slot, resets the input, unhides controls, selects the first-ever slot, runs auto-fill + renders.
  - `selectSlot`, `removeSlot`, `handleQtyChange` (sets `manual = true`, re-runs auto-fill for the
    rest), `renderSlotList`, `renderTotal`, `updateActiveHint`, `buildCellStates`,
    `saveActiveTransform`, `distributeAuto()`.
  - `handleSizeChange` → set `currentSizeKey`, `controller.setButtonSize(...)`, recompute
    `totalCells`, `distributeAuto()`, re-render slot list + total + (if open) preview + canvas.
  - `handlePrint` → `generatePrintLayout(buildCellStates(), getButtonSize(currentSizeKey),
    US_LETTER, getCalibrationFactor())`.
  - `renderPreview` → same, `cal` omitted; iterate `layout.buttons` (already reads `btn.imageState`).
  - `computeBaseScale`/`syncSlider` unchanged (per active slot, cut-diameter based).
- **`index.html`**
  - `#image-input` gains `multiple`.
  - Add the slot-list container + `#button-total` indicator under the load-image group.
  - Add an **"Other tools"** block as its own `control-group` at the bottom of the controls panel,
    with two relative links: `name-badge-printer/` ("Name Badges – Avery 25395") and
    `square-label-printer/` ("Square Labels – Avery 22853/22806").
- **`css/styles.css`** — port the `.slot-list` / `.slot-item` / `.slot-thumb` / `.slot-qty` /
  `.slot-remove` / `.button-total` styles from square-label; add a small `.tool-links` style.

## Out of scope

Alignment grid / position correction; any change to `name-badge-printer/` or `square-label-printer/`;
shared cross-folder modules; new button sizes.

## Verification

1. `node --check` every changed module.
2. Headless ESM test (a throwaway `.mjs` in `js/`): `generatePrintLayout` fans distinct cell states
   to distinct cells; `buildCellStates`/`distributeAuto` split evenly for 1.25″ (20 cells) and
   2.25″ (6 cells), one image fills the whole sheet, a manual override pins one slot and the rest
   absorb the remainder, and a size switch redistributes.
3. PIL render of a multi-image button sheet (using the app's cover-fit + circular-clip math) to
   eyeball placement.
4. User spot-checks in a browser via `python3 -m http.server` (Playwright is unavailable in this
   WSL env): load several images, adjust crops per slot, change size and watch the split recompute,
   preview, print-to-PDF; verify the "Other tools" links open the sibling apps.
