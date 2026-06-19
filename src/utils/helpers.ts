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
