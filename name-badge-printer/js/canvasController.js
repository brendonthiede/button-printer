/**
 * Canvas Controller
 *
 * Manages the interactive canvas where users position an image inside
 * the rectangular image-box of an Avery 25395 name badge.
 *
 * Mental model: the canvas shows the entire badge at native CSS-inch
 * resolution (badgeWidth × PIXELS_PER_INCH). The image-box rectangle is
 * a sub-region in the upper-left of that badge. The image is drawn
 * relative to the image-box centre using `scale` and `offsetX/Y` in
 * image-pixel space — the same convention as the print canvas, so the
 * print pipeline can reproduce the same crop without re-translating
 * coordinates.
 *
 * In resize mode the full image is visible with a dimmed overlay outside
 * the box and outlines for the badge + image-box + safe area. In preview
 * mode the image is clipped to the box and outlines are hidden.
 */

import { inchesToPixels } from './measurementConverter.js';

/**
 * @typedef {'resize' | 'preview'} CanvasMode
 *
 * @typedef {Object} ImageBox
 * @property {number} x       – inset from badge top-left, inches
 * @property {number} y       – inset from badge top-left, inches
 * @property {number} width   – box width, inches
 * @property {number} height  – box height, inches
 */

const SAFE_AREA_INSET_IN = 0.05; // visual "don't put important stuff at the edge" margin

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

    /** @type {{paperWidth:number,paperHeight:number,badgeWidth:number,badgeHeight:number} | null} */
    this.layout = null;
    /** @type {ImageBox | null} */
    this.imageBox = null;

    /** @type {CanvasMode} */
    this.mode = 'resize';

    /** @type {((scale: number) => void) | null} */
    this.onScaleChange = null;

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

  setImage(image) {
    this.image = image;
    this._resetTransform();
    this._sizeCanvas();
    this.render();
  }

  setLayout(layout) {
    this.layout = layout;
    this._sizeCanvas();
    if (this.image) this.render();
  }

  setImageBox(box) {
    this.imageBox = box;
    if (this.image) this._resetTransform();
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
  }

  setMode(mode) {
    this.mode = mode;
    this.render();
  }

  /**
   * Snapshot of the current image state (for printing/preview).
   */
  getImageState() {
    return {
      image: this.image,
      scale: this.scale,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
      imageBox: this.imageBox,
    };
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!this.layout || !this.imageBox) return;

    const badgePxW = inchesToPixels(this.layout.badgeWidth);
    const badgePxH = inchesToPixels(this.layout.badgeHeight);

    // Centre the badge rectangle within the canvas.
    const badgeX = (w - badgePxW) / 2;
    const badgeY = (h - badgePxH) / 2;

    const boxX = badgeX + inchesToPixels(this.imageBox.x);
    const boxY = badgeY + inchesToPixels(this.imageBox.y);
    const boxW = inchesToPixels(this.imageBox.width);
    const boxH = inchesToPixels(this.imageBox.height);
    const boxCx = boxX + boxW / 2;
    const boxCy = boxY + boxH / 2;

    // Badge background (paper colour)
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(badgeX, badgeY, badgePxW, badgePxH);
    ctx.restore();

    if (!this.image) {
      // No image yet — just draw an empty badge with the image-box outline
      this._strokeBadge(ctx, badgeX, badgeY, badgePxW, badgePxH);
      this._strokeImageBox(ctx, boxX, boxY, boxW, boxH);
      return;
    }

    if (this.mode === 'preview') {
      // Clip to the image box and draw the cropped image only.
      ctx.save();
      ctx.beginPath();
      ctx.rect(boxX, boxY, boxW, boxH);
      ctx.clip();
      this._drawImage(ctx, boxCx, boxCy);
      ctx.restore();

      // Faint badge border for context — no other markup.
      ctx.save();
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeRect(badgeX + 0.5, badgeY + 0.5, badgePxW - 1, badgePxH - 1);
      ctx.restore();
      return;
    }

    // ---- Resize mode ----
    // Draw the full image so the user can see what's being cropped out.
    this._drawImage(ctx, boxCx, boxCy);

    // Dim everything outside the image box.
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    // Counter-clockwise inner rect punches a hole.
    ctx.rect(boxX + boxW, boxY, -boxW, boxH);
    ctx.fill('evenodd');
    ctx.restore();

    // Badge outline (the cut edge — what gets peeled off the sheet).
    this._strokeBadge(ctx, badgeX, badgeY, badgePxW, badgePxH);

    // Image-box outline.
    this._strokeImageBox(ctx, boxX, boxY, boxW, boxH);

    // Safe-area inside the image box.
    const safeInset = inchesToPixels(SAFE_AREA_INSET_IN);
    if (boxW > 2 * safeInset && boxH > 2 * safeInset) {
      ctx.save();
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(boxX + safeInset, boxY + safeInset, boxW - 2 * safeInset, boxH - 2 * safeInset);
      ctx.restore();
    }

    // Handwriting-area hatch hint inside the badge but outside the image box.
    this._drawHandwritingHint(ctx, badgeX, badgeY, badgePxW, badgePxH, boxX, boxY, boxW, boxH);

    // Labels
    ctx.save();
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#3b82f6';
    ctx.fillText('Image', boxX + 4, boxY + 14);
    ctx.fillStyle = '#64748b';
    ctx.fillText('Handwriting area', boxX + boxW + 8, badgeY + badgePxH / 2);
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

  _strokeBadge(ctx, x, y, w, h) {
    ctx.save();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  _strokeImageBox(ctx, x, y, w, h) {
    ctx.save();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  /**
   * Draw light diagonal hatching in the handwriting area to make it visually
   * distinct from the image box. The hatch is purely a visual hint on screen —
   * it never appears in the printed output.
   */
  _drawHandwritingHint(ctx, badgeX, badgeY, badgeW, badgeH, boxX, boxY, boxW, boxH) {
    ctx.save();
    // Build a path that covers the badge minus the image box, then clip.
    ctx.beginPath();
    ctx.rect(badgeX, badgeY, badgeW, badgeH);
    ctx.rect(boxX + boxW, boxY, -boxW, boxH);
    ctx.clip('evenodd');

    ctx.strokeStyle = 'rgba(100, 116, 139, 0.15)';
    ctx.lineWidth = 1;
    const spacing = 8;
    const right = badgeX + badgeW;
    const bottom = badgeY + badgeH;
    for (let d = -badgeH; d < badgeW; d += spacing) {
      ctx.beginPath();
      ctx.moveTo(badgeX + d, badgeY);
      ctx.lineTo(badgeX + d + badgeH, bottom);
      ctx.stroke();
    }
    // Limit drawn lines to badge area
    void right;
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
   * Reset image transform so the image fills the image-box.
   * The smaller image dimension fills the corresponding box dimension —
   * for a square image and a wider-than-tall box this means the image
   * width fills the box width with vertical overflow.
   */
  _resetTransform() {
    if (!this.image || !this.imageBox) {
      this.scale = 1;
      this.offsetX = 0;
      this.offsetY = 0;
      return;
    }

    const boxPxW = inchesToPixels(this.imageBox.width);
    const boxPxH = inchesToPixels(this.imageBox.height);
    const imgW = this.image.naturalWidth;
    const imgH = this.image.naturalHeight;

    // Cover-fit: scale so the image fully covers the box (the smaller
    // image-side-to-box-side ratio wins).
    this.scale = Math.max(boxPxW / imgW, boxPxH / imgH);
    this.offsetX = 0;
    this.offsetY = 0;
  }

  /* --------------------------------------------------------
     Pointer / wheel interaction
     -------------------------------------------------------- */

  _onPointerDown(e) {
    if (this.mode === 'preview') return;
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
    if (this.mode === 'preview') return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    const newScale = Math.max(0.05, this.scale + delta * this.scale);
    this.scaleImage(newScale);
    if (this.onScaleChange) this.onScaleChange(this.scale);
  }
}
