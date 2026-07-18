import { useCallback } from 'react';
import { supabase } from '../utils/supabase';

// One row per customer from the public.customer_outstanding SQL view —
// the authoritative net credit outstanding. See supabase/customer_outstanding.sql.
export interface OutstandingCustomerRow {
  // Present once the Phase 1 customers table exists; null/undefined before then.
  customer_id: string | null;
  customer_key: string;
  customer_name: string;
  mobile_number: string;
  gross_amount: number;
  paid_amount: number;
  outstanding: number;
  invoice_count: number;
  last_sale_date: string;
}

export function useCustomerOutstanding() {
  // Returns null when the view is unavailable (e.g. migration not run yet) so
  // callers can fall back to the client-side computation.
  const fetchOutstanding = useCallback(async (): Promise<OutstandingCustomerRow[] | null> => {
    const { data, error } = await supabase
      .from('customer_outstanding')
      .select('*')
      .order('outstanding', { ascending: false });
    if (error || !data) return null;
    // PostgREST may serialize numeric columns as strings — coerce to numbers.
    return data.map((r) => ({
      customer_id: r.customer_id ?? null,
      customer_key: r.customer_key,
      customer_name: r.customer_name,
      mobile_number: r.mobile_number ?? '',
      gross_amount: Number(r.gross_amount),
      paid_amount: Number(r.paid_amount),
      outstanding: Number(r.outstanding),
      invoice_count: Number(r.invoice_count),
      last_sale_date: r.last_sale_date,
    }));
  }, []);

  return { fetchOutstanding };
}
