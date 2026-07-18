import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, User, Phone, Receipt, Check, Pencil, Printer, RotateCcw } from 'lucide-react';
import type { Sale, SalesReturn } from '../types';
import { formatCurrency, formatDate, formatGrandTotal } from '../utils/helpers';
import { printInvoice } from '../utils/printInvoice';
import { useSalesReturns } from '../hooks/useSalesReturns';
import ReturnModal from './ReturnModal';

interface InvoiceModalProps {
  sales: Sale[];
  onClose: () => void;
  onUpdateCustomer?: (invoiceNumber: string, customerName: string, mobileNumber: string) => Promise<boolean>;
  // Opt-in: show the Return / Refund action (operational screens only).
  allowReturn?: boolean;
  // Called after a return is recorded, so the parent can refresh its data.
  onReturnRecorded?: () => void;
}

export default function InvoiceModal({ sales, onClose, onUpdateCustomer, allowReturn, onReturnRecorded }: InvoiceModalProps) {
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftMobile, setDraftMobile] = useState('');
  const [saving, setSaving] = useState(false);
  const [showReturn, setShowReturn] = useState(false);

  // Returns booked against this invoice — annotate the invoice so a refund is
  // visible here (and staff don't re-collect money or re-return a full invoice).
  const { fetchReturnsByInvoice } = useSalesReturns();
  const [returns, setReturns] = useState<SalesReturn[]>([]);
  const invoiceNumber = sales[0]?.invoice_number ?? '';
  const loadReturns = useCallback(() => {
    if (!invoiceNumber) return;
    fetchReturnsByInvoice(invoiceNumber).then(setReturns);
  }, [fetchReturnsByInvoice, invoiceNumber]);
  useEffect(() => { loadReturns(); }, [loadReturns]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (editingCustomer) setEditingCustomer(false); else onClose(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, editingCustomer]);

  const startEditCustomer = () => {
    setDraftName(first.customer_name || '');
    setDraftMobile(first.mobile_number || '');
    setEditingCustomer(true);
  };

  const cancelEditCustomer = () => setEditingCustomer(false);

  const saveCustomer = async () => {
    if (!onUpdateCustomer) return;
    setSaving(true);
    const ok = await onUpdateCustomer(first.invoice_number, draftName, draftMobile);
    setSaving(false);
    if (ok) setEditingCustomer(false);
  };

  const handlePrint = () => printInvoice(sales);

  if (sales.length === 0) return null;

  const first = sales[0];
  const total = sales.reduce((s, x) => s + x.total_amount, 0);
  const subtotal = parseFloat(
    sales.reduce((s, x) => s + x.quantity * x.selling_rate, 0).toFixed(2)
  );
  const billDiscount = first.bill_discount ?? 0;

  // Returns roll-up for this invoice.
  const returnedBySaleId = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of returns) {
      if (r.original_sale_id) m[r.original_sale_id] = (m[r.original_sale_id] || 0) + r.quantity_returned;
    }
    return m;
  }, [returns]);
  const totalRefunded = returns.reduce((s, r) => s + r.refund_amount, 0);
  const returnedUnits = returns.reduce((s, r) => s + r.quantity_returned, 0);
  const soldUnits = sales.reduce((s, x) => s + x.quantity, 0);
  const fullyReturned = returnedUnits > 0 && returnedUnits >= soldUnits;
  const netPayable = Math.max(0, total - totalRefunded);

  const paymentBadge = (mode: string) => {
    if (mode === 'Cash') return <span className="badge-cash">{mode}</span>;
    if (mode === 'UPI') return <span className="badge-upi">{mode}</span>;
    return <span className="badge-credit">{mode}</span>;
  };

  return (
    <>
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <Receipt size={18} className="text-blue-600" />
            <div>
              <h2 className="font-bold text-gray-900">{first.invoice_number}</h2>
              <p className="text-xs text-gray-500">{formatDate(first.sale_date)}</p>
            </div>
            {paymentBadge(first.payment_mode)}
          </div>
          <div className="flex items-center gap-2">
            {allowReturn && (
              <button
                onClick={() => setShowReturn(true)}
                className="flex items-center gap-1.5 text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                <RotateCcw size={14} /> Return
              </button>
            )}
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Printer size={14} /> Print / PDF
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={22} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Customer info */}
          {onUpdateCustomer && editingCustomer ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <User size={14} className="text-gray-400 shrink-0" />
                  <input
                    autoFocus
                    type="text"
                    className="input-field py-1.5 text-sm"
                    placeholder="Customer name"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 flex-1">
                  <Phone size={14} className="text-gray-400 shrink-0" />
                  <input
                    type="tel"
                    className="input-field py-1.5 text-sm"
                    placeholder="Mobile number"
                    value={draftMobile}
                    onChange={(e) => setDraftMobile(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={cancelEditCustomer}
                  className="px-3 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveCustomer}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-60"
                >
                  <Check size={12} /> {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 rounded-lg px-4 py-3">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <User size={14} className="text-gray-400" />
                  <span className="text-sm font-medium text-gray-700">
                    {first.customer_name || <span className="text-gray-400 italic">No customer name</span>}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone size={14} className="text-gray-400" />
                  <span className="text-sm text-gray-600">
                    {first.mobile_number || <span className="text-gray-400 italic">No mobile</span>}
                  </span>
                </div>
              </div>
              {onUpdateCustomer && (
                <button
                  onClick={startEditCustomer}
                  className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-1 rounded-md transition-colors"
                >
                  <Pencil size={12} /> Edit
                </button>
              )}
            </div>
          )}

          {/* Returns against this invoice */}
          {returns.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-amber-800">
                  <RotateCcw size={15} />
                  <span className="text-sm font-semibold">
                    {fullyReturned ? 'Fully returned' : 'Partially returned'}
                  </span>
                </div>
                <span className="text-xs text-amber-700">
                  {returnedUnits} of {soldUnits} units · {returns.length} refund{returns.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span className="text-gray-600">Original <span className="font-semibold tabular-nums">{formatGrandTotal(total)}</span></span>
                <span className="text-gray-600">Refunded <span className="font-semibold text-red-600 tabular-nums">− {formatCurrency(totalRefunded)}</span></span>
                <span className="text-gray-600">Net <span className="font-bold text-green-700 tabular-nums">{formatGrandTotal(netPayable)}</span></span>
              </div>
            </div>
          )}

          {/* Medicines table */}
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="table-header">#</th>
                  <th className="table-header">Medicine</th>
                  <th className="table-header hidden sm:table-cell">Batch</th>
                  <th className="table-header hidden sm:table-cell">Expiry</th>
                  <th className="table-header">Qty</th>
                  <th className="table-header">MRP</th>
                  <th className="table-header">Rate</th>
                  <th className="table-header text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale, idx) => (
                  <tr key={sale.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-cell text-gray-400 text-xs">{idx + 1}</td>
                    <td className="table-cell font-medium">
                      {sale.medicine_name}
                      {returnedBySaleId[sale.id] > 0 && (
                        <span className="block text-xs font-normal text-red-500">
                          ↺ {returnedBySaleId[sale.id]} of {sale.quantity} returned
                        </span>
                      )}
                    </td>
                    <td className="hidden sm:table-cell px-3 py-3 text-xs text-gray-500 border-b border-gray-100">
                      {sale.batch_number || '-'}
                    </td>
                    <td className="hidden sm:table-cell px-3 py-3 text-xs text-gray-500 border-b border-gray-100">
                      {sale.expiry_date || '-'}
                    </td>
                    <td className="table-cell">{sale.quantity}</td>
                    <td className="table-cell text-sm">₹{sale.mrp}</td>
                    <td className="table-cell text-sm">₹{sale.selling_rate}</td>
                    <td className="table-cell text-right font-semibold">
                      {formatCurrency(sale.quantity * sale.selling_rate)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-blue-50 border-t-2 border-blue-200">
                  <td colSpan={99} className="px-3 py-3">
                    <div className="flex flex-col items-end gap-0.5 text-sm">
                      {billDiscount > 0 && (
                        <>
                          <div className="flex justify-between w-48">
                            <span className="text-gray-500">Subtotal</span>
                            <span className="text-gray-700 font-medium">{formatCurrency(subtotal)}</span>
                          </div>
                          <div className="flex justify-between w-48">
                            <span className="text-gray-500">Bill Discount ({billDiscount}%)</span>
                            <span className="text-red-500 font-medium">- {formatCurrency(subtotal - total)}</span>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between w-48 border-t border-blue-200 pt-1 mt-0.5">
                        <span className="font-semibold text-gray-600">
                          Grand Total &middot; {sales.length} {sales.length === 1 ? 'medicine' : 'medicines'}
                        </span>
                        <span className="font-bold text-blue-700 text-base">{formatGrandTotal(total)}</span>
                      </div>
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>

    {allowReturn && showReturn && (
      <ReturnModal
        sales={sales}
        onClose={() => setShowReturn(false)}
        onRecorded={() => { onReturnRecorded?.(); loadReturns(); }}
      />
    )}
    </>
  );
}
