/**
 * Settings Manager
 *
 * Persists and retrieves user printer preferences from localStorage.
 * Storage keys are namespaced to squareLabelMaker_* so this app's settings
 * don't collide with the sibling button-printer / name-badge-printer apps.
 */

const STORAGE_KEY = 'squareLabelMaker_printerSettings';
const CALIBRATION_KEY = 'squareLabelMaker_calibration';
const POSITION_KEY = 'squareLabelMaker_posCorrection';

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
   Position correction (fine alignment)

   Corrects WHERE labels land (independent of their size). A per-axis
   affine maps an ideal true-inch position to the position we actually
   send to the printer:  sent = scale * ideal + offset.

   The identity {sx:1, ox:0, sy:1, oy:0} means no correction. The SEEDED
   default below compensates for the user's observed drift out of the box
   (every square ~1/8" too far left; top row ~1/8" too high, tapering to
   correct by the bottom row) so the first print is already close. It is
   derived by inverting the printer's observed map P(sent)=physical, where
   P(0.6)=0.475 (top row 1/8" high) and P(8.4)=8.4 (bottom row correct).
   Users refine it by measuring the alignment grid and saving readings.
   ============================================================ */

/**
 * @typedef {Object} PositionCorrection
 * @property {number} sx  – horizontal scale (sent per ideal inch)
 * @property {number} ox  – horizontal offset, inches
 * @property {number} sy  – vertical scale
 * @property {number} oy  – vertical offset, inches
 * @property {{tlx:number,tly:number,brx:number,bry:number}} [readings]
 *           – the raw grid readings this correction was fit from (for UI)
 */

/** Seeded first-guess correction from the user's observed drift. */
export const SEEDED_POSITION_CORRECTION = {
  sx: 1,
  ox: 0.125,
  sy: 0.98423,
  oy: 0.13249,
  readings: { tlx: 0.75, tly: 0.72, brx: 6.0, bry: 8.4 },
};

/** Identity (no correction). */
export const IDENTITY_POSITION_CORRECTION = {
  sx: 1,
  ox: 0,
  sy: 1,
  oy: 0,
  readings: null,
};

export function savePositionCorrection(corr) {
  if (!isStorageAvailable()) return false;
  try {
    localStorage.setItem(POSITION_KEY, JSON.stringify(corr));
    return true;
  } catch {
    return false;
  }
}

export function loadPositionCorrection() {
  if (!isStorageAvailable()) return null;
  try {
    const raw = localStorage.getItem(POSITION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Current position correction: the stored one if valid, else the seeded
 * default (so compensation is active until the user resets or refines it).
 * @returns {PositionCorrection}
 */
export function getPositionCorrection() {
  const c = loadPositionCorrection();
  if (
    c &&
    isFinite(c.sx) && isFinite(c.ox) &&
    isFinite(c.sy) && isFinite(c.oy)
  ) {
    return c;
  }
  return { ...SEEDED_POSITION_CORRECTION };
}
