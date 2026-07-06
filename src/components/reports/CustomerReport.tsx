import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, User, Phone, Users } from 'lucide-react';
import type { Sale } from '../../types';
import { formatCurrency, formatDate } from '../../utils/helpers';
import InvoiceModal from '../InvoiceModal';

interface Props {
  sales: Sale[];
  allSales: Sale[];
  search?: string;
}

interface InvoiceLine {
  invoice_number: string;
  date: string;
  amount: number;
  medicines: number;
  paymentMode: string;
  group: Sale[];
}

interface CustomerRow {
  key: string;
  name: string;
  mobile: string;
  invoices: InvoiceLine[];
  totalSpent: number;
  avgBill: number;
  lastDate: string;
  daysSince: number;
}

function buildCustomerRows(sales: Sale[]): CustomerRow[] {
  const invMap = new Map<string, Sale[]>();
  for (const s of sales) {
    if (!invMap.has(s.invoice_number)) invMap.set(s.invoice_number, []);
    invMap.get(s.invoice_number)!.push(s);
  }

  const custMap = new Map<string, CustomerRow>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const [inv, group] of invMap.entries()) {
    const first = group[0];
    const name = first.customer_name?.trim() || '';
    const mobile = first.mobile_number?.trim() || '';
    if (!name && !mobile) continue; // skip fully anonymous
    const key = name ? `${name.toLowerCase()}||${mobile}` : `mobile||${mobile}`;
    const invAmount = group.reduce((s, x) => s + x.total_amount, 0);

    if (!custMap.has(key)) {
      custMap.set(key, { key, name: name || '—', mobile, invoices: [], totalSpent: 0, avgBill: 0, lastDate: first.sale_date, daysSince: 0 });
    }
    const row = custMap.get(key)!;
    if (name && row.name === '—') row.name = name;
    row.invoices.push({
      invoice_number: inv,
      date: first.sale_date,
      amount: invAmount,
      medicines: group.length,
      paymentMode: first.payment_mode,
      group,
    });
    row.totalSpent += invAmount;
    if (first.sale_date > row.lastDate) row.lastDate = first.sale_date;
  }

  for (const row of custMap.values()) {
    row.avgBill = row.invoices.length > 0 ? row.totalSpent / row.invoices.length : 0;
    const last = new Date(row.lastDate);
    row.daysSince = Math.floor((today.getTime() - last.getTime()) / 86400000);
    row.invoices.sort((a, b) => b.date.localeCompare(a.date));
  }

  return [...custMap.values()].sort((a, b) => b.totalSpent - a.totalSpent);
}

function PaymentBadge({ mode }: { mode: string }) {
  if (mode === 'Cash') return <span className="badge-cash">{mode}</span>;
  if (mode === 'UPI') return <span className="badge-upi">{mode}</span>;
  return <span className="badge-credit">{mode}</span>;
}

export default function CustomerReport({ sales, allSales, search = '' }: Props) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Sale[] | null>(null);
  const [view, setView] = useState<'period' | 'alltime'>('alltime');

  const sourceData = view === 'period' ? sales : allSales;
  const allRows = useMemo(() => buildCustomerRows(sourceData), [sourceData]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter((r) => r.name.toLowerCase().includes(q) || r.mobile.includes(q));
  }, [allRows, search]);

  const totalCustomers = allRows.length;
  const totalRevenue = allRows.reduce((s, r) => s + r.totalSpent, 0);

  if (allRows.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <Users size={40} className="mx-auto text-gray-300 mb-3" />
        <p className="text-sm">No customer data for this period.</p>
        <p className="text-xs text-gray-300 mt-1">Sales without a customer name or mobile are excluded.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* View toggle */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView('alltime')}
              className={`px-4 py-2 text-sm font-semibold rounded-lg border transition-colors ${
                view === 'alltime' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
              }`}
            >
              All Customers
            </button>
            <button
              onClick={() => setView('period')}
              className={`px-4 py-2 text-sm font-semibold rounded-lg border transition-colors ${
                view === 'period' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
              }`}
            >
              Selected Period
            </button>
          </div>
        </div>

        {/* Summary strip */}
        <div className="flex flex-wrap gap-3">
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 flex items-center gap-3">
            <Users size={16} className="text-blue-600" />
            <div>
              <p className="text-xs text-blue-500 font-medium">Total Customers</p>
              <p className="text-lg font-bold text-blue-700">{totalCustomers}</p>
            </div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5">
            <p className="text-xs text-gray-400 font-medium">Revenue from Named Customers</p>
            <p className="text-lg font-bold text-gray-800 tabular-nums">{formatCurrency(totalRevenue)}</p>
          </div>
        </div>

        {rows.length === 0 && (
          <p className="text-center py-8 text-gray-400 text-sm">No customers match "{search}"</p>
        )}

        {rows.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="table-header w-8"></th>
                  <th className="table-header">#</th>
                  <th className="table-header">Customer</th>
                  <th className="table-header text-center">Visits</th>
                  <th className="table-header text-right">Total Spent</th>
                  <th className="table-header text-right hidden md:table-cell">Avg Bill</th>
                  <th className="table-header hidden lg:table-cell">Last Visit</th>
                  <th className="table-header text-right hidden lg:table-cell">Days Since</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const isOpen = expandedKey === row.key;
                  const staleClass = row.daysSince > 60 ? 'text-orange-500' : row.daysSince > 30 ? 'text-yellow-600' : 'text-green-600';
                  return (
                    <>
                      <tr
                        key={row.key}
                        className="border-b border-gray-100 hover:bg-blue-50/30 cursor-pointer transition-colors"
                        onClick={() => setExpandedKey(isOpen ? null : row.key)}
                      >
                        <td className="px-3 py-3 text-center text-gray-400">
                          {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        </td>
                        <td className="table-cell text-xs text-gray-400 font-semibold">{idx + 1}</td>
                        <td className="table-cell">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                              <User size={14} className="text-blue-600" />
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
                        <td className="table-cell text-center font-medium text-gray-700">{row.invoices.length}</td>
                        <td className="table-cell text-right font-bold text-gray-900 tabular-nums">{formatCurrency(row.totalSpent)}</td>
                        <td className="table-cell text-right text-gray-500 hidden md:table-cell tabular-nums">{formatCurrency(row.avgBill)}</td>
                        <td className="table-cell text-xs text-gray-500 hidden lg:table-cell">{formatDate(row.lastDate)}</td>
                        <td className={`table-cell text-right font-semibold hidden lg:table-cell tabular-nums ${staleClass}`}>
                          {row.daysSince === 0 ? 'Today' : `${row.daysSince}d ago`}
                        </td>
                      </tr>

                      {isOpen && (
                        <tr key={`${row.key}-expanded`} className="bg-blue-50/20">
                          <td colSpan={8} className="px-6 py-3">
                            <div className="overflow-x-auto rounded-lg border border-blue-100">
                              <table className="min-w-full text-sm">
                                <thead>
                                  <tr className="bg-blue-50 border-b border-blue-100">
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-blue-700">Invoice</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-blue-700">Date</th>
                                    <th className="px-3 py-2 text-center text-xs font-semibold text-blue-700">Items</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-blue-700">Payment</th>
                                    <th className="px-3 py-2 text-right text-xs font-semibold text-blue-700">Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {row.invoices.map((inv) => (
                                    <tr key={inv.invoice_number} className="border-b border-blue-50 hover:bg-blue-50 transition-colors">
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
                                      <td className="px-3 py-2"><PaymentBadge mode={inv.paymentMode} /></td>
                                      <td className="px-3 py-2 text-right font-semibold text-gray-800 tabular-nums">{formatCurrency(inv.amount)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
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
