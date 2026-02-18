/**
 * Settings Manager
 *
 * Persists and retrieves user printer preferences from localStorage.
 */

const STORAGE_KEY = 'buttonMaker_printerSettings';
const CALIBRATION_KEY = 'buttonMaker_calibration';

/**
 * Check whether localStorage is available and writable.
 * @returns {boolean}
 */
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
 * Save printer settings to localStorage.
 *
 * @param {PrinterSettings} settings
 * @returns {boolean} true if saved successfully
 *
 * @typedef {Object} PrinterSettings
 * @property {string}  [printerName]
 * @property {string}  paperSize
 * @property {number}  scale
 * @property {string}  margins
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

/**
 * Load previously saved printer settings.
 * @returns {PrinterSettings | null}
 */
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

/**
 * Save calibration data to localStorage.
 * @param {CalibrationData} calibration
 * @returns {boolean}
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

/**
 * Load calibration data from localStorage.
 * @returns {CalibrationData | null}
 */
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

/**
 * Clear saved calibration data.
 * @returns {boolean}
 */
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
