/**
 * Measurement Converter
 *
 * Converts CSS inches to CSS pixels. Shared by all three apps.
 *
 * CSS standard: 1 CSS inch = 96 CSS pixels.
 * When printing, 1 CSS inch maps to 1 physical inch on paper
 * (assuming browser print settings are at 100% scale).
 */

export const PIXELS_PER_INCH = 96;

/**
 * Convert inches to CSS pixels.
 * @param {number} inches
 * @returns {number} pixels
 */
export function inchesToPixels(inches) {
  return inches * PIXELS_PER_INCH;
}

/**
 * Return the device pixel ratio of the current display.
 * @returns {number}
 */
export function getPixelRatio() {
  return window.devicePixelRatio || 1;
}
