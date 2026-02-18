/**
 * Settings Manager
 *
 * Persists and retrieves user printer preferences from localStorage.
 */

const STORAGE_KEY = 'buttonMaker_printerSettings';

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
