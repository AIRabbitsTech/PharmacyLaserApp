import type { Sale } from '../types';

// Shared refund math for the Return / Refund flow. Kept pure (no React) so it
// can be unit-tested and reused by the modal.

type PricedLine = Pick<Sale, 'total_amount' | 'quantity'>;

// Effective per-unit price actually paid = row total (post bill-discount &
// rounding) ÷ quantity. Refunding at this rate returns exactly what the
// customer paid, not the pre-discount selling_rate.
export function returnUnitPrice(sale: PricedLine): number {
  if (!sale.quantity) return 0;
  return sale.total_amount / sale.quantity;
}

// The amount actually paid for `qty` units of this line — the natural ceiling
// for a refund. Refunding above this hands back more than was collected.
export function paidForQty(sale: PricedLine, qty: number): number {
  if (!(qty > 0)) return 0;
  return qty * returnUnitPrice(sale);
}

// Soft signal: true when the entered refund exceeds what was paid for the
// returned qty, beyond a small rounding tolerance. The refund is still allowed
// (goodwill / restocking-fee cases exist) — callers surface this as a warning,
// not a hard block.
export function isRefundOverPaid(
  refund: number,
  sale: PricedLine,
  qty: number,
  epsilon = 0.01,
): boolean {
  if (!(qty > 0)) return false;
  return refund > paidForQty(sale, qty) + epsilon;
}
