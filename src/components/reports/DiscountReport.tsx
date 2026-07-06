import { useMemo, useState } from 'react';
import { AlertTriangle, Percent } from 'lucide-react';
import type { Sale } from '../../types';
import { formatCurrency } from '../../utils/helpers';

interface Props {
  sales: Sale[];
  search?: string;
}

interface DiscountRow {
  name: string;
  gross: number;
  discountAmount: number;
  net: number;
  discountPct: number;
  qty: number;
  invoices: number;
}

type SortKey = 'discountPct' | 'discountAmount' | 'gross';

function buildRows(sales: Sale[]): DiscountRow[] {
  const map = new Map<string, {
    name: string; gross: number; net: number; qty: number; invoices: Set<string>;
  }>();

  for (const s of sales) {
    const key = s.medicine_name.trim().toLowerCase();
    if (!map.has(key)) {
      map.set(key, { name: s.medicine_name.trim(), gross: 0, net: 0, qty: 0, invoices: new Set() });
    }
    const r = map.get(key)!;
    const itemGross = s.mrp * s.quantity;
    r.gross += itemGross;
    r.net += s.total_amount;
    r.qty += s.quantity;
    r.invoices.add(s.invoice_number);
  }

  return [...map.values()]
    .map((v) => {
      const discountAmount = Math.max(0, v.gross - v.net);
      const discountPct = v.gross > 0 ? (discountAmount / v.gross) * 100 : 0;
      return {
        name: v.name,
        gross: v.gross,
        discountAmount,
        net: v.net,
        discountPct,
        qty: v.qty,
        invoices: v.invoices.size,
      };
    })
    .filter((r) => r.gross > 0);
}

export default function DiscountReport({ sales, search = '' }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('discountPct');
  const [showHighOnly, setShowHighOnly] = useState(false);

  const allRows = useMemo(() => buildRows(sales), [sales]);

  const totals = useMemo(() => ({
    gross: allRows.reduce((s, r) => s + r.gross, 0),
    discount: allRows.reduce((s, r) => s + r.discountAmount, 0),
    net: allRows.reduce((s, r) => s + r.net, 0),
  }), [allRows]);

  const overallDiscountPct = totals.gross > 0 ? (totals.discount / totals.gross) * 100 : 0;
  const highDiscountCount = allRows.filter((r) => r.discountPct > 10).length;

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    let copy = showHighOnly ? allRows.filter((r) => r.discountPct > 10) : [...allRows];
    if (q) copy = copy.filter((r) => r.name.toLowerCase().includes(q));
    return copy.sort((a, b) => b[sortKey] - a[sortKey]);
  }, [allRows, sortKey, showHighOnly, search]);

  if (sales.length === 0) {
    return <p className="text-center py-16 text-gray-400 text-sm">No sales data for this period.</p>;
  }

  return (
    <div className="space-y-5">
      {/* Summary banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="stat-card">
          <span className="text-gray-400 text-xs font-medium uppercase">Gross MRP Revenue</span>
          <p className="text-xl font-bold text-gray-900 mt-1 tabular-nums">{formatCurrency(totals.gross)}</p>
          <p className="text-gray-400 text-xs mt-0.5">before all discounts</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Percent size={14} className="text-red-500" />
            <span className="text-red-500 text-xs font-medium uppercase">Total Discount Given</span>
          </div>
          <p className="text-xl font-bold text-red-700 mt-1 tabular-nums">{formatCurrency(totals.discount)}</p>
          <p className="text-red-400 text-xs">{overallDiscountPct.toFixed(2)}% of gross revenue</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex flex-col gap-1">
          <span className="text-green-600 text-xs font-medium uppercase">Net Revenue Collected</span>
          <p className="text-xl font-bold text-green-700 mt-1 tabular-nums">{formatCurrency(totals.net)}</p>
          <p className="text-green-500 text-xs">{(100 - overallDiscountPct).toFixed(2)}% of gross</p>
        </div>
      </div>

      {/* Margin loss bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Overall Margin Retention</h3>
          <span className="text-sm font-bold text-gray-700 tabular-nums">{(100 - overallDiscountPct).toFixed(1)}% retained</span>
        </div>
        <div className="h-4 bg-red-100 rounded-full overflow-hidden flex">
          <div
            className="h-4 bg-green-500 rounded-l-full transition-all duration-500"
            style={{ width: `${100 - overallDiscountPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5 text-xs text-gray-400">
          <span className="text-green-600 font-medium">Net {formatCurrency(totals.net)}</span>
          <span className="text-red-500 font-medium">Discount {formatCurrency(totals.discount)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium">Sort by:</span>
          {([
            ['discountPct', 'Disc %'],
            ['discountAmount', 'Disc ₹'],
            ['gross', 'Gross MRP'],
          ] as [SortKey, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSortKey(key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                sortKey === key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {highDiscountCount > 0 && (
          <button
            onClick={() => setShowHighOnly(!showHighOnly)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              showHighOnly ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-600 border-red-300 hover:bg-red-50'
            }`}
          >
            <AlertTriangle size={12} /> High Discount (&gt;10%) — {highDiscountCount}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="min-w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="table-header w-8">#</th>
              <th className="table-header">Medicine</th>
              <th className="table-header text-right">Gross MRP</th>
              <th className="table-header text-right">Discount ₹</th>
              <th className="table-header text-right">Net Revenue</th>
              <th className="table-header text-right">Disc %</th>
              <th className="table-header hidden md:table-cell">Margin Bar</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-gray-400 text-sm">No medicines match "{search}"</td>
              </tr>
            )}
            {sorted.map((row, idx) => {
              const isHigh = row.discountPct > 10;
              return (
                <tr key={row.name} className={`border-b border-gray-100 transition-colors ${isHigh ? 'hover:bg-red-50/30' : 'hover:bg-gray-50'}`}>
                  <td className="table-cell text-center text-xs text-gray-400 font-semibold">{idx + 1}</td>
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800 truncate max-w-[180px]">{row.name}</span>
                      {isHigh && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-100 text-red-600 text-xs font-semibold rounded">
                          <AlertTriangle size={10} /> High
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="table-cell text-right text-gray-700 tabular-nums">{formatCurrency(row.gross)}</td>
                  <td className="table-cell text-right text-red-600 font-semibold tabular-nums">
                    {row.discountAmount > 0 ? formatCurrency(row.discountAmount) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="table-cell text-right font-semibold text-green-700 tabular-nums">{formatCurrency(row.net)}</td>
                  <td className={`table-cell text-right font-bold tabular-nums ${isHigh ? 'text-red-600' : row.discountPct > 5 ? 'text-orange-500' : 'text-gray-600'}`}>
                    {row.discountPct > 0 ? `${row.discountPct.toFixed(1)}%` : <span className="text-gray-300">0%</span>}
                  </td>
                  <td className="px-3 py-3 border-b border-gray-100 hidden md:table-cell">
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden min-w-[80px]">
                      <div
                        className={`h-2 rounded-full ${isHigh ? 'bg-red-400' : row.discountPct > 5 ? 'bg-orange-400' : 'bg-green-400'}`}
                        style={{ width: `${Math.min(row.discountPct * 5, 100)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-300">
              <td colSpan={2} className="px-3 py-2.5 text-sm font-semibold text-gray-600">
                Total ({sorted.length} medicines)
              </td>
              <td className="px-3 py-2.5 text-right font-bold text-gray-900 tabular-nums">{formatCurrency(totals.gross)}</td>
              <td className="px-3 py-2.5 text-right font-bold text-red-600 tabular-nums">{formatCurrency(totals.discount)}</td>
              <td className="px-3 py-2.5 text-right font-bold text-green-700 tabular-nums">{formatCurrency(totals.net)}</td>
              <td className="px-3 py-2.5 text-right font-bold text-gray-700">{overallDiscountPct.toFixed(1)}%</td>
              <td className="hidden md:table-cell" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
