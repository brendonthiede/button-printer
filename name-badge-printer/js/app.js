/**
 * Name Badge Image Tool – Application Entry Point
 *
 * Wires modules together and binds DOM events.
 */

import { loadImage } from '../../js/imageLoader.js';
import { AVERY_25395, DEFAULT_IMAGE_BOX, imageBoxFits } from './badgeLayout.js';
import { CanvasController } from './canvasController.js';
import {
  generatePrintLayout,
  renderPrintLayout,
  renderTestSheet,
  renderAlignmentSheet,
} from './printGenerator.js';
import { PIXELS_PER_INCH } from '../../js/measurementConverter.js';
import {
  isStorageAvailable,
  savePrinterSettings,
  loadPrinterSettings,
  saveCalibration,
  loadCalibration,
  clearCalibration,
  getCalibrationFactor,
  saveImageBox,
  loadImageBox,
} from './settingsManager.js';

/* ============================================================
   DOM references
   ============================================================ */

const imageInput = document.getElementById('image-input');
const fileLabelText = document.getElementById('file-label-text');
const imageError = document.getElementById('image-error');
const canvasEl = document.getElementById('badge-canvas');
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

const boxXInput = document.getElementById('box-x');
const boxYInput = document.getElementById('box-y');
const boxWInput = document.getElementById('box-w');
const boxHInput = document.getElementById('box-h');
const resetBoxBtn = document.getElementById('reset-box-btn');
const boxError = document.getElementById('box-error');

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

/* ============================================================
   State
   ============================================================ */

let controller = null;
let imageBox = { ...DEFAULT_IMAGE_BOX };

/* ============================================================
   Initialization
   ============================================================ */

function init() {
  controller = new CanvasController(canvasEl);
  controller.setLayout(AVERY_25395);

  // Restore image-box config (or use defaults)
  const savedBox = loadImageBox();
  if (savedBox && imageBoxFits(savedBox, AVERY_25395)) {
    imageBox = savedBox;
  }
  syncBoxInputs();
  controller.setImageBox(imageBox);

  controller.onScaleChange = () => syncSlider();

  if (!isStorageAvailable()) {
    storageWarning.hidden = false;
  }

  restoreSettings();
  restoreCalibration();
  bindEvents();
}

/* ============================================================
   Event bindings
   ============================================================ */

function bindEvents() {
  imageInput.addEventListener('change', handleImageSelect);

  [boxXInput, boxYInput, boxWInput, boxHInput].forEach((el) => {
    el.addEventListener('input', handleBoxInputChange);
  });
  resetBoxBtn.addEventListener('click', handleResetBox);

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

  // Ctrl+P bypasses the Print button: render the badges, and never reprint a stale sheet.
  window.addEventListener('beforeprint', () => {
    if (!printLayout.hasChildNodes() && controller.image) renderBadges();
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
   Handlers
   ============================================================ */

async function handleImageSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  hideError();

  try {
    const img = await loadImage(file);
    fileLabelText.textContent = file.name;

    canvasPlaceholder.hidden = true;
    canvasEl.classList.add('active');
    imageControls.hidden = false;
    printControls.hidden = false;

    controller.setLayout(AVERY_25395);
    controller.setImageBox(imageBox);
    controller.setImage(img);

    syncSlider();
  } catch (err) {
    showError(err.message);
    console.error('Image load error:', err);
  }
}

function handleBoxInputChange() {
  const next = {
    x: parseFloat(boxXInput.value),
    y: parseFloat(boxYInput.value),
    width: parseFloat(boxWInput.value),
    height: parseFloat(boxHInput.value),
  };

  if (
    !isFinite(next.x) || !isFinite(next.y) ||
    !isFinite(next.width) || !isFinite(next.height)
  ) {
    return; // wait for valid numbers
  }

  if (!imageBoxFits(next, AVERY_25395)) {
    showBoxError(
      `Image box must fit inside the ${AVERY_25395.badgeWidth}" × ${AVERY_25395.badgeHeight}" badge.`
    );
    return;
  }

  hideBoxError();
  imageBox = next;
  saveImageBox(imageBox);
  controller.setImageBox(imageBox);
  if (controller.image) {
    syncSlider();
    if (printPreview && !printPreview.hidden) renderPreview();
  }
}

function handleResetBox() {
  imageBox = { ...DEFAULT_IMAGE_BOX };
  syncBoxInputs();
  saveImageBox(imageBox);
  hideBoxError();
  controller.setImageBox(imageBox);
  if (controller.image) {
    syncSlider();
    if (printPreview && !printPreview.hidden) renderPreview();
  }
}

function syncBoxInputs() {
  boxXInput.value = imageBox.x;
  boxYInput.value = imageBox.y;
  boxWInput.value = imageBox.width;
  boxHInput.value = imageBox.height;
}

function handleScaleChange() {
  const pct = parseInt(scaleSlider.value, 10);
  scaleValue.textContent = pct + '%';

  if (!controller.image) return;

  const baseScale = computeBaseScale();
  controller.scaleImage(baseScale * (pct / 100));
  if (!printPreview.hidden) renderPreview();
}

function setMode(mode) {
  modeResize.classList.toggle('active', mode === 'resize');
  modePreview.classList.toggle('active', mode === 'preview');

  if (mode === 'preview' && controller.image) {
    canvasContainer.hidden = true;
    printPreview.hidden = false;
    renderPreview();
  } else {
    canvasContainer.hidden = false;
    printPreview.hidden = true;
  }
}

function renderBadges() {
  const layout = generatePrintLayout(controller.getImageState(), AVERY_25395, getCalibrationFactor());
  renderPrintLayout(layout, printLayout);
}

function handlePrint() {
  if (!controller.image) return;
  renderBadges();
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
  renderAlignmentSheet(printLayout, AVERY_25395);
  requestAnimationFrame(() => {
    window.print();
  });
}

function handleSaveCalibration() {
  const measuredStr = calibrationMeasuredInput.value.trim();
  const measured = parseFloat(measuredStr);
  const expected = 6;

  // Outside 5–7" is a typo, not printer drift; a wild factor would empty the page.
  if (!(measured >= 5 && measured <= 7)) {
    showCalibrationAlert('Enter the 6" line\'s measured length, between 5 and 7 inches.', 'warning');
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
 * Render a scaled on-screen preview of the full sheet.
 * Each badge is drawn as a faint dashed rectangle; the image cell
 * inside is drawn via a small canvas, all positioned in percentages
 * so the preview scales to fit the container.
 */
function renderPreview() {
  printPreviewPage.innerHTML = '';
  if (!controller.image) return;

  const imageState = controller.getImageState();
  const layout = generatePrintLayout(imageState, AVERY_25395); // no calibration on screen
  const { layout: paperLayout, badges } = layout;

  const pageW = paperLayout.paperWidth;
  const pageH = paperLayout.paperHeight;

  // Outline every badge (the cut edge of the Avery label).
  for (let row = 0; row < paperLayout.rows; row++) {
    for (let col = 0; col < paperLayout.columns; col++) {
      const bx = paperLayout.marginLeft + col * (paperLayout.badgeWidth + paperLayout.gapX);
      const by = paperLayout.marginTop  + row * (paperLayout.badgeHeight + paperLayout.gapY);

      const badgeEl = document.createElement('div');
      badgeEl.className = 'preview-badge';
      badgeEl.style.left   = ((bx / pageW) * 100) + '%';
      badgeEl.style.top    = ((by / pageH) * 100) + '%';
      badgeEl.style.width  = ((paperLayout.badgeWidth  / pageW) * 100) + '%';
      badgeEl.style.height = ((paperLayout.badgeHeight / pageH) * 100) + '%';
      printPreviewPage.appendChild(badgeEl);
    }
  }

  // Draw each image cell.
  badges.forEach((b) => {
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

function showBoxError(msg) {
  boxError.textContent = msg;
  boxError.hidden = false;
}

function hideBoxError() {
  boxError.textContent = '';
  boxError.hidden = true;
}

/**
 * Compute the base scale: the cover-fit scale that fully fills the
 * image-box rectangle. Slider 100% corresponds to this.
 */
function computeBaseScale() {
  if (!controller.image || !controller.imageBox) return 1;
  const boxPxW = controller.imageBox.width  * PIXELS_PER_INCH;
  const boxPxH = controller.imageBox.height * PIXELS_PER_INCH;
  const imgW = controller.image.naturalWidth;
  const imgH = controller.image.naturalHeight;
  return Math.max(boxPxW / imgW, boxPxH / imgH);
}

function syncSlider() {
  const baseScale = computeBaseScale();
  if (baseScale <= 0) return;
  const pct = Math.round((controller.scale / baseScale) * 100);
  scaleSlider.value = Math.max(10, Math.min(500, pct));
  scaleValue.textContent = scaleSlider.value + '%';
}

document.addEventListener('DOMContentLoaded', init);
