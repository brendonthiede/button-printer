/**
 * Square Label Tool – Application Entry Point
 *
 * Wires modules together and binds DOM events. Unlike the sibling
 * single-image tools, this app holds an ARRAY of image "slots" — each with
 * its own crop transform and a repeat quantity — and lays them out across
 * the 12 squares of an Avery 22853 sheet.
 *
 * One CanvasController edits whichever slot is currently active; switching
 * slots saves the current transform back and loads the selected one.
 */

import { loadImage } from './imageLoader.js';
import { AVERY_22853, labelsPerSheet } from './labelLayout.js';
import { CanvasController } from './canvasController.js';
import {
  generatePrintLayout,
  renderPrintLayout,
  renderTestSheet,
  renderAlignmentSheet,
  renderAlignmentGrid,
} from './printGenerator.js';
import { PIXELS_PER_INCH } from './measurementConverter.js';
import {
  isStorageAvailable,
  savePrinterSettings,
  loadPrinterSettings,
  saveCalibration,
  loadCalibration,
  clearCalibration,
  getCalibrationFactor,
  getPositionCorrection,
  savePositionCorrection,
  clearPositionCorrection,
  IDENTITY_POSITION_CORRECTION,
} from './settingsManager.js';

/* ============================================================
   DOM references
   ============================================================ */

const imageInput = document.getElementById('image-input');
const fileLabelText = document.getElementById('file-label-text');
const imageError = document.getElementById('image-error');
const canvasEl = document.getElementById('label-canvas');
const canvasPlaceholder = document.getElementById('canvas-placeholder');
const imageControls = document.getElementById('image-controls');
const printControls = document.getElementById('print-controls');
const activeSlotHint = document.getElementById('active-slot-hint');
const scaleSlider = document.getElementById('scale-slider');
const scaleValue = document.getElementById('scale-value');
const modeResize = document.getElementById('mode-resize');
const modePreview = document.getElementById('mode-preview');
const printBtn = document.getElementById('print-btn');
const printInfoToggle = document.getElementById('print-info-toggle');
const printInstructions = document.getElementById('print-instructions');
const printLayout = document.getElementById('print-layout');

const slotSection = document.getElementById('slot-section');
const slotList = document.getElementById('slot-list');
const labelTotal = document.getElementById('label-total');

const printerNameInput = document.getElementById('printer-name');
const printerNotesInput = document.getElementById('printer-notes');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const storageWarning = document.getElementById('storage-warning');

const printPreview = document.getElementById('print-preview');
const printPreviewPage = document.getElementById('print-preview-page');
const canvasContainer = document.getElementById('canvas-container');

const printTestSheetBtn = document.getElementById('print-test-sheet-btn');
const printAlignmentBtn = document.getElementById('print-alignment-btn');
const calibrationMeasuredInput = document.getElementById('calibration-measured');
const saveCalibrationBtn = document.getElementById('save-calibration-btn');
const clearCalibrationBtn = document.getElementById('clear-calibration-btn');
const calibrationStatus = document.getElementById('calibration-status');

const printGridBtn = document.getElementById('print-grid-btn');
const alignTlxInput = document.getElementById('align-tlx');
const alignTlyInput = document.getElementById('align-tly');
const alignBrxInput = document.getElementById('align-brx');
const alignBryInput = document.getElementById('align-bry');
const saveAlignmentBtn = document.getElementById('save-alignment-btn');
const resetAlignmentBtn = document.getElementById('reset-alignment-btn');
const alignmentStatus = document.getElementById('alignment-status');

// Ideal (true-inch) top-left corners of the two diagonal reference squares.
const IDEAL_TL = { x: AVERY_22853.marginLeft, y: AVERY_22853.marginTop };
const IDEAL_BR = {
  x: AVERY_22853.marginLeft + (AVERY_22853.columns - 1) * (AVERY_22853.labelWidth + AVERY_22853.gapX),
  y: AVERY_22853.marginTop + (AVERY_22853.rows - 1) * (AVERY_22853.labelHeight + AVERY_22853.gapY),
};

/* ============================================================
   State
   ============================================================ */

const TOTAL_CELLS = labelsPerSheet(AVERY_22853); // 12
const DEFAULT_QUANTITY = 3;

/** @type {{id:number,image:HTMLImageElement,name:string,scale:number,offsetX:number,offsetY:number,quantity:number}[]} */
let slots = [];
let activeSlotId = null;
let nextSlotId = 1;
let controller = null;

/* ============================================================
   Initialization
   ============================================================ */

function init() {
  controller = new CanvasController(canvasEl);
  controller.setLayout(AVERY_22853);

  controller.onScaleChange = () => syncSlider();
  controller.onTransformChange = () => saveActiveTransform();

  if (!isStorageAvailable()) {
    storageWarning.hidden = false;
  }

  restoreSettings();
  restoreCalibration();
  restoreAlignment();
  renderTotal();
  bindEvents();
}

/* ============================================================
   Event bindings
   ============================================================ */

function bindEvents() {
  imageInput.addEventListener('change', handleImageSelect);

  scaleSlider.addEventListener('input', handleScaleChange);

  modeResize.addEventListener('click', () => setMode('resize'));
  modePreview.addEventListener('click', () => setMode('preview'));

  printBtn.addEventListener('click', handlePrint);
  printInfoToggle.addEventListener('click', () => {
    printInstructions.hidden = !printInstructions.hidden;
  });

  saveSettingsBtn.addEventListener('click', handleSaveSettings);

  printTestSheetBtn.addEventListener('click', handlePrintTestSheet);
  printAlignmentBtn.addEventListener('click', handlePrintAlignmentSheet);
  saveCalibrationBtn.addEventListener('click', handleSaveCalibration);
  clearCalibrationBtn.addEventListener('click', handleClearCalibration);

  printGridBtn.addEventListener('click', handlePrintAlignmentGrid);
  saveAlignmentBtn.addEventListener('click', handleSaveAlignment);
  resetAlignmentBtn.addEventListener('click', handleResetAlignment);

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

/** Cover-fit scale for an image inside the 2"×2" label. */
function coverFitScale(image) {
  const labelPxW = AVERY_22853.labelWidth * PIXELS_PER_INCH;
  const labelPxH = AVERY_22853.labelHeight * PIXELS_PER_INCH;
  return Math.max(labelPxW / image.naturalWidth, labelPxH / image.naturalHeight);
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
        scale: coverFitScale(img),
        offsetX: 0,
        offsetY: 0,
        quantity: DEFAULT_QUANTITY,
      });
      added++;
    } catch (err) {
      showError(err.message);
      console.error('Image load error:', err);
    }
  }

  // Reset the input so selecting the same file again re-fires change.
  imageInput.value = '';

  if (!added) return;

  fileLabelText.textContent =
    slots.length === 1 ? '1 image loaded' : `${slots.length} images loaded`;

  canvasPlaceholder.hidden = true;
  canvasEl.classList.add('active');
  slotSection.hidden = false;
  imageControls.hidden = false;
  printControls.hidden = false;

  // Activate the first-ever slot; otherwise keep the current selection.
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

/** Persist the controller's current transform into the active slot. */
function saveActiveTransform() {
  const slot = getSlot(activeSlotId);
  if (!slot || !controller.image) return;
  slot.scale = controller.scale;
  slot.offsetX = controller.offsetX;
  slot.offsetY = controller.offsetY;
}

function selectSlot(id) {
  // Save the outgoing slot's transform before switching.
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

  updateActiveHint();
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
      // Leave preview mode if it was on.
      setMode('resize');
    }
  }

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
  renderTotal();
  if (!printPreview.hidden) renderPreview();
}

function totalLabels() {
  return slots.reduce((sum, s) => sum + s.quantity, 0);
}

function updateActiveHint() {
  const slot = getSlot(activeSlotId);
  if (!slot) {
    activeSlotHint.textContent = '';
    return;
  }
  const idx = slots.findIndex((s) => s.id === activeSlotId) + 1;
  activeSlotHint.textContent =
    `Editing image ${idx} of ${slots.length} — drag & zoom to frame it in the 2" square.`;
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
    qtyInput.max = String(TOTAL_CELLS);
    qtyInput.value = String(slot.quantity);
    qtyInput.addEventListener('click', (e) => e.stopPropagation());
    qtyInput.addEventListener('input', (e) => handleQtyChange(slot.id, e.target.value));
    qtyWrap.appendChild(qtyInput);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'slot-remove';
    removeBtn.type = 'button';
    removeBtn.textContent = '×';
    removeBtn.title = 'Remove image';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeSlot(slot.id);
    });

    item.appendChild(thumb);
    item.appendChild(meta);
    item.appendChild(qtyWrap);
    item.appendChild(removeBtn);
    slotList.appendChild(item);
  });

  updateActiveHint();
}

function renderTotal() {
  const total = totalLabels();
  let msg = `Total: ${total} / ${TOTAL_CELLS} labels`;
  if (total === TOTAL_CELLS) {
    labelTotal.className = 'label-total';
  } else if (total < TOTAL_CELLS) {
    labelTotal.className = 'label-total warn';
    msg += ` — ${TOTAL_CELLS - total} will be left blank`;
  } else {
    labelTotal.className = 'label-total warn';
    msg += ` — over by ${total - TOTAL_CELLS}, extras won't print`;
  }
  labelTotal.textContent = msg;
}

/* ============================================================
   Cell expansion (slots → 12 cells)
   ============================================================ */

/**
 * Expand slots into a flat, row-major list of up to 12 cell image-states
 * in slot order (image 1's copies first, then image 2, …). Extra copies
 * past 12 are dropped; unused cells are left undefined (blank).
 * @returns {(object|null)[]}
 */
function buildCellStates() {
  saveActiveTransform();
  const cells = [];
  for (const slot of slots) {
    for (let i = 0; i < slot.quantity && cells.length < TOTAL_CELLS; i++) {
      cells.push({
        image: slot.image,
        scale: slot.scale,
        offsetX: slot.offsetX,
        offsetY: slot.offsetY,
      });
    }
    if (cells.length >= TOTAL_CELLS) break;
  }
  return cells;
}

/* ============================================================
   Scale slider + mode
   ============================================================ */

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

/* ============================================================
   Print
   ============================================================ */

function handlePrint() {
  if (!slots.length) return;

  const cellStates = buildCellStates();
  const layout = generatePrintLayout(cellStates, AVERY_22853, getCalibrationFactor(), getPositionCorrection());
  renderPrintLayout(layout, printLayout);

  requestAnimationFrame(() => {
    window.print();
  });
}

function handleSaveSettings() {
  const settings = {
    printerName: printerNameInput.value.trim(),
    paperSize: 'US Letter',
    notes: printerNotesInput.value.trim(),
  };

  const saved = savePrinterSettings(settings);
  if (saved) {
    saveSettingsBtn.textContent = 'Saved!';
    setTimeout(() => {
      saveSettingsBtn.textContent = 'Save Settings';
    }, 1500);
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
  if (cal.measuredInches) {
    calibrationMeasuredInput.value = cal.measuredInches;
  }
  showCalibrationStatus(cal);
}

function handlePrintTestSheet() {
  renderTestSheet(printLayout);
  requestAnimationFrame(() => {
    window.print();
  });
}

function handlePrintAlignmentSheet() {
  renderAlignmentSheet(printLayout, AVERY_22853, getPositionCorrection());
  requestAnimationFrame(() => {
    window.print();
  });
}

function handlePrintAlignmentGrid() {
  renderAlignmentGrid(printLayout, AVERY_22853);
  requestAnimationFrame(() => {
    window.print();
  });
}

/* ============================================================
   Fine alignment (position correction)
   ============================================================ */

function restoreAlignment() {
  const corr = getPositionCorrection();
  const r = corr.readings;
  if (r) {
    alignTlxInput.value = r.tlx;
    alignTlyInput.value = r.tly;
    alignBrxInput.value = r.brx;
    alignBryInput.value = r.bry;
  }
  showAlignmentStatus(corr);
}

function handleSaveAlignment() {
  const tlx = parseFloat(alignTlxInput.value);
  const tly = parseFloat(alignTlyInput.value);
  const brx = parseFloat(alignBrxInput.value);
  const bry = parseFloat(alignBryInput.value);

  if (![tlx, tly, brx, bry].every((v) => isFinite(v))) {
    showAlignmentAlert('Enter all four corner readings (inches).', 'warning');
    return;
  }
  const dxIdeal = IDEAL_BR.x - IDEAL_TL.x;
  const dyIdeal = IDEAL_BR.y - IDEAL_TL.y;
  if (dxIdeal === 0 || dyIdeal === 0) return;

  // Fit sent = scale * ideal + offset from the two diagonal reference corners.
  const sx = (brx - tlx) / dxIdeal;
  const ox = tlx - sx * IDEAL_TL.x;
  const sy = (bry - tly) / dyIdeal;
  const oy = tly - sy * IDEAL_TL.y;

  if (![sx, ox, sy, oy].every((v) => isFinite(v))) {
    showAlignmentAlert('Those readings produce an invalid correction. Double-check them.', 'warning');
    return;
  }

  const corr = { sx, ox, sy, oy, readings: { tlx, tly, brx, bry } };
  if (savePositionCorrection(corr)) {
    showAlignmentStatus(corr);
  } else {
    showAlignmentAlert('Could not save. Browser storage may be unavailable.', 'warning');
  }
  if (!printPreview.hidden) renderPreview();
}

function handleResetAlignment() {
  clearPositionCorrection();
  savePositionCorrection({ ...IDENTITY_POSITION_CORRECTION });
  alignTlxInput.value = '';
  alignTlyInput.value = '';
  alignBrxInput.value = '';
  alignBryInput.value = '';
  showAlignmentAlert('Position correction reset — squares will print at their exact ideal positions.', 'info');
  if (!printPreview.hidden) renderPreview();
}

function showAlignmentStatus(corr) {
  const isIdentity = corr.sx === 1 && corr.ox === 0 && corr.sy === 1 && corr.oy === 0;
  alignmentStatus.hidden = false;
  if (isIdentity) {
    alignmentStatus.className = 'calibration-status info';
    alignmentStatus.textContent = 'No position correction (ideal positions).';
    return;
  }
  const seeded = !corr.readings || !isStoredCorrection();
  alignmentStatus.className = 'calibration-status success';
  alignmentStatus.innerHTML =
    `<strong>Correction active${seeded ? ' (first-guess)' : ''}:</strong> ` +
    `X → ${corr.sx.toFixed(4)}·x ${corr.ox >= 0 ? '+' : '−'} ${Math.abs(corr.ox).toFixed(3)}", ` +
    `Y → ${corr.sy.toFixed(4)}·y ${corr.oy >= 0 ? '+' : '−'} ${Math.abs(corr.oy).toFixed(3)}".`;
}

function isStoredCorrection() {
  // True once the user has saved their own correction (vs the seeded default).
  return !!loadStoredCorrectionFlag();
}
function loadStoredCorrectionFlag() {
  try { return localStorage.getItem('squareLabelMaker_posCorrection'); } catch { return null; }
}

function showAlignmentAlert(msg, type) {
  alignmentStatus.hidden = false;
  alignmentStatus.className = 'calibration-status ' + type;
  alignmentStatus.textContent = msg;
}

function handleSaveCalibration() {
  const measuredStr = calibrationMeasuredInput.value.trim();
  const measured = parseFloat(measuredStr);
  const expected = 6;

  if (!measured || measured <= 0 || !isFinite(measured)) {
    showCalibrationAlert('Please enter a valid measurement.', 'warning');
    return;
  }

  const scaleFactor = expected / measured;
  const calibration = {
    expectedInches: expected,
    measuredInches: measured,
    scaleFactor,
  };

  const saved = saveCalibration(calibration);
  if (saved) {
    showCalibrationStatus(calibration);
  } else {
    showCalibrationAlert('Could not save calibration. Browser storage may be unavailable.', 'warning');
  }
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
 * Render a scaled on-screen preview of the full sheet. Every label cell is
 * outlined (the die-cut edge); cells that have an image draw it via a
 * small clipped canvas. All positioned in percentages so the preview
 * scales to fit the container.
 */
function renderPreview() {
  printPreviewPage.innerHTML = '';
  if (!slots.length) return;

  const cellStates = buildCellStates();
  // No size calibration on screen, but show the position correction so the
  // preview matches what prints.
  const layout = generatePrintLayout(cellStates, AVERY_22853, 1.0, getPositionCorrection());
  const { layout: paperLayout, labels } = layout;

  const pageW = paperLayout.paperWidth;
  const pageH = paperLayout.paperHeight;

  labels.forEach((b) => {
    // Outline the label (cut edge) for every cell.
    const outline = document.createElement('div');
    outline.className = 'preview-label';
    outline.style.left   = ((b.x / pageW) * 100) + '%';
    outline.style.top    = ((b.y / pageH) * 100) + '%';
    outline.style.width  = ((b.width  / pageW) * 100) + '%';
    outline.style.height = ((b.height / pageH) * 100) + '%';
    printPreviewPage.appendChild(outline);

    if (!b.imageState || !b.imageState.image) return;

    const cell = document.createElement('div');
    cell.className = 'preview-image-cell';
    cell.style.left   = ((b.x / pageW) * 100) + '%';
    cell.style.top    = ((b.y / pageH) * 100) + '%';
    cell.style.width  = ((b.width  / pageW) * 100) + '%';
    cell.style.height = ((b.height / pageH) * 100) + '%';

    const c = document.createElement('canvas');
    const pxW = Math.max(1, Math.round(b.width  * PIXELS_PER_INCH));
    const pxH = Math.max(1, Math.round(b.height * PIXELS_PER_INCH));
    c.width = pxW;
    c.height = pxH;

    const ctx = c.getContext('2d');
    const cx = pxW / 2;
    const cy = pxH / 2;

    const { image, scale, offsetX, offsetY } = b.imageState;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, pxW, pxH);
    ctx.clip();

    const drawW = image.naturalWidth  * scale;
    const drawH = image.naturalHeight * scale;
    const imgX = cx - drawW / 2 + offsetX;
    const imgY = cy - drawH / 2 + offsetY;
    ctx.drawImage(image, imgX, imgY, drawW, drawH);
    ctx.restore();

    cell.appendChild(c);
    printPreviewPage.appendChild(cell);
  });
}

/* ============================================================
   Helpers
   ============================================================ */

function showError(msg) {
  imageError.textContent = msg;
  imageError.hidden = false;
}

function hideError() {
  imageError.textContent = '';
  imageError.hidden = true;
}

/**
 * Compute the base scale: the cover-fit scale that fully fills the 2"×2"
 * label. Slider 100% corresponds to this. Uses the active slot's image.
 */
function computeBaseScale() {
  if (!controller.image) return 1;
  return coverFitScale(controller.image);
}

function syncSlider() {
  const baseScale = computeBaseScale();
  if (baseScale <= 0) return;
  const pct = Math.round((controller.scale / baseScale) * 100);
  scaleSlider.value = Math.max(10, Math.min(500, pct));
  scaleValue.textContent = scaleSlider.value + '%';
}

document.addEventListener('DOMContentLoaded', init);
