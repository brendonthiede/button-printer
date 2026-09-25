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

  // Ctrl+P bypasses the Print button: render the buttons, and never reprint a stale sheet.
  window.addEventListener('beforeprint', () => {
    if (!printLayout.hasChildNodes() && slots.length) renderButtons();
  });
  window.addEventListener('afterprint', () => { printLayout.innerHTML = ''; });

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
  return calculateButtonsPerPage(getButtonSize(currentSizeKey), US_LETTER, getCalibrationFactor()).total;
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
  const refocus = document.activeElement?.classList.contains('slot-select');
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

    // Focusable target for keyboard users; its click bubbles to the row's handler.
    const selectBtn = document.createElement('button');
    selectBtn.type = 'button';
    selectBtn.className = 'slot-select';
    selectBtn.setAttribute('aria-pressed', String(slot.id === activeSlotId));
    selectBtn.appendChild(thumb);
    selectBtn.appendChild(meta);

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

    item.appendChild(selectBtn);
    item.appendChild(qtyWrap);
    item.appendChild(removeBtn);
    slotList.appendChild(item);
    if (refocus && slot.id === activeSlotId) selectBtn.focus();
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
  saveActiveTransform();
  // Transforms are absolute pixels, so rescale every crop to keep its framing in the new circle.
  const ratio = getButtonSize(e.target.value).cutLineDiameter / getButtonSize(currentSizeKey).cutLineDiameter;
  slots.forEach((s) => { s.scale *= ratio; s.offsetX *= ratio; s.offsetY *= ratio; });
  currentSizeKey = e.target.value;
  controller.setButtonSize(getButtonSize(currentSizeKey));
  const active = getSlot(activeSlotId);
  if (active) controller.setImageState(active);
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

function renderButtons() {
  const layout = generatePrintLayout(buildCellStates(), getButtonSize(currentSizeKey), US_LETTER, getCalibrationFactor());
  renderPrintLayout(layout, printLayout);
}

function handlePrint() {
  if (!slots.length) return;
  renderButtons();
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
  // Outside 5–7" is a typo, not printer drift; a wild factor would empty the page.
  if (!(measured >= 5 && measured <= 7)) {
    showCalibrationAlert('Enter the 6" line\'s measured length, between 5 and 7 inches.', 'warning');
    return;
  }
  const scaleFactor = expected / measured;
  const calibration = { expectedInches: expected, measuredInches: measured, scaleFactor };
  const saved = saveCalibration(calibration);
  if (saved) {
    showCalibrationStatus(calibration);
    handleCapacityChange();
  } else {
    showCalibrationAlert('Could not save calibration. Browser storage may be unavailable.', 'warning');
  }
}

function handleClearCalibration() {
  clearCalibration();
  calibrationMeasuredInput.value = '';
  showCalibrationAlert('Calibration reset to default (no correction).', 'info');
  handleCapacityChange();
}

/** Calibration changes how many buttons fit, so re-balance auto quantities. */
function handleCapacityChange() {
  distributeAuto();
  refreshSlotQuantities();
  renderTotal();
  if (!printPreview.hidden) renderPreview();
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
  const layout = generatePrintLayout(cellStates, getButtonSize(currentSizeKey), US_LETTER, getCalibrationFactor());
  const { buttonSize, buttons, paperSize, cal } = layout;

  // Cells are sized at the calibrated diameter to match print positions; the
  // canvas bitmap stays uncalibrated and CSS stretches it to fill the cell.
  const cutDiameterIn = buttonSize.cutLineDiameter;
  const cellDiameterIn = cutDiameterIn * cal;
  const pageW = paperSize.width;
  const pageH = paperSize.height;

  buttons.forEach((btn) => {
    if (!btn.imageState || !btn.imageState.image) return;

    const cell = document.createElement('div');
    cell.className = 'preview-button-cell';
    cell.style.left = ((btn.x / pageW) * 100) + '%';
    cell.style.top = ((btn.y / pageH) * 100) + '%';
    cell.style.width = ((cellDiameterIn / pageW) * 100) + '%';
    cell.style.height = ((cellDiameterIn / pageH) * 100) + '%';

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
