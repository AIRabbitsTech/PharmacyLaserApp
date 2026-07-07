import { useState, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import type { PaymentMode, SalesReturn } from '../types';

// One returned line to record.
export interface ReturnLineInput {
  // Links back to the exact sales row being reversed. Optional so a return can
  // still be booked against a legacy/imported invoice whose line can't be resolved.
  original_sale_id?: string | null;
  medicine_name: string;
  batch_number?: string | null;
  quantity_returned: number;
  refund_amount: number;
}

// One return event = one refund transaction covering one or more lines.
export interface RecordReturnInput {
  original_invoice_number: string;
  customer_name?: string | null;
  mobile_number?: string | null;
  // 'Credit' reduces the customer's outstanding; 'Cash'/'UPI' move real money.
  refund_mode: PaymentMode;
  return_date?: string; // defaults to the DB's current_date (today)
  reason?: string | null;
  remarks?: string | null;
  lines: ReturnLineInput[];
}

// PostgREST may serialize numeric columns as strings — coerce on read.
function coerceReturn(r: Record<string, unknown>): SalesReturn {
  return {
    id: r.id as string,
    return_date: r.return_date as string,
    original_sale_id: (r.original_sale_id as string) ?? null,
    original_invoice_number: r.original_invoice_number as string,
    customer_id: (r.customer_id as string) ?? null,
    customer_name: (r.customer_name as string) ?? null,
    mobile_number: (r.mobile_number as string) ?? null,
    medicine_name: r.medicine_name as string,
    batch_number: (r.batch_number as string) ?? null,
    quantity_returned: Number(r.quantity_returned),
    refund_amount: Number(r.refund_amount),
    refund_mode: r.refund_mode as PaymentMode,
    restocked: Boolean(r.restocked),
    reason: (r.reason as string) ?? null,
    remarks: (r.remarks as string) ?? null,
    created_at: r.created_at as string,
  };
}

export function useSalesReturns() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Insert one row per returned line. customer_id is intentionally NOT sent —
  // the resolve_customer_id() trigger populates it from customer_name +
  // mobile_number on insert, exactly as createSale relies on for `sales`.
  const recordReturn = useCallback(async (input: RecordReturnInput): Promise<SalesReturn[] | null> => {
    setLoading(true);
    setError(null);
    try {
      const name = input.customer_name?.trim() || null;
      const mobile = input.mobile_number?.trim() || null;
      const records = input.lines.map((line) => ({
        original_invoice_number: input.original_invoice_number,
        original_sale_id: line.original_sale_id ?? null,
        customer_name: name,
        mobile_number: mobile,
        medicine_name: line.medicine_name,
        batch_number: line.batch_number?.trim() || null,
        quantity_returned: line.quantity_returned,
        refund_amount: line.refund_amount,
        refund_mode: input.refund_mode,
        reason: input.reason?.trim() || null,
        remarks: input.remarks?.trim() || null,
        ...(input.return_date ? { return_date: input.return_date } : {}),
      }));

      const { data, error: err } = await supabase
        .from('sales_returns')
        .insert(records)
        .select();
      if (err) throw err;
      return (data || []).map(coerceReturn);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record return';
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // All returns booked against an invoice — used to compute already-returned
  // quantities so the entry UI can cap each line (over-return guard).
  const fetchReturnsByInvoice = useCallback(async (invoiceNumber: string): Promise<SalesReturn[]> => {
    try {
      const { data, error: err } = await supabase
        .from('sales_returns')
        .select('*')
        .eq('original_invoice_number', invoiceNumber);
      if (err) throw err;
      return (data || []).map(coerceReturn);
    } catch {
      return [];
    }
  }, []);

  // Given the invoice numbers currently on screen, return the subset that has at
  // least one return booked against it — for flagging in lists. Matched by
  // invoice (not date), since a return can be dated later than the sale. Safe
  // (returns an empty set) when the sales_returns table isn't present yet.
  const fetchReturnedInvoiceSet = useCallback(async (invoiceNumbers: string[]): Promise<Set<string>> => {
    const unique = [...new Set(invoiceNumbers)].filter(Boolean);
    if (unique.length === 0) return new Set();
    const result = new Set<string>();
    const CHUNK = 300; // keep the .in() list well under URL-length limits
    try {
      for (let i = 0; i < unique.length; i += CHUNK) {
        const batch = unique.slice(i, i + CHUNK);
        const { data, error: err } = await supabase
          .from('sales_returns')
          .select('original_invoice_number')
          .in('original_invoice_number', batch);
        if (err) throw err;
        for (const r of data || []) result.add(r.original_invoice_number as string);
      }
    } catch {
      return new Set();
    }
    return result;
  }, []);

  // Returns within a date window — for netting into the sales/revenue reports.
  const fetchReturnsByDateRange = useCallback(async (startDate: string, endDate: string): Promise<SalesReturn[]> => {
    try {
      const { data, error: err } = await supabase
        .from('sales_returns')
        .select('*')
        .gte('return_date', startDate)
        .lte('return_date', endDate)
        .order('return_date', { ascending: false });
      if (err) throw err;
      return (data || []).map(coerceReturn);
    } catch {
      return [];
    }
  }, []);

  return { loading, error, recordReturn, fetchReturnsByInvoice, fetchReturnsByDateRange, fetchReturnedInvoiceSet };
}
