import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';
import { normalizeMedicineName } from '../utils/medicine';

export interface MedicineDetail {
  batch_number: string;
  expiry_date: string;
  mrp: string;
}

// PostgREST caps a single response at 1000 rows. Page through so suggestions
// don't silently drop names/medicines once the sales table grows large.
async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error || !data) break;
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return all;
}

export function useSuggestions() {
  const [customers, setCustomers] = useState<string[]>([]);
  const [mobiles, setMobiles] = useState<string[]>([]);
  const [medicines, setMedicines] = useState<string[]>([]);
  const [medicineDetails, setMedicineDetails] = useState<Map<string, MedicineDetail>>(new Map());
  const [mobileToCustomer, setMobileToCustomer] = useState<Map<string, string>>(new Map());
  // mobile -> every distinct customer name seen for it (to warn on shared numbers)
  const [mobileOwners, setMobileOwners] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    // Order by the unique `id` so range pagination is stable (a non-unique sort
    // key can duplicate or drop rows at page boundaries).
    fetchAllRows<{ customer_name: string | null; mobile_number: string | null }>((from, to) =>
      supabase
        .from('sales')
        .select('customer_name, mobile_number')
        .not('customer_name', 'is', null)
        .order('id', { ascending: true })
        .range(from, to),
    ).then((data) => {
      const seen = new Set<string>();
      const unique: string[] = [];
      [...data]
        .filter((d) => d.customer_name)
        .sort((a, b) => (a.customer_name as string).localeCompare(b.customer_name as string))
        .forEach((d) => {
          const name = (d.customer_name as string).trim();
          const mobile = (d.mobile_number || '').trim();
          const key = `${name}||${mobile}`;
          if (!seen.has(key)) {
            seen.add(key);
            unique.push(mobile ? `${name} | ${mobile}` : name);
          }
        });
      setCustomers(unique);

      // Build mobile suggestions list ("MOBILE | NAME"), reverse map (first name),
      // and the full set of distinct names per mobile (to flag shared numbers).
      const mobileMap = new Map<string, string>();
      const ownersMap = new Map<string, string[]>();
      const mobileSeen = new Set<string>();
      const mobileList: string[] = [];
      data.filter((d) => d.mobile_number).forEach((d) => {
        const mobile = (d.mobile_number as string).trim();
        const name = (d.customer_name || '').trim();
        if (!mobile) return;
        if (name && !mobileMap.has(mobile)) mobileMap.set(mobile, name);
        if (name) {
          const owners = ownersMap.get(mobile) || [];
          if (!owners.includes(name)) owners.push(name);
          ownersMap.set(mobile, owners);
        }
        const entry = name ? `${mobile} | ${name}` : mobile;
        if (!mobileSeen.has(entry)) { mobileSeen.add(entry); mobileList.push(entry); }
      });
      setMobiles(mobileList.sort());
      setMobileOwners(ownersMap);
      setMobileToCustomer(mobileMap);
    });

    // Fetch batch/expiry per medicine. Order created_at DESC so the first hit per
    // medicine is the latest; `id` is a tiebreaker for stable pagination.
    fetchAllRows<{ medicine_name: string | null; batch_number: string | null; expiry_date: string | null; mrp: number | null }>((from, to) =>
      supabase
        .from('sales')
        .select('medicine_name, batch_number, expiry_date, mrp')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to),
    ).then((data) => {
      // Dedup on the normalized key (case/whitespace-insensitive) so entry
      // variants collapse, but keep the first display name we see for each key.
      // Rows arrive newest-first (created_at DESC), so the canonical name and
      // details reflect the most recent sale of that medicine.
      const namesSeen = new Set<string>();
      const names: string[] = [];
      const details = new Map<string, MedicineDetail>();

      data.filter((d) => d.medicine_name).forEach((d) => {
        const name = (d.medicine_name as string).trim();
        const key = normalizeMedicineName(name);
        if (!namesSeen.has(key)) {
          namesSeen.add(key);
          names.push(name);
          details.set(name, {
            batch_number: d.batch_number || '',
            expiry_date: d.expiry_date || '',
            mrp: d.mrp != null ? String(d.mrp) : '',
          });
        }
      });

      setMedicines(names.sort((a, b) => a.localeCompare(b)));
      setMedicineDetails(details);
    });
  }, []);

  return { customers, mobiles, medicines, medicineDetails, mobileToCustomer, mobileOwners };
}
