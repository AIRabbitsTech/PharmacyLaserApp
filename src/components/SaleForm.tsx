import { useEffect, useRef, useMemo, useState } from 'react';
import { Plus, Trash2, Copy, AlertTriangle } from 'lucide-react';
import type { SaleFormData, MedicineItem, PaymentMode } from '../types';
import { formatGrandTotal } from '../utils/helpers';
import { canonicalizeMedicineName } from '../utils/medicine';
import AutocompleteInput from './AutocompleteInput';

const paymentModes: PaymentMode[] = ['Cash', 'UPI', 'Credit'];

interface SaleFormProps {
  formData: SaleFormData;
  onFieldChange: (field: keyof Omit<SaleFormData, 'medicines'>, value: string) => void;
  onMedicineChange: (index: number, field: keyof MedicineItem, value: string) => void;
  onAddMedicine: () => void;
  onRemoveMedicine: (index: number) => void;
  onDuplicateMedicine?: (index: number) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  loading: boolean;
  isEdit?: boolean;
  customerSuggestions?: string[];
  mobileSuggestions?: string[];
  medicineSuggestions?: string[];
  // mobile -> distinct names already on file, used to flag a shared/mismatched number
  mobileOwners?: Map<string, string[]>;
  onMedicineNameSelect?: (index: number, name: string) => void;
  submitLabel?: string;
}

// Input that fills the entire table cell — no own border, gets bg on focus
const ci = 'w-full px-3 py-4 text-sm bg-transparent focus:outline-none focus:bg-blue-50 text-gray-800 placeholder-gray-300 transition-colors';

// Auto-formats expiry as MM/YY; handles backspace without looping
function fmtExpiry(raw: string, prev: string): string {
  let v = raw.replace(/[^\d/]/g, '');
  const isDeleting = v.length < prev.replace(/[^\d/]/g, '').length;
  if (!isDeleting && /^\d{2}$/.test(v)) v += '/';
  return v.slice(0, 5);
}

export default function SaleForm({
  formData,
  onFieldChange,
  onMedicineChange,
  onAddMedicine,
  onRemoveMedicine,
  onDuplicateMedicine,
  onSubmit,
  loading,
  isEdit = false,
  customerSuggestions = [],
  mobileSuggestions = [],
  medicineSuggestions = [],
  mobileOwners,
  onMedicineNameSelect,
  submitLabel,
}: SaleFormProps) {
  const lastRowRef = useRef<HTMLTableRowElement>(null);
  const lastMedInputRef = useRef<HTMLInputElement>(null);
  const prevCount = useRef(formData.medicines.length);
  const [dismissedMobile, setDismissedMobile] = useState('');

  // Warn (don't block) when the entered mobile is already on file under a
  // different name — a typo'd duplicate or a shared household number.
  const mob = formData.mobile_number.trim();
  const typedName = formData.customer_name.trim().toLowerCase();
  const conflictOwners = (mob.length >= 10 ? mobileOwners?.get(mob) ?? [] : [])
    .filter((n) => n.trim().toLowerCase() !== typedName);
  const showMobileWarning = conflictOwners.length > 0 && mob !== dismissedMobile;

  const blockEnterOnInputs = (e: React.KeyboardEvent<HTMLFormElement>) => {
    const tag = (e.target as HTMLElement).tagName;
    if (e.key === 'Enter' && tag !== 'BUTTON' && tag !== 'TEXTAREA') {
      e.preventDefault();
    }
  };

  // Total = (Qty × MRP) − Discount
  const subtotal = useMemo(
    () => formData.medicines.reduce((s, m) => s + (parseFloat(m.total_amount) || 0), 0),
    [formData.medicines],
  );
  const billDiscount = parseFloat(formData.bill_discount) || 0;
  const grandTotal = Math.max(0, subtotal * (1 - billDiscount / 100));

  useEffect(() => {
    if (formData.medicines.length > prevCount.current) {
      lastRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      // Focus after scroll settles so dropdown positions correctly
      setTimeout(() => lastMedInputRef.current?.focus(), 250);
    }
    prevCount.current = formData.medicines.length;
  }, [formData.medicines.length]);

  // ── EDIT MODE ─────────────────────────────────────────────────────────────
  if (isEdit) {
    const med = formData.medicines[0];
    if (!med) return null;
    return (
      <form onSubmit={onSubmit} onKeyDown={blockEnterOnInputs} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label">Medicine Name *</label>
            <input type="text" className="input-field" value={med.medicine_name}
              onChange={(e) => onMedicineChange(0, 'medicine_name', e.target.value)} required />
          </div>
          <div>
            <label className="label">Batch No</label>
            <input type="text" className="input-field" value={med.batch_number}
              onChange={(e) => onMedicineChange(0, 'batch_number', e.target.value)} />
          </div>
          <div>
            <label className="label">Expiry</label>
            <input type="text" className="input-field" placeholder="MM/YY" value={med.expiry_date}
              onChange={(e) => onMedicineChange(0, 'expiry_date', fmtExpiry(e.target.value, med.expiry_date))} />
          </div>
          <div>
            <label className="label">Qty *</label>
            <input type="number" className="input-field" value={med.quantity}
              min="1" step="1"
              onChange={(e) => onMedicineChange(0, 'quantity', e.target.value)} required />
          </div>
          <div>
            <label className="label">MRP (₹) *</label>
            <input type="number" className="input-field" value={med.mrp}
              min="0" step="0.01"
              onChange={(e) => onMedicineChange(0, 'mrp', e.target.value)} required />
          </div>
          <div>
            <label className="label">Disc (%)</label>
            <input type="number" className="input-field" value={med.discount}
              min="0" max="100" step="0.01"
              onChange={(e) => onMedicineChange(0, 'discount', e.target.value)} />
          </div>
          <div>
            <label className="label">Total (₹)</label>
            <input type="number" className="input-field bg-blue-50 font-semibold"
              value={med.total_amount} readOnly tabIndex={-1} />
          </div>
        </div>

        <div>
          <label className="label">Payment Mode *</label>
          <div className="grid grid-cols-3 gap-2">
            {paymentModes.map((mode) => (
              <button key={mode} type="button"
                onClick={() => onFieldChange('payment_mode', mode)}
                className={`py-3 rounded-lg text-sm font-semibold border-2 transition-all ${
                  formData.payment_mode === mode
                    ? mode === 'Cash' ? 'bg-green-600 border-green-600 text-white'
                    : mode === 'UPI' ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-orange-500 border-orange-500 text-white'
                    : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                }`}>
                {mode}
              </button>
            ))}
          </div>
        </div>

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Saving...' : 'Update Sale'}
        </button>
      </form>
    );
  }

  // ── BILLING MODE ──────────────────────────────────────────────────────────
  return (
    <form onSubmit={onSubmit} onKeyDown={blockEnterOnInputs} className="divide-y divide-gray-100">

      {/* ── Customer ──────────────────────────────────────────────────────── */}
      <div className="p-5">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Customer Info</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Customer Name</label>
            <AutocompleteInput
              value={formData.customer_name}
              onChange={(v) => {
                const sepIdx = v.indexOf(' | ');
                if (sepIdx !== -1) {
                  onFieldChange('customer_name', v.slice(0, sepIdx));
                  onFieldChange('mobile_number', v.slice(sepIdx + 3));
                } else {
                  onFieldChange('customer_name', v);
                }
              }}
              suggestions={customerSuggestions}
              placeholder="Optional"
              className="input-field"
            />
          </div>
          <div>
            <label className="label">Mobile Number</label>
            <AutocompleteInput
              value={formData.mobile_number}
              onChange={(v) => onFieldChange('mobile_number', v.replace(/\D/g, '').slice(0, 10))}
              onSelect={(v) => {
                const sepIdx = v.indexOf(' | ');
                if (sepIdx !== -1) {
                  onFieldChange('mobile_number', v.slice(0, sepIdx));
                  onFieldChange('customer_name', v.slice(sepIdx + 3));
                } else {
                  onFieldChange('mobile_number', v);
                }
              }}
              suggestions={mobileSuggestions}
              placeholder="Optional"
              className="input-field"
              inputType="tel"
              maxLength={10}
            />
          </div>
        </div>

        {/* Soft warning: mobile already linked to a different customer */}
        {showMobileWarning && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <AlertTriangle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 text-sm">
              <p className="text-amber-800">
                Mobile <span className="font-semibold">{mob}</span> is already registered with{' '}
                {conflictOwners.map((n, i) => (
                  <span key={n}>{i > 0 ? ', ' : ''}<span className="font-semibold">{n}</span></span>
                ))}.
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {conflictOwners.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => { onFieldChange('customer_name', n); setDismissedMobile(mob); }}
                    className="text-xs font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-full transition-colors"
                  >
                    Use "{n}"
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setDismissedMobile(mob)}
                  className="text-xs font-medium text-amber-600 hover:text-amber-800 px-1.5 py-1"
                >
                  Different person — keep "{formData.customer_name.trim() || 'no name'}"
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Medicine Grid ──────────────────────────────────────────────────── */}
      <div>
        {/* Section bar */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Medicines</p>
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold">
              {formData.medicines.length}
            </span>
          </div>
          <button type="button" onClick={onAddMedicine} tabIndex={-1}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm">
            <Plus size={15} /> Add Medicine
          </button>
        </div>

        {/* Scrollable table with spreadsheet feel */}
        <div className="overflow-x-auto">
          <table className="min-w-[960px] w-full border-collapse">
            <thead>
              <tr className="bg-gray-700 text-white">
                <th className="border-r border-gray-600 px-3 py-4 text-center w-12 text-xs font-semibold tracking-wide">#</th>
                <th className="border-r border-gray-600 px-3 py-4 text-left text-sm font-semibold tracking-wide min-w-[260px]">Medicine Name *</th>
                <th className="border-r border-gray-600 px-3 py-4 text-left text-sm font-semibold tracking-wide w-[110px]">Batch</th>
                <th className="border-r border-gray-600 px-3 py-4 text-left text-sm font-semibold tracking-wide w-[100px]">Expiry</th>
                <th className="border-r border-gray-600 px-3 py-4 text-right text-sm font-semibold tracking-wide w-[90px]">Qty *</th>
                <th className="border-r border-gray-600 px-3 py-4 text-right text-sm font-semibold tracking-wide w-[110px]">MRP (₹) *</th>
                <th className="border-r border-gray-600 px-3 py-4 text-right text-sm font-semibold tracking-wide w-[95px]">Disc (%)</th>
                <th className="border-r border-gray-600 px-3 py-4 text-right text-sm font-semibold tracking-wide w-[120px] bg-blue-900">Total (₹)</th>
                <th className="px-2 py-4 w-[64px]"></th>
              </tr>
            </thead>
            <tbody>
              {formData.medicines.map((med, idx) => {
                const isLast = idx === formData.medicines.length - 1;
                const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50';
                return (
                  <tr
                    key={idx}
                    ref={isLast ? lastRowRef : undefined}
                    className={`${rowBg} border-b border-gray-200 hover:bg-blue-50/40 group transition-colors`}
                  >
                    {/* # */}
                    <td className="border-r border-gray-200 text-center px-2 py-4">
                      <span className="text-sm text-gray-400 font-semibold select-none">{idx + 1}</span>
                    </td>

                    {/* Medicine Name */}
                    <td className="border-r border-gray-200 p-0">
                      <AutocompleteInput
                        ref={isLast ? lastMedInputRef : undefined}
                        value={med.medicine_name}
                        onChange={(v) => onMedicineChange(idx, 'medicine_name', v)}
                        onSelect={(v) => onMedicineNameSelect?.(idx, v)}
                        transformOnBlur={(v) => canonicalizeMedicineName(v, medicineSuggestions)}
                        suggestions={medicineSuggestions}
                        placeholder="Enter medicine name"
                        className={ci}
                      />
                    </td>

                    {/* Batch */}
                    <td className="border-r border-gray-200 p-0">
                      <input type="text" className={ci} placeholder="Batch no."
                        value={med.batch_number}
                        onChange={(e) => onMedicineChange(idx, 'batch_number', e.target.value)} />
                    </td>

                    {/* Expiry */}
                    <td className="border-r border-gray-200 p-0">
                      <input type="text" className={ci} placeholder="MM/YY"
                        value={med.expiry_date}
                        onChange={(e) => onMedicineChange(idx, 'expiry_date', fmtExpiry(e.target.value, med.expiry_date))} />
                    </td>

                    {/* Qty */}
                    <td className="border-r border-gray-200 p-0">
                      <input type="number" className={`${ci} text-right`} placeholder="0"
                        min="1" step="1"
                        value={med.quantity}
                        onChange={(e) => onMedicineChange(idx, 'quantity', e.target.value)} />
                    </td>

                    {/* MRP */}
                    <td className="border-r border-gray-200 p-0">
                      <input type="number" className={`${ci} text-right`} placeholder="0.00"
                        min="0" step="0.01"
                        value={med.mrp}
                        onChange={(e) => onMedicineChange(idx, 'mrp', e.target.value)} />
                    </td>

                    {/* Discount */}
                    <td className="border-r border-gray-200 p-0">
                      <input type="number" className={`${ci} text-right`} placeholder="0"
                        min="0" max="100" step="0.01"
                        value={med.discount}
                        onChange={(e) => onMedicineChange(idx, 'discount', e.target.value)} />
                    </td>

                    {/* Total (computed, read-only — excluded from tab order) */}
                    <td className="border-r border-gray-200 bg-blue-50/60 px-3 py-4">
                      <span className="block text-right text-base font-bold text-blue-700 tabular-nums">
                        {med.total_amount ? `₹${parseFloat(med.total_amount).toFixed(2)}` : '—'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-1 py-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {onDuplicateMedicine && (
                          <button type="button" onClick={() => onDuplicateMedicine(idx)}
                            tabIndex={-1}
                            className="p-2 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
                            title="Duplicate">
                            <Copy size={15} />
                          </button>
                        )}
                        <button type="button" onClick={() => onRemoveMedicine(idx)}
                          disabled={formData.medicines.length === 1}
                          tabIndex={-1}
                          title="Remove"
                          className={`p-2 rounded transition-colors ${
                            formData.medicines.length === 1
                              ? 'text-gray-200 cursor-not-allowed'
                              : 'text-gray-300 hover:text-red-500 hover:bg-red-50'
                          }`}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Add row — secondary link */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
          <button type="button" onClick={onAddMedicine}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-semibold">
            <Plus size={14} /> Add another medicine
          </button>
        </div>
      </div>

      {/* ── Bill Summary ──────────────────────────────────────────────────── */}
      <div className="px-5 py-5">
        <div className="flex justify-end">
          <div className="w-full max-w-sm bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
            {/* Subtotal row */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <span className="text-sm text-gray-500 font-medium">Subtotal</span>
              <span className="text-sm font-semibold text-gray-800 tabular-nums">₹{subtotal.toFixed(2)}</span>
            </div>
            {/* Bill discount row */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <span className="text-sm text-gray-500 font-medium">Bill Discount (%)</span>
              <input
                type="number"
                className="w-28 text-right border-2 border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:border-blue-500 focus:outline-none transition-colors"
                placeholder="0"
                min="0" max="100" step="0.01"
                value={formData.bill_discount}
                onChange={(e) => onFieldChange('bill_discount', e.target.value)}
              />
            </div>
            {/* Grand total row */}
            <div className="flex items-center justify-between px-4 py-4 bg-blue-600 text-white">
              <span className="font-bold text-base">Grand Total</span>
              <span className="text-2xl font-bold tabular-nums">{formatGrandTotal(grandTotal)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Payment Mode ──────────────────────────────────────────────────── */}
      <div className="px-5 py-5">
        <label className="label">Payment Mode *</label>
        <div className="grid grid-cols-3 gap-3">
          {paymentModes.map((mode) => (
            <button key={mode} type="button"
              onClick={() => onFieldChange('payment_mode', mode)}
              className={`py-3.5 rounded-xl text-sm font-bold border-2 transition-all ${
                formData.payment_mode === mode
                  ? mode === 'Cash' ? 'bg-green-600 border-green-600 text-white shadow-sm'
                  : mode === 'UPI' ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                  : 'bg-orange-500 border-orange-500 text-white shadow-sm'
                  : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50'
              }`}>
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* ── Remarks ──────────────────────────────────────────────────────── */}
      <div className="px-5 py-5">
        <label className="label">Remarks (optional)</label>
        <textarea className="input-field resize-none" rows={2} placeholder="Any remarks..."
          value={formData.remarks}
          onChange={(e) => onFieldChange('remarks', e.target.value)} />
      </div>

      {/* ── Buttons ──────────────────────────────────────────────────────── */}
      <div className="px-5 py-5 flex flex-col gap-3 bg-gray-50/60">
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Saving...' : (submitLabel ?? 'Save Sale')}
        </button>
      </div>
    </form>
  );
}
