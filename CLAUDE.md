# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Browser-based tool for preparing images to print as physical pinback buttons. Vanilla JS ES modules, no build step, no dependencies, no tests. Open `index.html` in a browser (or serve the directory with any static file server) — there is nothing to install or compile.

## Architecture

The pipeline is: **load image → crop interactively → lay out on a virtual US Letter page → trigger `window.print()`**. The browser's print engine handles the actual printing; the app's job is to position content at exact physical dimensions.

### Print accuracy model — the load-bearing concept

Physical accuracy depends on CSS inches. The app sets element widths/positions in `in` units (e.g. `style.width = '1.772in'`) and trusts that 1 CSS inch maps to 1 physical inch when the user prints at 100% scale. For canvases, dimensions are computed in pixels via `inchesToPixels()` (96 px/in, `measurementConverter.js`) but the canvas's CSS `width`/`height` are still set in inches so print sizing is correct independent of the bitmap resolution.

Real printers drift, so a **calibration scale factor** (`getCalibrationFactor()` in `settingsManager.js`) is multiplied into every CSS-inch value in `printGenerator.js`. The factor is computed from the test sheet: user prints it, measures the 6" line, app stores `expected / measured`. When applying calibration, multiply *all* inch values consistently — positions, sizes, and image scale — or buttons drift relative to their cut lines.

Calibration must also drive the **grid layout itself**, not just the per-cell render: `generatePrintLayout(imageState, paperSize, cal)` and `calculateButtonsPerPage(buttonSize, paperSize, cal)` use the calibrated diameter when deciding how many rows/columns fit and where to centre each button. If you only scale at render time, the calibrated cells overflow the 8.5×11 CSS bound and any printer with "Shrink to fit" enabled silently rescales the whole page — defeating the calibration. The returned layout carries `cal` forward so `renderPrintLayout` sizes cells to `cutLineDiameter * cal` without rescaling positions a second time. The on-screen preview calls `generatePrintLayout` without `cal` (defaults to 1.0), since calibration is irrelevant to a percentage-positioned preview.

### Module boundaries

- **`canvasController.js`** owns the interactive crop canvas (image + scale + offset + mode). Renders three concentric guide circles in resize mode: cut line (red, outer), button face (blue, middle), content safe area (green, inner). Pointer drag pans, wheel zooms.
- **`printGenerator.js`** is pure layout: `generatePrintLayout()` returns a list of `{x, y, imageState}` button positions in inches. `renderPrintLayout()` writes them as positioned canvases into the hidden `#print-layout` div. `renderTestSheet()` writes a calibration page into the same div. The print CSS in `styles.css` (`@media print`) hides everything else and reveals only `.print-layout`.
- **`buttonSizes.js`** holds the physical dimensions for each size. Three diameters per size: `cutLineDiameter` (paper trim), `buttonFaceDiameter` (visible front), `contentGuideDiameter` (safe area inside the wrap-around). A size may also declare `layout: 'hex'` and `maxRows` to opt into the hex-packed layout in `generateHexPrintLayout()` instead of the default grid.
- **`app.js`** is glue — DOM event bindings, slider/canvas sync, calibration UI state. Holds no logic that belongs in the other modules.

### Image transform stays in image-pixel space

`CanvasController.scale` and `offsetX/Y` are stored in image-native pixels relative to the canvas centre, not as ratios. The interactive canvas, the on-screen preview (`renderPreview` in `app.js`), and the print canvas all reproduce the same crop by drawing the image at `naturalWidth * scale` centred on the cut circle plus the offset. When the print canvas is calibration-scaled, `drawW = naturalWidth * scale * cal` (see `printGenerator.js:203`) — the image's draw size scales with the cut circle, but the offset does not (it's already in canvas pixels and the canvas is the same size in pixels).

## Conventions

- All physical measurements in the code are inches (not mm, not pixels) until the moment they're handed to a canvas bitmap.
- The slider's "100%" is the *fit* scale (image's smaller dimension fills the cut circle), not the image's native size — see `computeBaseScale()` in `app.js`.
- `localStorage` access is wrapped in try/catch in `settingsManager.js`; assume it can be unavailable (private browsing, etc.) and fall back gracefully.
