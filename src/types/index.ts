export type PaymentMode = 'Cash' | 'UPI' | 'Credit';

export interface MedicineItem {
  id?: string;           // present for existing DB rows, absent for newly added rows
  medicine_name: string;
  batch_number: string;
  expiry_date: string;
  quantity: string;
  mrp: string;
  selling_rate: string;
  discount: string;
  total_amount: string;
}

export interface Sale {
  id: string;
  sale_date: string;
  invoice_number: string;
  medicine_name: string;
  quantity: number;
  mrp: number;
  selling_rate: number;
  total_amount: number;
  payment_mode: PaymentMode;
  customer_name?: string;
  mobile_number?: string;
  batch_number?: string;
  expiry_date?: string;
  discount?: number;
  bill_discount?: number;
  remarks?: string;
  created_at: string;
  // Stamped by the sales_set_updated_at trigger on every write. Equal to
  // created_at for un-edited rows; later than created_at once the row is
  // changed. See supabase/migrations/20260715120000_sales_updated_at.sql.
  updated_at?: string;
}

// A recorded medicine return / credit note. One row per returned line.
// See supabase/migrations/20260702120000_sales_returns.sql.
export interface SalesReturn {
  id: string;
  return_date: string;
  original_sale_id?: string | null;
  original_invoice_number: string;
  customer_id?: string | null;
  customer_name?: string | null;
  mobile_number?: string | null;
  medicine_name: string;
  batch_number?: string | null;
  quantity_returned: number;
  refund_amount: number;
  // 'Credit' reduces the customer's outstanding; 'Cash'/'UPI' move real money.
  refund_mode: PaymentMode;
  restocked: boolean;
  reason?: string | null;
  remarks?: string | null;
  created_at: string;
}

export interface SaleFormData {
  customer_name: string;
  mobile_number: string;
  payment_mode: PaymentMode | '';
  remarks: string;
  bill_discount: string;
  medicines: MedicineItem[];
}

export interface DashboardStats {
  totalSales: number;
  cashSales: number;
  upiSales: number;
  creditSales: number;
  totalTransactions: number;
}

export interface ReportFilters {
  startDate: string;
  endDate: string;
  preset: 'today' | 'yesterday' | 'last_7_days' | 'this_month' | 'last_month' | 'custom';
}
