import { useMemo } from 'react';
import { TrendingUp, Receipt, Package, RotateCcw } from 'lucide-react';
import type { Sale, SalesReturn } from '../../types';
import { formatCurrency, formatDate } from '../../utils/helpers';

interface Props {
  sales: Sale[];
  returns?: SalesReturn[];
}

export default function RevenueReport({ sales, returns = [] }: Props) {
  const stats = useMemo(() => {
    const invoiceSet = new Set(sales.map((s) => s.invoice_number));
    const total = sales.reduce((s, x) => s + x.total_amount, 0);
    const cash = sales.filter((x) => x.payment_mode === 'Cash').reduce((s, x) => s + x.total_amount, 0);
    const upi = sales.filter((x) => x.payment_mode === 'UPI').reduce((s, x) => s + x.total_amount, 0);
    const credit = sales.filter((x) => x.payment_mode === 'Credit').reduce((s, x) => s + x.total_amount, 0);
    return {
      total, cash, upi, credit,
      invoices: invoiceSet.size,
      items: sales.length,
      avgBill: invoiceSet.size > 0 ? total / invoiceSet.size : 0,
    };
  }, [sales]);

  // Returns are booked by refund_mode, netting against that same mode.
  const ret = useMemo(() => {
    const byMode = (m: string) =>
      returns.filter((r) => r.refund_mode === m).reduce((s, r) => s + r.refund_amount, 0);
    const total = returns.reduce((s, r) => s + r.refund_amount, 0);
    return { total, cash: byMode('Cash'), upi: byMode('UPI'), credit: byMode('Credit'), count: returns.length };
  }, [returns]);

  const net = {
    total: stats.total - ret.total,
    cash: stats.cash - ret.cash,
    upi: stats.upi - ret.upi,
    credit: stats.credit - ret.credit,
  };

  const dayRows = useMemo(() => {
    const map = new Map<string, {
      date: string; invoices: Set<string>;
      revenue: number; cash: number; upi: number; credit: number;
    }>();
    for (const s of sales) {
      if (!map.has(s.sale_date)) {
        map.set(s.sale_date, { date: s.sale_date, invoices: new Set(), revenue: 0, cash: 0, upi: 0, credit: 0 });
      }
      const row = map.get(s.sale_date)!;
      row.invoices.add(s.invoice_number);
      row.revenue += s.total_amount;
      if (s.payment_mode === 'Cash') row.cash += s.total_amount;
      else if (s.payment_mode === 'UPI') row.upi += s.total_amount;
      else row.credit += s.total_amount;
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [sales]);

  const maxRevenue = Math.max(...dayRows.map((d) => d.revenue), 1);

  if (sales.length === 0) {
    return <p className="text-center py-16 text-gray-400 text-sm">No sales data for this period.</p>;
  }

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-4 text-white col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-blue-100 text-xs font-medium uppercase tracking-wide">Total Revenue</span>
            <TrendingUp size={16} className="text-blue-200" />
          </div>
          <p className="text-2xl font-bold tabular-nums">{formatCurrency(stats.total)}</p>
          <p className="text-blue-200 text-xs mt-0.5">{stats.invoices} invoices · {stats.items} items</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <Receipt size={14} className="text-purple-500" />
            <span className="text-gray-400 text-xs font-medium uppercase">Avg Bill</span>
          </div>
          <p className="text-xl font-bold text-gray-900 tabular-nums">{formatCurrency(stats.avgBill)}</p>
          <p className="text-gray-400 text-xs mt-0.5">per invoice</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <Receipt size={14} className="text-blue-500" />
            <span className="text-gray-400 text-xs font-medium uppercase">Invoices</span>
          </div>
          <p className="text-xl font-bold text-gray-900">{stats.invoices}</p>
          <p className="text-gray-400 text-xs mt-0.5">{stats.items} line items</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <Package size={14} className="text-teal-500" />
            <span className="text-gray-400 text-xs font-medium uppercase">Items Sold</span>
          </div>
          <p className="text-xl font-bold text-gray-900">{stats.items}</p>
          <p className="text-gray-400 text-xs mt-0.5">total medicine lines</p>
        </div>
      </div>

      {/* Returns & Net Revenue — only when returns exist in the period */}
      {ret.count > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <RotateCcw size={14} className="text-red-500" />
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Returns &amp; Net Revenue</h3>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center">
              <p className="text-xs text-gray-400 uppercase tracking-wide">Gross Sales</p>
              <p className="text-lg font-bold text-gray-800 tabular-nums">{formatCurrency(stats.total)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 uppercase tracking-wide">Returns ({ret.count})</p>
              <p className="text-lg font-bold text-red-600 tabular-nums">− {formatCurrency(ret.total)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 uppercase tracking-wide">Net Revenue</p>
              <p className="text-lg font-bold text-green-700 tabular-nums">{formatCurrency(net.total)}</p>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-3 grid grid-cols-3 gap-3 text-xs">
            {([
              { label: 'Cash', gross: stats.cash, refund: ret.cash, net: net.cash },
              { label: 'UPI', gross: stats.upi, refund: ret.upi, net: net.upi },
              { label: 'Credit', gross: stats.credit, refund: ret.credit, net: net.credit },
            ]).map(({ label, gross, refund, net: n }) => (
              <div key={label} className="text-center">
                <p className="font-semibold text-gray-600">{label}</p>
                <p className="text-gray-400 tabular-nums">{formatCurrency(gross)}{refund > 0 && <span className="text-red-500"> − {formatCurrency(refund)}</span>}</p>
                <p className="font-bold text-gray-800 tabular-nums">= {formatCurrency(n)}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-3">
            Credit returns also reduce the customer's outstanding in the Credit Ledger. Cash/UPI returns are money refunded from the drawer.
          </p>
        </div>
      )}

      {/* Payment Mode Breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Payment Mode Breakdown <span className="font-normal normal-case tracking-normal text-gray-400">· gross sales</span></h3>
        <div className="space-y-4">
          {[
            { label: 'Cash', value: stats.cash, bar: 'bg-green-500', text: 'text-green-700', pill: 'bg-green-50 text-green-700' },
            { label: 'UPI', value: stats.upi, bar: 'bg-blue-500', text: 'text-blue-700', pill: 'bg-blue-50 text-blue-700' },
            { label: 'Credit', value: stats.credit, bar: 'bg-orange-500', text: 'text-orange-700', pill: 'bg-orange-50 text-orange-700' },
          ].map(({ label, value, bar, text, pill }) => {
            const pct = stats.total > 0 ? (value / stats.total) * 100 : 0;
            return (
              <div key={label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-sm font-semibold ${text}`}>{label}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 tabular-nums">{pct.toFixed(1)}%</span>
                    <span className={`text-sm font-bold px-2.5 py-0.5 rounded-lg tabular-nums ${pill}`}>
                      {formatCurrency(value)}
                    </span>
                  </div>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-2.5 ${bar} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Day-wise table — only shown when range spans multiple days */}
      {dayRows.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Day-wise Revenue</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="table-header">Date</th>
                  <th className="table-header text-center">Invoices</th>
                  <th className="table-header">Revenue</th>
                  <th className="table-header text-right">Cash</th>
                  <th className="table-header text-right">UPI</th>
                  <th className="table-header text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {dayRows.map((row) => (
                  <tr key={row.date} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="table-cell font-medium text-gray-700">{formatDate(row.date)}</td>
                    <td className="table-cell text-center text-gray-500">{row.invoices.size}</td>
                    <td className="px-3 py-3 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden min-w-[80px]">
                          <div
                            className="h-2 bg-blue-500 rounded-full"
                            style={{ width: `${(row.revenue / maxRevenue) * 100}%` }}
                          />
                        </div>
                        <span className="text-sm font-semibold text-gray-800 tabular-nums w-28 text-right">
                          {formatCurrency(row.revenue)}
                        </span>
                      </div>
                    </td>
                    <td className="table-cell text-right text-green-700 font-medium tabular-nums">
                      {row.cash > 0 ? formatCurrency(row.cash) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="table-cell text-right text-blue-700 font-medium tabular-nums">
                      {row.upi > 0 ? formatCurrency(row.upi) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="table-cell text-right text-orange-600 font-medium tabular-nums">
                      {row.credit > 0 ? formatCurrency(row.credit) : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-300">
                  <td className="px-3 py-2.5 text-sm font-semibold text-gray-600">Total</td>
                  <td className="px-3 py-2.5 text-center font-semibold text-gray-600">{stats.invoices}</td>
                  <td className="px-3 py-2.5">
                    <span className="text-sm font-bold text-gray-900 tabular-nums">{formatCurrency(stats.total)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-green-700 tabular-nums">{formatCurrency(stats.cash)}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-blue-700 tabular-nums">{formatCurrency(stats.upi)}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-orange-600 tabular-nums">{formatCurrency(stats.credit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
