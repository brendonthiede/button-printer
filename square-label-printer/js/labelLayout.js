/**
 * Label Layout Configuration
 *
 * Physical dimensions for Avery 22853 print-to-the-edge square labels.
 * All measurements are in inches.
 *
 * Sheet layout (12 labels, 3 cols × 4 rows on US Letter):
 *
 *      ┌────────────────────────────────┐
 *      │   ┌────┐  ┌────┐  ┌────┐        │  ← top margin
 *      │   │ 1  │  │ 2  │  │ 3  │        │
 *      │   └────┘  └────┘  └────┘        │
 *      │   ┌────┐  ┌────┐  ┌────┐        │  ← row gap
 *      │   │ 4  │  │ 5  │  │ 6  │        │
 *      │   └────┘  └────┘  └────┘        │
 *      │           ...  (4 rows)         │
 *      └────────────────────────────────┘
 *        ↑       ↑
 *   left margin  col gap
 *
 * The squares are NOT contiguous — the sheet has an even gutter around
 * every label, equal to the page margins (measured from a real sheet):
 *
 *   Horizontal: 3 across × 2" = 6" of squares on an 8.5" page leaves 2.5"
 *   of whitespace, split evenly across 4 gaps (left edge, 2 gutters, right
 *   edge) = 2.5 / 4 = 0.625" (10/16"). So marginLeft == gapX == 0.625".
 *
 *   Vertical: 4 down × 2" = 8" on an 11" page leaves 3" of whitespace,
 *   split evenly across 5 gaps (top, 3 gutters, bottom) = 3 / 5 = 0.6"
 *   (~9/16"). So marginTop == gapY == 0.6". This centers the block and
 *   fills the sheet exactly (a uniform 9/16" would leave 3/16" over).
 *
 * VERIFY AGAINST A REAL SHEET: print the alignment sheet on plain paper
 * and hold it against a real Avery 22853 sheet; if the outlines don't
 * line up, tweak the four margin/gap constants below.
 */

export const AVERY_22853 = {
  paperWidth: 8.5,
  paperHeight: 11,
  labelWidth: 2,
  labelHeight: 2,
  columns: 3,
  rows: 4,
  marginTop: 0.6,     // (11 - 4×2) / 5 gaps — even top/row/bottom
  marginLeft: 0.625,  // (8.5 - 3×2) / 4 gaps — even left/col/right
  gapX: 0.625,        // even gutter between columns (== side margins)
  gapY: 0.6,          // even gutter between rows (== top/bottom margins)
};

/**
 * Total number of labels on one sheet.
 * @param {typeof AVERY_22853} layout
 * @returns {number}
 */
export function labelsPerSheet(layout = AVERY_22853) {
  return layout.columns * layout.rows;
}
