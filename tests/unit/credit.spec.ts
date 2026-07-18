import { test, expect } from '@playwright/test';
import {
  customerKey,
  computeOutstandingByCustomer,
  type SaleLike,
  type CreditPaymentLike,
  type ReturnLike,
} from '../../src/utils/credit';

// ── Fixture helpers ─────────────────────────────────────────────────────────
let inv = 0;
function sale(over: Partial<SaleLike> = {}): SaleLike {
  return {
    payment_mode: 'Credit',
    invoice_number: over.invoice_number ?? `INV-${String(++inv).padStart(4, '0')}`,
    sale_date: '2026-01-01',
    total_amount: 100,
    customer_name: 'Asha Devi',
    mobile_number: '9990001112',
    ...over,
  };
}
function payment(over: Partial<CreditPaymentLike> = {}): CreditPaymentLike {
  return { customer_name: 'Asha Devi', mobile_number: '9990001112', amount: 0, ...over };
}
function ret(over: Partial<ReturnLike> = {}): ReturnLike {
  return { customer_name: 'Asha Devi', mobile_number: '9990001112', refund_mode: 'Credit', refund_amount: 0, ...over };
}

// ── customerKey — the canonical identity ────────────────────────────────────
test.describe('customerKey()', () => {
  test('normalizes case and trims whitespace on the name', () => {
    expect(customerKey('  Asha Devi ', '9990001112'))
      .toBe(customerKey('asha devi', '9990001112'));
  });

  test('does NOT trim case on the mobile but does trim whitespace', () => {
    expect(customerKey('A', ' 999 ')).toBe('a||999');
  });

  test('same name + DIFFERENT mobile produce DIFFERENT keys (no false merge)', () => {
    expect(customerKey('Asha Devi', '9990001112'))
      .not.toBe(customerKey('Asha Devi', '8880001112'));
  });

  test('null / undefined name and mobile collapse to a stable empty key', () => {
    expect(customerKey(null, null)).toBe('||');
    expect(customerKey(undefined, undefined)).toBe('||');
  });
});

// ── computeOutstandingByCustomer — the money owed ───────────────────────────
test.describe('computeOutstandingByCustomer()', () => {
  test('ignores non-credit sales (Cash / UPI never become outstanding)', () => {
    const sales: SaleLike[] = [
      sale({ payment_mode: 'Cash', total_amount: 500 }),
      sale({ payment_mode: 'UPI', total_amount: 700 }),
    ];
    expect(computeOutstandingByCustomer(sales, [])).toEqual([]);
  });

  test('sums multiple medicine rows that share one invoice', () => {
    const sales: SaleLike[] = [
      sale({ invoice_number: 'INV-1000', total_amount: 60 }),
      sale({ invoice_number: 'INV-1000', total_amount: 40 }),
    ];
    const [row] = computeOutstandingByCustomer(sales, []);
    expect(row.total).toBe(100);
    expect(row.invoices).toHaveLength(1);
    expect(row.invoices[0].amount).toBe(100);
    expect(row.invoices[0].medicines).toBe(2);
  });

  test('groups multiple invoices under the same customer', () => {
    const sales: SaleLike[] = [
      sale({ invoice_number: 'INV-1', total_amount: 100 }),
      sale({ invoice_number: 'INV-2', total_amount: 250 }),
    ];
    const [row] = computeOutstandingByCustomer(sales, []);
    expect(row.invoices).toHaveLength(2);
    expect(row.total).toBe(350);
  });

  test('subtracts a payment matched by canonical key', () => {
    const sales: SaleLike[] = [sale({ total_amount: 300 })];
    const [row] = computeOutstandingByCustomer(sales, [payment({ amount: 120 })]);
    expect(row.total).toBe(180);
  });

  test('a single payment is NOT double-subtracted across a customer\'s invoices', () => {
    const sales: SaleLike[] = [
      sale({ invoice_number: 'INV-1', total_amount: 100 }),
      sale({ invoice_number: 'INV-2', total_amount: 100 }),
    ];
    // 200 owed, 150 paid → exactly 50 remains (not 200 - 150 - 150)
    const [row] = computeOutstandingByCustomer(sales, [payment({ amount: 150 })]);
    expect(row.total).toBe(50);
  });

  test('full payment removes the customer from the outstanding list', () => {
    const sales: SaleLike[] = [sale({ total_amount: 300 })];
    expect(computeOutstandingByCustomer(sales, [payment({ amount: 300 })])).toEqual([]);
  });

  test('overpayment clamps to zero (never negative) and is dropped', () => {
    const sales: SaleLike[] = [sale({ total_amount: 300 })];
    expect(computeOutstandingByCustomer(sales, [payment({ amount: 500 })])).toEqual([]);
  });

  test('two people who merely share a name are kept separate', () => {
    const sales: SaleLike[] = [
      sale({ customer_name: 'Asha Devi', mobile_number: '9990001112', total_amount: 100 }),
      sale({ customer_name: 'Asha Devi', mobile_number: '8880001112', total_amount: 200 }),
    ];
    // A payment from one mobile must not reduce the other's balance.
    const rows = computeOutstandingByCustomer(sales, [
      payment({ mobile_number: '9990001112', amount: 100 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].mobile).toBe('8880001112');
    expect(rows[0].total).toBe(200);
  });

  test('results are sorted by outstanding total, descending', () => {
    const sales: SaleLike[] = [
      sale({ customer_name: 'Small', mobile_number: '1', total_amount: 50 }),
      sale({ customer_name: 'Big', mobile_number: '2', total_amount: 900 }),
      sale({ customer_name: 'Mid', mobile_number: '3', total_amount: 300 }),
    ];
    const totals = computeOutstandingByCustomer(sales, []).map((r) => r.total);
    expect(totals).toEqual([900, 300, 50]);
  });

  test('lastDate reflects the most recent sale across the customer\'s invoices', () => {
    const sales: SaleLike[] = [
      sale({ invoice_number: 'INV-1', sale_date: '2026-01-01', total_amount: 100 }),
      sale({ invoice_number: 'INV-2', sale_date: '2026-03-15', total_amount: 100 }),
    ];
    const [row] = computeOutstandingByCustomer(sales, []);
    expect(row.lastDate).toBe('2026-03-15');
  });

  test('credit sale with no name is labelled (Anonymous) but still tracked', () => {
    const sales: SaleLike[] = [
      sale({ customer_name: '', mobile_number: '', total_amount: 75 }),
    ];
    const [row] = computeOutstandingByCustomer(sales, []);
    expect(row.name).toBe('(Anonymous)');
    expect(row.total).toBe(75);
  });
});

// ── returns netting — lockstep with the customer_outstanding SQL view ────────
test.describe('computeOutstandingByCustomer() — returns', () => {
  test('a Credit return reduces outstanding, matched by canonical key', () => {
    const sales: SaleLike[] = [sale({ total_amount: 300 })];
    const [row] = computeOutstandingByCustomer(sales, [], [ret({ refund_amount: 120 })]);
    expect(row.total).toBe(180);
  });

  test('Cash and UPI returns do NOT touch outstanding (money moved outside the ledger)', () => {
    const sales: SaleLike[] = [sale({ total_amount: 300 })];
    const rows = computeOutstandingByCustomer(sales, [], [
      ret({ refund_mode: 'Cash', refund_amount: 100 }),
      ret({ refund_mode: 'UPI', refund_amount: 50 }),
    ]);
    expect(rows[0].total).toBe(300);
  });

  test('payment and Credit return stack together', () => {
    const sales: SaleLike[] = [sale({ total_amount: 500 })];
    const [row] = computeOutstandingByCustomer(
      sales,
      [payment({ amount: 200 })],
      [ret({ refund_amount: 100 })],
    );
    expect(row.total).toBe(200); // 500 − 200 paid − 100 returned
  });

  test('a Credit return larger than the balance clamps to zero and drops the customer', () => {
    const sales: SaleLike[] = [sale({ total_amount: 300 })];
    expect(computeOutstandingByCustomer(sales, [], [ret({ refund_amount: 500 })])).toEqual([]);
  });

  test('a return for a different mobile does not reduce another customer\'s balance', () => {
    const sales: SaleLike[] = [
      sale({ customer_name: 'Asha Devi', mobile_number: '9990001112', total_amount: 100 }),
      sale({ customer_name: 'Asha Devi', mobile_number: '8880001112', total_amount: 200 }),
    ];
    const rows = computeOutstandingByCustomer(sales, [], [
      ret({ mobile_number: '9990001112', refund_amount: 100 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].mobile).toBe('8880001112');
    expect(rows[0].total).toBe(200);
  });

  test('multiple Credit returns for one customer are summed under the same key', () => {
    const sales: SaleLike[] = [sale({ total_amount: 500 })];
    const [row] = computeOutstandingByCustomer(sales, [], [
      ret({ refund_amount: 100 }),
      ret({ refund_amount: 150 }),
    ]);
    expect(row.total).toBe(250);
  });

  test('omitting the returns argument keeps the original behaviour (backward compatible)', () => {
    const sales: SaleLike[] = [sale({ total_amount: 300 })];
    const [row] = computeOutstandingByCustomer(sales, [payment({ amount: 100 })]);
    expect(row.total).toBe(200);
  });
});
