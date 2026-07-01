import type { Sale } from '../types';

// Shared source of truth for "net credit outstanding per customer".
// Used by both the Dashboard credit popup and the Reports → Credit Ledger so
// the two screens can never disagree.

export interface CreditPaymentLike {
  customer_name?: string | null;
  mobile_number?: string | null;
  amount: number;
}

// Minimal shape needed to compute outstanding. Lets callers pass either a full
// Sale[] (Reports) or a lightweight column projection (Dashboard).
export interface SaleLike {
  payment_mode: string;
  invoice_number: string;
  sale_date: string;
  total_amount: number;
  customer_name?: string | null;
  mobile_number?: string | null;
}

export interface OutstandingInvoice<T> {
  invoice_number: string;
  date: string;
  amount: number;
  medicines: number;
  group: T[];
}

export interface OutstandingCustomer<T = SaleLike> {
  key: string;
  name: string;
  mobile: string;
  invoices: OutstandingInvoice<T>[];
  total: number;
  lastDate: string;
}

// Canonical customer identity: normalized name + mobile.
// Both grouping and payment-matching go through this single key so a payment is
// counted against exactly one customer (no double-subtraction) and two people
// who merely share a name are never merged.
export function customerKey(name?: string | null, mobile?: string | null): string {
  return `${(name || '').trim().toLowerCase()}||${(mobile || '').trim()}`;
}

export function computeOutstandingByCustomer<T extends SaleLike>(
  sales: T[],
  payments: CreditPaymentLike[],
): OutstandingCustomer<T>[] {
  const creditSales = sales.filter((s) => s.payment_mode === 'Credit');

  // Group credit sales by invoice first.
  const invMap = new Map<string, T[]>();
  for (const s of creditSales) {
    if (!invMap.has(s.invoice_number)) invMap.set(s.invoice_number, []);
    invMap.get(s.invoice_number)!.push(s);
  }

  // Group invoices by canonical customer key.
  const custMap = new Map<string, OutstandingCustomer<T>>();
  for (const [inv, group] of invMap.entries()) {
    const first = group[0];
    const name = first.customer_name?.trim() || '(Anonymous)';
    const mobile = first.mobile_number?.trim() || '';
    const key = customerKey(first.customer_name, first.mobile_number);
    const invAmount = group.reduce((s, x) => s + x.total_amount, 0);

    if (!custMap.has(key)) {
      custMap.set(key, { key, name, mobile, invoices: [], total: 0, lastDate: first.sale_date });
    }
    const row = custMap.get(key)!;
    row.invoices.push({ invoice_number: inv, date: first.sale_date, amount: invAmount, medicines: group.length, group });
    row.total += invAmount;
    if (first.sale_date > row.lastDate) row.lastDate = first.sale_date;
  }

  // Sum payments under the SAME canonical key.
  const paymentsMap = new Map<string, number>();
  for (const p of payments) {
    const key = customerKey(p.customer_name, p.mobile_number);
    paymentsMap.set(key, (paymentsMap.get(key) || 0) + p.amount);
  }

  return [...custMap.values()]
    .map((row) => ({ ...row, total: Math.max(0, row.total - (paymentsMap.get(row.key) || 0)) }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);
}

export type { Sale };
