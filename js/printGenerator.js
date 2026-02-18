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
  const rows = Math.floor(printableHeight / buttonSize.cutLineDiameter);

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
  const grid = calculateButtonsPerPage(buttonSize, paperSize);

  const printableWidth = paperSize.width - paperSize.marginLeft - paperSize.marginRight;
  const printableHeight = paperSize.height - paperSize.marginTop - paperSize.marginBottom;

  // Centre the grid within the printable area
  const gridWidth = grid.columns * buttonSize.cutLineDiameter;
  const gridHeight = grid.rows * buttonSize.cutLineDiameter;
  const startX = paperSize.marginLeft + (printableWidth - gridWidth) / 2;
  const startY = paperSize.marginTop + (printableHeight - gridHeight) / 2;

  const buttons = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.columns; col++) {
      buttons.push({
        x: startX + col * buttonSize.cutLineDiameter,
        y: startY + row * buttonSize.cutLineDiameter,
        imageState,
      });
    }
  }

  return { paperSize, buttonSize, grid, buttons };
}

/**
 * Render the print layout into a container element, using CSS-inch
 * positioned canvases so the browser's print engine produces
 * physically accurate output.
 *
 * @param {import('./types').PrintLayout} layout
 * @param {HTMLElement} container – the #print-layout div
 */
export function renderPrintLayout(layout, container) {
  // Clear previous content
  container.innerHTML = '';

  const { buttonSize, buttons } = layout;
  const cutDiameterIn = buttonSize.cutLineDiameter;
  const cutRadiusIn = cutDiameterIn / 2;
  const contentRadiusIn = buttonSize.contentGuideDiameter / 2;

  // Each button is rendered on its own canvas, sized in CSS inches
  buttons.forEach((btn) => {
    const cellDiv = document.createElement('div');
    cellDiv.className = 'print-button-cell';

    // Position using CSS inches for print accuracy
    cellDiv.style.left = btn.x + 'in';
    cellDiv.style.top = btn.y + 'in';
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

    // Draw image
    const drawW = image.naturalWidth * scale;
    const drawH = image.naturalHeight * scale;
    const imgX = cx - drawW / 2 + offsetX;
    const imgY = cy - drawH / 2 + offsetY;

    ctx.drawImage(image, imgX, imgY, drawW, drawH);

    // Draw cut-line circle (thin red)
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
