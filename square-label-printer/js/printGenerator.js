/**
 * Print Generator
 *
 * Lays out up to 12 image stamps on a US Letter sheet at the positions of
 * an Avery 22853 print-to-the-edge square-label sheet. Unlike the sibling
 * button/badge tools, each label cell can carry a DIFFERENT image — the
 * caller passes an array of per-cell image states (e.g. image A ×3, image
 * B ×3, …). Empty cells (null) print blank.
 *
 * Calibration model (mirrors button-printer): every inch value — paper
 * margins, label dimensions, and gaps — is multiplied by `cal` before
 * being written as a CSS-inch position or size. If even one dimension is
 * left uncalibrated, the grid drifts relative to the pre-cut adhesive
 * labels.
 */

import { inchesToPixels } from './measurementConverter.js';
import { getCalibrationFactor, IDENTITY_POSITION_CORRECTION } from './settingsManager.js';
import { AVERY_22853 } from './labelLayout.js';

/**
 * Apply the per-axis position-correction affine to an ideal (true-inch)
 * top-left position: sent = scale * ideal + offset. Returns true-inch
 * "sent" coordinates (the caller still multiplies by the size `cal`).
 * @param {number} x
 * @param {number} y
 * @param {import('./settingsManager.js').PositionCorrection} corr
 */
function correctPosition(x, y, corr) {
  return {
    x: corr.sx * x + corr.ox,
    y: corr.sy * y + corr.oy,
  };
}

/**
 * @typedef {Object} ImageState
 * @property {HTMLImageElement} image
 * @property {number} scale
 * @property {number} offsetX
 * @property {number} offsetY
 *
 * @typedef {Object} LabelPlacement
 * @property {number} x                – inches, top-left of the label on the page
 * @property {number} y
 * @property {number} width            – inches, label width
 * @property {number} height
 * @property {ImageState | null} imageState  – null → blank label
 *
 * @typedef {Object} PrintLayout
 * @property {typeof AVERY_22853} layout
 * @property {LabelPlacement[]} labels
 * @property {number} cal
 */

/**
 * Build a print layout: for each label cell in the grid, compute the
 * absolute page position of its top-left corner and attach the matching
 * image state from `cellStates` (indexed row-major).
 *
 * The label SIZE is `labelWidth/Height * cal`. The label POSITION is the
 * ideal grid position run through the position-correction affine, then
 * scaled by `cal` (the same cal-scaled space the alignment grid is drawn
 * in). With the default identity correction, positions are unchanged.
 *
 * @param {(ImageState|null)[]} cellStates – one entry per cell, row-major
 * @param {typeof AVERY_22853} layout
 * @param {number} [cal=1.0]
 * @param {import('./settingsManager.js').PositionCorrection} [corr]
 * @returns {PrintLayout}
 */
export function generatePrintLayout(cellStates, layout = AVERY_22853, cal = 1.0, corr = IDENTITY_POSITION_CORRECTION) {
  const labelWidth  = layout.labelWidth  * cal;
  const labelHeight = layout.labelHeight * cal;

  const labels = [];
  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.columns; col++) {
      const i = row * layout.columns + col;
      // Ideal top-left in true inches, then position-corrected, then scaled.
      const idealX = layout.marginLeft + col * (layout.labelWidth  + layout.gapX);
      const idealY = layout.marginTop  + row * (layout.labelHeight + layout.gapY);
      const sent = correctPosition(idealX, idealY, corr);
      labels.push({
        x: sent.x * cal,
        y: sent.y * cal,
        width: labelWidth,
        height: labelHeight,
        imageState: cellStates[i] || null,
      });
    }
  }

  return { layout, labels, cal };
}

/**
 * Render a print layout into the hidden print container.
 *
 * Each image is drawn on its own positioned canvas. The canvas is sized
 * to the calibrated label (in CSS inches), and the image is drawn centred
 * with `scale * cal` so its on-screen crop is reproduced at the correct
 * physical size. Blank cells (no image) are skipped.
 *
 * @param {PrintLayout} layout
 * @param {HTMLElement} container – the #print-layout div
 */
export function renderPrintLayout(layout, container) {
  container.innerHTML = '';

  const { labels, cal = 1.0 } = layout;

  labels.forEach((b) => {
    if (!b.imageState || !b.imageState.image) return; // blank label

    const cell = document.createElement('div');
    cell.className = 'print-label-cell';
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

    // Clip image to the label rectangle so it doesn't bleed onto an
    // adjacent label.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, pxW, pxH);
    ctx.clip();

    // The interactive canvas drew the image at (naturalWidth*scale)
    // pixels with the label at uncalibrated CSS-inch size. The print
    // canvas is `cal` times larger, so multiply draw size by cal.
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
 * Render an alignment-check sheet: thin outlines at every label's
 * CORRECTED position, so the user can print on plain paper and hold it up
 * to a real Avery sheet to confirm the position correction now lands each
 * outline on its die-cut square.
 *
 * @param {HTMLElement} container
 * @param {typeof AVERY_22853} layout
 * @param {import('./settingsManager.js').PositionCorrection} [corr]
 */
export function renderAlignmentSheet(container, layout = AVERY_22853, corr = IDENTITY_POSITION_CORRECTION) {
  container.innerHTML = '';

  const cal = getCalibrationFactor();
  const corrected = corr && (corr.sx !== 1 || corr.ox !== 0 || corr.sy !== 1 || corr.oy !== 0);

  const page = document.createElement('div');
  page.className = 'alignment-sheet-page';

  const note = document.createElement('div');
  note.className = 'alignment-sheet-note';
  note.innerHTML =
    '<strong>Alignment Check Sheet</strong><br>' +
    'Print on plain paper and hold it against a real Avery 22853 sheet against a window. ' +
    'Each square should line up with a label outline. ' +
    (corrected ? 'Position correction applied. ' : 'No position correction. ') +
    (cal !== 1.0 ? 'Size calibration: ' + cal.toFixed(4) + '×.' : '');
  page.appendChild(note);

  const labelWidth  = layout.labelWidth  * cal;
  const labelHeight = layout.labelHeight * cal;

  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.columns; col++) {
      const idealX = layout.marginLeft + col * (layout.labelWidth  + layout.gapX);
      const idealY = layout.marginTop  + row * (layout.labelHeight + layout.gapY);
      const sent = correctPosition(idealX, idealY, corr);

      const cell = document.createElement('div');
      cell.className = 'alignment-cell';
      cell.style.left   = (sent.x * cal) + 'in';
      cell.style.top    = (sent.y * cal) + 'in';
      cell.style.width  = labelWidth + 'in';
      cell.style.height = labelHeight + 'in';

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
 * Render a full-page coordinate reference grid. The user prints this and
 * overlays it on a blank Avery 22853 sheet (through the light) to read the
 * true position of each die-cut square's corners, then enters two diagonal
 * corner readings so the app can fit the position correction.
 *
 * Drawn at the size-calibration scale (so labeled inches ≈ real inches) but
 * WITHOUT the position correction — this is the raw ruler. Decimal labels
 * sit at every 1" intersection, spread across the whole page, with fine
 * 1/8" ticks between so fractions can be read even through an overlaid sheet.
 *
 * @param {HTMLElement} container
 * @param {typeof AVERY_22853} layout
 */
export function renderAlignmentGrid(container, layout = AVERY_22853) {
  container.innerHTML = '';

  const cal = getCalibrationFactor();
  const pageW = layout.paperWidth;   // 8.5
  const pageH = layout.paperHeight;  // 11

  const page = document.createElement('div');
  page.className = 'alignment-grid-page';

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(inchesToPixels(pageW * cal));
  canvas.height = Math.round(inchesToPixels(pageH * cal));
  canvas.style.width = (pageW * cal) + 'in';
  canvas.style.height = (pageH * cal) + 'in';

  const ctx = canvas.getContext('2d');
  const px = (inches) => inchesToPixels(inches * cal);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Minor (1/8"), medium (1/2"), major (1") lines.
  const eighths = 8;
  const drawVLine = (xIn, color, w) => {
    ctx.strokeStyle = color; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(px(xIn), 0); ctx.lineTo(px(xIn), canvas.height); ctx.stroke();
  };
  const drawHLine = (yIn, color, w) => {
    ctx.strokeStyle = color; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(0, px(yIn)); ctx.lineTo(canvas.width, px(yIn)); ctx.stroke();
  };

  for (let i = 0; i <= Math.round(pageW * eighths); i++) {
    const xIn = i / eighths;
    if (i % eighths === 0)      drawVLine(xIn, '#333333', 1.4);
    else if (i % (eighths / 2) === 0) drawVLine(xIn, '#999999', 1);
    else                        drawVLine(xIn, '#dddddd', 0.6);
  }
  for (let j = 0; j <= Math.round(pageH * eighths); j++) {
    const yIn = j / eighths;
    if (j % eighths === 0)      drawHLine(yIn, '#333333', 1.4);
    else if (j % (eighths / 2) === 0) drawHLine(yIn, '#999999', 1);
    else                        drawHLine(yIn, '#dddddd', 0.6);
  }

  // Faint dashed outlines of the ideal label squares, for orientation.
  ctx.save();
  ctx.strokeStyle = 'rgba(34,197,94,0.5)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.columns; col++) {
      const x = layout.marginLeft + col * (layout.labelWidth + layout.gapX);
      const y = layout.marginTop  + row * (layout.labelHeight + layout.gapY);
      ctx.strokeRect(px(x), px(y), px(layout.labelWidth), px(layout.labelHeight));
    }
  }
  ctx.restore();

  // Decimal coordinate labels at every 1" intersection, spread across page.
  ctx.fillStyle = '#1e3a8a';
  ctx.font = `${Math.round(inchesToPixels(0.09))}px -apple-system, "Segoe UI", sans-serif`;
  ctx.textBaseline = 'top';
  for (let xi = 0; xi <= Math.floor(pageW); xi++) {
    for (let yi = 0; yi <= Math.floor(pageH); yi++) {
      const tx = px(xi) + 2;
      const ty = px(yi) + 2;
      ctx.fillText(`${xi.toFixed(1)}, ${yi.toFixed(1)}`, tx, ty);
    }
  }

  page.appendChild(canvas);

  const note = document.createElement('div');
  note.className = 'alignment-grid-note';
  note.innerHTML =
    '<strong>Alignment Reference Grid</strong> — coordinates in inches (x, y). ' +
    'Overlay on a blank Avery 22853 sheet against a window. Read the coordinate at the ' +
    '<strong>top-left corner</strong> of the <strong>top-left</strong> square and of the ' +
    '<strong>bottom-right</strong> square, then enter both in the Fine Alignment panel.' +
    (cal !== 1.0 ? ' Size calibration ' + cal.toFixed(4) + '× is applied.' : '');
  page.appendChild(note);

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
