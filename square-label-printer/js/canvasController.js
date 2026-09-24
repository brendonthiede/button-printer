/**
 * Canvas Controller
 *
 * Manages the interactive canvas where users position an image inside a
 * single 2"×2" Avery 22853 square label. The whole label is the image
 * area (full-bleed / print-to-the-edge), so there is no separate
 * "image box" inset — the crop rectangle IS the label square.
 *
 * Mental model: the canvas shows one label at native CSS-inch resolution
 * (labelWidth × PIXELS_PER_INCH). The image is drawn relative to the
 * label centre using `scale` and `offsetX/Y` in image-pixel space — the
 * same convention as the print canvas, so the print pipeline reproduces
 * the same crop without re-translating coordinates.
 *
 * In resize mode the full image is visible with a dimmed overlay outside
 * the label and outlines for the cut edge + a safe area. In preview mode
 * the image is clipped to the label square and outlines are hidden.
 *
 * This controller edits ONE slot at a time. The app swaps images in and
 * out via setImageState() as the user selects different slots; brand-new
 * images use setImage() which cover-fits them to the label.
 */

import { inchesToPixels } from './measurementConverter.js';

/**
 * @typedef {'resize' | 'preview'} CanvasMode
 */

const SAFE_AREA_INSET_IN = 0.1; // keep important content this far from the cut edge

export class CanvasController {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    /** @type {HTMLImageElement | null} */
    this.image = null;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    /** @type {{labelWidth:number,labelHeight:number} | null} */
    this.layout = null;

    /** @type {CanvasMode} */
    this.mode = 'resize';

    /** @type {((scale: number) => void) | null} */
    this.onScaleChange = null;
    /** @type {(() => void) | null} — fired after any pan or zoom */
    this.onTransformChange = null;

    this._dragging = false;
    this._lastPointer = { x: 0, y: 0 };

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onWheel = this._onWheel.bind(this);

    this.canvas.addEventListener('pointerdown', this._onPointerDown);
    this.canvas.addEventListener('pointermove', this._onPointerMove);
    this.canvas.addEventListener('pointerup', this._onPointerUp);
    this.canvas.addEventListener('pointerleave', this._onPointerUp);
    this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
  }

  /* --------------------------------------------------------
     Public API
     -------------------------------------------------------- */

  /** Load a brand-new image and cover-fit it to the label. */
  setImage(image) {
    this.image = image;
    this._resetTransform();
    this._sizeCanvas();
    this.render();
  }

  /**
   * Load an existing slot's image + transform without resetting the crop.
   * @param {{image:HTMLImageElement, scale:number, offsetX:number, offsetY:number}} state
   */
  setImageState(state) {
    this.image = state.image;
    this.scale = state.scale;
    this.offsetX = state.offsetX;
    this.offsetY = state.offsetY;
    this._sizeCanvas();
    this.render();
  }

  /** Clear the canvas (no active image). */
  clearImage() {
    this.image = null;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.render();
  }

  setLayout(layout) {
    this.layout = layout;
    this._sizeCanvas();
    if (this.image) this.render();
  }

  scaleImage(scaleFactor) {
    if (scaleFactor <= 0) return;
    this.scale = scaleFactor;
    this.render();
  }

  panImage(deltaX, deltaY) {
    this.offsetX += deltaX;
    this.offsetY += deltaY;
    this.render();
    if (this.onTransformChange) this.onTransformChange();
  }

  setMode(mode) {
    this.mode = mode;
    this.render();
  }

  /**
   * Snapshot of the current image state (for printing/preview/slot save).
   */
  getImageState() {
    return {
      image: this.image,
      scale: this.scale,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
    };
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!this.layout) return;

    const labelPxW = inchesToPixels(this.layout.labelWidth);
    const labelPxH = inchesToPixels(this.layout.labelHeight);

    // Centre the label square within the canvas.
    const labelX = (w - labelPxW) / 2;
    const labelY = (h - labelPxH) / 2;
    const cx = labelX + labelPxW / 2;
    const cy = labelY + labelPxH / 2;

    // Label background (paper colour)
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(labelX, labelY, labelPxW, labelPxH);
    ctx.restore();

    if (!this.image) {
      this._strokeCut(ctx, labelX, labelY, labelPxW, labelPxH);
      return;
    }

    if (this.mode === 'preview') {
      // Clip to the label and draw the cropped image only.
      ctx.save();
      ctx.beginPath();
      ctx.rect(labelX, labelY, labelPxW, labelPxH);
      ctx.clip();
      this._drawImage(ctx, cx, cy);
      ctx.restore();

      // Faint label border for context — no other markup.
      ctx.save();
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeRect(labelX + 0.5, labelY + 0.5, labelPxW - 1, labelPxH - 1);
      ctx.restore();
      return;
    }

    // ---- Resize mode ----
    // Draw the full image so the user can see what's being cropped out.
    this._drawImage(ctx, cx, cy);

    // Dim everything outside the label square.
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    // Counter-clockwise inner rect punches a hole.
    ctx.rect(labelX + labelPxW, labelY, -labelPxW, labelPxH);
    ctx.fill('evenodd');
    ctx.restore();

    // Cut-edge outline (what gets peeled off the sheet).
    this._strokeCut(ctx, labelX, labelY, labelPxW, labelPxH);

    // Safe-area inside the label — keep important content inside this.
    const safeInset = inchesToPixels(SAFE_AREA_INSET_IN);
    if (labelPxW > 2 * safeInset && labelPxH > 2 * safeInset) {
      ctx.save();
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(labelX + safeInset, labelY + safeInset, labelPxW - 2 * safeInset, labelPxH - 2 * safeInset);
      ctx.restore();
    }

    // Labels
    ctx.save();
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#ef4444';
    ctx.fillText('Cut edge (2")', labelX + 4, labelY - 6);
    ctx.fillStyle = '#16a34a';
    ctx.fillText('Safe area', labelX + safeInset + 4, labelY + safeInset + 14);
    ctx.restore();
  }

  /* --------------------------------------------------------
     Internal helpers
     -------------------------------------------------------- */

  _drawImage(ctx, cx, cy) {
    const img = this.image;
    const drawW = img.naturalWidth * this.scale;
    const drawH = img.naturalHeight * this.scale;
    const x = cx - drawW / 2 + this.offsetX;
    const y = cy - drawH / 2 + this.offsetY;
    ctx.drawImage(img, x, y, drawW, drawH);
  }

  _strokeCut(ctx, x, y, w, h) {
    ctx.save();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  _sizeCanvas() {
    const container = this.canvas.parentElement;
    const containerW = container.clientWidth || 600;
    const containerH = container.clientHeight || 400;

    // Make canvas fill the container.
    this.canvas.width = containerW;
    this.canvas.height = containerH;
    this.canvas.style.width = containerW + 'px';
    this.canvas.style.height = containerH + 'px';
  }

  /**
   * Reset image transform so the image fully covers the label square.
   * The smaller image-side-to-label-side ratio wins (cover-fit).
   */
  _resetTransform() {
    if (!this.image || !this.layout) {
      this.scale = 1;
      this.offsetX = 0;
      this.offsetY = 0;
      return;
    }

    const labelPxW = inchesToPixels(this.layout.labelWidth);
    const labelPxH = inchesToPixels(this.layout.labelHeight);
    const imgW = this.image.naturalWidth;
    const imgH = this.image.naturalHeight;

    this.scale = Math.max(labelPxW / imgW, labelPxH / imgH);
    this.offsetX = 0;
    this.offsetY = 0;
  }

  /* --------------------------------------------------------
     Pointer / wheel interaction
     -------------------------------------------------------- */

  _onPointerDown(e) {
    if (this.mode === 'preview' || !this.image) return;
    this._dragging = true;
    this._lastPointer = { x: e.clientX, y: e.clientY };
    this.canvas.setPointerCapture(e.pointerId);
  }

  _onPointerMove(e) {
    if (this.mode === 'preview' || !this._dragging) return;
    const dx = e.clientX - this._lastPointer.x;
    const dy = e.clientY - this._lastPointer.y;
    this._lastPointer = { x: e.clientX, y: e.clientY };
    this.panImage(dx, dy);
  }

  _onPointerUp() {
    this._dragging = false;
  }

  _onWheel(e) {
    if (this.mode === 'preview' || !this.image) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    const newScale = Math.max(0.05, this.scale + delta * this.scale);
    this.scaleImage(newScale);
    if (this.onScaleChange) this.onScaleChange(this.scale);
    if (this.onTransformChange) this.onTransformChange();
  }
}
