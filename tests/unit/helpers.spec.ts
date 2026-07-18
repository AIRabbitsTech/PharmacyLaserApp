import { test, expect } from '@playwright/test';
import {
  roundGrandTotal,
  formatGrandTotal,
  formatCurrency,
  generateInvoiceNumber,
  getDateRange,
  parseExpiryMonth,
  isExpiredExpiry,
} from '../../src/utils/helpers';

// ── roundGrandTotal — the bill-rounding rule (decimal <= .50 floor, > .50 ceil)
test.describe('roundGrandTotal()', () => {
  test('rounds DOWN when the decimal is below 0.50', () => {
    expect(roundGrandTotal(120.49)).toBe(120);
    expect(roundGrandTotal(120.01)).toBe(120);
  });

  test('rounds DOWN at exactly 0.50 (boundary is inclusive of floor)', () => {
    expect(roundGrandTotal(120.50)).toBe(120);
  });

  test('rounds UP when the decimal is above 0.50', () => {
    expect(roundGrandTotal(120.51)).toBe(121);
    expect(roundGrandTotal(120.99)).toBe(121);
  });

  test('leaves whole numbers unchanged', () => {
    expect(roundGrandTotal(120)).toBe(120);
    expect(roundGrandTotal(0)).toBe(0);
  });
});

// ── formatGrandTotal — rounded, zero-decimal INR ────────────────────────────
test.describe('formatGrandTotal()', () => {
  test('shows the rounded amount with no decimal places and a ₹ symbol', () => {
    const out = formatGrandTotal(1234.50); // rounds to 1234
    expect(out).toContain('₹');
    expect(out).toContain('1,234');
    expect(out).not.toMatch(/\.\d/); // no decimal portion
  });

  test('applies the rounding rule before formatting', () => {
    expect(formatGrandTotal(1234.51)).toContain('1,235');
  });
});

// ── formatCurrency — exact INR with 2 decimals ──────────────────────────────
test.describe('formatCurrency()', () => {
  test('always renders two decimal places', () => {
    expect(formatCurrency(1234.5)).toContain('1,234.50');
    expect(formatCurrency(1000)).toContain('1,000.00');
  });

  test('includes the ₹ symbol', () => {
    expect(formatCurrency(50)).toContain('₹');
  });
});

// ── generateInvoiceNumber — sequential, zero-padded ─────────────────────────
test.describe('generateInvoiceNumber()', () => {
  test('increments and zero-pads to 4 digits', () => {
    expect(generateInvoiceNumber(0)).toBe('INV-0001');
    expect(generateInvoiceNumber(41)).toBe('INV-0042');
  });

  test('keeps the INV- prefix and stops padding past 4 digits', () => {
    expect(generateInvoiceNumber(9999)).toBe('INV-10000');
  });
});

// ── getDateRange — report period presets ────────────────────────────────────
const DAY = 86_400_000;
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY);

test.describe('getDateRange()', () => {
  test('"today" returns a single calendar day (start === end date)', () => {
    const { start, end } = getDateRange('today');
    expect(start).toBe(end);
  });

  test('"yesterday" is a single day, one day before today', () => {
    const today = getDateRange('today').start;
    const { start, end } = getDateRange('yesterday');
    expect(start).toBe(end);
    expect(daysBetween(start, today)).toBe(1);
  });

  test('"last_7_days" spans 7 inclusive days (6-day gap, ending today)', () => {
    const today = getDateRange('today').start;
    const { start, end } = getDateRange('last_7_days');
    expect(end).toBe(today);
    expect(daysBetween(start, end)).toBe(6);
  });

  test('"this_month" starts on the 1st and ends on/after the start', () => {
    const { start, end } = getDateRange('this_month');
    expect(start.endsWith('-01')).toBe(true);
    expect(daysBetween(start, end)).toBeGreaterThanOrEqual(0);
  });

  test('custom preset passes through the supplied start/end verbatim', () => {
    const { start, end } = getDateRange('custom', '2026-02-01', '2026-02-28');
    expect(start).toBe('2026-02-01');
    expect(end).toBe('2026-02-28');
  });

  test('unknown preset with no custom dates falls back to today', () => {
    const { start, end } = getDateRange('???');
    expect(start).toBe(end); // both default to today's calendar day
  });
});

// ── parseExpiryMonth — MM/YY format + month validity ────────────────────────
test.describe('parseExpiryMonth()', () => {
  test('parses a valid MM/YY', () => {
    expect(parseExpiryMonth('07/26')).toEqual({ year: 2026, month: 7 });
    expect(parseExpiryMonth('12/30')).toEqual({ year: 2030, month: 12 });
  });

  test('rejects an out-of-range month (00 or > 12)', () => {
    expect(parseExpiryMonth('13/26')).toBeNull();
    expect(parseExpiryMonth('00/26')).toBeNull();
    expect(parseExpiryMonth('99/26')).toBeNull();
  });

  test('rejects malformed / incomplete input', () => {
    expect(parseExpiryMonth('7/26')).toBeNull();   // not zero-padded
    expect(parseExpiryMonth('0726')).toBeNull();   // missing slash
    expect(parseExpiryMonth('07/2026')).toBeNull(); // 4-digit year
    expect(parseExpiryMonth('')).toBeNull();
  });
});

// ── isExpiredExpiry — usable through the END of the expiry month ─────────────
test.describe('isExpiredExpiry()', () => {
  const now = new Date('2026-07-15');

  test('the current month is NOT expired (valid through month end)', () => {
    expect(isExpiredExpiry('07/26', now)).toBe(false);
  });

  test('a past month IS expired', () => {
    expect(isExpiredExpiry('06/26', now)).toBe(true);
    expect(isExpiredExpiry('12/25', now)).toBe(true);
  });

  test('a future month is NOT expired', () => {
    expect(isExpiredExpiry('08/26', now)).toBe(false);
    expect(isExpiredExpiry('01/30', now)).toBe(false);
  });

  test('a blank or malformed value is treated as not-expired (format checked separately)', () => {
    expect(isExpiredExpiry('', now)).toBe(false);
    expect(isExpiredExpiry('13/26', now)).toBe(false);
  });
});
