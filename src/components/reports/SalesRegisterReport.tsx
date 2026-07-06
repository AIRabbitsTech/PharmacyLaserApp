import { useMemo, useState } from 'react';
import { FileDown, FileText, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import type { Sale, SalesReturn } from '../../types';
import { formatDate, formatGrandTotal, formatCurrency } from '../../utils/helpers';
import { useProgressiveList } from '../../hooks/useProgressiveList';
import InvoiceModal from '../InvoiceModal';
import { exportSummaryToExcel } from '../../utils/exportExcel';
import { exportToPdf } from '../../utils/exportPdf';

interface Props {
  sales: Sale[];
  returns?: SalesReturn[];
  dateLabel: string;
  startDate: string;
  search?: string;
}

function groupByInvoice(sales: Sale[]): Sale[][] {
  const map = new Map<string, Sale[]>();
  const order: string[] = [];
  for (const s of sales) {
    if (!map.has(s.invoice_number)) {
      map.set(s.invoice_number, []);
      order.push(s.invoice_number);
    }
    map.get(s.invoice_number)!.push(s);
  }
  return order.map((inv) => map.get(inv)!);
}

function PaymentBadge({ mode }: { mode: string }) {
  if (mode === 'Cash') return <span className="badge-cash">{mode}</span>;
  if (mode === 'UPI') return <span className="badge-upi">{mode}</span>;
  return <span className="badge-credit">{mode}</span>;
}

type SortKey = 'date' | 'invoice' | 'customer' | 'amount' | 'payment' | 'items';
type SortDir = 'asc' | 'desc';

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey | null; sortDir: SortDir }) {
  if (sortKey !== col) return <ChevronsUpDown size={13} className="text-gray-400 inline ml-1" />;
  return sortDir === 'asc'
    ? <ChevronUp size={13} className="text-blue-600 inline ml-1" />
    : <ChevronDown size={13} className="text-blue-600 inline ml-1" />;
}

export default function SalesRegisterReport({ sales, returns = [], dateLabel, startDate, search = '' }: Props) {
  const [selectedInvoice, setSelectedInvoice] = useState<Sale[] | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const invoiceGroups = useMemo(() => groupByInvoice(sales), [sales]);

  // Filter by invoice / customer / mobile / any medicine line in the group.
  const searchedGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return invoiceGroups;
    return invoiceGroups.filter((g) =>
      g.some((s) =>
        s.medicine_name.toLowerCase().includes(q) ||
        s.invoice_number.toLowerCase().includes(q) ||
        (s.customer_name || '').toLowerCase().includes(q) ||
        (s.mobile_number || '').includes(q),
      ),
    );
  }, [invoiceGroups, search]);

  const sortedGroups = useMemo(() => {
    if (!sortKey) return searchedGroups;
    return [...searchedGroups].sort((a, b) => {
      const fa = a[0], fb = b[0];
      const aTotal = a.reduce((s, x) => s + x.total_amount, 0);
      const bTotal = b.reduce((s, x) => s + x.total_amount, 0);
      let cmp = 0;
      if (sortKey === 'date') cmp = fa.sale_date.localeCompare(fb.sale_date);
      else if (sortKey === 'invoice') cmp = fa.invoice_number.localeCompare(fb.invoice_number);
      else if (sortKey === 'customer') cmp = (fa.customer_name || '').localeCompare(fb.customer_name || '');
      else if (sortKey === 'amount') cmp = aTotal - bTotal;
      else if (sortKey === 'payment') cmp = fa.payment_mode.localeCompare(fb.payment_mode);
      else if (sortKey === 'items') cmp = a.length - b.length;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [searchedGroups, sortKey, sortDir]);

  // Total for the footer reflects what's listed (filtered by search when active).
  const shownTotal = useMemo(
    () => sortedGroups.reduce((s, g) => s + g.reduce((a, x) => a + x.total_amount, 0), 0),
    [sortedGroups],
  );

  const summary = useMemo(() => ({
    total: sales.reduce((s, x) => s + x.total_amount, 0),
    cash: sales.filter((x) => x.payment_mode === 'Cash').reduce((s, x) => s + x.total_amount, 0),
    upi: sales.filter((x) => x.payment_mode === 'UPI').reduce((s, x) => s + x.total_amount, 0),
    credit: sales.filter((x) => x.payment_mode === 'Credit').reduce((s, x) => s + x.total_amount, 0),
  }), [sales]);

  const returnsTotal = useMemo(() => returns.reduce((s, r) => s + r.refund_amount, 0), [returns]);

  // Lazy render: 150 invoices up front, more as the user scrolls. Reset when
  // the period (startDate/size) or sort changes.
  const { shown: shownGroups, hasMore, sentinelRef, shownCount, total } = useProgressiveList(
    sortedGroups,
    `${startDate}|${sales.length}|${sortKey}|${sortDir}|${search}`,
  );

  if (sales.length === 0) {
    return <p className="text-center py-16 text-gray-400 text-sm">No sales data for this period.</p>;
  }

  return (
    <>
      <div className="flex justify-end gap-2 mb-4">
        <button
          onClick={() => exportSummaryToExcel(sales, summary, `sales-register-${startDate}`)}
          className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
        >
          <FileDown size={15} /> Excel
        </button>
        <button
          onClick={() => exportToPdf(sales, summary, dateLabel, `sales-register-${startDate}`)}
          className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
        >
          <FileText size={15} /> PDF
        </button>
      </div>

      {/* Net-of-returns summary — only when the period has returns */}
      {returns.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
          <span className="text-gray-600">Gross sales <span className="font-semibold text-gray-800 tabular-nums">{formatGrandTotal(summary.total)}</span></span>
          <span className="text-gray-600">Returns <span className="font-semibold text-red-600 tabular-nums">− {formatCurrency(returnsTotal)}</span> <span className="text-gray-400">({returns.length})</span></span>
          <span className="text-gray-600">Net <span className="font-bold text-green-700 tabular-nums">{formatGrandTotal(summary.total - returnsTotal)}</span></span>
          <span className="text-[11px] text-gray-400">Returns are separate transactions — the invoice list below shows original sales.</span>
        </div>
      )}

      {sortedGroups.length === 0 && (
        <p className="text-center py-12 text-gray-400 text-sm">No invoices match "{search}"</p>
      )}

      {/* Mobile cards */}
      <div className={`space-y-2 sm:hidden ${sortedGroups.length === 0 ? 'hidden' : ''}`}>
        {shownGroups.map((group) => {
          const first = group[0];
          const groupTotal = group.reduce((s, x) => s + x.total_amount, 0);
          return (
            <div key={first.invoice_number} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <button
                    onClick={() => setSelectedInvoice(group)}
                    className="font-mono text-sm text-blue-600 font-semibold hover:underline"
                  >
                    {first.invoice_number}
                  </button>
                  <p className="text-xs text-gray-500 mt-0.5">{formatDate(first.sale_date)}</p>
                  {first.customer_name && <p className="text-sm text-gray-700 mt-0.5">{first.customer_name}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-gray-900">{formatGrandTotal(groupTotal)}</p>
                  <div className="mt-1"><PaymentBadge mode={first.payment_mode} /></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className={`overflow-x-auto rounded-xl border border-gray-200 ${sortedGroups.length === 0 ? 'hidden' : 'hidden sm:block'}`}>
        <table className="min-w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {([
                { key: 'date' as SortKey, label: 'Date', cls: '' },
                { key: 'invoice' as SortKey, label: 'Invoice', cls: '' },
                { key: 'customer' as SortKey, label: 'Customer', cls: '' },
                { key: 'amount' as SortKey, label: 'Amount', cls: 'text-right' },
                { key: 'payment' as SortKey, label: 'Payment', cls: '' },
                { key: 'items' as SortKey, label: 'Items', cls: 'text-center' },
              ]).map(({ key, label, cls }) => (
                <th
                  key={key}
                  className={`table-header cursor-pointer select-none hover:bg-gray-100 transition-colors ${cls}`}
                  onClick={() => handleSort(key)}
                >
                  {label}<SortIcon col={key} sortKey={sortKey} sortDir={sortDir} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shownGroups.map((group) => {
              const first = group[0];
              const groupTotal = group.reduce((s, x) => s + x.total_amount, 0);
              return (
                <tr key={first.invoice_number} className="hover:bg-gray-50 border-b border-gray-100 transition-colors">
                  <td className="table-cell text-xs text-gray-500">{formatDate(first.sale_date)}</td>
                  <td className="table-cell">
                    <button
                      onClick={() => setSelectedInvoice(group)}
                      className="font-mono text-xs text-blue-600 hover:underline font-semibold"
                    >
                      {first.invoice_number}
                    </button>
                  </td>
                  <td className="table-cell text-gray-700 max-w-[180px] truncate">{first.customer_name || '—'}</td>
                  <td className="table-cell text-right font-semibold tabular-nums">{formatGrandTotal(groupTotal)}</td>
                  <td className="table-cell"><PaymentBadge mode={first.payment_mode} /></td>
                  <td className="table-cell text-center text-sm text-gray-500">{group.length}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-300">
              <td colSpan={3} className="px-3 py-2.5 text-sm font-semibold text-gray-600">
                Total ({sortedGroups.length} invoices)
              </td>
              <td className="px-3 py-2.5 text-right font-bold text-gray-900 tabular-nums">
                {formatGrandTotal(shownTotal)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Lazy-load sentinel + progress indicator */}
      <div ref={sentinelRef} className="py-3 text-center text-xs text-gray-400">
        {hasMore
          ? `Showing ${shownCount} of ${total} invoices — scroll for more…`
          : total > 150 && `All ${total} invoices shown`}
      </div>

      {selectedInvoice && (
        <InvoiceModal sales={selectedInvoice} onClose={() => setSelectedInvoice(null)} />
      )}
    </>
  );
}
