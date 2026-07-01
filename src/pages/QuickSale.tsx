import { useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CheckCircle, X, Printer } from 'lucide-react';
import SaleForm from '../components/SaleForm';
import InvoiceModal from '../components/InvoiceModal';
import { useSales } from '../hooks/useSales';
import { useSuggestions } from '../hooks/useSuggestions';
import { formatGrandTotal } from '../utils/helpers';
import type { Sale, SaleFormData, MedicineItem } from '../types';

const EMPTY_MEDICINE: MedicineItem = {
  medicine_name: '',
  batch_number: '',
  expiry_date: '',
  quantity: '',
  mrp: '',
  selling_rate: '',
  discount: '',
  total_amount: '',
};

function makeEmptyForm(customer = '', mobile = ''): SaleFormData {
  return {
    customer_name: customer,
    mobile_number: mobile,
    payment_mode: '',
    remarks: '',
    bill_discount: '',
    medicines: [{ ...EMPTY_MEDICINE }],
  };
}

function calcRowTotal(qty: string, mrp: string, discount: string): string {
  const q = parseFloat(qty) || 0;
  const m = parseFloat(mrp) || 0;
  const d = parseFloat(discount) || 0;
  if (q <= 0 && m <= 0) return '';
  return Math.max(0, q * m * (1 - d / 100)).toFixed(2);
}

function validate(data: SaleFormData): string | null {
  const filled = data.medicines.filter((m) => m.medicine_name.trim());
  if (filled.length === 0) return 'At least one medicine is required';
  for (let i = 0; i < filled.length; i++) {
    const med = filled[i];
    const label = filled.length > 1 ? ` (Medicine ${i + 1})` : '';
    const qty = parseFloat(med.quantity);
    if (!qty || qty <= 0) return `Quantity must be > 0${label}`;
    const mrp = parseFloat(med.mrp);
    if (isNaN(mrp) || mrp <= 0) return `MRP must be > 0${label}`;
  }
  if (!data.payment_mode) return 'Please select a payment mode';
  return null;
}

export default function QuickSale() {
  const { createSale, loading } = useSales();
  const { customers, mobiles, medicines, medicineDetails, mobileToCustomer, mobileOwners } = useSuggestions();
  const [searchParams] = useSearchParams();
  const [formData, setFormData] = useState<SaleFormData>(
    makeEmptyForm(searchParams.get('customer') || '', searchParams.get('mobile') || ''),
  );
  const [lastSaved, setLastSaved] = useState<Sale[] | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const handleFieldChange = (field: keyof Omit<SaleFormData, 'medicines'>, value: string) => {
    if (field === 'mobile_number') {
      const matched = mobileToCustomer.get(value.trim());
      setFormData((prev) => ({
        ...prev,
        mobile_number: value,
        // Autofill the name only when it's empty — never overwrite a name the
        // operator already typed (a shared number must not silently rename them).
        ...(matched && !prev.customer_name.trim() ? { customer_name: matched } : {}),
      }));
    } else {
      setFormData((prev) => ({ ...prev, [field]: value }));
    }
  };

  const handleMedicineChange = (index: number, field: keyof MedicineItem, value: string) => {
    setFormData((prev) => {
      const medicines = [...prev.medicines];
      const updated = { ...medicines[index], [field]: value };
      if (field === 'quantity' || field === 'mrp' || field === 'discount') {
        updated.total_amount = calcRowTotal(
          field === 'quantity' ? value : updated.quantity,
          field === 'mrp' ? value : updated.mrp,
          field === 'discount' ? value : updated.discount,
        );
      }
      medicines[index] = updated;
      return { ...prev, medicines };
    });
  };

  const handleAddMedicine = () => {
    setFormData((prev) => {
      if (prev.medicines.length >= 10) return prev;
      return { ...prev, medicines: [...prev.medicines, { ...EMPTY_MEDICINE }] };
    });
  };

  const handleRemoveMedicine = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      medicines: prev.medicines.filter((_, i) => i !== index),
    }));
  };

  const handleMedicineNameSelect = (index: number, name: string) => {
    const detail = medicineDetails.get(name);
    if (!detail) return;
    setFormData((prev) => {
      const medicines = [...prev.medicines];
      const updated = {
        ...medicines[index],
        ...(detail.batch_number ? { batch_number: detail.batch_number } : {}),
        ...(detail.expiry_date ? { expiry_date: detail.expiry_date } : {}),
        ...(detail.mrp ? { mrp: detail.mrp } : {}),
      };
      if (detail.mrp) {
        updated.total_amount = calcRowTotal(updated.quantity, detail.mrp, updated.discount);
      }
      medicines[index] = updated;
      return { ...prev, medicines };
    });
  };

  const handleDuplicateMedicine = (index: number) => {
    setFormData((prev) => {
      const medicines = [...prev.medicines];
      medicines.splice(index + 1, 0, { ...medicines[index] });
      return { ...prev, medicines };
    });
  };

  const requestConfirm = () => {
    const filled = formData.medicines.filter((m) => m.medicine_name.trim());
    const filledData = { ...formData, medicines: filled };
    if (filled.length < formData.medicines.length) {
      setFormData((prev) => ({ ...prev, medicines: filled.length ? filled : [{ ...EMPTY_MEDICINE }] }));
    }
    const err = validate(filledData);
    if (err) { toast.error(err); return; }
    setConfirmOpen(true);
  };

  const confirmAndSave = async () => {
    setConfirmOpen(false);
    const filled = formData.medicines.filter((m) => m.medicine_name.trim());
    const filledData = { ...formData, medicines: filled };
    const sales = await createSale(filledData);
    if (sales && sales.length > 0) {
      setLastSaved(sales);
      setFormData(makeEmptyForm());
      topRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      toast.error('Failed to save sale — check browser console.');
    }
  };

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    requestConfirm();
  };

  const filledMeds = formData.medicines.filter((m) => m.medicine_name.trim());
  const subtotal = filledMeds.reduce((s, m) => s + (parseFloat(m.total_amount) || 0), 0);
  const billDiscFactor = 1 - (parseFloat(formData.bill_discount) || 0) / 100;
  const grandTotal = subtotal * billDiscFactor;

  return (
    <div className="space-y-4" ref={topRef}>
      <div>
        <h1 className="page-title">Sale Entry</h1>
        <p className="text-gray-500 text-sm mt-0.5">Create a new customer bill</p>
      </div>

      {/* Persistent success banner with Print button */}
      {lastSaved && (
        <div className="flex items-center justify-between gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-green-800">
            <CheckCircle size={18} className="text-green-600 flex-shrink-0" />
            <span>Saved: <strong>{lastSaved[0].invoice_number}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPrintOpen(true)}
              className="flex items-center gap-1.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Printer size={14} /> Print Invoice
            </button>
            <button onClick={() => setLastSaved(null)} className="text-green-400 hover:text-green-700 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <SaleForm
          formData={formData}
          onFieldChange={handleFieldChange}
          onMedicineChange={handleMedicineChange}
          onAddMedicine={handleAddMedicine}
          onRemoveMedicine={handleRemoveMedicine}
          onDuplicateMedicine={handleDuplicateMedicine}
          onSubmit={handleSave}
          loading={loading}
          customerSuggestions={customers}
          mobileSuggestions={mobiles}
          medicineSuggestions={medicines}
          mobileOwners={mobileOwners}
          onMedicineNameSelect={handleMedicineNameSelect}
        />
      </div>

      {/* Confirmation Modal */}
      {confirmOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="font-bold text-gray-900">Confirm Invoice</h2>
              <button onClick={() => setConfirmOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              {formData.customer_name && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Customer</span>
                  <span className="font-medium text-gray-900">{formData.customer_name}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Medicines</span>
                <span className="font-medium text-gray-900">{filledMeds.length}</span>
              </div>
              {parseFloat(formData.bill_discount) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Bill Discount</span>
                  <span className="font-medium text-gray-900">{formData.bill_discount}%</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Payment Mode</span>
                <span className={`font-semibold ${
                  formData.payment_mode === 'Cash' ? 'text-green-600'
                  : formData.payment_mode === 'UPI' ? 'text-blue-600'
                  : 'text-orange-500'
                }`}>{formData.payment_mode}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                <span className="font-semibold text-gray-700">Grand Total</span>
                <span className="text-xl font-bold text-blue-700">{formatGrandTotal(grandTotal)}</span>
              </div>
            </div>

            <div className="px-5 py-4 flex gap-3 bg-gray-50 rounded-b-2xl">
              <button
                onClick={() => setConfirmOpen(false)}
                className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Go Back
              </button>
              <button
                onClick={confirmAndSave}
                disabled={loading}
                className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {loading ? 'Saving...' : 'Confirm & Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Invoice Modal */}
      {printOpen && lastSaved && (
        <InvoiceModal sales={lastSaved} onClose={() => setPrintOpen(false)} />
      )}
    </div>
  );
}
