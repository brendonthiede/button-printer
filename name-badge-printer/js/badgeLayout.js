/**
 * Badge Layout Configuration
 *
 * Physical dimensions for Avery 25395 self-adhesive name badges.
 * All measurements are in inches.
 *
 * Sheet layout (8 badges, 2 cols × 4 rows on US Letter):
 *
 *      ┌──────────────────────────────────┐
 *      │  ┌─────────┐    ┌─────────┐      │  ← top margin
 *      │  │ badge 1 │    │ badge 2 │      │
 *      │  └─────────┘    └─────────┘      │
 *      │  ┌─────────┐    ┌─────────┐      │  ← row gap
 *      │  │ badge 3 │    │ badge 4 │      │
 *      │  └─────────┘    └─────────┘      │
 *      │     ...                          │
 *      └──────────────────────────────────┘
 *        ↑          ↑
 *    left margin  col gap
 *
 * Horizontal check: 2 × 11/16 + 2 × 3.375 + 1 × 3/8  = 8.5  ✓
 * Vertical check:   9/16 + 4 × 2.333 + 3 × 3/16 + bot = 11.0
 *                   bottom margin = 0.543" (asymmetric — absorbs the
 *                   rounding from badgeHeight = 2.333 vs the implied 7/3").
 *
 * Source: Avery's official template PDF for product 25395. The vector
 * rectangles in that PDF give exact cut positions in points (1/72").
 */

export const AVERY_25395 = {
  paperWidth: 8.5,
  paperHeight: 11,
  badgeWidth: 3.375,     // 3-3/8"
  badgeHeight: 2.333,    // 2-1/3" (Avery uses 2.333, not exact 7/3)
  columns: 2,
  rows: 4,
  marginTop: 0.5625,     // 9/16"
  marginLeft: 0.6875,    // 11/16"
  gapX: 0.375,           // 3/8" between columns
  gapY: 0.1875,          // 3/16" between rows
};

/**
 * Default image box configuration: a square in the upper-left of each badge.
 * x/y are insets from the badge's top-left corner; width/height are the
 * box dimensions. All in inches.
 *
 * The small inset keeps the image away from the cut edge where printers
 * are most likely to clip or smear.
 */
export const DEFAULT_IMAGE_BOX = {
  x: 0.1,
  y: 0.1,
  width: 1.0,
  height: 1.0,
};

/**
 * Validate an image box fits within the badge.
 * @param {{x:number,y:number,width:number,height:number}} box
 * @param {typeof AVERY_25395} layout
 * @returns {boolean}
 */
export function imageBoxFits(box, layout = AVERY_25395) {
  return (
    box.x >= 0 &&
    box.y >= 0 &&
    box.width > 0 &&
    box.height > 0 &&
    box.x + box.width <= layout.badgeWidth &&
    box.y + box.height <= layout.badgeHeight
  );
}
