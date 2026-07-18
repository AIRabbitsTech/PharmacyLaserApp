import { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, ArrowUpDown } from 'lucide-react';
import type { Sale } from '../../types';
import { formatCurrency } from '../../utils/helpers';

interface Props {
  sales: Sale[];
  search?: string;
}

type SortKey = 'revenue' | 'qty' | 'invoices';

interface MedRow {
  name: string;
  qty: number;
  revenue: number;
  invoices: number;
  avgMrp: number;
  grossMrp: number;
}

function buildRows(sales: Sale[]): MedRow[] {
  const map = new Map<string, {
    name: string; qty: number; revenue: number;
    invoices: Set<string>; mrpTotal: number;
  }>();
  for (const s of sales) {
    const key = s.medicine_name.trim().toLowerCase();
    if (!map.has(key)) {
      map.set(key, { name: s.medicine_name.trim(), qty: 0, revenue: 0, invoices: new Set(), mrpTotal: 0 });
    }
    const r = map.get(key)!;
    r.qty += s.quantity;
    r.revenue += s.total_amount;
    r.invoices.add(s.invoice_number);
    r.mrpTotal += s.mrp * s.quantity;
  }
  return [...map.values()].map((v) => ({
    name: v.name,
    qty: v.qty,
    revenue: v.revenue,
    invoices: v.invoices.size,
    avgMrp: v.qty > 0 ? v.mrpTotal / v.qty : 0,
    grossMrp: v.mrpTotal,
  }));
}

function SortButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
        active
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
      }`}
    >
      <ArrowUpDown size={11} /> {label}
    </button>
  );
}

export default function MedicinesReport({ sales, search = '' }: Props) {
  const [subTab, setSubTab] = useState<'top' | 'slow'>('top');
  const [sortKey, setSortKey] = useState<SortKey>('revenue');

  const allRows = useMemo(() => buildRows(sales), [sales]);
  const totalRevenue = useMemo(() => allRows.reduce((s, r) => s + r.revenue, 0), [allRows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? allRows.filter((r) => r.name.toLowerCase().includes(q)) : allRows;
  }, [allRows, search]);

  const sorted = useMemo(() => {
    const copy = [...filteredRows];
    if (subTab === 'top') {
      copy.sort((a, b) => b[sortKey] - a[sortKey]);
    } else {
      copy.sort((a, b) => a.revenue - b.revenue);
    }
    return copy;
  }, [filteredRows, subTab, sortKey]);

  if (sales.length === 0) {
    return <p className="text-center py-16 text-gray-400 text-sm">No sales data for this period.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
        <button
          onClick={() => setSubTab('top')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
            subTab === 'top' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <TrendingUp size={15} /> Top Selling
        </button>
        <button
          onClick={() => setSubTab('slow')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
            subTab === 'slow' ? 'bg-orange-50 text-orange-700' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <TrendingDown size={15} /> Slow Moving
        </button>
        <span className="ml-auto text-xs text-gray-400">{allRows.length} unique medicines</span>
      </div>

      {subTab === 'top' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium">Sort by:</span>
          <SortButton label="Revenue" active={sortKey === 'revenue'} onClick={() => setSortKey('revenue')} />
          <SortButton label="Units Sold" active={sortKey === 'qty'} onClick={() => setSortKey('qty')} />
          <SortButton label="Invoices" active={sortKey === 'invoices'} onClick={() => setSortKey('invoices')} />
        </div>
      )}

      {subTab === 'slow' && (
        <p className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
          Sorted by lowest revenue in the selected period — review these for slow-moving or stagnant stock.
        </p>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="min-w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="table-header w-8">#</th>
              <th className="table-header">Medicine Name</th>
              <th className="table-header text-right">Units Sold</th>
              <th className="table-header text-right">Revenue</th>
              <th className="table-header hidden md:table-cell">Revenue Share</th>
              <th className="table-header text-right hidden lg:table-cell">Invoices</th>
              <th className="table-header text-right hidden lg:table-cell">Avg MRP</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-gray-400 text-sm">No medicines match "{search}"</td>
              </tr>
            )}
            {sorted.map((row, idx) => {
              const share = totalRevenue > 0 ? (row.revenue / totalRevenue) * 100 : 0;
              return (
                <tr key={row.name} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="table-cell text-center text-xs text-gray-400 font-semibold">{idx + 1}</td>
                  <td className="table-cell font-medium text-gray-800 max-w-[200px]">
                    <span className="truncate block">{row.name}</span>
                  </td>
                  <td className="table-cell text-right tabular-nums text-gray-700">{row.qty.toFixed(row.qty % 1 ? 2 : 0)}</td>
                  <td className="table-cell text-right font-semibold tabular-nums text-gray-900">{formatCurrency(row.revenue)}</td>
                  <td className="px-3 py-3 border-b border-gray-100 hidden md:table-cell">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden min-w-[60px]">
                        <div
                          className={`h-1.5 rounded-full ${subTab === 'slow' ? 'bg-orange-400' : 'bg-blue-500'}`}
                          style={{ width: `${Math.min(share * 3, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 tabular-nums w-10 text-right">{share.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="table-cell text-right text-gray-500 hidden lg:table-cell tabular-nums">{row.invoices}</td>
                  <td className="table-cell text-right text-gray-500 hidden lg:table-cell tabular-nums">₹{row.avgMrp.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
