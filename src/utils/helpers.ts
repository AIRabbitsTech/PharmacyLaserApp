import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, subDays, subMonths } from 'date-fns';

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);
}

// Rounds grand total: decimal <= 0.50 → floor, > 0.50 → ceil
export function roundGrandTotal(amount: number): number {
  const decimal = amount - Math.floor(amount);
  return decimal <= 0.5 ? Math.floor(amount) : Math.ceil(amount);
}

export function formatGrandTotal(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(roundGrandTotal(amount));
}

export function formatDate(dateStr: string): string {
  return format(new Date(dateStr), 'dd/MM/yyyy');
}

export function formatDateTime(dateStr: string): string {
  return format(new Date(dateStr), 'dd/MM/yyyy HH:mm');
}

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

// Expiry is entered/stored as "MM/YY". Returns the (year, month) it represents,
// or null if it isn't a valid month (month must be 01–12, e.g. "13/26" is invalid).
export function parseExpiryMonth(mmYY: string): { year: number; month: number } | null {
  const m = mmYY.trim().match(/^(\d{2})\/(\d{2})$/);
  if (!m) return null;
  const month = parseInt(m[1], 10);
  if (month < 1 || month > 12) return null;
  return { year: 2000 + parseInt(m[2], 10), month };
}

// A medicine is expired once the current month is past its expiry month — an
// MM/YY expiry is usable through the END of that month. Returns false for a
// blank or malformed value (format is validated separately).
export function isExpiredExpiry(mmYY: string, now: Date = new Date()): boolean {
  const parsed = parseExpiryMonth(mmYY);
  if (!parsed) return false;
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;
  return parsed.year < curY || (parsed.year === curY && parsed.month < curM);
}

export function getDateRange(preset: string, customStart?: string, customEnd?: string) {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { start: format(startOfDay(now), 'yyyy-MM-dd'), end: format(endOfDay(now), 'yyyy-MM-dd') };
    case 'yesterday': {
      const yesterday = subDays(now, 1);
      return { start: format(startOfDay(yesterday), 'yyyy-MM-dd'), end: format(endOfDay(yesterday), 'yyyy-MM-dd') };
    }
    case 'last_7_days':
      return { start: format(subDays(now, 6), 'yyyy-MM-dd'), end: format(now, 'yyyy-MM-dd') };
    case 'this_month':
      return { start: format(startOfMonth(now), 'yyyy-MM-dd'), end: format(endOfMonth(now), 'yyyy-MM-dd') };
    case 'last_month': {
      const lm = subMonths(now, 1);
      return { start: format(startOfMonth(lm), 'yyyy-MM-dd'), end: format(endOfMonth(lm), 'yyyy-MM-dd') };
    }
    default:
      return {
        start: customStart || format(startOfDay(now), 'yyyy-MM-dd'),
        end: customEnd || format(endOfDay(now), 'yyyy-MM-dd'),
      };
  }
}

export function generateInvoiceNumber(lastNumber: number): string {
  const next = lastNumber + 1;
  return `INV-${String(next).padStart(4, '0')}`;
}
