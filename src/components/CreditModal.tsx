import { Fragment, useState } from 'react';
import { X, User, CheckCircle, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency, todayISO } from '../utils/helpers';

export interface CustomerCredit {
  name: string;
  mobile: string;
  amount: number;
}

interface PayOffForm {
  amount: string;
  mode: 'Cash' | 'UPI';
  date: string;
  remarks: string;
}

interface Props {
  customers: CustomerCredit[];
  total: number;
  title?: string;
  onClose: () => void;
  onPayOff?: (
    customer: CustomerCredit,
    amount: number,
    mode: 'Cash' | 'UPI',
    date: string,
    remarks: string,
  ) => Promise<void>;
}

export default function CreditModal({
  customers,
  total,
  title = 'Credit Outstanding',
  onClose,
  onPayOff,
}: Props) {
  const [search, setSearch] = useState('');
  const [payingOff, setPayingOff] = useState<string | null>(null);
  const [form, setForm] = useState<PayOffForm>({ amount: '', mode: 'Cash', date: todayISO(), remarks: '' });
  const [saving, setSaving] = useState(false);

  const openPayOff = (c: CustomerCredit) => {
    setPayingOff(c.name);
    setForm({ amount: c.amount.toFixed(2), mode: 'Cash', date: todayISO(), remarks: '' });
  };

  const handleConfirm = async (c: CustomerCredit) => {
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    if (!onPayOff) return;
    setSaving(true);
    await onPayOff(c, amt, form.mode, form.date, form.remarks);
    setSaving(false);
    setPayingOff(null);
  };

  const filtered = search.trim()
    ? customers.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()))
    : customers;

  const colSpan = onPayOff ? 4 : 3;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Net outstanding per customer</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        {customers.length > 0 && (
          <div className="px-5 py-3 border-b border-gray-100">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search customer…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
          </div>
        )}

        {/* List */}
        <div className="overflow-y-auto flex-1">
          {customers.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">No outstanding credit</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">No customers match "{search}"</div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">#</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Outstanding</th>
                  {onPayOff && <th className="px-5 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((c, i) => (
                  <Fragment key={`${c.name}-${i}`}>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5 text-sm text-gray-400 font-medium">{i + 1}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                            <User size={13} className="text-orange-600" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{c.name || '—'}</p>
                            {c.mobile && <p className="text-xs text-gray-400">{c.mobile}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="text-sm font-bold text-orange-600">{formatCurrency(c.amount)}</span>
                      </td>
                      {onPayOff && (
                        <td className="px-5 py-3.5 text-right">
                          {payingOff === c.name ? (
                            <button
                              onClick={() => setPayingOff(null)}
                              className="text-xs text-gray-400 hover:text-gray-600"
                            >
                              Cancel
                            </button>
                          ) : (
                            <button
                              onClick={() => openPayOff(c)}
                              className="text-xs font-semibold text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100 px-2.5 py-1 rounded-full transition-colors"
                            >
                              Pay Off
                            </button>
                          )}
                        </td>
                      )}
                    </tr>

                    {/* Inline pay-off form */}
                    {payingOff === c.name && (
                      <tr>
                        <td colSpan={colSpan} className="px-5 py-3 bg-green-50 border-l-4 border-green-400">
                          <div className="space-y-2.5">
                            <p className="text-xs font-semibold text-green-700">Record Payment — {c.name}</p>
                            <div className="flex gap-2 flex-wrap items-center">
                              <input
                                type="number"
                                className="input-field py-1.5 text-sm w-32"
                                placeholder="Amount"
                                value={form.amount}
                                min="0.01"
                                step="0.01"
                                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                              />
                              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
                                {(['Cash', 'UPI'] as const).map((m) => (
                                  <button
                                    key={m}
                                    type="button"
                                    onClick={() => setForm((f) => ({ ...f, mode: m }))}
                                    className={`px-3 py-1.5 font-medium transition-colors ${
                                      form.mode === m
                                        ? 'bg-green-600 text-white'
                                        : 'bg-white text-gray-600 hover:bg-gray-50'
                                    }`}
                                  >
                                    {m}
                                  </button>
                                ))}
                              </div>
                              <input
                                type="date"
                                className="input-field py-1.5 text-sm w-auto"
                                value={form.date}
                                max={todayISO()}
                                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                              />
                            </div>
                            <div className="flex gap-2 items-center">
                              <input
                                type="text"
                                className="input-field py-1.5 text-sm flex-1"
                                placeholder="Remarks (optional)"
                                value={form.remarks}
                                onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
                              />
                              <button
                                onClick={() => handleConfirm(c)}
                                disabled={saving}
                                className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                              >
                                <CheckCircle size={15} />
                                {saving ? 'Saving…' : 'Confirm'}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 bg-orange-50 rounded-b-2xl">
          <span className="text-sm font-semibold text-gray-700">Total Outstanding</span>
          <span className="text-lg font-bold text-orange-600">{formatCurrency(total)}</span>
        </div>
      </div>
    </div>
  );
}
