import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { X, AlertTriangle } from 'lucide-react';
import SaleForm from './SaleForm';
import { useSales } from '../hooks/useSales';
import { useSuggestions } from '../hooks/useSuggestions';
import { parseExpiryMonth, isExpiredExpiry } from '../utils/helpers';
import type { Sale, SaleFormData, MedicineItem } from '../types';

interface InvoiceEditOverlayProps {
  sales: Sale[];
  onClose: () => void;
  onSaved: (invoiceNumber: string, updated: Sale[], inserted: Sale[], removedIds: string[]) => void;
}

function calcRowTotal(qty: string, mrp: string, discount: string): string {
  const q = parseFloat(qty) || 0;
  const m = parseFloat(mrp) || 0;
  const d = parseFloat(discount) || 0;
  if (q <= 0 && m <= 0) return '';
  return Math.max(0, q * m * (1 - d / 100)).toFixed(2);
}

function toFormData(sales: Sale[]): SaleFormData {
  const first = sales[0];
  return {
    customer_name: first.customer_name || '',
    mobile_number: first.mobile_number || '',
    payment_mode: first.payment_mode,
    remarks: first.remarks || '',
    bill_discount: first.bill_discount ? String(first.bill_discount) : '',
    medicines: sales.map((s) => ({
      id: s.id,
      medicine_name: s.medicine_name,
      batch_number: s.batch_number || '',
      expiry_date: s.expiry_date || '',
      quantity: String(s.quantity),
      mrp: String(s.mrp),
      selling_rate: String(s.selling_rate),
      discount: String(s.discount ?? ''),
      total_amount: (s.selling_rate * s.quantity).toFixed(2),
    })),
  };
}

const EMPTY_MEDICINE: MedicineItem = {
  medicine_name: '', batch_number: '', expiry_date: '',
  quantity: '', mrp: '', selling_rate: '', discount: '', total_amount: '',
};

export default function InvoiceEditOverlay({ sales, onClose, onSaved }: InvoiceEditOverlayProps) {
  const { saveInvoiceEdit, loading } = useSales();
  const { customers, mobiles, medicines, medicineDetails, mobileToCustomer } = useSuggestions();

  const first = sales[0];
  const [formData, setFormData] = useState<SaleFormData>(() => toFormData(sales));
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleFieldChange = useCallback((field: keyof Omit<SaleFormData, 'medicines'>, value: string) => {
    if (field === 'mobile_number') {
      const sanitized = value.replace(/\D/g, '').slice(0, 10);
      const matched = mobileToCustomer.get(sanitized.trim());
      setFormData((prev) => ({
        ...prev,
        mobile_number: sanitized,
        ...(matched ? { customer_name: matched } : {}),
      }));
    } else {
      setFormData((prev) => ({ ...prev, [field]: value }));
    }
  }, [mobileToCustomer]);

  const handleMedicineChange = useCallback((index: number, field: keyof MedicineItem, value: string) => {
    setFormData((prev) => {
      const meds = [...prev.medicines];
      const updated = { ...meds[index], [field]: value };
      if (field === 'quantity' || field === 'mrp' || field === 'discount') {
        updated.total_amount = calcRowTotal(
          field === 'quantity' ? value : updated.quantity,
          field === 'mrp' ? value : updated.mrp,
          field === 'discount' ? value : updated.discount,
        );
      }
      meds[index] = updated;
      return { ...prev, medicines: meds };
    });
  }, []);

  const handleAddMedicine = useCallback(() => {
    setFormData((prev) => {
      if (prev.medicines.length >= 10) return prev;
      return { ...prev, medicines: [...prev.medicines, { ...EMPTY_MEDICINE }] };
    });
  }, []);

  const handleRemoveMedicine = useCallback((index: number) => {
    setFormData((prev) => {
      const med = prev.medicines[index];
      if (med.id) setRemovedIds((ids) => [...ids, med.id!]);
      return { ...prev, medicines: prev.medicines.filter((_, i) => i !== index) };
    });
  }, []);

  const handleDuplicateMedicine = useCallback((index: number) => {
    setFormData((prev) => {
      const meds = [...prev.medicines];
      // Strip id so the duplicate is treated as a new INSERT
      const { id: _id, ...rest } = meds[index];
      meds.splice(index + 1, 0, { ...rest });
      return { ...prev, medicines: meds };
    });
  }, []);

  const handleMedicineNameSelect = useCallback((index: number, name: string) => {
    const detail = medicineDetails.get(name);
    if (!detail) return;
    setFormData((prev) => {
      const meds = [...prev.medicines];
      const updated = {
        ...meds[index],
        ...(detail.batch_number ? { batch_number: detail.batch_number } : {}),
        ...(detail.expiry_date ? { expiry_date: detail.expiry_date } : {}),
        ...(detail.mrp ? { mrp: detail.mrp } : {}),
      };
      if (detail.mrp) {
        updated.total_amount = calcRowTotal(updated.quantity, detail.mrp, updated.discount);
      }
      meds[index] = updated;
      return { ...prev, medicines: meds };
    });
  }, [medicineDetails]);

  const doSave = async () => {
    const filled = formData.medicines.filter((m) => m.medicine_name.trim());
    if (filled.length === 0) { toast.error('At least one medicine is required'); return; }
    // Mirror QuickSale: a Credit sale must name the customer, else the receivable
    // can't be linked (customer_id NULL) and drops out of the outstanding ledger.
    if (formData.payment_mode === 'Credit' && !formData.customer_name.trim()) {
      toast.error('Customer Name is mandatory for Credit transactions.'); return;
    }
    for (let i = 0; i < filled.length; i++) {
      const med = filled[i];
      const label = filled.length > 1 ? ` (Medicine ${i + 1})` : '';
      if (!parseFloat(med.quantity) || parseFloat(med.quantity) <= 0) {
        toast.error(`Quantity must be > 0${label}`); return;
      }
      if (!parseFloat(med.mrp) || parseFloat(med.mrp) <= 0) {
        toast.error(`MRP must be > 0${label}`); return;
      }
      const exp = med.expiry_date.trim();
      if (exp) {
        if (!parseExpiryMonth(exp)) { toast.error(`Expiry must be a valid month as MM/YY${label}`); return; }
        if (isExpiredExpiry(exp)) { toast.error(`Cannot sell expired medicine (exp ${exp})${label}`); return; }
      }
    }

    const result = await saveInvoiceEdit(
      first.invoice_number,
      first.sale_date,
      { ...formData, medicines: filled },
      removedIds,
    );

    if (result) {
      toast.success('Invoice updated');
      onSaved(first.invoice_number, result.updated, result.inserted, removedIds);
    } else {
      toast.error('Failed to save invoice');
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (removedIds.length > 0) {
      setShowDeleteConfirm(true);
    } else {
      await doSave();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-stretch sm:items-center justify-center sm:p-4">
      <div className="bg-white w-full sm:rounded-2xl sm:max-w-5xl max-h-screen sm:max-h-[95vh] flex flex-col shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-white flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">Edit Invoice</h2>
            <p className="text-xs font-mono text-blue-600 mt-0.5">{first.invoice_number} · {first.sale_date}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={22} />
          </button>
        </div>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto">
          {/* Deletion confirmation */}
          {showDeleteConfirm && (
            <div className="mx-5 mt-4 rounded-xl border-2 border-red-200 bg-red-50 p-4 flex flex-col gap-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-800 font-medium">
                  You removed {removedIds.length} medicine row{removedIds.length > 1 ? 's' : ''} from this invoice.
                  This cannot be undone. Confirm to permanently delete {removedIds.length > 1 ? 'them' : 'it'}.
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Go back
                </button>
                <button
                  type="button"
                  onClick={async () => { setShowDeleteConfirm(false); await doSave(); }}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                >
                  Yes, delete &amp; save
                </button>
              </div>
            </div>
          )}

          <SaleForm
            formData={formData}
            onFieldChange={handleFieldChange}
            onMedicineChange={handleMedicineChange}
            onAddMedicine={handleAddMedicine}
            onRemoveMedicine={handleRemoveMedicine}
            onDuplicateMedicine={handleDuplicateMedicine}
            onSubmit={handleSubmit}
            loading={loading}
            customerSuggestions={customers}
            mobileSuggestions={mobiles}
            medicineSuggestions={medicines}
            onMedicineNameSelect={handleMedicineNameSelect}
            submitLabel="Save Invoice"
          />
        </div>
      </div>
    </div>
  );
}
