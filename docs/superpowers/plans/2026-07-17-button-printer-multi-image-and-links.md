# Button-printer multi-image + links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the main `button-printer/` app multi-image support (each image with its own crop and an auto-balanced repeat count) plus links to the two sibling tools.

**Architecture:** Port the "slot" model from `square-label-printer/` into the button tool, adapted for the button-count-per-sheet that varies by size. Pure fill/expand logic goes in a new testable `js/slotFill.js`; `generatePrintLayout` is refactored to take an array of per-cell image states + a page-level `buttonSize`; the renderer is already per-cell capable.

**Tech Stack:** Vanilla JS ES modules, no build, no framework. Canvas 2D. CSS inches for print accuracy.

## Global Constraints

- Changes are confined to `button-printer/` (repo root `js/`, `css/`, `index.html`). Do **not** modify `name-badge-printer/` or `square-label-printer/`.
- No new dependencies, no build step, no test framework. "Tests" = headless `node` ESM assertion scripts for pure modules; DOM/visual behavior is verified in a browser + a PIL render.
- The repo is on branch `main`. Before any commit, create a feature branch (Task 0). Only commit with the user's explicit go-ahead; commit messages end with the repo's required Co-Authored-By / Claude-Session trailers.
- Preserve today's single-image behavior as a special case: one image fills the whole sheet.
- All physical measurements are inches until handed to a canvas bitmap (96 px/in via `inchesToPixels`).

---

## Task 0: Feature branch

**Files:** none (git only)

- [ ] **Step 1: Create and switch to a feature branch**

Run:
```bash
git checkout -b button-printer-multi-image
```
Expected: `Switched to a new branch 'button-printer-multi-image'`

---

## Task 1: Pure slot-fill helpers (`js/slotFill.js`)

**Files:**
- Create: `js/slotFill.js`
- Test: throwaway `js/_slotfill.test.mjs` (run then delete; not committed)

**Interfaces:**
- Produces:
  - `distributeEvenly(totalCells: number, slots: {quantity:number, manual:boolean}[]) -> number[]` — quantities aligned to `slots`; manual slots keep their quantity, auto slots evenly split the remainder (extra +1 to earliest auto slots).
  - `expandCells(slots: {image,scale,offsetX,offsetY,quantity}[], totalCells: number) -> {image,scale,offsetX,offsetY}[]` — grouped, row-major, capped at `totalCells`.

- [ ] **Step 1: Write the failing test**

Create `js/_slotfill.test.mjs`:
```js
import { distributeEvenly, expandCells } from './slotFill.js';

let failed = 0;
function eq(got, want, msg) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.error('FAIL:', msg, '\n  got ', JSON.stringify(got), '\n  want', JSON.stringify(want));
    failed++;
  } else console.log('ok:', msg);
}

// distributeEvenly
eq(distributeEvenly(20, [{ quantity: 0, manual: false }]), [20], '1 auto image fills 20');
eq(distributeEvenly(20, [{ quantity: 0, manual: false }, { quantity: 0, manual: false }]), [10, 10], '2 auto split 10/10');
eq(distributeEvenly(20, [{ quantity: 0, manual: false }, { quantity: 0, manual: false }, { quantity: 0, manual: false }]), [7, 7, 6], '3 auto split 7/7/6 (remainder to earliest)');
eq(distributeEvenly(20, [{ quantity: 5, manual: true }, { quantity: 0, manual: false }]), [5, 15], 'manual 5 pins, auto absorbs 15');
eq(distributeEvenly(6, [{ quantity: 10, manual: true }, { quantity: 0, manual: false }]), [10, 0], 'manual overflow -> auto clamps to 0');
eq(distributeEvenly(20, [{ quantity: 3, manual: true }, { quantity: 3, manual: true }]), [3, 3], 'all manual kept as-is');

// expandCells
const A = { naturalWidth: 1 }, B = { naturalWidth: 2 };
const cells = expandCells(
  [{ image: A, scale: 1, offsetX: 0, offsetY: 0, quantity: 3 },
   { image: B, scale: 1, offsetX: 0, offsetY: 0, quantity: 2 }], 6);
eq(cells.map((c) => c.image), [A, A, A, B, B], 'grouped expand A×3,B×2');
eq(expandCells([{ image: A, scale: 1, offsetX: 0, offsetY: 0, quantity: 10 }], 6).length, 6, 'expand capped at total');

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node js/_slotfill.test.mjs`
Expected: FAIL — `Cannot find module .../slotFill.js`

- [ ] **Step 3: Write `js/slotFill.js`**

```js
/**
 * Slot-fill helpers (pure, no DOM — headless-testable)
 *
 * distributeEvenly: auto-balance a page's button count across image slots.
 * expandCells: expand slots into a flat, row-major list of per-cell states.
 */

/**
 * Slots the user hasn't pinned ("auto") evenly split the cells left over
 * after the pinned ("manual") slots; the remainder gives +1 to the
 * earliest auto slots. Manual slots keep their quantity.
 * @param {number} totalCells
 * @param {{quantity:number, manual:boolean}[]} slots
 * @returns {number[]} quantities aligned to `slots`
 */
export function distributeEvenly(totalCells, slots) {
  const quantities = slots.map((s) => (s.manual ? Math.max(0, s.quantity | 0) : 0));
  const autoIndexes = [];
  let manualSum = 0;
  slots.forEach((s, i) => {
    if (s.manual) manualSum += quantities[i];
    else autoIndexes.push(i);
  });

  if (autoIndexes.length === 0) return quantities;

  const remaining = Math.max(0, totalCells - manualSum);
  const base = Math.floor(remaining / autoIndexes.length);
  let extra = remaining - base * autoIndexes.length;
  for (const i of autoIndexes) {
    quantities[i] = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
  }
  return quantities;
}

/**
 * Expand slots into a flat row-major list of up to `totalCells` per-cell
 * image states, in slot order (image1×qty, image2×qty, …). Extra copies
 * past the total are dropped.
 * @param {{image:any,scale:number,offsetX:number,offsetY:number,quantity:number}[]} slots
 * @param {number} totalCells
 * @returns {{image:any,scale:number,offsetX:number,offsetY:number}[]}
 */
export function expandCells(slots, totalCells) {
  const cells = [];
  for (const slot of slots) {
    for (let i = 0; i < slot.quantity && cells.length < totalCells; i++) {
      cells.push({
        image: slot.image,
        scale: slot.scale,
        offsetX: slot.offsetX,
        offsetY: slot.offsetY,
      });
    }
    if (cells.length >= totalCells) break;
  }
  return cells;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node js/_slotfill.test.mjs`
Expected: `ALL PASS` (exit 0)

- [ ] **Step 5: Delete the throwaway test and commit**

```bash
rm js/_slotfill.test.mjs
git add js/slotFill.js
git commit -m "feat(button-printer): add pure slot-fill helpers (distributeEvenly, expandCells)"
```

---

## Task 2: Refactor `generatePrintLayout` to per-cell image states

**Files:**
- Modify: `js/printGenerator.js` (`generatePrintLayout` ~lines 68-95, `generateHexPrintLayout` ~lines 108-155, `renderPrintLayout` ~lines 176-234)
- Modify: `js/app.js` (`handlePrint` ~lines 197-208, `renderPreview` ~lines 324-331, imports ~line 10) — keep single-image working on the new API
- Test: throwaway `js/_layout.test.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `generatePrintLayout(cellStates, buttonSize, paperSize = US_LETTER, cal = 1.0)` — `cellStates` is a row-major array of `{image,scale,offsetX,offsetY}` (or `null`); returns `{ paperSize, buttonSize, grid, buttons, cal }` where each `button` is `{x, y, imageState}`.
  - `generateHexPrintLayout(cellStates, buttonSize, paperSize, cal)` — same shape.
  - `calculateButtonsPerPage` unchanged (already exported).

- [ ] **Step 1: Write the failing test**

Create `js/_layout.test.mjs`:
```js
import { generatePrintLayout, calculateButtonsPerPage, US_LETTER } from './printGenerator.js';
import { getButtonSize } from './buttonSizes.js';

let failed = 0;
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); failed++; } else console.log('ok:', m); };

const size = getButtonSize('2.25');
const total = calculateButtonsPerPage(size, US_LETTER).total; // grid total for 2.25"
const A = { image: { naturalWidth: 10, naturalHeight: 10 }, scale: 1, offsetX: 0, offsetY: 0 };
const B = { image: { naturalWidth: 20, naturalHeight: 20 }, scale: 1, offsetX: 0, offsetY: 0 };

const cells = Array.from({ length: total }, (_, i) => (i === 0 ? A : B));
const layout = generatePrintLayout(cells, size, US_LETTER, 1.0);
ok(layout.buttons.length === total, `produces ${total} button cells`);
ok(layout.buttons[0].imageState === A, 'cell 0 gets image A');
ok(layout.buttons[1].imageState === B, 'cell 1 gets image B (distinct per cell)');
ok(layout.buttonSize === size, 'buttonSize carried on layout');

// blank cells when fewer states than cells
const sparse = generatePrintLayout([A], size, US_LETTER, 1.0);
ok(sparse.buttons[0].imageState === A && sparse.buttons[total - 1].imageState === null, 'missing cells are null');

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node js/_layout.test.mjs`
Expected: FAIL — old `generatePrintLayout(imageState, …)` reads `imageState.buttonSize`, so `layout.buttons[0].imageState` is the whole `size`/array, not `A`.

- [ ] **Step 3: Rewrite `generatePrintLayout` and `generateHexPrintLayout`**

Replace `generatePrintLayout` (currently `js/printGenerator.js:68-95`) with:
```js
export function generatePrintLayout(cellStates, buttonSize, paperSize = US_LETTER, cal = 1.0) {
  if (buttonSize.layout === 'hex') {
    return generateHexPrintLayout(cellStates, buttonSize, paperSize, cal);
  }

  const calibratedDiameter = buttonSize.cutLineDiameter * cal;
  const grid = calculateButtonsPerPage(buttonSize, paperSize, cal);

  const printableWidth = paperSize.width - paperSize.marginLeft - paperSize.marginRight;
  const printableHeight = paperSize.height - paperSize.marginTop - paperSize.marginBottom;

  const cellWidth = printableWidth / grid.columns;
  const cellHeight = printableHeight / grid.rows;

  const buttons = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.columns; col++) {
      const i = row * grid.columns + col;
      const x = paperSize.marginLeft + col * cellWidth + (cellWidth - calibratedDiameter) / 2;
      const y = paperSize.marginTop + row * cellHeight + (cellHeight - calibratedDiameter) / 2;
      buttons.push({ x, y, imageState: cellStates[i] || null });
    }
  }

  return { paperSize, buttonSize, grid, buttons, cal };
}
```

Replace `generateHexPrintLayout` signature + button push (currently `js/printGenerator.js:108-155`) with:
```js
function generateHexPrintLayout(cellStates, buttonSize, paperSize, cal = 1.0) {
  const diameter = buttonSize.cutLineDiameter * cal;
  const numRows = buttonSize.maxRows || 4;
  const available = paperSize.width - 3 * diameter;
  const gap = Math.min(0.2, Math.max(0, available / 4));
  const step = diameter + gap;

  const rowCounts = [];
  for (let i = 0; i < numRows; i++) rowCounts.push(i % 2 === 0 ? 3 : 2);
  const total = rowCounts.reduce((sum, n) => sum + n, 0);

  const totalWidth = 2 * step + diameter;
  const startX3 = (paperSize.width - totalWidth) / 2;
  const startX2 = startX3 + step / 2;

  const rowSpacing = step * Math.sqrt(3) / 2;
  const totalHeight = (numRows - 1) * rowSpacing + diameter;
  const startY = (paperSize.height - totalHeight) / 2;

  const buttons = [];
  let i = 0;
  for (let row = 0; row < numRows; row++) {
    const count = rowCounts[row];
    const baseX = count === 3 ? startX3 : startX2;
    const y = startY + row * rowSpacing;
    for (let col = 0; col < count; col++) {
      const x = baseX + col * step;
      buttons.push({ x, y, imageState: cellStates[i] || null });
      i++;
    }
  }

  const grid = { columns: 3, rows: numRows, total, layout: 'hex' };
  return { paperSize, buttonSize, grid, buttons, cal };
}
```

- [ ] **Step 4: Add the null-cell guard in `renderPrintLayout`**

In `js/printGenerator.js`, inside `buttons.forEach((btn) => {` (currently line 176), add as the first line of the callback:
```js
    if (!btn.imageState || !btn.imageState.image) return; // blank cell
```

- [ ] **Step 5: Update the two `app.js` call sites to the new API (keep single-image working)**

In `js/app.js`, change the import on line 10 to add `calculateButtonsPerPage`:
```js
import { generatePrintLayout, renderPrintLayout, renderTestSheet, calculateButtonsPerPage, US_LETTER } from './printGenerator.js';
```

Replace the body of `handlePrint` (currently `js/app.js:197-208`) with:
```js
function handlePrint() {
  if (!controller.image) return;

  const st = controller.getImageState();
  const size = st.buttonSize;
  const cal = getCalibrationFactor();
  const total = calculateButtonsPerPage(size, US_LETTER, cal).total;
  const cellStates = Array.from({ length: total }, () => st);
  const layout = generatePrintLayout(cellStates, size, US_LETTER, cal);
  renderPrintLayout(layout, printLayout);

  requestAnimationFrame(() => {
    window.print();
  });
}
```

Replace the first three lines of `renderPreview`'s body (currently `js/app.js:329-331`, the `const imageState …`, `const layout …`, `const { … } = layout;`) with:
```js
  const imageState = controller.getImageState();
  const size = imageState.buttonSize;
  const total = calculateButtonsPerPage(size, US_LETTER).total;
  const cellStates = Array.from({ length: total }, () => imageState);
  const layout = generatePrintLayout(cellStates, size, US_LETTER);
  const { buttonSize, buttons, paperSize } = layout;
```

- [ ] **Step 6: Run the layout test + syntax check**

Run: `node js/_layout.test.mjs && for f in js/*.js; do node --check "$f"; done`
Expected: `ALL PASS`, no syntax errors.

- [ ] **Step 7: Delete throwaway test and commit**

```bash
rm js/_layout.test.mjs
git add js/printGenerator.js js/app.js
git commit -m "refactor(button-printer): generatePrintLayout takes per-cell image states + page buttonSize"
```

---

## Task 3: CanvasController — load a slot without resetting its crop

**Files:**
- Modify: `js/canvasController.js` (add two methods after `setImage`, ~line 73)

**Interfaces:**
- Produces:
  - `CanvasController.setImageState({image, scale, offsetX, offsetY})` — set image + transform without refitting.
  - `CanvasController.clearImage()` — drop the image and re-render empty.

- [ ] **Step 1: Add the methods**

In `js/canvasController.js`, immediately after the `setImage` method (ends `js/canvasController.js:73`), add:
```js
  /**
   * Load an existing slot's image + transform WITHOUT resetting the crop
   * (contrast with setImage, which fits a brand-new image).
   * @param {{image:HTMLImageElement, scale:number, offsetX:number, offsetY:number}} state
   */
  setImageState(state) {
    this.image = state.image;
    this.scale = state.scale;
    this.offsetX = state.offsetX;
    this.offsetY = state.offsetY;
    this._sizeCanvas();
    this.render();
  }

  /** Clear the active image and re-render an empty canvas. */
  clearImage() {
    this.image = null;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.render();
  }
```

- [ ] **Step 2: Syntax check**

Run: `node --check js/canvasController.js`
Expected: no output (valid).

- [ ] **Step 3: Commit**

```bash
git add js/canvasController.js
git commit -m "feat(button-printer): CanvasController.setImageState + clearImage for slot switching"
```

---

## Task 4: HTML + CSS for the slot list (no JS wiring yet)

**Files:**
- Modify: `index.html` (`#image-input` line 24; the Load-Image `control-group` lines 20-27)
- Modify: `css/styles.css` (append slot-list + total styles)

**Interfaces:**
- Produces DOM: `#image-input` now `multiple`; `#slot-section` (hidden) containing `#slot-list` and `#button-total`.

- [ ] **Step 1: Update the Load-Image group in `index.html`**

Replace lines 20-27 (the `<div class="control-group">` for "1. Load Image") with:
```html
        <div class="control-group">
          <h2>1. Load Images</h2>
          <label for="image-input" class="file-input-label">
            <span id="file-label-text">Choose one or more images…</span>
            <input type="file" id="image-input" accept="image/jpeg,image/png,image/gif,image/webp" multiple />
          </label>
          <div id="image-error" class="error-message" role="alert" hidden></div>

          <div id="slot-section" hidden>
            <div id="slot-list" class="slot-list"></div>
            <div id="button-total" class="button-total"></div>
            <p class="hint" style="margin-top: 0.4rem;">
              Each image repeats to fill the sheet. Counts balance automatically;
              type a number to pin one and the rest re-balance.
            </p>
          </div>
        </div>
```

- [ ] **Step 2: Append slot styles to `css/styles.css`**

Copy the slot-list style block from `square-label-printer/css/styles.css` (the `.slot-list`, `.slot-item`, `.slot-item.active`, `.slot-thumb`, `.slot-meta`, `.slot-name`, `.slot-index`, `.slot-qty`, `.slot-qty input`, `.slot-remove`, `.slot-remove:hover` rules) into `css/styles.css`, then add the total indicator (renamed from square-label's `.label-total`):
```css
.button-total {
  margin-top: 0.6rem;
  padding: 0.4rem 0.5rem;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  text-align: center;
  background: #ecfdf5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}

.button-total.warn {
  background: #fffbeb;
  color: #92400e;
  border-color: #fde68a;
}
```
(If `button-printer/css/styles.css` lacks the `--radius`/color variables used by the copied block, keep the copied literal values or map them to the button app's existing variables — check the top of `css/styles.css` first.)

- [ ] **Step 3: Verify the page still loads**

Run: `python3 -m http.server 8000` (in repo root), open `http://localhost:8000/`, confirm the page renders, no console errors, the file input says "Choose one or more images…". Stop the server.

- [ ] **Step 4: Commit**

```bash
git add index.html css/styles.css
git commit -m "feat(button-printer): slot-list markup + styles (multiple image input)"
```

---

## Task 5: Rewrite `js/app.js` for the multi-slot model

**Files:**
- Modify: `js/app.js` (full rewrite of state + handlers; calibration/settings handlers unchanged in behavior)

**Interfaces:**
- Consumes: `distributeEvenly`, `expandCells` (Task 1); `generatePrintLayout`, `calculateButtonsPerPage`, `renderPrintLayout`, `renderTestSheet`, `US_LETTER` (Task 2); `CanvasController.setImageState/clearImage` (Task 3); `#slot-section`, `#slot-list`, `#button-total` (Task 4).

- [ ] **Step 1: Replace `js/app.js` with the multi-slot version**

Replace the entire file `js/app.js` with:
```js
/**
 * Button Maker Image Tool – Application Entry Point (multi-image)
 *
 * Holds an array of image "slots", each with its own crop transform and a
 * repeat quantity, laid out across the buttons that fit on one US Letter
 * sheet (count varies by button size). One CanvasController edits the
 * active slot; quantities auto-balance across the sheet.
 */

import { loadImage } from './imageLoader.js';
import { getButtonSize } from './buttonSizes.js';
import { CanvasController } from './canvasController.js';
import {
  generatePrintLayout,
  renderPrintLayout,
  renderTestSheet,
  calculateButtonsPerPage,
  US_LETTER,
} from './printGenerator.js';
import { PIXELS_PER_INCH } from './measurementConverter.js';
import { distributeEvenly, expandCells } from './slotFill.js';
import {
  isStorageAvailable,
  savePrinterSettings,
  loadPrinterSettings,
  saveCalibration,
  loadCalibration,
  clearCalibration,
  getCalibrationFactor,
} from './settingsManager.js';

/* ============================================================
   DOM references
   ============================================================ */

const imageInput = document.getElementById('image-input');
const fileLabelText = document.getElementById('file-label-text');
const imageError = document.getElementById('image-error');
const canvasEl = document.getElementById('button-canvas');
const canvasPlaceholder = document.getElementById('canvas-placeholder');
const imageControls = document.getElementById('image-controls');
const printControls = document.getElementById('print-controls');
const scaleSlider = document.getElementById('scale-slider');
const scaleValue = document.getElementById('scale-value');
const modeResize = document.getElementById('mode-resize');
const modePreview = document.getElementById('mode-preview');
const printBtn = document.getElementById('print-btn');
const printInfoToggle = document.getElementById('print-info-toggle');
const printInstructions = document.getElementById('print-instructions');
const printLayout = document.getElementById('print-layout');
const printerNameInput = document.getElementById('printer-name');
const printerNotesInput = document.getElementById('printer-notes');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const storageWarning = document.getElementById('storage-warning');
const printPreview = document.getElementById('print-preview');
const printPreviewPage = document.getElementById('print-preview-page');
const canvasContainer = document.getElementById('canvas-container');
const printTestSheetBtn = document.getElementById('print-test-sheet-btn');
const calibrationMeasuredInput = document.getElementById('calibration-measured');
const saveCalibrationBtn = document.getElementById('save-calibration-btn');
const clearCalibrationBtn = document.getElementById('clear-calibration-btn');
const calibrationStatus = document.getElementById('calibration-status');
const slotSection = document.getElementById('slot-section');
const slotList = document.getElementById('slot-list');
const buttonTotal = document.getElementById('button-total');

/* ============================================================
   State
   ============================================================ */

/** @type {{id:number,image:HTMLImageElement,name:string,scale:number,offsetX:number,offsetY:number,quantity:number,manual:boolean}[]} */
let slots = [];
let activeSlotId = null;
let nextSlotId = 1;
let currentSizeKey = '1.25';
let controller = null;

/* ============================================================
   Initialization
   ============================================================ */

function init() {
  controller = new CanvasController(canvasEl);
  controller.setButtonSize(getButtonSize(currentSizeKey));

  controller.onScaleChange = () => {
    syncSlider();
    saveActiveTransform();
  };

  if (!isStorageAvailable()) storageWarning.hidden = false;

  restoreSettings();
  restoreCalibration();
  renderTotal();
  bindEvents();
}

/* ============================================================
   Event bindings
   ============================================================ */

function bindEvents() {
  imageInput.addEventListener('change', handleImageSelect);

  document.querySelectorAll('input[name="button-size"]').forEach((radio) => {
    radio.addEventListener('change', handleSizeChange);
  });

  scaleSlider.addEventListener('input', handleScaleChange);

  modeResize.addEventListener('click', () => setMode('resize'));
  modePreview.addEventListener('click', () => setMode('preview'));

  printBtn.addEventListener('click', handlePrint);
  printInfoToggle.addEventListener('click', () => {
    printInstructions.hidden = !printInstructions.hidden;
  });

  saveSettingsBtn.addEventListener('click', handleSaveSettings);

  printTestSheetBtn.addEventListener('click', handlePrintTestSheet);
  saveCalibrationBtn.addEventListener('click', handleSaveCalibration);
  clearCalibrationBtn.addEventListener('click', handleClearCalibration);

  const ro = new ResizeObserver(() => {
    if (controller && controller.image) {
      controller._sizeCanvas();
      controller.render();
    }
  });
  ro.observe(canvasEl.parentElement);
}

/* ============================================================
   Slot management
   ============================================================ */

function totalCells() {
  return calculateButtonsPerPage(getButtonSize(currentSizeKey), US_LETTER).total;
}

/** Fit scale: smaller image dimension fills the current cut circle. */
function fitScale(image) {
  const cutPx = getButtonSize(currentSizeKey).cutLineDiameter * PIXELS_PER_INCH;
  return cutPx / Math.min(image.naturalWidth, image.naturalHeight);
}

function distributeAuto() {
  const q = distributeEvenly(totalCells(), slots);
  slots.forEach((s, i) => { s.quantity = q[i]; });
}

async function handleImageSelect(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  hideError();

  let added = 0;
  for (const file of files) {
    try {
      const img = await loadImage(file);
      slots.push({
        id: nextSlotId++,
        image: img,
        name: file.name,
        scale: fitScale(img),
        offsetX: 0,
        offsetY: 0,
        quantity: 0,
        manual: false,
      });
      added++;
    } catch (err) {
      showError(err.message);
      console.error('Image load error:', err);
    }
  }
  imageInput.value = '';
  if (!added) return;

  fileLabelText.textContent = slots.length === 1 ? '1 image loaded' : `${slots.length} images loaded`;
  canvasPlaceholder.hidden = true;
  canvasEl.classList.add('active');
  slotSection.hidden = false;
  imageControls.hidden = false;
  printControls.hidden = false;

  distributeAuto();
  if (activeSlotId === null) {
    selectSlot(slots[slots.length - added].id);
  } else {
    renderSlotList();
  }
  renderTotal();
  if (!printPreview.hidden) renderPreview();
}

function getSlot(id) {
  return slots.find((s) => s.id === id) || null;
}

function saveActiveTransform() {
  const slot = getSlot(activeSlotId);
  if (!slot || !controller.image) return;
  slot.scale = controller.scale;
  slot.offsetX = controller.offsetX;
  slot.offsetY = controller.offsetY;
}

function selectSlot(id) {
  saveActiveTransform();
  const slot = getSlot(id);
  if (!slot) return;
  activeSlotId = id;
  controller.setImageState({
    image: slot.image,
    scale: slot.scale,
    offsetX: slot.offsetX,
    offsetY: slot.offsetY,
  });
  renderSlotList();
  syncSlider();
}

function removeSlot(id) {
  const idx = slots.findIndex((s) => s.id === id);
  if (idx === -1) return;
  slots.splice(idx, 1);

  if (activeSlotId === id) {
    activeSlotId = null;
    if (slots.length) {
      selectSlot(slots[Math.min(idx, slots.length - 1)].id);
    } else {
      controller.clearImage();
      canvasEl.classList.remove('active');
      canvasPlaceholder.hidden = false;
      imageControls.hidden = true;
      printControls.hidden = true;
      slotSection.hidden = true;
      fileLabelText.textContent = 'Choose one or more images…';
      setMode('resize');
    }
  }
  distributeAuto();
  renderSlotList();
  renderTotal();
  if (!printPreview.hidden) renderPreview();
}

function handleQtyChange(id, rawValue) {
  const slot = getSlot(id);
  if (!slot) return;
  let q = parseInt(rawValue, 10);
  if (!isFinite(q) || q < 0) q = 0;
  slot.quantity = q;
  slot.manual = true;
  distributeAuto();
  refreshSlotQuantities();
  renderTotal();
  if (!printPreview.hidden) renderPreview();
}

function totalLabels() {
  return slots.reduce((sum, s) => sum + s.quantity, 0);
}

/* ============================================================
   Slot list + total rendering
   ============================================================ */

function renderSlotList() {
  slotList.innerHTML = '';
  slots.forEach((slot, i) => {
    const item = document.createElement('div');
    item.className = 'slot-item' + (slot.id === activeSlotId ? ' active' : '');
    item.addEventListener('click', () => selectSlot(slot.id));

    const thumb = document.createElement('img');
    thumb.className = 'slot-thumb';
    thumb.src = slot.image.src;
    thumb.alt = slot.name;

    const meta = document.createElement('div');
    meta.className = 'slot-meta';
    const nameEl = document.createElement('div');
    nameEl.className = 'slot-name';
    nameEl.textContent = slot.name;
    nameEl.title = slot.name;
    const indexEl = document.createElement('div');
    indexEl.className = 'slot-index';
    indexEl.textContent = `Image ${i + 1}`;
    meta.appendChild(nameEl);
    meta.appendChild(indexEl);

    const qtyWrap = document.createElement('label');
    qtyWrap.className = 'slot-qty';
    qtyWrap.textContent = 'Qty';
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.min = '0';
    qtyInput.dataset.slotId = String(slot.id);
    qtyInput.value = String(slot.quantity);
    qtyInput.addEventListener('click', (ev) => ev.stopPropagation());
    qtyInput.addEventListener('input', (ev) => handleQtyChange(slot.id, ev.target.value));
    qtyWrap.appendChild(qtyInput);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'slot-remove';
    removeBtn.type = 'button';
    removeBtn.textContent = '×';
    removeBtn.title = 'Remove image';
    removeBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      removeSlot(slot.id);
    });

    item.appendChild(thumb);
    item.appendChild(meta);
    item.appendChild(qtyWrap);
    item.appendChild(removeBtn);
    slotList.appendChild(item);
  });
}

/** Update quantity inputs in place (avoids stealing focus during typing). */
function refreshSlotQuantities() {
  slotList.querySelectorAll('input[data-slot-id]').forEach((input) => {
    if (input === document.activeElement) return;
    const slot = getSlot(parseInt(input.dataset.slotId, 10));
    if (slot) input.value = String(slot.quantity);
  });
}

function renderTotal() {
  const total = totalLabels();
  const fits = totalCells();
  let msg = `Total: ${total} / ${fits} buttons`;
  if (total === fits) {
    buttonTotal.className = 'button-total';
  } else if (total < fits) {
    buttonTotal.className = 'button-total warn';
    msg += ` — ${fits - total} will be left blank`;
  } else {
    buttonTotal.className = 'button-total warn';
    msg += ` — over by ${total - fits}, extras won't print`;
  }
  buttonTotal.textContent = msg;
}

function buildCellStates() {
  saveActiveTransform();
  return expandCells(slots, totalCells());
}

/* ============================================================
   Handlers
   ============================================================ */

function handleSizeChange(e) {
  currentSizeKey = e.target.value;
  controller.setButtonSize(getButtonSize(currentSizeKey));
  if (controller.image) controller.render();
  distributeAuto();
  refreshSlotQuantities();
  renderTotal();
  syncSlider();
  if (!printPreview.hidden) renderPreview();
}

function handleScaleChange() {
  const pct = parseInt(scaleSlider.value, 10);
  scaleValue.textContent = pct + '%';
  if (!controller.image) return;
  const baseScale = computeBaseScale();
  controller.scaleImage(baseScale * (pct / 100));
  saveActiveTransform();
  if (!printPreview.hidden) renderPreview();
}

function setMode(mode) {
  controller.setMode(mode);
  modeResize.classList.toggle('active', mode === 'resize');
  modePreview.classList.toggle('active', mode === 'preview');

  if (mode === 'preview' && slots.length) {
    canvasContainer.hidden = true;
    printPreview.hidden = false;
    renderPreview();
  } else {
    canvasContainer.hidden = false;
    printPreview.hidden = true;
  }
}

function handlePrint() {
  if (!slots.length) return;
  const cellStates = buildCellStates();
  const layout = generatePrintLayout(cellStates, getButtonSize(currentSizeKey), US_LETTER, getCalibrationFactor());
  renderPrintLayout(layout, printLayout);
  requestAnimationFrame(() => window.print());
}

function handleSaveSettings() {
  const settings = {
    printerName: printerNameInput.value.trim(),
    paperSize: 'US Letter',
    scale: 100,
    margins: 'Default',
    notes: printerNotesInput.value.trim(),
  };
  const saved = savePrinterSettings(settings);
  if (saved) {
    saveSettingsBtn.textContent = 'Saved!';
    setTimeout(() => { saveSettingsBtn.textContent = 'Save Settings'; }, 1500);
  }
}

function restoreSettings() {
  const settings = loadPrinterSettings();
  if (!settings) return;
  if (settings.printerName) printerNameInput.value = settings.printerName;
  if (settings.notes) printerNotesInput.value = settings.notes;
}

function restoreCalibration() {
  const cal = loadCalibration();
  if (!cal) return;
  if (cal.measuredInches) calibrationMeasuredInput.value = cal.measuredInches;
  showCalibrationStatus(cal);
}

function handlePrintTestSheet() {
  renderTestSheet(printLayout);
  requestAnimationFrame(() => window.print());
}

function handleSaveCalibration() {
  const measured = parseFloat(calibrationMeasuredInput.value.trim());
  const expected = 6;
  if (!measured || measured <= 0 || !isFinite(measured)) {
    showCalibrationAlert('Please enter a valid measurement.', 'warning');
    return;
  }
  const scaleFactor = expected / measured;
  const calibration = { expectedInches: expected, measuredInches: measured, scaleFactor };
  const saved = saveCalibration(calibration);
  if (saved) showCalibrationStatus(calibration);
  else showCalibrationAlert('Could not save calibration. Browser storage may be unavailable.', 'warning');
}

function handleClearCalibration() {
  clearCalibration();
  calibrationMeasuredInput.value = '';
  showCalibrationAlert('Calibration reset to default (no correction).', 'info');
}

function showCalibrationStatus(cal) {
  const pct = ((cal.scaleFactor - 1) * 100).toFixed(1);
  const direction = cal.scaleFactor > 1 ? 'enlarging' : cal.scaleFactor < 1 ? 'shrinking' : 'no change to';
  const sign = cal.scaleFactor > 1 ? '+' : '';
  calibrationStatus.hidden = false;
  calibrationStatus.className = 'calibration-status success';
  calibrationStatus.innerHTML =
    `<strong>Calibration active:</strong> Your 6" line measured ${cal.measuredInches}". ` +
    `Correction factor: ${cal.scaleFactor.toFixed(4)}× (${sign}${pct}%, ${direction} output).`;
}

function showCalibrationAlert(msg, type) {
  calibrationStatus.hidden = false;
  calibrationStatus.className = 'calibration-status ' + type;
  calibrationStatus.textContent = msg;
}

/**
 * On-screen scaled preview of the full printed page (circular buttons).
 */
function renderPreview() {
  printPreviewPage.innerHTML = '';
  if (!slots.length) return;

  const cellStates = buildCellStates();
  const layout = generatePrintLayout(cellStates, getButtonSize(currentSizeKey), US_LETTER);
  const { buttonSize, buttons, paperSize } = layout;

  const cutDiameterIn = buttonSize.cutLineDiameter;
  const pageW = paperSize.width;
  const pageH = paperSize.height;

  buttons.forEach((btn) => {
    if (!btn.imageState || !btn.imageState.image) return;

    const cell = document.createElement('div');
    cell.className = 'preview-button-cell';
    cell.style.left = ((btn.x / pageW) * 100) + '%';
    cell.style.top = ((btn.y / pageH) * 100) + '%';
    cell.style.width = ((cutDiameterIn / pageW) * 100) + '%';
    cell.style.height = ((cutDiameterIn / pageH) * 100) + '%';

    const c = document.createElement('canvas');
    const sizePx = Math.round(cutDiameterIn * PIXELS_PER_INCH);
    c.width = sizePx;
    c.height = sizePx;
    const ctx = c.getContext('2d');
    const cx = sizePx / 2;
    const cy = sizePx / 2;
    const cutRadiusPx = sizePx / 2 - 0.5;

    const { image, scale, offsetX, offsetY } = btn.imageState;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, cutRadiusPx, 0, Math.PI * 2);
    ctx.clip();
    const drawW = image.naturalWidth * scale;
    const drawH = image.naturalHeight * scale;
    ctx.drawImage(image, cx - drawW / 2 + offsetX, cy - drawH / 2 + offsetY, drawW, drawH);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(cx, cy, cutRadiusPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    cell.appendChild(c);
    printPreviewPage.appendChild(cell);
  });
}

/* ============================================================
   Helpers
   ============================================================ */

function showError(msg) { imageError.textContent = msg; imageError.hidden = false; }
function hideError() { imageError.textContent = ''; imageError.hidden = true; }

function computeBaseScale() {
  if (!controller.image || !controller.buttonSize) return 1;
  const cutDiameterPx = controller.buttonSize.cutLineDiameter * PIXELS_PER_INCH;
  const minDim = Math.min(controller.image.naturalWidth, controller.image.naturalHeight);
  return cutDiameterPx / minDim;
}

function syncSlider() {
  const baseScale = computeBaseScale();
  if (baseScale <= 0) return;
  const pct = Math.round((controller.scale / baseScale) * 100);
  scaleSlider.value = Math.max(10, Math.min(500, pct));
  scaleValue.textContent = scaleSlider.value + '%';
}

document.addEventListener('DOMContentLoaded', init);
```

- [ ] **Step 2: Syntax-check all modules**

Run: `for f in js/*.js; do node --check "$f" && echo "ok $f"; done`
Expected: `ok` for every file.

- [ ] **Step 3: PIL render sanity (optional visual, in scratchpad)**

Reuse the square-label PIL approach but with circular clip + the button grid math (marginLeft/Top 0.5, cellWidth = printableWidth/columns, calibratedDiameter centered) and 2+ distinct images at quantities that fill the sheet; save a PNG and eyeball that distinct images repeat in grouped order and fill the grid.

- [ ] **Step 4: Browser spot-check** (Playwright unavailable in WSL — do this manually)

Run `python3 -m http.server 8000`, open `http://localhost:8000/`:
- Load 3 images at once → 3 slots; total shows the sheet count (e.g. `20 / 20` for 1.25″) split ~7/7/6.
- Pan/zoom one image; click another slot and back → each keeps its own crop.
- Type a quantity on one slot → it pins, the others re-balance, total stays green.
- Switch to 2.25″ → total becomes `6 / 6` and counts recompute.
- Preview Mode → 3×… grid of circular buttons with the images repeated in order.
- Print → PDF shows the same; single image (remove two slots) fills the whole sheet.
Stop the server.

- [ ] **Step 5: Commit**

```bash
git add js/app.js
git commit -m "feat(button-printer): multi-image slots with auto-balanced quantities"
```

---

## Task 6: "Other tools" links block

**Files:**
- Modify: `index.html` (add a `control-group` at the end of the controls panel, before `</section>` line 132)
- Modify: `css/styles.css` (append `.tool-links` styles)

- [ ] **Step 1: Add the links group in `index.html`**

Immediately before the `</section>` that closes `.controls-panel` (currently `index.html:132`), add:
```html
        <!-- Other tools -->
        <div class="control-group" id="other-tools">
          <h2>Other Tools</h2>
          <ul class="tool-links">
            <li><a href="name-badge-printer/">Name Badges — Avery 25395</a></li>
            <li><a href="square-label-printer/">Square Labels — Avery 22853 / 22806</a></li>
          </ul>
        </div>
```

- [ ] **Step 2: Append `.tool-links` styles to `css/styles.css`**

```css
.tool-links {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.tool-links a {
  display: block;
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  color: var(--color-primary, #3b82f6);
  text-decoration: none;
  font-size: 0.9rem;
}

.tool-links a:hover {
  background: rgba(59, 130, 246, 0.06);
}
```
(If `css/styles.css` doesn't define `--color-border`/`--color-primary`, the literal fallbacks in the rule apply.)

- [ ] **Step 3: Verify links resolve**

Run `python3 -m http.server 8000`, open `http://localhost:8000/`, click each link → confirm `name-badge-printer/` and `square-label-printer/` load. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add index.html css/styles.css
git commit -m "feat(button-printer): link to name-badge and square-label tools"
```

---

## Self-Review

**Spec coverage:**
- Multi-image slot model → Task 5 (state, handlers) + Task 1 (pure fill logic).
- Auto-fill evenly (recompute on add/remove/size-change; one image fills sheet; override pins) → `distributeAuto` calls in `handleImageSelect`/`removeSlot`/`handleQtyChange`/`handleSizeChange`; `distributeEvenly` unit-tested (Task 1).
- `generatePrintLayout(cellStates, buttonSize, …)` seam + renderer null guard → Task 2.
- `setImageState`/`clearImage` → Task 3.
- `multiple` input + slot list + total indicator → Task 4; wired in Task 5.
- "Other tools" links, main page only, subfolders untouched → Task 6.

**Placeholder scan:** none — every code step contains full code; every command has expected output.

**Type consistency:** `distributeEvenly(totalCells, slots)→number[]` and `expandCells(slots, totalCells)→states[]` used consistently in Task 5 (`distributeAuto`, `buildCellStates`); `generatePrintLayout(cellStates, buttonSize, paperSize, cal)` used identically in Task 2 shim and Task 5; slot shape `{id,image,name,scale,offsetX,offsetY,quantity,manual}` consistent across handlers; `setImageState({image,scale,offsetX,offsetY})` matches its caller in `selectSlot`.
