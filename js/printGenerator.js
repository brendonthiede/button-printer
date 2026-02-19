/**
 * Print Generator
 *
 * Creates printable layouts with multiple button images arranged on
 * US letter-sized paper at precise physical dimensions.
 *
 * Uses CSS inches so that browser print media queries map 1 CSS inch
 * to 1 physical inch on paper.
 */

import { inchesToPixels, PIXELS_PER_INCH } from './measurementConverter.js';
import { getCalibrationFactor } from './settingsManager.js';

/** Standard US Letter paper */
export const US_LETTER = {
  width: 8.5,   // inches
  height: 11,   // inches
  marginTop: 0.5,
  marginRight: 0.5,
  marginBottom: 0.5,
  marginLeft: 0.5,
};

/**
 * Calculate how many buttons fit on a given paper size.
 *
 * @param {import('./buttonSizes').ButtonSize} buttonSize
 * @param {typeof US_LETTER} paperSize
 * @returns {{ columns: number, rows: number, total: number }}
 */
export function calculateButtonsPerPage(buttonSize, paperSize = US_LETTER) {
  const printableWidth = paperSize.width - paperSize.marginLeft - paperSize.marginRight;
  const printableHeight = paperSize.height - paperSize.marginTop - paperSize.marginBottom;

  const columns = Math.floor(printableWidth / buttonSize.cutLineDiameter);
  let rows = Math.floor(printableHeight / buttonSize.cutLineDiameter);

  // Respect per-size row cap (e.g. 1.25" buttons limited to 5 rows)
  if (buttonSize.maxRows && rows > buttonSize.maxRows) {
    rows = buttonSize.maxRows;
  }

  return { columns, rows, total: columns * rows };
}

/**
 * Generate a print layout description.
 *
 * @param {import('./canvasController').ImageState} imageState
 * @param {typeof US_LETTER} paperSize
 * @returns {import('./types').PrintLayout}
 */
export function generatePrintLayout(imageState, paperSize = US_LETTER) {
  const { buttonSize } = imageState;

  if (buttonSize.layout === 'hex') {
    return generateHexPrintLayout(imageState, paperSize);
  }

  const grid = calculateButtonsPerPage(buttonSize, paperSize);

  const printableWidth = paperSize.width - paperSize.marginLeft - paperSize.marginRight;
  const printableHeight = paperSize.height - paperSize.marginTop - paperSize.marginBottom;

  // Distribute buttons evenly across the printable area.
  // Each button occupies a cell; cells are equally sized so that
  // buttons are spread apart with uniform spacing.
  const cellWidth = printableWidth / grid.columns;
  const cellHeight = printableHeight / grid.rows;

  const buttons = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.columns; col++) {
      // Centre each button within its cell
      const x = paperSize.marginLeft + col * cellWidth + (cellWidth - buttonSize.cutLineDiameter) / 2;
      const y = paperSize.marginTop + row * cellHeight + (cellHeight - buttonSize.cutLineDiameter) / 2;
      buttons.push({ x, y, imageState });
    }
  }

  return { paperSize, buttonSize, grid, buttons };
}

/**
 * Generate a hex-packed (brick pattern) print layout.
 *
 * Alternating rows of 3 and 2 buttons, with rows packed closer
 * together using hexagonal spacing (diameter × √3/2) so adjacent
 * rows overlap while leaving a small gap between circles.
 *
 * @param {import('./canvasController').ImageState} imageState
 * @param {typeof US_LETTER} paperSize
 * @returns {import('./types').PrintLayout}
 */
function generateHexPrintLayout(imageState, paperSize) {
  const { buttonSize } = imageState;
  const diameter = buttonSize.cutLineDiameter;
  const radius = diameter / 2;
  const numRows = buttonSize.maxRows || 4;
  const gap = 0.2; // inches of spacing between buttons
  const step = diameter + gap; // centre-to-centre distance within a row

  // Alternating rows: 3 buttons, 2 buttons, 3, 2, …
  const rowCounts = [];
  for (let i = 0; i < numRows; i++) {
    rowCounts.push(i % 2 === 0 ? 3 : 2);
  }
  const total = rowCounts.reduce((sum, n) => sum + n, 0);

  // Centre 3-button rows horizontally on the page
  const totalWidth = 2 * step + diameter; // 3 buttons with gaps
  const startX3 = (paperSize.width - totalWidth) / 2;
  const startX2 = startX3 + step / 2; // half-step offset for 2-button rows

  // Hex-pack vertically with gap: row spacing = step × √3/2
  const rowSpacing = step * Math.sqrt(3) / 2;
  const totalHeight = (numRows - 1) * rowSpacing + diameter;
  const startY = (paperSize.height - totalHeight) / 2;

  const buttons = [];
  for (let row = 0; row < numRows; row++) {
    const count = rowCounts[row];
    const baseX = count === 3 ? startX3 : startX2;
    const y = startY + row * rowSpacing;

    for (let col = 0; col < count; col++) {
      const x = baseX + col * step;
      buttons.push({ x, y, imageState });
    }
  }

  const grid = {
    columns: 3,
    rows: numRows,
    total,
    layout: 'hex',
  };

  return { paperSize, buttonSize, grid, buttons };
}

/**
 * Render the print layout into a container element, using CSS-inch
 * positioned canvases so the browser's print engine produces
 * physically accurate output.
 *
 * Applies calibration scale factor so CSS inches map to real inches.
 *
 * @param {import('./types').PrintLayout} layout
 * @param {HTMLElement} container – the #print-layout div
 */
export function renderPrintLayout(layout, container) {
  // Clear previous content
  container.innerHTML = '';

  const cal = getCalibrationFactor();
  const { buttonSize, buttons } = layout;
  const cutDiameterIn = buttonSize.cutLineDiameter * cal;
  const cutRadiusIn = cutDiameterIn / 2;
  const contentRadiusIn = (buttonSize.contentGuideDiameter * cal) / 2;

  // Each button is rendered on its own canvas, sized in CSS inches
  buttons.forEach((btn) => {
    const cellDiv = document.createElement('div');
    cellDiv.className = 'print-button-cell';

    // Position using CSS inches for print accuracy (calibrated)
    cellDiv.style.left = (btn.x * cal) + 'in';
    cellDiv.style.top = (btn.y * cal) + 'in';
    cellDiv.style.width = cutDiameterIn + 'in';
    cellDiv.style.height = cutDiameterIn + 'in';

    const c = document.createElement('canvas');
    const sizePx = inchesToPixels(cutDiameterIn);
    c.width = sizePx;
    c.height = sizePx;
    c.style.width = cutDiameterIn + 'in';
    c.style.height = cutDiameterIn + 'in';

    const ctx = c.getContext('2d');
    const cx = sizePx / 2;
    const cy = sizePx / 2;

    const { image, scale, offsetX, offsetY } = btn.imageState;

    // Compute the scale ratio: the interactive canvas may differ in size
    // from the print canvas, so we need to map offsets accordingly.
    // On the interactive canvas the cut-line circle also has radius
    // = inchesToPixels(cutRadiusIn), so the ratio is 1:1 for offsets.
    const cutRadiusPx = inchesToPixels(cutRadiusIn);
    const contentRadiusPx = inchesToPixels(contentRadiusIn);

    // Clip image to the circular cut-line area so background is transparent
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, cutRadiusPx, 0, Math.PI * 2);
    ctx.clip();

    // Draw image
    const drawW = image.naturalWidth * scale;
    const drawH = image.naturalHeight * scale;
    const imgX = cx - drawW / 2 + offsetX;
    const imgY = cy - drawH / 2 + offsetY;

    ctx.drawImage(image, imgX, imgY, drawW, drawH);
    ctx.restore();

    // Draw cut-line circle (thin dashed)
    ctx.save();
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(cx, cy, cutRadiusPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    cellDiv.appendChild(c);
    container.appendChild(cellDiv);
  });
}

/**
 * Render a calibration test sheet into the print-layout container.
 * The test sheet has horizontal and vertical measurement lines at
 * known CSS-inch lengths so the user can compare against a physical
 * ruler and calculate a correction factor.
 *
 * @param {HTMLElement} container – the #print-layout div
 */
export function renderTestSheet(container) {
  container.innerHTML = '';

  const page = document.createElement('div');
  page.className = 'test-sheet-page';

  // Title
  const title = document.createElement('h1');
  title.className = 'test-sheet-title';
  title.textContent = 'Print Calibration Test Sheet';
  page.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.className = 'test-sheet-subtitle';
  subtitle.textContent =
    'Measure the lines below with a ruler. Enter your measurements in the calibration panel to correct for printer inaccuracy.';
  page.appendChild(subtitle);

  // Reference lines at 1", 2", 3", 4", 5", 6"
  const lengths = [1, 2, 3, 4, 5, 6];

  // Horizontal lines section
  const hSection = document.createElement('div');
  hSection.className = 'test-sheet-section';
  const hTitle = document.createElement('h2');
  hTitle.textContent = 'Horizontal Lines';
  hSection.appendChild(hTitle);

  lengths.forEach((len) => {
    const row = document.createElement('div');
    row.className = 'test-sheet-line-row';

    const label = document.createElement('span');
    label.className = 'test-sheet-label';
    label.textContent = len + '"';

    const lineWrap = document.createElement('div');
    lineWrap.className = 'test-sheet-line-wrap';

    const line = document.createElement('div');
    line.className = 'test-sheet-h-line';
    line.style.width = len + 'in';

    // Tick marks at each end
    const tickL = document.createElement('div');
    tickL.className = 'test-sheet-tick-v';
    const tickR = document.createElement('div');
    tickR.className = 'test-sheet-tick-v';
    tickR.style.left = len + 'in';

    lineWrap.appendChild(tickL);
    lineWrap.appendChild(line);
    lineWrap.appendChild(tickR);
    row.appendChild(label);
    row.appendChild(lineWrap);
    hSection.appendChild(row);
  });

  page.appendChild(hSection);

  // Vertical lines section
  const vSection = document.createElement('div');
  vSection.className = 'test-sheet-section test-sheet-vertical-section';
  const vTitle = document.createElement('h2');
  vTitle.textContent = 'Vertical Lines';
  vSection.appendChild(vTitle);

  const vContainer = document.createElement('div');
  vContainer.className = 'test-sheet-v-container';

  lengths.slice(0, 3).forEach((len) => { // 1"-3" verticals to fit on one page
    const col = document.createElement('div');
    col.className = 'test-sheet-v-col';

    const label = document.createElement('span');
    label.className = 'test-sheet-label';
    label.textContent = len + '"';

    const lineWrap = document.createElement('div');
    lineWrap.className = 'test-sheet-vline-wrap';

    const line = document.createElement('div');
    line.className = 'test-sheet-v-line';
    line.style.height = len + 'in';

    // Tick marks at each end
    const tickT = document.createElement('div');
    tickT.className = 'test-sheet-tick-h';
    const tickB = document.createElement('div');
    tickB.className = 'test-sheet-tick-h';
    tickB.style.top = len + 'in';

    lineWrap.appendChild(tickT);
    lineWrap.appendChild(line);
    lineWrap.appendChild(tickB);
    col.appendChild(label);
    col.appendChild(lineWrap);
    vContainer.appendChild(col);
  });

  vSection.appendChild(vContainer);
  page.appendChild(vSection);

  // Box test – a 2"x2" square
  const boxSection = document.createElement('div');
  boxSection.className = 'test-sheet-section';
  const boxTitle = document.createElement('h2');
  boxTitle.textContent = 'Reference Square (2" × 2")';
  boxSection.appendChild(boxTitle);

  const box = document.createElement('div');
  box.className = 'test-sheet-box';
  box.style.width = '2in';
  box.style.height = '2in';

  boxSection.appendChild(box);
  page.appendChild(boxSection);

  container.appendChild(page);
}
