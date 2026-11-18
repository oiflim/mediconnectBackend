import test from 'node:test';
import assert from 'node:assert/strict';
import { generateIntervals, SLOT_DURATIONS } from '../src/utils/time.js';
import { medicineAvailabilityStatus } from '../src/utils/medicine.js';

test('availability generator creates contiguous fixed-duration slots', () => {
  const start = new Date('2030-01-01T09:00:00+05:30');
  const end = new Date('2030-01-01T10:00:00+05:30');
  const slots = generateIntervals(start, end, 15);
  assert.equal(slots.length, 4);
  assert.equal(slots[0].endTime.getTime(), slots[1].startTime.getTime());
  assert.equal(slots.at(-1).endTime.getTime(), end.getTime());
});
test('availability generator rejects unsupported durations and non-divisible windows', () => {
  assert.deepEqual(SLOT_DURATIONS, [5, 10, 15, 20, 30, 60]);
  assert.throws(() => generateIntervals(new Date('2030-01-01T09:00:00Z'), new Date('2030-01-01T09:17:00Z'), 10));
  assert.throws(() => generateIntervals(new Date('2030-01-01T09:00:00Z'), new Date('2030-01-01T09:30:00Z'), 7));
});
test('medicine availability priority is inactive, expired, out-of-stock, low-stock, available', () => {
  const base = { isActive: true, expiryDate: new Date('2035-01-01'), quantity: 20, reorderLevel: 5 };
  assert.equal(medicineAvailabilityStatus({ ...base, isActive: false }), 'INACTIVE');
  assert.equal(medicineAvailabilityStatus({ ...base, expiryDate: new Date('2020-01-01') }), 'EXPIRED');
  assert.equal(medicineAvailabilityStatus({ ...base, quantity: 0 }), 'OUT_OF_STOCK');
  assert.equal(medicineAvailabilityStatus({ ...base, quantity: 5 }), 'LOW_STOCK');
  assert.equal(medicineAvailabilityStatus(base), 'AVAILABLE');
});
