/**
 * Canvas Controller
 *
 * Manages the interactive canvas where users manipulate images.
 * Handles rendering, panning, zooming, and guide overlays.
 */

import { inchesToPixels, getPixelRatio } from './measurementConverter.js';

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

    // CSS-pixel size and device pixel ratio of the backing store (see _sizeCanvas)
    this._cssSize = 0;
    this._dpr = 1;

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
   * Load an existing slot's image + transform WITHOUT resetting the crop
   * (contrast with setImage, which fits a brand-new image).
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

  /** Clear the active image and re-render an empty canvas. */
  clearImage() {
    this.image = null;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
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
   * Render the current state to the canvas.
   */
  render() {
    const ctx = this.ctx;
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    const w = this._cssSize;
    const h = this._cssSize;
    const cx = w / 2;
    const cy = h / 2;

    ctx.clearRect(0, 0, w, h);

    if (!this.image || !this.buttonSize) return;

    const cutRadius = inchesToPixels(this.buttonSize.cutLineDiameter / 2);
    const faceRadius = inchesToPixels(this.buttonSize.buttonFaceDiameter / 2);
    const contentRadius = inchesToPixels(this.buttonSize.contentGuideDiameter / 2);

    // Draw the full image, then a semi-transparent overlay with guides
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

    // Button face circle
    ctx.save();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, faceRadius, 0, Math.PI * 2);
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
    ctx.fillText('Cut line', cx + cutRadius + 6, cy - 8);

    // Button face label
    ctx.fillStyle = '#3b82f6';
    ctx.fillText('Button face', cx + faceRadius + 6, cy + 6);

    // Content guide label
    ctx.fillStyle = '#22c55e';
    ctx.fillText('Safe area', cx + contentRadius + 6, cy + 20);
    ctx.restore();
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

    // Backing store at device resolution so the crop view is sharp on HiDPI screens.
    this._dpr = getPixelRatio();
    this._cssSize = containerSize;
    this.canvas.width = Math.round(containerSize * this._dpr);
    this.canvas.height = Math.round(containerSize * this._dpr);
    this.canvas.style.width = containerSize + 'px';
    this.canvas.style.height = containerSize + 'px';
  }

  /* --------------------------------------------------------
     Pointer / wheel interaction
     -------------------------------------------------------- */

  _onPointerDown(e) {
    this._dragging = true;
    this._lastPointer = { x: e.clientX, y: e.clientY };
    this.canvas.setPointerCapture(e.pointerId);
  }

  _onPointerMove(e) {
    if (!this._dragging) return;
    const dx = e.clientX - this._lastPointer.x;
    const dy = e.clientY - this._lastPointer.y;
    this._lastPointer = { x: e.clientX, y: e.clientY };
    this.panImage(dx, dy);
  }

  _onPointerUp(e) {
    this._dragging = false;
  }

  _onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    const newScale = Math.max(0.05, this.scale + delta * this.scale);
    this.scaleImage(newScale);
    if (this.onScaleChange) this.onScaleChange(this.scale);
  }
}
