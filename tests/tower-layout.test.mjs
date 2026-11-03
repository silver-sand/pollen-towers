import test from 'node:test';
import assert from 'node:assert/strict';
import { floorY, roofY, stepFloor } from '../public/tower-layout.js';

test('positions all floors at uniform vertical intervals across tier boundaries', () => {
  assert.deepEqual([0, 3, 4, 7, 8, 11].map(floor => floorY(floor)), [1, 8.5, 11, 18.5, 21, 28.5]);
});

test('places the roof just above the final floor walls', () => {
  // roofY(12) = floorY(11) + 2.5 + 0.1 = 28.5 + 2.6 = 31.1
  assert.equal(roofY(12), 31.1);
  // roof bottom (31.1 - 0.2) must clear the top floor's wall top (28.5 + 2.2 = 30.7)
  assert.ok(roofY(12) - 0.2 > floorY(11) + 1.9);
});

test('steps upward and downward without leaving the tower', () => {
  assert.equal(stepFloor(4, 1, 12), 5);
  assert.equal(stepFloor(4, -1, 12), 3);
  assert.equal(stepFloor(11, 1, 12), 11);
  assert.equal(stepFloor(0, -1, 12), 0);
});

test('handles rapid consecutive floor changes', () => {
  const afterRapidUp = Array.from({ length: 6 }, (_, index) => stepFloor(index, 1, 12)).at(-1);
  const afterRapidDown = Array.from({ length: 6 }, (_, index) => stepFloor(6 - index, -1, 12)).at(-1);
  assert.equal(afterRapidUp, 6);
  assert.equal(afterRapidDown, 0);
});
