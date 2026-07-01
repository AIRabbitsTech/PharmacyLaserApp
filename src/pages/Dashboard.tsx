import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Banknote, Smartphone, CreditCard, ShoppingCart,
  PlusCircle, TrendingUp, TrendingDown,
} from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import toast from 'react-hot-toast';
import { useSales } from '../hooks/useSales';
import { useCreditPayments } from '../hooks/useCreditPayments';
import { useCustomerOutstanding } from '../hooks/useCustomerOutstanding';
import { supabase } from '../utils/supabase';
import type { Sale, DashboardStats } from '../types';
import { formatCurrency, formatDateTime, todayISO } from '../utils/helpers';
import InvoiceModal from '../components/InvoiceModal';
import CreditModal, { type CustomerCredit } from '../components/CreditModal';
import { computeOutstandingByCustomer, customerKey } from '../utils/credit';

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

function computeStats(sales: Sale[]): DashboardStats {
  return {
    totalSales: sales.reduce((s, x) => s + x.total_amount, 0),
    cashSales: sales.filter((x) => x.payment_mode === 'Cash').reduce((s, x) => s + x.total_amount, 0),
    upiSales: sales.filter((x) => x.payment_mode === 'UPI').reduce((s, x) => s + x.total_amount, 0),
    creditSales: sales.filter((x) => x.payment_mode === 'Credit').reduce((s, x) => s + x.total_amount, 0),
    totalTransactions: sales.length,
  };
}

function calcGrowth(current: number, previous: number): number | null {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return 100; // first data — treat as full growth
  return ((current - previous) / previous) * 100;
}

function GrowthBadge({ current, previous, label, onDark = false }: { current: number; previous: number; label: string; onDark?: boolean }) {
  const pct = calcGrowth(current, previous);
  if (pct === null) return null;

  const up = pct > 0;
  const neutral = pct === 0;
  const isNew = previous === 0 && current > 0;

  const color = neutral
    ? onDark ? 'text-white/60' : 'text-gray-400'
    : up
    ? onDark ? 'text-green-300' : 'text-green-600'
    : onDark ? 'text-red-300' : 'text-red-500';

  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${color}`}>
      {!neutral && (up ? <TrendingUp size={12} /> : <TrendingDown size={12} />)}
      {isNew ? 'New' : neutral ? '0%' : `${up ? '+' : ''}${pct.toFixed(1)}%`}
      {!isNew && <span className={`font-normal ml-0.5 ${onDark ? 'text-white/60' : 'text-gray-400'}`}>vs {label}</span>}
    </span>
  );
}

interface PeriodTotals {
  total: number;
  invoices: number;
}

export default function Dashboard() {
  const { fetchSalesByDateRange } = useSales();
  const { recordPayment } = useCreditPayments();
  const { fetchOutstanding } = useCustomerOutstanding();
  const [sales, setSales] = useState<Sale[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Sale[] | null>(null);
  const invoiceGroups = useMemo(() => groupByInvoice(sales), [sales]);
  const [stats, setStats] = useState<DashboardStats>({
    totalSales: 0, cashSales: 0, upiSales: 0, creditSales: 0, totalTransactions: 0,
  });
  const [today, setToday] = useState<PeriodTotals>({ total: 0, invoices: 0 });
  const [yesterday, setYesterday] = useState<PeriodTotals>({ total: 0, invoices: 0 });
  const [thisMonth, setThisMonth] = useState<PeriodTotals>({ total: 0, invoices: 0 });
  const [lastMonth, setLastMonth] = useState<PeriodTotals>({ total: 0, invoices: 0 });
  const [allTimeCredit, setAllTimeCredit] = useState(0);
  const [creditByCustomer, setCreditByCustomer] = useState<CustomerCredit[]>([]);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [todayCreditByCustomer, setTodayCreditByCustomer] = useState<CustomerCredit[]>([]);
  const [showTodayCreditModal, setShowTodayCreditModal] = useState(false);

  useEffect(() => {
    const now = new Date();
    const todayStr = todayISO();
    const yesterdayStr = format(subDays(now, 1), 'yyyy-MM-dd');
    const thisMonthStart = format(startOfMonth(now), 'yyyy-MM-dd');
    const lastMonthStart = format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd');
    const lastMonthEnd = format(endOfMonth(subMonths(now, 1)), 'yyyy-MM-dd');

    Promise.all([
      fetchSalesByDateRange(todayStr, todayStr),
      fetchSalesByDateRange(yesterdayStr, yesterdayStr),
      fetchSalesByDateRange(thisMonthStart, todayStr),
      fetchSalesByDateRange(lastMonthStart, lastMonthEnd),
      supabase.from('sales').select('customer_name, mobile_number, total_amount, invoice_number, sale_date, payment_mode').eq('payment_mode', 'Credit'),
      supabase.from('credit_payments').select('customer_name, mobile_number, amount'),
      fetchOutstanding(),
    ]).then(([todayData, ydayData, thisMonthData, lastMonthData, creditRes, paymentsRes, outstandingRows]) => {
      const uniqueInvoices = (arr: Sale[]) =>
        new Set(arr.map((s) => s.invoice_number)).size;

      setSales(todayData);
      setStats(computeStats(todayData));

      // Today's credit breakdown by customer
      const todayCreditMap = new Map<string, CustomerCredit>();
      todayData.filter((x) => x.payment_mode === 'Credit').forEach((x) => {
        const key = customerKey(x.customer_name, x.mobile_number);
        if (!todayCreditMap.has(key)) {
          todayCreditMap.set(key, { name: x.customer_name || '—', mobile: x.mobile_number || '', amount: 0 });
        }
        todayCreditMap.get(key)!.amount += x.total_amount;
      });
      setTodayCreditByCustomer([...todayCreditMap.values()].sort((a, b) => b.amount - a.amount));
      setToday({ total: todayData.reduce((s, x) => s + x.total_amount, 0), invoices: uniqueInvoices(todayData) });
      setYesterday({ total: ydayData.reduce((s, x) => s + x.total_amount, 0), invoices: uniqueInvoices(ydayData) });
      setThisMonth({ total: thisMonthData.reduce((s, x) => s + x.total_amount, 0), invoices: uniqueInvoices(thisMonthData) });
      setLastMonth({ total: lastMonthData.reduce((s, x) => s + x.total_amount, 0), invoices: uniqueInvoices(lastMonthData) });

      // Net outstanding per customer. Prefer the authoritative customer_outstanding
      // SQL view; fall back to the shared client-side computation if it isn't
      // available yet (migration not run).
      const byCustomer: CustomerCredit[] = outstandingRows
        ? outstandingRows.map((row) => ({ customer_id: row.customer_id, name: row.customer_name, mobile: row.mobile_number, amount: row.outstanding }))
        : computeOutstandingByCustomer(creditRes.data || [], paymentsRes.data || [])
            .map((row) => ({ name: row.name, mobile: row.mobile, amount: row.total }));

      setCreditByCustomer(byCustomer);
      setAllTimeCredit(byCustomer.reduce((s, c) => s + c.amount, 0));
      setDataLoaded(true);
    });
  }, [fetchSalesByDateRange]);

  const handlePayOff = async (
    customer: CustomerCredit,
    amount: number,
    mode: 'Cash' | 'UPI',
    date: string,
    remarks: string,
  ) => {
    const ok = await recordPayment({
      customer_name: customer.name,
      mobile_number: customer.mobile || undefined,
      customer_id: customer.customer_id ?? undefined,
      amount,
      payment_mode: mode,
      paid_date: date,
      remarks,
    });
    if (ok) {
      toast.success(`Payment of ${formatCurrency(amount)} recorded for ${customer.name}`);
      // Optimistic update — subtract from local state immediately
      const paidKey = customerKey(customer.name, customer.mobile);
      setCreditByCustomer((prev) =>
        prev
          .map((c) => customerKey(c.name, c.mobile) === paidKey ? { ...c, amount: Math.max(0, c.amount - amount) } : c)
          .filter((c) => c.amount > 0),
      );
      setAllTimeCredit((prev) => Math.max(0, prev - amount));
    } else {
      toast.error('Failed to record payment');
    }
  };

  const paymentBadge = (mode: string) => {
    if (mode === 'Cash') return <span className="badge-cash">{mode}</span>;
    if (mode === 'UPI') return <span className="badge-upi">{mode}</span>;
    return <span className="badge-credit">{mode}</span>;
  };

  const loading = !dataLoaded;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Today's overview</p>
        </div>
        <Link
          to="/quick-sale"
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          <PlusCircle size={18} />
          <span className="hidden sm:inline">New Sale</span>
        </Link>
      </div>

      {/* Today's Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="stat-card bg-gradient-to-br from-blue-600 to-blue-700 text-white border-blue-600">
          <p className="text-xs font-medium text-blue-100 uppercase tracking-wide">Today</p>
          <p className="text-2xl font-bold mt-1">
            {loading ? '...' : formatCurrency(today.total)}
          </p>
          <p className="text-xs text-blue-200 mb-1">{today.invoices} invoices</p>
          {!loading && (
            <GrowthBadge current={today.total} previous={yesterday.total} label="yesterday" onDark />
          )}
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">Cash</p>
            <Banknote size={18} className="text-green-500" />
          </div>
          <p className="text-xl font-bold text-gray-900 mt-1">
            {loading ? '...' : formatCurrency(stats.cashSales)}
          </p>
          <p className="text-green-600 text-xs font-medium">Cash Sales</p>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">UPI</p>
            <Smartphone size={18} className="text-blue-500" />
          </div>
          <p className="text-xl font-bold text-gray-900 mt-1">
            {loading ? '...' : formatCurrency(stats.upiSales)}
          </p>
          <p className="text-blue-600 text-xs font-medium">UPI Sales</p>
        </div>

        <button
          type="button"
          onClick={() => setShowTodayCreditModal(true)}
          className="stat-card text-left w-full hover:shadow-md transition-all active:scale-[0.98]"
        >
          <div className="flex items-center justify-between">
            <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">Credit</p>
            <CreditCard size={18} className="text-orange-500" />
          </div>
          <p className="text-xl font-bold text-gray-900 mt-1">
            {loading ? '...' : formatCurrency(stats.creditSales)}
          </p>
          <p className="text-orange-600 text-xs font-medium">Today Credit Sales</p>
        </button>
      </div>

      {/* Period Comparison */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total Credit */}
        <button
          type="button"
          onClick={() => setShowCreditModal(true)}
          className="stat-card bg-gradient-to-br from-orange-500 to-orange-600 text-white border-orange-500 text-left w-full hover:from-orange-600 hover:to-orange-700 transition-all active:scale-[0.98]"
        >
          <div className="flex items-center justify-between">
            <p className="text-orange-100 text-xs font-medium uppercase tracking-wide">Total Credit</p>
            <CreditCard size={20} className="text-orange-200" />
          </div>
          <p className="text-2xl font-bold mt-1">
            {loading ? '...' : formatCurrency(allTimeCredit)}
          </p>
          <p className="text-orange-200 text-xs">Tap to view details</p>
        </button>

        {/* Yesterday */}
        <div className="stat-card border-l-4 border-l-gray-300">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Yesterday</p>
          <p className="text-lg font-bold text-gray-900 mt-1">
            {loading ? '...' : formatCurrency(yesterday.total)}
          </p>
          <p className="text-xs text-gray-400">{yesterday.invoices} invoices</p>
        </div>

        {/* This Month */}
        <div className="stat-card border-l-4 border-l-green-500">
          <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">This Month</p>
          <p className="text-lg font-bold text-gray-900 mt-1">
            {loading ? '...' : formatCurrency(thisMonth.total)}
          </p>
          <p className="text-xs text-gray-400 mb-1">{thisMonth.invoices} invoices</p>
          {!loading && (
            <GrowthBadge current={thisMonth.total} previous={lastMonth.total} label="last month" />
          )}
        </div>

        {/* Last Month */}
        <div className="stat-card border-l-4 border-l-gray-300">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Month</p>
          <p className="text-lg font-bold text-gray-900 mt-1">
            {loading ? '...' : formatCurrency(lastMonth.total)}
          </p>
          <p className="text-xs text-gray-400">{lastMonth.invoices} invoices</p>
        </div>
      </div>

      {/* Recent Sales */}
      <div className="card">
        <div className="section-header">
          <h2 className="font-semibold text-gray-900">Recent Transactions</h2>
          <Link to="/sales-list" className="text-blue-600 text-sm font-medium hover:underline">
            View All
          </Link>
        </div>

        {loading && (
          <div className="text-center py-8 text-gray-400">Loading...</div>
        )}

        {!loading && sales.length === 0 && (
          <div className="text-center py-10">
            <ShoppingCart size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 text-sm">No sales today yet</p>
            <Link
              to="/quick-sale"
              className="mt-3 inline-flex items-center gap-2 text-blue-600 text-sm font-medium hover:underline"
            >
              <PlusCircle size={16} /> Add first sale
            </Link>
          </div>
        )}

        {!loading && sales.length > 0 && (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="table-header">Invoice</th>
                  <th className="table-header">Customer</th>
                  <th className="table-header text-right">Total</th>
                  <th className="table-header">Payment</th>
                  <th className="table-header hidden sm:table-cell">Time</th>
                </tr>
              </thead>
              <tbody>
                {invoiceGroups.slice(0, 10).map((group) => {
                  const first = group[0];
                  const groupTotal = group.reduce((s, x) => s + x.total_amount, 0);
                  return (
                    <tr key={first.invoice_number} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell">
                        <button
                          onClick={() => setSelectedInvoice(group)}
                          className="font-mono text-xs text-blue-600 hover:underline font-semibold"
                        >
                          {first.invoice_number}
                        </button>
                      </td>
                      <td className="table-cell text-gray-700 max-w-[160px] truncate">{first.customer_name || '—'}</td>
                      <td className="table-cell text-right font-semibold text-gray-900">{formatCurrency(groupTotal)}</td>
                      <td className="table-cell">{paymentBadge(first.payment_mode)}</td>
                      <td className="hidden sm:table-cell px-3 py-3 text-xs text-gray-500 border-b border-gray-100">{formatDateTime(first.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedInvoice && (
        <InvoiceModal
          sales={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
        />
      )}

      {showCreditModal && (
        <CreditModal
          customers={creditByCustomer}
          total={allTimeCredit}
          onClose={() => setShowCreditModal(false)}
          onPayOff={handlePayOff}
        />
      )}

      {showTodayCreditModal && (
        <CreditModal
          title="Today's Credit Sales"
          customers={todayCreditByCustomer}
          total={stats.creditSales}
          onClose={() => setShowTodayCreditModal(false)}
        />
      )}
    </div>
  );
}
