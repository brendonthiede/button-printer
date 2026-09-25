// Headless self-check for the pure layout math. Run: node check.mjs
import assert from 'node:assert/strict';
import { distributeEvenly, expandCells } from './js/slotFill.js';
import { calculateButtonsPerPage, generatePrintLayout, US_LETTER } from './js/printGenerator.js';
import { BUTTON_SIZES } from './js/buttonSizes.js';

// Auto slots split what the pinned ones leave; remainder goes to the earliest.
assert.deepEqual(distributeEvenly(20, [{ manual: false }, { manual: false }, { manual: false }]), [7, 7, 6]);
assert.deepEqual(distributeEvenly(20, [{ manual: true, quantity: 15 }, { manual: false }, { manual: false }]), [15, 3, 2]);
assert.deepEqual(distributeEvenly(20, [{ manual: true, quantity: 25 }, { manual: false }]), [25, 0]);

// Expansion is slot-ordered and truncated at the page capacity.
const cells = expandCells([{ image: 'a', quantity: 2 }, { image: 'b', quantity: 5 }], 4);
assert.deepEqual(cells.map((c) => c.image), ['a', 'a', 'b', 'b']);

// Capacity per size, and calibration can only shrink it (never overflow the page).
const small = BUTTON_SIZES['1.25'];
const large = BUTTON_SIZES['2.25'];
assert.equal(calculateButtonsPerPage(small).total, 20);
assert.equal(calculateButtonsPerPage(large).total, 6);
for (const cal of [0.95, 1, 1.03, 1.05]) {
  for (const size of [small, large]) {
    const { buttons } = generatePrintLayout([], size, US_LETTER, cal);
    const d = size.cutLineDiameter * cal;
    for (const b of buttons) {
      assert.ok(b.x >= 0 && b.y >= 0 && b.x + d <= US_LETTER.width && b.y + d <= US_LETTER.height,
        `button off page at cal=${cal}`);
    }
  }
}

console.log('ok');
