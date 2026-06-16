import { useEffect, useState, useCallback } from 'react';
import {
  FileText, TrendingUp, Package, AlertTriangle,
  CreditCard, Users, Percent, Calendar,
} from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { useSales } from '../hooks/useSales';
import { supabase } from '../utils/supabase';
import type { Sale, ReportFilters } from '../types';
import { getDateRange, todayISO } from '../utils/helpers';
import SalesRegisterReport from '../components/reports/SalesRegisterReport';
import RevenueReport from '../components/reports/RevenueReport';
import MedicinesReport from '../components/reports/MedicinesReport';
import ExpiryReport from '../components/reports/ExpiryReport';
import CreditReport from '../components/reports/CreditReport';
import CustomerReport from '../components/reports/CustomerReport';
import DiscountReport from '../components/reports/DiscountReport';

// ── Date presets ──────────────────────────────────────────────────────────────
const PRESETS: { value: ReportFilters['preset']; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'custom', label: 'Custom' },
];

function buildDateLabel(filters: ReportFilters): string {
  const p = PRESETS.find((x) => x.value === filters.preset);
  if (filters.preset === 'custom') return `${filters.startDate} – ${filters.endDate}`;
  return p?.label || '';
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
type TabId = 'register' | 'revenue' | 'medicines' | 'expiry' | 'credit' | 'customers' | 'discounts';

const TABS: { id: TabId; label: string; icon: React.ElementType; shortLabel: string }[] = [
  { id: 'register',  label: 'Sales Register', shortLabel: 'Register',  icon: FileText     },
  { id: 'revenue',   label: 'Revenue',         shortLabel: 'Revenue',   icon: TrendingUp   },
  { id: 'medicines', label: 'Medicines',        shortLabel: 'Medicines', icon: Package      },
  { id: 'expiry',    label: 'Expiry',           shortLabel: 'Expiry',    icon: AlertTriangle },
  { id: 'credit',    label: 'Credit Ledger',    shortLabel: 'Credit',    icon: CreditCard   },
  { id: 'customers', label: 'Customers',        shortLabel: 'Customers', icon: Users        },
  { id: 'discounts', label: 'Discounts',        shortLabel: 'Discounts', icon: Percent      },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function Reports() {
  const { fetchSalesByDateRange, loading } = useSales();

  const today = todayISO();
  const [filters, setFilters] = useState<ReportFilters>({ preset: 'today', startDate: today, endDate: today });
  const [sales, setSales] = useState<Sale[]>([]);
  const [allSales, setAllSales] = useState<Sale[]>([]);
  const [creditPayments, setCreditPayments] = useState<{ customer_name: string; amount: number }[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('register');

  // Load date-filtered sales
  const loadSales = useCallback(async (f: ReportFilters) => {
    const range = getDateRange(f.preset, f.startDate, f.endDate);
    const data = await fetchSalesByDateRange(range.start, range.end);
    setSales(data);
  }, [fetchSalesByDateRange]);

  // Load all-time sales and all credit payments once.
  useEffect(() => {
    Promise.all([
      supabase
        .from('sales')
        .select('*')
        .gte('sale_date', '2020-01-01')
        .lte('sale_date', todayISO())
        .order('created_at', { ascending: false }),
      supabase
        .from('credit_payments')
        .select('customer_name, amount'),
    ]).then(([salesRes, paymentsRes]) => {
      setAllSales(salesRes.data || []);
      setCreditPayments(paymentsRes.data || []);
    });
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadSales(filters); }, []);

  // ── Date filter handlers ────────────────────────────────────────────────────
  const handlePreset = (preset: ReportFilters['preset']) => {
    const now = new Date();
    let next: ReportFilters;
    switch (preset) {
      case 'today':
        next = { preset, startDate: todayISO(), endDate: todayISO() }; break;
      case 'yesterday': {
        const y = format(subDays(now, 1), 'yyyy-MM-dd');
        next = { preset, startDate: y, endDate: y }; break;
      }
      case 'last_7_days':
        next = { preset, startDate: format(subDays(now, 6), 'yyyy-MM-dd'), endDate: todayISO() }; break;
      case 'this_month':
        next = { preset, startDate: format(startOfMonth(now), 'yyyy-MM-dd'), endDate: format(endOfMonth(now), 'yyyy-MM-dd') }; break;
      case 'last_month': {
        const lm = subMonths(now, 1);
        next = { preset, startDate: format(startOfMonth(lm), 'yyyy-MM-dd'), endDate: format(endOfMonth(lm), 'yyyy-MM-dd') }; break;
      }
      default:
        next = { ...filters, preset };
    }
    setFilters(next);
    if (preset !== 'custom') loadSales(next);
  };

  const handleCustomDate = (field: 'startDate' | 'endDate', value: string) => {
    setFilters((prev) => ({ ...prev, [field]: value, preset: 'custom' }));
  };

  const dateLabel = buildDateLabel(filters);
  const creditCount = sales.filter((s) => s.payment_mode === 'Credit').length;

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div>
        <h1 className="page-title">Reports</h1>
        <p className="text-gray-500 text-sm mt-0.5">{dateLabel}</p>
      </div>

      {/* Date filter */}
      <div className="card space-y-3">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => handlePreset(p.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                filters.preset === p.value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {filters.preset === 'custom' && (
          <div className="flex flex-wrap items-end gap-3 pt-1">
            <div>
              <label className="label">From</label>
              <input
                type="date" className="input-field" value={filters.startDate}
                max={filters.endDate}
                onChange={(e) => handleCustomDate('startDate', e.target.value)}
              />
            </div>
            <div>
              <label className="label">To</label>
              <input
                type="date" className="input-field" value={filters.endDate}
                min={filters.startDate}
                onChange={(e) => handleCustomDate('endDate', e.target.value)}
              />
            </div>
            <button
              onClick={() => loadSales(filters)}
              className="px-5 py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="text-center py-10 text-gray-400 text-sm">Loading…</div>
      )}

      {!loading && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Tab navigation */}
          <div className="flex overflow-x-auto border-b border-gray-200 scrollbar-none">
            {TABS.map(({ id, label, shortLabel, icon: Icon }) => {
              const isActive = activeTab === id;
              const badge = id === 'credit' && creditCount > 0 ? creditCount : null;
              const isExpiry = id === 'expiry';
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-2 px-4 py-3.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors flex-shrink-0 relative ${
                    isActive
                      ? isExpiry
                        ? 'border-orange-500 text-orange-600 bg-orange-50/40'
                        : 'border-blue-600 text-blue-600 bg-blue-50/30'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={15} />
                  <span className="hidden sm:inline">{label}</span>
                  <span className="sm:hidden">{shortLabel}</span>
                  {badge && (
                    <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-orange-500 text-white text-[10px] font-bold">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="p-5">
            {activeTab === 'register' && (
              <SalesRegisterReport sales={sales} dateLabel={dateLabel} startDate={filters.startDate} />
            )}
            {activeTab === 'revenue' && (
              <RevenueReport sales={sales} />
            )}
            {activeTab === 'medicines' && (
              <MedicinesReport sales={sales} />
            )}
            {activeTab === 'expiry' && (
              <ExpiryReport />
            )}
            {activeTab === 'credit' && (
              <CreditReport sales={sales} allSales={allSales} creditPayments={creditPayments} />
            )}
            {activeTab === 'customers' && (
              <CustomerReport sales={sales} allSales={allSales} />
            )}
            {activeTab === 'discounts' && (
              <DiscountReport sales={sales} />
            )}

            {/* Empty state for date-filtered tabs */}
            {sales.length === 0 && activeTab !== 'expiry' && !loading && (
              <div className="text-center py-16 text-gray-400">
                <Calendar size={40} className="mx-auto text-gray-300 mb-3" />
                <p className="text-sm">No sales data for this period.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
