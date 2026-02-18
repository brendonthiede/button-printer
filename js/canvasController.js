/**
 * Canvas Controller
 *
 * Manages the interactive canvas where users manipulate images.
 * Handles rendering, panning, zooming, mode switching, and guide overlays.
 */

import { inchesToPixels } from './measurementConverter.js';

/**
 * @typedef {'resize' | 'preview'} CanvasMode
 */

export class CanvasController {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    /** @type {HTMLCanvasElement} */
    this.canvas = canvas;
    /** @type {CanvasRenderingContext2D} */
    this.ctx = canvas.getContext('2d');

    // Image state
    /** @type {HTMLImageElement | null} */
    this.image = null;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    // Button size (will be set)
    this.buttonSize = null;

    // Mode
    /** @type {CanvasMode} */
    this.mode = 'resize';

    // Callback for external scale sync (e.g. slider)
    /** @type {((scale: number) => void) | null} */
    this.onScaleChange = null;

    // Interaction state
    this._dragging = false;
    this._lastPointer = { x: 0, y: 0 };

    // Bind interaction handlers
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

  /**
   * Set the image to display and reset transformations so the image
   * is centered and scaled to fill the cut-line circle.
   * @param {HTMLImageElement} image
   */
  setImage(image) {
    this.image = image;
    this._resetTransform();
    this._sizeCanvas();
    this.render();
  }

  /**
   * Update the button size (guide circles). Preserves image position/scale.
   * @param {import('./buttonSizes').ButtonSize} size
   */
  setButtonSize(size) {
    this.buttonSize = size;
    this._sizeCanvas();
    if (this.image) {
      this.render();
    }
  }

  /**
   * Scale the image by a factor (1.0 = current size).
   * @param {number} scaleFactor – absolute scale (e.g. 1.5 = 150 %)
   */
  scaleImage(scaleFactor) {
    if (scaleFactor <= 0) return;
    this.scale = scaleFactor;
    this.render();
  }

  /**
   * Pan the image by pixel offsets.
   * @param {number} deltaX
   * @param {number} deltaY
   */
  panImage(deltaX, deltaY) {
    this.offsetX += deltaX;
    this.offsetY += deltaY;
    this.render();
  }

  /**
   * Switch between resize mode and preview mode.
   * @param {CanvasMode} mode
   */
  setMode(mode) {
    this.mode = mode;
    this.render();
  }

  /**
   * Return a snapshot of the current image state (for printing).
   */
  getImageState() {
    return {
      image: this.image,
      scale: this.scale,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
      buttonSize: this.buttonSize,
    };
  }

  /**
   * Render the current state to the canvas.
   */
  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    ctx.clearRect(0, 0, w, h);

    if (!this.image || !this.buttonSize) return;

    const cutRadius = inchesToPixels(this.buttonSize.cutLineDiameter / 2);
    const contentRadius = inchesToPixels(this.buttonSize.contentGuideDiameter / 2);

    if (this.mode === 'preview') {
      // --- Preview mode: clip to content guide, no overlay ---
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, contentRadius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      this._drawImage(ctx, cx, cy);

      ctx.restore();
    } else {
      // --- Resize mode: draw image then semi-transparent overlay with guides ---
      // Draw the full image first
      this._drawImage(ctx, cx, cy);

      // Semi-transparent overlay outside the cut line
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.arc(cx, cy, cutRadius, 0, Math.PI * 2, true); // counter-clockwise to cut hole
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Cut line circle
      ctx.save();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(cx, cy, cutRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Content guide circle
      ctx.save();
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, contentRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Labels
      ctx.save();
      ctx.font = '12px sans-serif';

      // Cut line label
      ctx.fillStyle = '#ef4444';
      ctx.fillText('Cut line', cx + cutRadius + 6, cy - 4);

      // Content guide label
      ctx.fillStyle = '#22c55e';
      ctx.fillText('Safe area', cx + contentRadius + 6, cy + 14);
      ctx.restore();
    }
  }

  /* --------------------------------------------------------
     Internal helpers
     -------------------------------------------------------- */

  /**
   * Draw the image centred on (cx, cy) using the current scale & offset.
   */
  _drawImage(ctx, cx, cy) {
    const img = this.image;
    const drawW = img.naturalWidth * this.scale;
    const drawH = img.naturalHeight * this.scale;
    const x = cx - drawW / 2 + this.offsetX;
    const y = cy - drawH / 2 + this.offsetY;
    ctx.drawImage(img, x, y, drawW, drawH);
  }

  /**
   * Resize the canvas element to fit the cut line with some padding.
   */
  _sizeCanvas() {
    if (!this.buttonSize) return;

    const container = this.canvas.parentElement;
    const containerSize = Math.min(container.clientWidth, container.clientHeight) || 500;

    this.canvas.width = containerSize;
    this.canvas.height = containerSize;
    this.canvas.style.width = containerSize + 'px';
    this.canvas.style.height = containerSize + 'px';
  }

  /**
   * Reset image transform so the image fills the cut-line circle.
   */
  _resetTransform() {
    if (!this.image || !this.buttonSize) {
      this.scale = 1;
      this.offsetX = 0;
      this.offsetY = 0;
      return;
    }

    const cutDiameterPx = inchesToPixels(this.buttonSize.cutLineDiameter);
    const imgW = this.image.naturalWidth;
    const imgH = this.image.naturalHeight;
    const minDim = Math.min(imgW, imgH);

    // Scale so the smaller dimension fills the cut-line circle diameter
    this.scale = cutDiameterPx / minDim;
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

  _onPointerUp(e) {
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
