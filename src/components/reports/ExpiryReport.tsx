import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { formatDate } from '../../utils/helpers';

interface ExpiryRecord {
  medicine_name: string;
  batch_number?: string;
  expiry_date: string;
  sale_date: string;
}

type RiskLevel = 'expired' | 'critical' | 'warning' | 'watch';

interface ExpiryRow {
  medicine: string;
  batch: string;
  expiry: string;
  expiryDate: Date;
  lastSold: string;
  risk: RiskLevel;
  daysLeft: number;
}

function parseExpiry(mmyy: string): Date | null {
  if (!mmyy || !mmyy.includes('/')) return null;
  const [mm, yy] = mmyy.split('/');
  const month = parseInt(mm, 10);
  const year = parseInt('20' + yy, 10);
  if (isNaN(month) || isNaN(year) || month < 1 || month > 12) return null;
  return new Date(year, month, 0); // last day of that month
}

function getRisk(daysLeft: number): RiskLevel {
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 30) return 'critical';
  if (daysLeft <= 90) return 'warning';
  return 'watch';
}

const RISK_CONFIG: Record<RiskLevel, { label: string; color: string; bg: string; icon: React.ReactNode; order: number }> = {
  expired: { label: 'Expired', color: 'text-red-700', bg: 'bg-red-100 text-red-700', icon: <XCircle size={14} />, order: 0 },
  critical: { label: '< 1 Month', color: 'text-orange-700', bg: 'bg-orange-100 text-orange-700', icon: <AlertTriangle size={14} />, order: 1 },
  warning: { label: '1–3 Months', color: 'text-yellow-700', bg: 'bg-yellow-100 text-yellow-700', icon: <Clock size={14} />, order: 2 },
  watch: { label: '3–6 Months', color: 'text-blue-700', bg: 'bg-blue-100 text-blue-700', icon: <CheckCircle size={14} />, order: 3 },
};

interface Props {
  search?: string;
}

export default function ExpiryReport({ search = '' }: Props) {
  const [records, setRecords] = useState<ExpiryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRisk, setFilterRisk] = useState<RiskLevel | 'all'>('all');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('sales')
        .select('medicine_name, batch_number, expiry_date, sale_date')
        .not('expiry_date', 'is', null)
        .neq('expiry_date', '')
        .order('sale_date', { ascending: false });
      setRecords((data || []) as ExpiryRecord[]);
      setLoading(false);
    })();
  }, []);

  const rows = useMemo((): ExpiryRow[] => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Deduplicate by medicine+batch+expiry — keep most recent sale_date
    const seen = new Map<string, ExpiryRecord>();
    for (const r of records) {
      const key = `${r.medicine_name.trim().toLowerCase()}||${(r.batch_number || '').trim()}||${r.expiry_date}`;
      if (!seen.has(key) || r.sale_date > seen.get(key)!.sale_date) {
        seen.set(key, r);
      }
    }

    const result: ExpiryRow[] = [];
    for (const r of seen.values()) {
      const expDate = parseExpiry(r.expiry_date);
      if (!expDate) continue;
      const daysLeft = Math.floor((expDate.getTime() - today.getTime()) / 86400000);
      if (daysLeft > 180) continue; // only show ≤ 6 months window
      result.push({
        medicine: r.medicine_name.trim(),
        batch: r.batch_number?.trim() || '—',
        expiry: r.expiry_date,
        expiryDate: expDate,
        lastSold: r.sale_date,
        risk: getRisk(daysLeft),
        daysLeft,
      });
    }
    return result.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [records]);

  const counts = useMemo(() => {
    const c: Record<RiskLevel, number> = { expired: 0, critical: 0, warning: 0, watch: 0 };
    for (const r of rows) c[r.risk]++;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const byRisk = filterRisk === 'all' ? rows : rows.filter((r) => r.risk === filterRisk);
    const q = search.trim().toLowerCase();
    if (!q) return byRisk;
    return byRisk.filter((r) => r.medicine.toLowerCase().includes(q) || r.batch.toLowerCase().includes(q));
  }, [rows, filterRisk, search]);

  if (loading) {
    return <p className="text-center py-16 text-gray-400 text-sm">Loading expiry data…</p>;
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <CheckCircle size={40} className="mx-auto text-green-400 mb-3" />
        <p className="text-sm">No medicines expiring within 6 months.</p>
        <p className="text-xs text-gray-300 mt-1">Only medicines with expiry dates recorded in sales are shown.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
        Shows all medicines with expiry dates recorded in sales, expiring within 6 months.
        Data from all-time sales records — independent of the date filter above.
      </p>

      {/* Risk summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(Object.entries(RISK_CONFIG) as [RiskLevel, typeof RISK_CONFIG[RiskLevel]][]).map(([level, cfg]) => (
          <button
            key={level}
            onClick={() => setFilterRisk(filterRisk === level ? 'all' : level)}
            className={`rounded-xl border-2 p-4 text-left transition-all ${
              filterRisk === level
                ? 'border-current shadow-sm scale-[1.02]'
                : 'border-gray-200 hover:border-gray-300'
            } ${cfg.color}`}
          >
            <div className="flex items-center gap-2 mb-1">
              {cfg.icon}
              <span className="text-xs font-bold uppercase tracking-wide">{cfg.label}</span>
            </div>
            <p className="text-3xl font-bold">{counts[level]}</p>
            <p className="text-xs opacity-70 mt-0.5">batches</p>
          </button>
        ))}
      </div>

      {filterRisk !== 'all' && (
        <button
          onClick={() => setFilterRisk('all')}
          className="text-xs text-blue-600 hover:underline font-medium"
        >
          ← Show all
        </button>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">
            {filterRisk === 'all' ? 'All Expiring Medicines' : RISK_CONFIG[filterRisk].label}
          </h3>
          <span className="text-xs text-gray-400">{visible.length} batches</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="table-header">#</th>
                <th className="table-header">Medicine</th>
                <th className="table-header">Batch</th>
                <th className="table-header">Expiry</th>
                <th className="table-header text-right">Days Left</th>
                <th className="table-header">Last Sold</th>
                <th className="table-header">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-gray-400 text-sm">No medicines match "{search}"</td>
                </tr>
              )}
              {visible.map((row, idx) => {
                const cfg = RISK_CONFIG[row.risk];
                return (
                  <tr key={`${row.medicine}-${row.batch}-${row.expiry}`} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="table-cell text-center text-xs text-gray-400">{idx + 1}</td>
                    <td className="table-cell font-medium text-gray-800">{row.medicine}</td>
                    <td className="table-cell text-gray-500 font-mono text-xs">{row.batch}</td>
                    <td className="table-cell font-semibold text-gray-700">{row.expiry}</td>
                    <td className={`table-cell text-right font-bold tabular-nums ${cfg.color}`}>
                      {row.daysLeft < 0 ? `${Math.abs(row.daysLeft)}d ago` : `${row.daysLeft}d`}
                    </td>
                    <td className="table-cell text-gray-500 text-xs">{formatDate(row.lastSold)}</td>
                    <td className="table-cell">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.bg}`}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
