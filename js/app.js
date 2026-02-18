/**
 * Button Maker Image Tool – Application Entry Point
 *
 * Wires together all modules and binds DOM events.
 */

import { loadImage } from './imageLoader.js';
import { getButtonSize } from './buttonSizes.js';
import { CanvasController } from './canvasController.js';
import { generatePrintLayout, renderPrintLayout, renderTestSheet, US_LETTER } from './printGenerator.js';
import { PIXELS_PER_INCH } from './measurementConverter.js';
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

/* ============================================================
   State
   ============================================================ */

let controller = null;
let currentSizeKey = '1.25';

/* ============================================================
   Initialization
   ============================================================ */

function init() {
  // Initialize canvas controller
  controller = new CanvasController(canvasEl);
  controller.setButtonSize(getButtonSize(currentSizeKey));

  // Keep slider in sync when user zooms with mouse wheel
  controller.onScaleChange = () => syncSlider();

  // Storage availability
  if (!isStorageAvailable()) {
    storageWarning.hidden = false;
  }

  // Restore saved settings
  restoreSettings();
  restoreCalibration();

  // Bind events
  bindEvents();
}

/* ============================================================
   Event bindings
   ============================================================ */

function bindEvents() {
  // Image loading
  imageInput.addEventListener('change', handleImageSelect);

  // Button size radios
  document.querySelectorAll('input[name="button-size"]').forEach((radio) => {
    radio.addEventListener('change', handleSizeChange);
  });

  // Scale slider
  scaleSlider.addEventListener('input', handleScaleChange);

  // Mode buttons
  modeResize.addEventListener('click', () => setMode('resize'));
  modePreview.addEventListener('click', () => setMode('preview'));

  // Print
  printBtn.addEventListener('click', handlePrint);
  printInfoToggle.addEventListener('click', () => {
    printInstructions.hidden = !printInstructions.hidden;
  });

  // Settings
  saveSettingsBtn.addEventListener('click', handleSaveSettings);

  // Calibration
  printTestSheetBtn.addEventListener('click', handlePrintTestSheet);
  saveCalibrationBtn.addEventListener('click', handleSaveCalibration);
  clearCalibrationBtn.addEventListener('click', handleClearCalibration);

  // Resize observer for canvas container
  const ro = new ResizeObserver(() => {
    if (controller && controller.image) {
      controller._sizeCanvas();
      controller.render();
    }
  });
  ro.observe(canvasEl.parentElement);
}

/* ============================================================
   Handlers
   ============================================================ */

async function handleImageSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  hideError();

  try {
    const img = await loadImage(file);
    fileLabelText.textContent = file.name;

    // Show canvas, hide placeholder
    canvasPlaceholder.hidden = true;
    canvasEl.classList.add('active');
    imageControls.hidden = false;
    printControls.hidden = false;

    controller.setButtonSize(getButtonSize(currentSizeKey));
    controller.setImage(img);

    // Sync slider to initial scale
    syncSlider();
  } catch (err) {
    showError(err.message);
    console.error('Image load error:', err);
  }
}

function handleSizeChange(e) {
  currentSizeKey = e.target.value;
  controller.setButtonSize(getButtonSize(currentSizeKey));
  if (controller.image) {
    controller.render();
  }
}

function handleScaleChange() {
  const pct = parseInt(scaleSlider.value, 10);
  scaleValue.textContent = pct + '%';

  if (!controller.image) return;

  // The slider represents a percentage of the "fit" scale
  const baseScale = computeBaseScale();
  controller.scaleImage(baseScale * (pct / 100));
}

function setMode(mode) {
  controller.setMode(mode);
  modeResize.classList.toggle('active', mode === 'resize');
  modePreview.classList.toggle('active', mode === 'preview');

  if (mode === 'preview' && controller.image) {
    // Hide the interactive canvas, show full-page preview
    canvasContainer.hidden = true;
    printPreview.hidden = false;
    renderPreview();
  } else {
    // Show interactive canvas, hide preview
    canvasContainer.hidden = false;
    printPreview.hidden = true;
  }
}

function handlePrint() {
  if (!controller.image) return;

  const imageState = controller.getImageState();
  const layout = generatePrintLayout(imageState, US_LETTER);
  renderPrintLayout(layout, printLayout);

  // Short delay to let canvases render before triggering print
  requestAnimationFrame(() => {
    window.print();
  });
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

/**
 * Restore calibration state from localStorage and show status.
 */
function restoreCalibration() {
  const cal = loadCalibration();
  if (!cal) return;
  if (cal.measuredInches) {
    calibrationMeasuredInput.value = cal.measuredInches;
  }
  showCalibrationStatus(cal);
}

/**
 * Print a calibration test sheet with measurement reference lines.
 */
function handlePrintTestSheet() {
  renderTestSheet(printLayout);
  requestAnimationFrame(() => {
    window.print();
  });
}

/**
 * Save the user's measured value and compute a calibration factor.
 */
function handleSaveCalibration() {
  const measuredStr = calibrationMeasuredInput.value.trim();
  const measured = parseFloat(measuredStr);
  const expected = 6; // the test sheet has a 6" reference line

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

/**
 * Clear calibration and reset to default (1:1) scaling.
 */
function handleClearCalibration() {
  clearCalibration();
  calibrationMeasuredInput.value = '';
  showCalibrationAlert('Calibration reset to default (no correction).', 'info');
}

/**
 * Show the current calibration status message.
 * @param {import('./settingsManager').CalibrationData} cal
 */
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

/**
 * Show a one-off calibration alert message.
 * @param {string} msg
 * @param {'success'|'info'|'warning'} type
 */
function showCalibrationAlert(msg, type) {
  calibrationStatus.hidden = false;
  calibrationStatus.className = 'calibration-status ' + type;
  calibrationStatus.textContent = msg;
}

/**
 * Render an on-screen scaled preview of the full printed page.
 * Uses percentage-based positioning so the preview scales to fit.
 */
function renderPreview() {
  printPreviewPage.innerHTML = '';

  if (!controller.image) return;

  const imageState = controller.getImageState();
  const layout = generatePrintLayout(imageState, US_LETTER);
  const { buttonSize, buttons, paperSize } = layout;

  const cutDiameterIn = buttonSize.cutLineDiameter;

  // We render each button as a percentage-positioned element inside
  // the preview page div (which has aspect-ratio 8.5/11).
  const pageW = paperSize.width;   // 8.5
  const pageH = paperSize.height;  // 11

  buttons.forEach((btn) => {
    const cell = document.createElement('div');
    cell.className = 'preview-button-cell';
    cell.style.left   = ((btn.x / pageW) * 100) + '%';
    cell.style.top    = ((btn.y / pageH) * 100) + '%';
    cell.style.width  = ((cutDiameterIn / pageW) * 100) + '%';
    cell.style.height = ((cutDiameterIn / pageH) * 100) + '%';

    // Draw onto a small canvas
    const c = document.createElement('canvas');
    const sizePx = Math.round(cutDiameterIn * PIXELS_PER_INCH);
    c.width = sizePx;
    c.height = sizePx;

    const ctx = c.getContext('2d');
    const cx = sizePx / 2;
    const cy = sizePx / 2;

    const { image, scale, offsetX, offsetY } = btn.imageState;
    const drawW = image.naturalWidth * scale;
    const drawH = image.naturalHeight * scale;
    const imgX = cx - drawW / 2 + offsetX;
    const imgY = cy - drawH / 2 + offsetY;
    ctx.drawImage(image, imgX, imgY, drawW, drawH);

    // Cut line circle (dashed grey)
    ctx.save();
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(cx, cy, sizePx / 2 - 0.5, 0, Math.PI * 2);
    ctx.stroke();
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
 * Compute the base scale that fits the smaller image dimension
 * into the cut-line circle. The slider 100 % corresponds to this.
 */
function computeBaseScale() {
  if (!controller.image || !controller.buttonSize) return 1;
  const cutDiameterPx = controller.buttonSize.cutLineDiameter * PIXELS_PER_INCH;
  const minDim = Math.min(controller.image.naturalWidth, controller.image.naturalHeight);
  return cutDiameterPx / minDim;
}

/**
 * Sync the slider position to the controller's current scale.
 */
function syncSlider() {
  const baseScale = computeBaseScale();
  if (baseScale <= 0) return;
  const pct = Math.round((controller.scale / baseScale) * 100);
  scaleSlider.value = Math.max(10, Math.min(500, pct));
  scaleValue.textContent = scaleSlider.value + '%';
}

/* ============================================================
   Boot
   ============================================================ */

document.addEventListener('DOMContentLoaded', init);
