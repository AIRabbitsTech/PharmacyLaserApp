import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Search, X, Calendar, Pencil, Printer, RotateCcw, MessageCircle } from 'lucide-react';
import { useSales } from '../hooks/useSales';
import { useSalesReturns } from '../hooks/useSalesReturns';
import { useProgressiveList } from '../hooks/useProgressiveList';
import type { Sale } from '../types';
import { formatCurrency, formatDate, todayISO, getDateRange } from '../utils/helpers';
import { buildWhatsAppLink } from '../utils/whatsapp';
import { getPharmacyProfile } from '../hooks/usePharmacyProfile';
import InvoiceModal from '../components/InvoiceModal';
import InvoiceEditOverlay from '../components/InvoiceEditOverlay';
import { printInvoice } from '../utils/printInvoice';

type DatePreset = 'today' | 'yesterday' | 'last_7_days' | 'this_month' | 'last_month' | 'custom';

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last_7_days', label: 'Last 7 Days' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'custom', label: 'Custom' },
];

const PAGE_TITLES: Record<DatePreset, string> = {
  today: "Today's Sales",
  yesterday: "Yesterday's Sales",
  last_7_days: 'Sales · Last 7 Days',
  this_month: 'Sales · This Month',
  last_month: 'Sales · Last Month',
  custom: 'Sales',
};

const EMPTY_MESSAGES: Record<DatePreset, string> = {
  today: 'No sales recorded today',
  yesterday: 'No sales recorded yesterday',
  last_7_days: 'No sales in the last 7 days',
  this_month: 'No sales this month',
  last_month: 'No sales last month',
  custom: 'No sales in the selected date range',
};

function groupByInvoice(sales: Sale[]): Sale[][] {
  const map = new Map<string, Sale[]>();
  const order: string[] = [];
  for (const sale of sales) {
    if (!map.has(sale.invoice_number)) {
      map.set(sale.invoice_number, []);
      order.push(sale.invoice_number);
    }
    map.get(sale.invoice_number)!.push(sale);
  }
  return order.map((inv) => map.get(inv)!);
}

export default function SalesList() {
  const { fetchSalesByDateRange, updateInvoiceCustomer, loading } = useSales();
  const { fetchReturnedInvoiceSet } = useSalesReturns();
  const [sales, setSales] = useState<Sale[]>([]);
  const [returnedInvoices, setReturnedInvoices] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [selectedInvoiceNumber, setSelectedInvoiceNumber] = useState<string | null>(null);
  const [editingInvoiceSales, setEditingInvoiceSales] = useState<Sale[] | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>('today');
  const [customStart, setCustomStart] = useState(todayISO());
  const [customEnd, setCustomEnd] = useState(todayISO());

  const { start: rangeStart, end: rangeEnd } = useMemo(
    () => getDateRange(datePreset, customStart, customEnd),
    [datePreset, customStart, customEnd],
  );

  useEffect(() => {
    if (datePreset === 'custom' && (!customStart || !customEnd)) return;
    let active = true;
    fetchSalesByDateRange(rangeStart, rangeEnd).then((data) => {
      if (!active) return;
      setSales(data);
      // Flag which of these invoices have a return booked against them.
      const invoiceNumbers = [...new Set(data.map((s) => s.invoice_number))];
      fetchReturnedInvoiceSet(invoiceNumbers).then((set) => {
        if (active) setReturnedInvoices(set);
      });
    });
    return () => { active = false; };
  }, [fetchSalesByDateRange, fetchReturnedInvoiceSet, rangeStart, rangeEnd]);

  const filtered = sales.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.medicine_name.toLowerCase().includes(q) ||
      s.invoice_number.toLowerCase().includes(q) ||
      (s.customer_name || '').toLowerCase().includes(q) ||
      (s.mobile_number || '').includes(q)
    );
  });

  const filteredGroups = useMemo(() => groupByInvoice(filtered), [filtered]);

  // Lazy render: show 150 invoices, reveal more as the user scrolls. Reset the
  // window whenever the date range or search term changes.
  const { shown: shownGroups, hasMore, sentinelRef, shownCount, total } = useProgressiveList(
    filteredGroups,
    `${datePreset}|${rangeStart}|${rangeEnd}|${search}`,
  );

  const totalAmount = filtered.reduce((s, x) => s + x.total_amount, 0);

  const invoiceModalSales = selectedInvoiceNumber
    ? sales.filter((s) => s.invoice_number === selectedInvoiceNumber)
    : null;

  const subtitleText = rangeStart === rangeEnd
    ? formatDate(rangeStart)
    : `${formatDate(rangeStart)} – ${formatDate(rangeEnd)}`;

  const handleInvoiceSaved = (
    _invoiceNumber: string,
    updated: Sale[],
    inserted: Sale[],
    removedIds: string[],
  ) => {
    setSales((prev) => {
      const withoutRemoved = prev.filter((s) => !removedIds.includes(s.id));
      const withUpdates = withoutRemoved.map((s) => {
        const u = updated.find((u) => u.id === s.id);
        return u ?? s;
      });
      return [...withUpdates, ...inserted];
    });
    setEditingInvoiceSales(null);
  };

  const handleUpdateCustomer = async (invoiceNumber: string, customerName: string, mobileNumber: string): Promise<boolean> => {
    const ok = await updateInvoiceCustomer(invoiceNumber, customerName, mobileNumber);
    if (ok) {
      setSales((prev) =>
        prev.map((s) =>
          s.invoice_number === invoiceNumber
            ? { ...s, customer_name: customerName.trim() || undefined, mobile_number: mobileNumber.trim() || undefined }
            : s,
        ),
      );
      toast.success('Customer info updated');
    } else {
      toast.error('Failed to update customer info');
    }
    return ok;
  };

  const paymentBadge = (mode: string) => {
    if (mode === 'Cash') return <span className="badge-cash">{mode}</span>;
    if (mode === 'UPI') return <span className="badge-upi">{mode}</span>;
    return <span className="badge-credit">{mode}</span>;
  };

  // Free WhatsApp click-to-chat link for an invoice — opens WhatsApp with a
  // pre-filled receipt message to the customer (they press send). Null when the
  // invoice has no valid mobile number, in which case the button is hidden.
  const waHref = (group: Sale[]): string | null => {
    const first = group[0];
    const total = group.reduce((s, x) => s + x.total_amount, 0);
    const items = group.map((g) => `${g.medicine_name} x${g.quantity}`).join(', ');
    const pharmacy = getPharmacyProfile();
    const message =
      `Thank you for shopping at ${pharmacy.name || 'our pharmacy'}!\n\n` +
      `Invoice: ${first.invoice_number}\n` +
      `Date: ${formatDate(first.sale_date)}\n` +
      `Items: ${items}\n` +
      `Total: ${formatCurrency(total)}\n\n` +
      `Get well soon!`;
    return buildWhatsAppLink(first.mobile_number, message);
  };

  // Flag shown next to an invoice that has at least one return/refund against it.
  const returnFlag = (invoiceNumber: string) =>
    returnedInvoices.has(invoiceNumber) ? (
      <span
        title="This invoice has a return / refund"
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-semibold align-middle"
      >
        <RotateCcw size={10} /> Returned
      </span>
    ) : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">{PAGE_TITLES[datePreset]}</h1>
        <p className="text-gray-500 text-sm">{subtitleText} · {filteredGroups.length} invoices</p>
      </div>

      {/* Date Filter */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setDatePreset(key)}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                datePreset === key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {key === 'custom' && <Calendar size={13} />}
              {label}
            </button>
          ))}
        </div>
        {datePreset === 'custom' && (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              className="input-field py-1.5 text-sm w-auto"
              value={customStart}
              max={customEnd || todayISO()}
              onChange={(e) => setCustomStart(e.target.value)}
            />
            <span className="text-gray-400 text-sm">to</span>
            <input
              type="date"
              className="input-field py-1.5 text-sm w-auto"
              value={customEnd}
              min={customStart}
              max={todayISO()}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          className="input-field pl-10"
          placeholder="Search by medicine, invoice, customer or mobile..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            onClick={() => setSearch('')}
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Summary strip */}
      {filteredGroups.length > 0 && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5">
          <span className="text-sm text-gray-600">{filteredGroups.length} invoices · {filtered.length} medicines</span>
          <span className="font-bold text-blue-700">{formatCurrency(totalAmount)}</span>
        </div>
      )}

      {loading && <div className="text-center py-10 text-gray-400">Loading...</div>}

      {!loading && filteredGroups.length === 0 && (
        <div className="card text-center py-10 text-gray-400">
          {search ? `No results for "${search}"` : EMPTY_MESSAGES[datePreset]}
        </div>
      )}

      {/* Mobile Cards */}
      {!loading && filteredGroups.length > 0 && (
        <div className="space-y-3 sm:hidden">
          {shownGroups.map((group) => {
            const first = group[0];
            const groupTotal = group.reduce((s, x) => s + x.total_amount, 0);
            const wa = waHref(group);
            return (
              <div key={first.invoice_number} className="card space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedInvoiceNumber(first.invoice_number)}
                        className="font-mono text-sm text-blue-600 font-semibold hover:underline text-left"
                      >
                        {first.invoice_number}
                      </button>
                      {returnFlag(first.invoice_number)}
                    </div>
                    <p className="text-sm font-medium text-gray-900 mt-0.5">
                      {group.length === 1
                        ? first.medicine_name
                        : `${first.medicine_name} +${group.length - 1} more`}
                    </p>
                    {first.customer_name && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {first.customer_name}{first.mobile_number ? ` · ${first.mobile_number}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-gray-900">{formatCurrency(groupTotal)}</p>
                    {paymentBadge(first.payment_mode)}
                  </div>
                </div>
                <div className="pt-1 border-t border-gray-100 flex items-center gap-3">
                  <button
                    onClick={() => setEditingInvoiceSales(group)}
                    className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    <Pencil size={12} /> Edit Invoice
                  </button>
                  <button
                    onClick={() => printInvoice(group)}
                    className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700"
                  >
                    <Printer size={12} /> Print
                  </button>
                  {wa && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Send receipt on WhatsApp"
                      className="flex items-center gap-1.5 text-xs font-medium text-green-600 hover:text-green-700"
                    >
                      <MessageCircle size={12} /> WhatsApp
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Desktop Table */}
      {!loading && filteredGroups.length > 0 && (
        <div className="card hidden sm:block overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="table-header">Invoice</th>
                <th className="table-header">Medicines</th>
                <th className="table-header text-right">Total</th>
                <th className="table-header">Payment</th>
                <th className="table-header">Action</th>
              </tr>
            </thead>
            <tbody>
              {shownGroups.map((group) => {
                const first = group[0];
                const groupTotal = group.reduce((s, x) => s + x.total_amount, 0);
                const wa = waHref(group);
                return (
                  <tr key={first.invoice_number} className="hover:bg-gray-50 transition-colors">
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedInvoiceNumber(first.invoice_number)}
                          className="font-mono text-xs text-blue-600 hover:underline font-semibold"
                        >
                          {first.invoice_number}
                        </button>
                        {returnFlag(first.invoice_number)}
                      </div>
                      {first.customer_name && (
                        <p className="text-xs text-gray-500 mt-0.5">{first.customer_name}</p>
                      )}
                    </td>
                    <td className="table-cell text-gray-700 max-w-[260px] truncate">
                      {group.length === 1
                        ? first.medicine_name
                        : `${first.medicine_name} +${group.length - 1} more`}
                    </td>
                    <td className="table-cell text-right font-semibold">
                      {formatCurrency(groupTotal)}
                    </td>
                    <td className="table-cell">{paymentBadge(first.payment_mode)}</td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditingInvoiceSales(group)}
                          className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-1 rounded-md transition-colors"
                        >
                          <Pencil size={12} /> Edit
                        </button>
                        <button
                          onClick={() => printInvoice(group)}
                          className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 px-2 py-1 rounded-md transition-colors"
                        >
                          <Printer size={12} /> Print
                        </button>
                        {wa && (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Send receipt on WhatsApp"
                            className="flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-700 hover:bg-green-50 px-2 py-1 rounded-md transition-colors"
                          >
                            <MessageCircle size={12} /> WhatsApp
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-300">
                <td colSpan={2} className="px-3 py-2 text-sm font-semibold text-gray-600">
                  Total ({filteredGroups.length} invoices)
                </td>
                <td className="px-3 py-2 text-right font-bold text-gray-900">
                  {formatCurrency(totalAmount)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Lazy-load sentinel + progress indicator */}
      {!loading && filteredGroups.length > 0 && (
        <div ref={sentinelRef} className="py-3 text-center text-xs text-gray-400">
          {hasMore
            ? `Showing ${shownCount} of ${total} invoices — scroll for more…`
            : total > 150 && `All ${total} invoices shown`}
        </div>
      )}

      {/* Full Invoice Edit Overlay */}
      {editingInvoiceSales && (
        <InvoiceEditOverlay
          sales={editingInvoiceSales}
          onClose={() => setEditingInvoiceSales(null)}
          onSaved={handleInvoiceSaved}
        />
      )}

      {/* Invoice Detail Modal */}
      {invoiceModalSales && invoiceModalSales.length > 0 && (
        <InvoiceModal
          sales={invoiceModalSales}
          onClose={() => setSelectedInvoiceNumber(null)}
          onUpdateCustomer={handleUpdateCustomer}
          allowReturn
          onReturnRecorded={() => {
            const invoiceNumbers = [...new Set(sales.map((s) => s.invoice_number))];
            fetchReturnedInvoiceSet(invoiceNumbers).then(setReturnedInvoices);
          }}
        />
      )}

    </div>
  );
}
