/**
 * Slot-fill helpers (pure, no DOM — headless-testable)
 *
 * distributeEvenly: auto-balance a page's button count across image slots.
 * expandCells: expand slots into a flat, row-major list of per-cell states.
 */

/**
 * Slots the user hasn't pinned ("auto") evenly split the cells left over
 * after the pinned ("manual") slots; the remainder gives +1 to the
 * earliest auto slots. Manual slots keep their quantity.
 * @param {number} totalCells
 * @param {{quantity:number, manual:boolean}[]} slots
 * @returns {number[]} quantities aligned to `slots`
 */
export function distributeEvenly(totalCells, slots) {
  const quantities = slots.map((s) => (s.manual ? Math.max(0, s.quantity | 0) : 0));
  const autoIndexes = [];
  let manualSum = 0;
  slots.forEach((s, i) => {
    if (s.manual) manualSum += quantities[i];
    else autoIndexes.push(i);
  });

  if (autoIndexes.length === 0) return quantities;

  const remaining = Math.max(0, totalCells - manualSum);
  const base = Math.floor(remaining / autoIndexes.length);
  let extra = remaining - base * autoIndexes.length;
  for (const i of autoIndexes) {
    quantities[i] = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
  }
  return quantities;
}

/**
 * Expand slots into a flat row-major list of up to `totalCells` per-cell
 * image states, in slot order (image1×qty, image2×qty, …). Extra copies
 * past the total are dropped.
 * @param {{image:any,scale:number,offsetX:number,offsetY:number,quantity:number}[]} slots
 * @param {number} totalCells
 * @returns {{image:any,scale:number,offsetX:number,offsetY:number}[]}
 */
export function expandCells(slots, totalCells) {
  const cells = [];
  for (const slot of slots) {
    for (let i = 0; i < slot.quantity && cells.length < totalCells; i++) {
      cells.push({
        image: slot.image,
        scale: slot.scale,
        offsetX: slot.offsetX,
        offsetY: slot.offsetY,
      });
    }
    if (cells.length >= totalCells) break;
  }
  return cells;
}
