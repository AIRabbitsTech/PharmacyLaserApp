import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, User, Phone, CreditCard } from 'lucide-react';
import type { Sale, SalesReturn } from '../../types';
import { formatGrandTotal, formatDate } from '../../utils/helpers';
import {
  computeOutstandingByCustomer,
  customerKey,
  type CreditPaymentLike,
  type OutstandingCustomer,
  type OutstandingInvoice,
} from '../../utils/credit';
import type { OutstandingCustomerRow } from '../../hooks/useCustomerOutstanding';
import InvoiceModal from '../InvoiceModal';

interface Props {
  sales: Sale[];
  allSales: Sale[];
  creditPayments: CreditPaymentLike[];
  // Returns within the selected period — Credit-mode returns reduce a customer's
  // period outstanding (mirrors the customer_outstanding SQL view).
  returns?: SalesReturn[];
  // Authoritative all-time outstanding from the customer_outstanding SQL view.
  // null when the view is unavailable → fall back to the client-side computation.
  outstandingRows: OutstandingCustomerRow[] | null;
  search?: string;
}

export default function CreditReport({ sales, allSales, creditPayments, returns = [], outstandingRows, search = '' }: Props) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Sale[] | null>(null);

  // Current period credit rows (net of all payments AND Credit-mode returns).
  const periodRows = useMemo(
    () => computeOutstandingByCustomer(sales, creditPayments, returns),
    [sales, creditPayments, returns],
  );

  // Per-customer invoice breakdown (for the expandable drill-down), keyed by the
  // same canonical customer key the SQL view uses.
  const invoicesByKey = useMemo(() => {
    const invMap = new Map<string, Sale[]>();
    for (const s of allSales) {
      if (s.payment_mode !== 'Credit') continue;
      if (!invMap.has(s.invoice_number)) invMap.set(s.invoice_number, []);
      invMap.get(s.invoice_number)!.push(s);
    }
    const byKey = new Map<string, OutstandingInvoice<Sale>[]>();
    for (const [inv, group] of invMap.entries()) {
      const first = group[0];
      const key = customerKey(first.customer_name, first.mobile_number);
      const amount = group.reduce((s, x) => s + x.total_amount, 0);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push({ invoice_number: inv, date: first.sale_date, amount, medicines: group.length, group });
    }
    return byKey;
  }, [allSales]);

  // All-time credit rows. Prefer the SQL view (authoritative totals); attach the
  // invoice breakdown for drill-down. Fall back to the client-side computation.
  const allTimeRows = useMemo<OutstandingCustomer<Sale>[]>(() => {
    if (outstandingRows) {
      return outstandingRows.map((r) => ({
        key: r.customer_key,
        name: r.customer_name,
        mobile: r.mobile_number,
        total: r.outstanding,
        lastDate: r.last_sale_date,
        invoices: invoicesByKey.get(r.customer_key) ?? [],
      }));
    }
    // Degraded fallback (SQL view down): returns are NOT applied here because
    // only period-scoped returns are loaded, and subtracting those from all-time
    // sales would be wrong. The authoritative all-time path above (the SQL view)
    // already nets Credit returns correctly.
    return computeOutstandingByCustomer(allSales, creditPayments);
  }, [outstandingRows, invoicesByKey, allSales, creditPayments]);

  const [view, setView] = useState<'period' | 'alltime'>('alltime');
  const baseRows = view === 'period' ? periodRows : allTimeRows;

  // Filter by customer name / mobile. Totals reflect what's listed.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return baseRows;
    return baseRows.filter((r) => r.name.toLowerCase().includes(q) || (r.mobile || '').includes(q));
  }, [baseRows, search]);
  const grandTotal = useMemo(() => rows.reduce((s, r) => s + r.total, 0), [rows]);

  if (baseRows.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <CreditCard size={40} className="mx-auto text-gray-300 mb-3" />
        <p className="text-sm">No credit sales for this period.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* View toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('alltime')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg border transition-colors ${
              view === 'alltime' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-600 border-gray-300 hover:border-orange-400'
            }`}
          >
            All-time Outstanding
          </button>
          <button
            onClick={() => setView('period')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg border transition-colors ${
              view === 'period' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-600 border-gray-300 hover:border-orange-400'
            }`}
          >
            Selected Period
          </button>
        </div>

        {/* Grand total banner */}
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-orange-600 uppercase tracking-wide">Total Credit Outstanding</p>
            <p className="text-xs text-orange-400 mt-0.5">{rows.length} customers · {rows.reduce((s, r) => s + r.invoices.length, 0)} invoices</p>
          </div>
          <p className="text-2xl font-bold text-orange-700 tabular-nums">{formatGrandTotal(grandTotal)}</p>
        </div>

        {rows.length === 0 && (
          <p className="text-center py-10 text-gray-400 text-sm">No customers match "{search}"</p>
        )}

        {/* Customer rows */}
        {rows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="table-header w-8"></th>
                <th className="table-header">#</th>
                <th className="table-header">Customer</th>
                <th className="table-header text-center">Invoices</th>
                <th className="table-header text-right">Credit Amount</th>
                <th className="table-header">Last Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const isOpen = expandedKey === row.key;
                return (
                  <React.Fragment key={row.key}>
                    <tr
                      className="border-b border-gray-100 hover:bg-orange-50/40 cursor-pointer transition-colors"
                      onClick={() => setExpandedKey(isOpen ? null : row.key)}
                    >
                      <td className="px-3 py-3 text-center text-gray-400">
                        {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </td>
                      <td className="table-cell text-xs text-gray-400 font-semibold">{idx + 1}</td>
                      <td className="table-cell">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                            <User size={14} className="text-orange-600" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{row.name}</p>
                            {row.mobile && (
                              <p className="text-xs text-gray-400 flex items-center gap-1">
                                <Phone size={10} /> {row.mobile}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="table-cell text-center text-gray-600 font-medium">{row.invoices.length}</td>
                      <td className="table-cell text-right font-bold text-orange-700 tabular-nums text-base">
                        {formatGrandTotal(row.total)}
                      </td>
                      <td className="table-cell text-xs text-gray-500">{formatDate(row.lastDate)}</td>
                    </tr>

                    {isOpen && (
                      <tr className="bg-orange-50/30">
                        <td colSpan={6} className="px-6 py-3">
                          <div className="overflow-x-auto rounded-lg border border-orange-100">
                            <table className="min-w-full text-sm">
                              <thead>
                                <tr className="bg-orange-50 border-b border-orange-100">
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-orange-700">Invoice</th>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-orange-700">Date</th>
                                  <th className="px-3 py-2 text-center text-xs font-semibold text-orange-700">Items</th>
                                  <th className="px-3 py-2 text-right text-xs font-semibold text-orange-700">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.invoices.map((inv) => (
                                  <tr key={inv.invoice_number} className="border-b border-orange-50 hover:bg-orange-50 transition-colors">
                                    <td className="px-3 py-2">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setSelectedInvoice(inv.group); }}
                                        className="font-mono text-xs text-blue-600 hover:underline font-semibold"
                                      >
                                        {inv.invoice_number}
                                      </button>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-gray-500">{formatDate(inv.date)}</td>
                                    <td className="px-3 py-2 text-center text-xs text-gray-500">{inv.medicines}</td>
                                    <td className="px-3 py-2 text-right font-semibold text-orange-700 tabular-nums">
                                      {formatGrandTotal(inv.amount)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-300">
                <td colSpan={4} className="px-3 py-2.5 text-sm font-semibold text-gray-600">
                  Total ({rows.length} customers)
                </td>
                <td className="px-3 py-2.5 text-right font-bold text-orange-700 tabular-nums text-base">
                  {formatGrandTotal(grandTotal)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        )}
      </div>

      {selectedInvoice && (
        <InvoiceModal sales={selectedInvoice} onClose={() => setSelectedInvoice(null)} />
      )}
    </>
  );
}
