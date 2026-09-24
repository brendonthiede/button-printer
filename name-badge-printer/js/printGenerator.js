/**
 * Print Generator
 *
 * Lays out 8 image stamps on a US Letter sheet at the positions of an
 * Avery 25395 self-adhesive name-badge sheet, so that a single uploaded
 * image is reproduced in the upper-left corner of every badge.
 *
 * Calibration model (mirrors button-printer): every inch value — paper
 * margins, badge dimensions, gaps, and the image box itself — is
 * multiplied by `cal` before being written as a CSS-inch position or
 * size. If even one dimension is left uncalibrated, the grid drifts
 * relative to the pre-cut adhesive labels.
 */

import { inchesToPixels } from './measurementConverter.js';
import { getCalibrationFactor } from './settingsManager.js';
import { AVERY_25395 } from './badgeLayout.js';

/**
 * @typedef {{x:number,y:number,width:number,height:number}} ImageBox
 *
 * @typedef {Object} ImageState
 * @property {HTMLImageElement} image
 * @property {number} scale
 * @property {number} offsetX
 * @property {number} offsetY
 * @property {ImageBox} imageBox
 *
 * @typedef {Object} BadgePlacement
 * @property {number} x         – inches, top-left of the IMAGE BOX on the page
 * @property {number} y
 * @property {number} width     – inches, IMAGE BOX width
 * @property {number} height
 * @property {ImageState} imageState
 *
 * @typedef {Object} PrintLayout
 * @property {typeof AVERY_25395} layout
 * @property {ImageBox} imageBox
 * @property {BadgePlacement[]} badges
 * @property {number} cal
 */

/**
 * Build a print layout: for each of the 8 badges, compute the absolute
 * page position of its image-box top-left corner.
 *
 * @param {ImageState} imageState
 * @param {typeof AVERY_25395} layout
 * @param {number} [cal=1.0]
 * @returns {PrintLayout}
 */
export function generatePrintLayout(imageState, layout = AVERY_25395, cal = 1.0) {
  const { imageBox } = imageState;

  const badgeWidth  = layout.badgeWidth  * cal;
  const badgeHeight = layout.badgeHeight * cal;
  const marginLeft  = layout.marginLeft  * cal;
  const marginTop   = layout.marginTop   * cal;
  const gapX        = layout.gapX        * cal;
  const gapY        = layout.gapY        * cal;
  const boxX        = imageBox.x         * cal;
  const boxY        = imageBox.y         * cal;
  const boxW        = imageBox.width     * cal;
  const boxH        = imageBox.height    * cal;

  const badges = [];
  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.columns; col++) {
      const badgeX = marginLeft + col * (badgeWidth  + gapX);
      const badgeY = marginTop  + row * (badgeHeight + gapY);
      badges.push({
        x: badgeX + boxX,
        y: badgeY + boxY,
        width: boxW,
        height: boxH,
        imageState,
      });
    }
  }

  return { layout, imageBox, badges, cal };
}

/**
 * Render a print layout into the hidden print container.
 *
 * Each image is drawn on its own positioned canvas. The canvas is sized
 * to the calibrated image-box (in CSS inches), and the image is drawn
 * centred on the canvas with `scale * cal` so its on-screen crop is
 * reproduced at the correct physical size.
 *
 * @param {PrintLayout} layout
 * @param {HTMLElement} container – the #print-layout div
 */
export function renderPrintLayout(layout, container) {
  container.innerHTML = '';

  const { badges, cal = 1.0 } = layout;

  badges.forEach((b) => {
    const cell = document.createElement('div');
    cell.className = 'print-badge-cell';
    cell.style.left   = b.x + 'in';
    cell.style.top    = b.y + 'in';
    cell.style.width  = b.width + 'in';
    cell.style.height = b.height + 'in';

    const c = document.createElement('canvas');
    const pxW = Math.round(inchesToPixels(b.width));
    const pxH = Math.round(inchesToPixels(b.height));
    c.width = pxW;
    c.height = pxH;
    c.style.width  = b.width + 'in';
    c.style.height = b.height + 'in';

    const ctx = c.getContext('2d');
    const cx = pxW / 2;
    const cy = pxH / 2;

    const { image, scale, offsetX, offsetY } = b.imageState;

    // Clip image to the box rectangle so we don't bleed onto the
    // handwriting area (or onto an adjacent badge if the user expanded
    // the box near the edge).
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, pxW, pxH);
    ctx.clip();

    // The interactive canvas drew the image at (naturalWidth*scale)
    // pixels with the image-box at uncalibrated CSS-inch size. The
    // print canvas is `cal` times larger, so multiply draw size by cal.
    // Offsets are also in CSS pixels at 96 px/in, so they scale by cal too.
    const drawW = image.naturalWidth  * scale * cal;
    const drawH = image.naturalHeight * scale * cal;
    const imgX = cx - drawW / 2 + offsetX * cal;
    const imgY = cy - drawH / 2 + offsetY * cal;
    ctx.drawImage(image, imgX, imgY, drawW, drawH);
    ctx.restore();

    cell.appendChild(c);
    container.appendChild(cell);
  });
}

/**
 * Render an alignment-check sheet: thin outlines at every calibrated
 * badge boundary, so the user can print on plain paper and hold it up
 * to a real Avery sheet to verify column/row positions before
 * committing real labels.
 *
 * @param {HTMLElement} container
 * @param {typeof AVERY_25395} layout
 */
export function renderAlignmentSheet(container, layout = AVERY_25395) {
  container.innerHTML = '';

  const cal = getCalibrationFactor();

  const page = document.createElement('div');
  page.className = 'alignment-sheet-page';

  const note = document.createElement('div');
  note.className = 'alignment-sheet-note';
  note.innerHTML =
    '<strong>Alignment Check Sheet</strong><br>' +
    'Print on plain paper and hold against a real Avery 25395 sheet against a window. ' +
    'Each rectangle should line up with a label outline. ' +
    (cal !== 1.0
      ? 'Calibration factor: ' + cal.toFixed(4) + '×.'
      : 'No calibration applied.');
  page.appendChild(note);

  const badgeWidth  = layout.badgeWidth  * cal;
  const badgeHeight = layout.badgeHeight * cal;
  const marginLeft  = layout.marginLeft  * cal;
  const marginTop   = layout.marginTop   * cal;
  const gapX        = layout.gapX        * cal;
  const gapY        = layout.gapY        * cal;

  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.columns; col++) {
      const x = marginLeft + col * (badgeWidth  + gapX);
      const y = marginTop  + row * (badgeHeight + gapY);

      const cell = document.createElement('div');
      cell.className = 'alignment-cell';
      cell.style.left   = x + 'in';
      cell.style.top    = y + 'in';
      cell.style.width  = badgeWidth + 'in';
      cell.style.height = badgeHeight + 'in';

      const label = document.createElement('span');
      label.className = 'alignment-cell-label';
      label.textContent = `R${row + 1}C${col + 1}`;
      cell.appendChild(label);

      page.appendChild(cell);
    }
  }

  container.appendChild(page);
}

/**
 * Render a calibration test sheet with measurement reference lines.
 * The user prints this, measures the 6" line with a ruler, and enters
 * the result so the app can compute a uniform scale correction.
 *
 * @param {HTMLElement} container
 */
export function renderTestSheet(container) {
  container.innerHTML = '';

  const cal = getCalibrationFactor();

  const page = document.createElement('div');
  page.className = 'test-sheet-page';

  const title = document.createElement('h1');
  title.className = 'test-sheet-title';
  title.textContent = 'Print Calibration Test Sheet';
  page.appendChild(title);

  const calNote = document.createElement('p');
  calNote.className = 'test-sheet-subtitle';
  if (cal !== 1.0) {
    calNote.textContent =
      'Calibration active (factor: ' + cal.toFixed(4) + '×). Lines should now measure their labeled size.';
    calNote.style.fontWeight = '600';
    calNote.style.color = '#065f46';
  } else {
    calNote.textContent =
      'Measure the 6-inch line below with a ruler and enter your measurement in the calibration panel to correct for printer drift.';
  }
  page.appendChild(calNote);

  // Horizontal reference lines
  const hSection = document.createElement('div');
  hSection.className = 'test-sheet-section';
  const hTitle = document.createElement('h2');
  hTitle.textContent = 'Horizontal Lines';
  hSection.appendChild(hTitle);

  [1, 2, 3, 4, 5, 6].forEach((len) => {
    const row = document.createElement('div');
    row.className = 'test-sheet-line-row';

    const label = document.createElement('span');
    label.className = 'test-sheet-label';
    label.textContent = len + '"';

    const lineWrap = document.createElement('div');
    lineWrap.className = 'test-sheet-line-wrap';

    const line = document.createElement('div');
    line.className = 'test-sheet-h-line';
    line.style.width = (len * cal) + 'in';

    const tickL = document.createElement('div');
    tickL.className = 'test-sheet-tick-v';
    const tickR = document.createElement('div');
    tickR.className = 'test-sheet-tick-v';
    tickR.style.left = (len * cal) + 'in';

    lineWrap.appendChild(tickL);
    lineWrap.appendChild(line);
    lineWrap.appendChild(tickR);
    row.appendChild(label);
    row.appendChild(lineWrap);
    hSection.appendChild(row);
  });

  page.appendChild(hSection);

  // Vertical lines + 2x2 reference box, side-by-side
  const bottomRow = document.createElement('div');
  bottomRow.className = 'test-sheet-bottom-row';

  const vSection = document.createElement('div');
  vSection.className = 'test-sheet-section';
  const vTitle = document.createElement('h2');
  vTitle.textContent = 'Vertical Lines';
  vSection.appendChild(vTitle);

  const vContainer = document.createElement('div');
  vContainer.className = 'test-sheet-v-container';

  [1, 2, 3].forEach((len) => {
    const col = document.createElement('div');
    col.className = 'test-sheet-v-col';

    const label = document.createElement('span');
    label.className = 'test-sheet-label';
    label.textContent = len + '"';

    const lineWrap = document.createElement('div');
    lineWrap.className = 'test-sheet-vline-wrap';

    const line = document.createElement('div');
    line.className = 'test-sheet-v-line';
    line.style.height = (len * cal) + 'in';

    const tickT = document.createElement('div');
    tickT.className = 'test-sheet-tick-h';
    const tickB = document.createElement('div');
    tickB.className = 'test-sheet-tick-h';
    tickB.style.top = (len * cal) + 'in';

    lineWrap.appendChild(tickT);
    lineWrap.appendChild(line);
    lineWrap.appendChild(tickB);
    col.appendChild(label);
    col.appendChild(lineWrap);
    vContainer.appendChild(col);
  });

  vSection.appendChild(vContainer);

  const boxSection = document.createElement('div');
  boxSection.className = 'test-sheet-section';
  const boxTitle = document.createElement('h2');
  boxTitle.textContent = 'Reference Square (2" × 2")';
  boxSection.appendChild(boxTitle);

  const box = document.createElement('div');
  box.className = 'test-sheet-box';
  box.style.width = (2 * cal) + 'in';
  box.style.height = (2 * cal) + 'in';
  boxSection.appendChild(box);

  bottomRow.appendChild(vSection);
  bottomRow.appendChild(boxSection);
  page.appendChild(bottomRow);

  container.appendChild(page);
}
