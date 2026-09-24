/**
 * Settings Manager
 *
 * Persists and retrieves user printer preferences from localStorage.
 * Storage keys are namespaced to nameBadgeMaker_* so this app's settings
 * don't collide with the sibling button-printer app's localStorage.
 */

const STORAGE_KEY = 'nameBadgeMaker_printerSettings';
const CALIBRATION_KEY = 'nameBadgeMaker_calibration';
const IMAGE_BOX_KEY = 'nameBadgeMaker_imageBox';

export function isStorageAvailable() {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * @typedef {Object} PrinterSettings
 * @property {string}  [printerName]
 * @property {string}  paperSize
 * @property {string}  [notes]
 */

export function savePrinterSettings(settings) {
  if (!isStorageAvailable()) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

export function loadPrinterSettings() {
  if (!isStorageAvailable()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/* ============================================================
   Calibration
   ============================================================ */

/**
 * @typedef {Object} CalibrationData
 * @property {number} expectedInches – the target reference length on the test sheet
 * @property {number} measuredInches – what the user actually measured with a ruler
 * @property {number} scaleFactor    – computed correction: expected / measured
 */

export function saveCalibration(calibration) {
  if (!isStorageAvailable()) return false;
  try {
    localStorage.setItem(CALIBRATION_KEY, JSON.stringify(calibration));
    return true;
  } catch {
    return false;
  }
}

export function loadCalibration() {
  if (!isStorageAvailable()) return null;
  try {
    const raw = localStorage.getItem(CALIBRATION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearCalibration() {
  if (!isStorageAvailable()) return false;
  try {
    localStorage.removeItem(CALIBRATION_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current calibration scale factor.
 * Returns 1.0 if no calibration has been performed.
 * @returns {number}
 */
export function getCalibrationFactor() {
  const cal = loadCalibration();
  if (!cal || !cal.scaleFactor || !isFinite(cal.scaleFactor)) return 1.0;
  return cal.scaleFactor;
}

/* ============================================================
   Image-box configuration
   ============================================================ */

/**
 * @typedef {Object} ImageBox
 * @property {number} x       – inset from badge top-left, inches
 * @property {number} y       – inset from badge top-left, inches
 * @property {number} width   – box width, inches
 * @property {number} height  – box height, inches
 */

export function saveImageBox(box) {
  if (!isStorageAvailable()) return false;
  try {
    localStorage.setItem(IMAGE_BOX_KEY, JSON.stringify(box));
    return true;
  } catch {
    return false;
  }
}

export function loadImageBox() {
  if (!isStorageAvailable()) return null;
  try {
    const raw = localStorage.getItem(IMAGE_BOX_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
