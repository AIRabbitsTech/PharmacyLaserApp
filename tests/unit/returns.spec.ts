import { test, expect } from '@playwright/test';
import { returnUnitPrice, paidForQty, isRefundOverPaid } from '../../src/utils/returns';

// A minimal priced line: the refund math only needs total_amount + quantity.
const line = (total_amount: number, quantity: number) => ({ total_amount, quantity });

// ── returnUnitPrice — effective per-unit price actually paid ─────────────────
test.describe('returnUnitPrice()', () => {
  test('is the row total divided by quantity (post-discount price paid)', () => {
    expect(returnUnitPrice(line(90, 3))).toBe(30);   // ₹90 for 3 → ₹30/unit
    expect(returnUnitPrice(line(45.5, 1))).toBe(45.5);
  });

  test('is 0 when quantity is 0 (no divide-by-zero)', () => {
    expect(returnUnitPrice(line(100, 0))).toBe(0);
  });
});

// ── paidForQty — the natural refund ceiling ─────────────────────────────────
test.describe('paidForQty()', () => {
  test('is qty × unit price', () => {
    expect(paidForQty(line(90, 3), 2)).toBe(60);     // 2 units of a ₹30/unit line
  });

  test('is 0 for a non-positive qty', () => {
    expect(paidForQty(line(90, 3), 0)).toBe(0);
    expect(paidForQty(line(90, 3), -1)).toBe(0);
  });
});

// ── isRefundOverPaid — the Option A soft guard ──────────────────────────────
test.describe('isRefundOverPaid()', () => {
  test('false when the refund equals what was paid for the returned qty', () => {
    // 2 units of a ₹30/unit line = ₹60 paid; refunding ₹60 is exact.
    expect(isRefundOverPaid(60, line(90, 3), 2)).toBe(false);
  });

  test('false when refunding LESS than paid (partial / restocking fee)', () => {
    expect(isRefundOverPaid(50, line(90, 3), 2)).toBe(false);
  });

  test('true when the refund clearly exceeds what was paid', () => {
    expect(isRefundOverPaid(100, line(90, 3), 2)).toBe(true); // paid 60, refunding 100
  });

  test('tolerates sub-cent rounding (not flagged within epsilon)', () => {
    // paid = 33.333… × 1; a ₹33.34 refund is within the 0.01 tolerance.
    expect(isRefundOverPaid(33.34, line(100, 3), 1)).toBe(false);
  });

  test('false when no quantity is being returned (nothing to compare)', () => {
    expect(isRefundOverPaid(999, line(90, 3), 0)).toBe(false);
  });
});
