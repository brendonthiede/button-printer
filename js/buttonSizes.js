/**
 * Button Size Configuration
 *
 * Physical dimensions for each supported button size.
 * All measurements are in inches.
 */

export const BUTTON_SIZES = {
  '1.25': {
    name: '1.25 inch',
    cutLineDiameter: 1.772,
    contentGuideDiameter: 1.156,
    maxRows: 5,
  },
  '2.25': {
    name: '2.25 inch',
    cutLineDiameter: 2.625,
    contentGuideDiameter: 2.063,
    layout: 'hex',
    maxRows: 4,
  },
};

/**
 * Get a ButtonSize object by key.
 * @param {string} key – "1.25" or "2.25"
 * @returns {import('./types').ButtonSize}
 */
export function getButtonSize(key) {
  const size = BUTTON_SIZES[key];
  if (!size) {
    throw new Error(`Unknown button size: ${key}`);
  }
  return size;
}
