import { useEffect, useMemo, useState } from 'react';
import { X, RotateCcw, CheckCircle, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import type { PaymentMode, Sale } from '../types';
import { useSalesReturns } from '../hooks/useSalesReturns';
import { useCustomerOutstanding } from '../hooks/useCustomerOutstanding';
import { customerKey } from '../utils/credit';
import { formatCurrency, formatGrandTotal, todayISO } from '../utils/helpers';

interface Props {
  sales: Sale[]; // all lines of ONE invoice
  onClose: () => void;
  onRecorded?: () => void; // parent may refresh after a successful return
}

interface LineDraft {
  qty: string;    // quantity to return (editable)
  refund: string; // refund amount for this line (editable, auto-filled)
}

// Effective per-unit price actually paid = row total (post bill-discount &
// rounding) ÷ quantity. Refunding at this rate gives the customer back exactly
// what they paid, not the pre-discount selling_rate.
function unitPrice(s: Sale): number {
  if (!s.quantity) return 0;
  return s.total_amount / s.quantity;
}

export default function ReturnModal({ sales, onClose, onRecorded }: Props) {
  const { recordReturn, fetchReturnsByInvoice, loading } = useSalesReturns();
  const { fetchOutstanding } = useCustomerOutstanding();
  const first = sales[0];
  const invoiceNumber = first?.invoice_number ?? '';

  // Already-returned quantity per original sale line (over-return guard).
  const [returnedBySale, setReturnedBySale] = useState<Record<string, number>>({});
  const [loadingReturned, setLoadingReturned] = useState(true);

  // Customer's current net credit outstanding — caps how much can be credited
  // back (a Credit refund can't reduce a balance below zero). Cash/UPI refunds
  // move real money and are never capped. outstandingKnown stays false if the
  // view is unavailable, in which case we don't enforce the cap.
  const [creditOutstanding, setCreditOutstanding] = useState(0);
  const [outstandingKnown, setOutstandingKnown] = useState(false);

  const [refundMode, setRefundMode] = useState<PaymentMode>(
    (first?.payment_mode as PaymentMode) || 'Cash',
  );
  const [reason, setReason] = useState('');
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>(() =>
    Object.fromEntries(sales.map((s) => [s.id, { qty: '', refund: '' }])),
  );

  useEffect(() => {
    const custKey = customerKey(first?.customer_name, first?.mobile_number);
    Promise.all([fetchReturnsByInvoice(invoiceNumber), fetchOutstanding()]).then(
      ([rows, outstandingRows]) => {
        const map: Record<string, number> = {};
        for (const r of rows) {
          if (r.original_sale_id) {
            map[r.original_sale_id] = (map[r.original_sale_id] || 0) + r.quantity_returned;
          }
        }
        setReturnedBySale(map);
        if (outstandingRows) {
          const row = outstandingRows.find((r) => r.customer_key === custKey);
          setCreditOutstanding(row ? row.outstanding : 0);
          setOutstandingKnown(true);
        }
        setLoadingReturned(false);
      },
    );
  }, [fetchReturnsByInvoice, fetchOutstanding, invoiceNumber, first?.customer_name, first?.mobile_number]);

  const returnableQty = (s: Sale): number =>
    Math.max(0, s.quantity - (returnedBySale[s.id] || 0));

  const setQty = (s: Sale, raw: string) => {
    const max = returnableQty(s);
    let qty = parseFloat(raw);
    if (isNaN(qty) || qty < 0) qty = 0;
    if (qty > max) qty = max;
    const refund = qty > 0 ? (qty * unitPrice(s)).toFixed(2) : '';
    setDrafts((d) => ({ ...d, [s.id]: { qty: raw === '' ? '' : String(qty), refund } }));
  };

  const setRefund = (id: string, raw: string) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], refund: raw } }));

  const totalRefund = useMemo(
    () => sales.reduce((sum, s) => sum + (parseFloat(drafts[s.id]?.refund) || 0), 0),
    [sales, drafts],
  );
  const anyQty = sales.some((s) => (parseFloat(drafts[s.id]?.qty) || 0) > 0);

  // Option A: a Credit refund can't exceed what the customer still owes. The
  // excess should be handed back via Cash/UPI instead. Cash/UPI modes are never
  // capped (they move real money, not the credit ledger).
  const creditExceeds =
    refundMode === 'Credit' && outstandingKnown && totalRefund > creditOutstanding + 0.001;
  const creditExcess = Math.max(0, totalRefund - creditOutstanding);

  const handleConfirm = async () => {
    const lines = sales
      .filter((s) => (parseFloat(drafts[s.id]?.qty) || 0) > 0)
      .map((s) => ({
        original_sale_id: s.id,
        medicine_name: s.medicine_name,
        batch_number: s.batch_number ?? null,
        quantity_returned: parseFloat(drafts[s.id].qty),
        refund_amount: parseFloat(drafts[s.id].refund) || 0,
      }));

    if (lines.length === 0) {
      toast.error('Enter a return quantity for at least one item');
      return;
    }

    if (creditExceeds) {
      toast.error(`Credit refund exceeds what the customer owes (${formatCurrency(creditOutstanding)}). Refund the extra via Cash/UPI.`);
      return;
    }

    const ok = await recordReturn({
      original_invoice_number: invoiceNumber,
      customer_name: first.customer_name ?? null,
      mobile_number: first.mobile_number ?? null,
      refund_mode: refundMode,
      return_date: todayISO(),
      reason: reason.trim() || null,
      lines,
    });

    if (ok) {
      const note = refundMode === 'Credit' ? ' (outstanding reduced)' : '';
      toast.success(`Return recorded — ${formatGrandTotal(totalRefund)} refunded${note}`);
      onRecorded?.();
      onClose();
    } else {
      toast.error('Failed to record return');
    }
  };

  if (sales.length === 0) return null;

  const fullyReturned = !loadingReturned && sales.every((s) => returnableQty(s) === 0);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <RotateCcw size={18} className="text-red-500" />
            <div>
              <h2 className="text-base font-bold text-gray-900">Return / Refund</h2>
              <p className="text-xs text-gray-400 mt-0.5">{invoiceNumber} · {first.customer_name || 'No customer'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Lines */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {loadingReturned ? (
            <div className="text-center py-10 text-gray-400 text-sm">Loading…</div>
          ) : fullyReturned ? (
            <div className="text-center py-10 text-gray-400 text-sm">Every item on this invoice has already been fully returned.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="text-left pb-2">Medicine</th>
                  <th className="text-right pb-2">Sold</th>
                  <th className="text-right pb-2">Returnable</th>
                  <th className="text-right pb-2 w-24">Return qty</th>
                  <th className="text-right pb-2 w-28">Refund ₹</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sales.map((s) => {
                  const max = returnableQty(s);
                  const disabled = max === 0;
                  return (
                    <tr key={s.id} className={disabled ? 'opacity-50' : ''}>
                      <td className="py-2.5 pr-2">
                        <p className="text-sm font-medium text-gray-800">{s.medicine_name}</p>
                        <p className="text-xs text-gray-400">@ {formatCurrency(unitPrice(s))}/unit{s.batch_number ? ` · ${s.batch_number}` : ''}</p>
                      </td>
                      <td className="py-2.5 text-right text-sm text-gray-600">{s.quantity}</td>
                      <td className="py-2.5 text-right text-sm text-gray-600">{max}</td>
                      <td className="py-2.5 text-right">
                        <input
                          type="number"
                          className="input-field py-1 text-sm w-20 text-right"
                          value={drafts[s.id]?.qty ?? ''}
                          min="0"
                          max={max}
                          step="1"
                          disabled={disabled}
                          onChange={(e) => setQty(s, e.target.value)}
                          placeholder="0"
                        />
                      </td>
                      <td className="py-2.5 text-right">
                        <input
                          type="number"
                          className="input-field py-1 text-sm w-24 text-right"
                          value={drafts[s.id]?.refund ?? ''}
                          min="0"
                          step="0.01"
                          disabled={disabled || !(parseFloat(drafts[s.id]?.qty) > 0)}
                          onChange={(e) => setRefund(s.id, e.target.value)}
                          placeholder="0.00"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* Refund mode + reason */}
          {!fullyReturned && !loadingReturned && (
            <div className="pt-2 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Refund via</span>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
                  {(['Cash', 'UPI', 'Credit'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setRefundMode(m)}
                      className={`px-3 py-1.5 font-medium transition-colors ${
                        refundMode === m ? 'bg-red-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                {refundMode === 'Credit' && outstandingKnown && (
                  <span className="text-xs text-orange-600">
                    Reduces outstanding — customer owes {formatCurrency(creditOutstanding)}
                  </span>
                )}
              </div>

              {/* Option A cap: credit refund can't exceed the balance owed */}
              {creditExceeds && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs">
                  <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-amber-800">
                    This customer only owes <span className="font-semibold">{formatCurrency(creditOutstanding)}</span> on credit,
                    but the refund is <span className="font-semibold">{formatCurrency(totalRefund)}</span>.
                    A credit refund can't reduce their balance below zero.
                    <div className="mt-1 text-amber-700">
                      Refund the extra <span className="font-semibold">{formatCurrency(creditExcess)}</span> via <b>Cash</b> or <b>UPI</b> instead
                      {creditOutstanding > 0 && <> (or lower the return so the credit portion is at most {formatCurrency(creditOutstanding)})</>}.
                    </div>
                  </div>
                </div>
              )}

              <input
                type="text"
                className="input-field py-1.5 text-sm w-full"
                placeholder="Reason (optional) — e.g. wrong medicine, expired, patient discontinued"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        {!fullyReturned && !loadingReturned && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 bg-red-50 rounded-b-2xl">
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide">Total Refund</span>
              <p className="text-lg font-bold text-red-600">{formatGrandTotal(totalRefund)}</p>
            </div>
            <button
              onClick={handleConfirm}
              disabled={loading || !anyQty || creditExceeds}
              className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              <CheckCircle size={16} />
              {loading ? 'Recording…' : 'Confirm Return'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
