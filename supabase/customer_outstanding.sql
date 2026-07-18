-- ============================================================
-- customer_outstanding view
-- Single source of truth for "net credit outstanding per customer".
-- Replaces the duplicated client-side aggregation that let the Dashboard
-- popup and the Reports → Credit Ledger drift apart.
--
-- Run this in the Supabase SQL Editor.
--
-- Identity = normalized name + mobile (lower(trim(name)) || '||' || trim(mobile)),
-- matching customerKey() in src/utils/credit.ts exactly. Both gross credit and
-- payments are bucketed by this single key, so a payment is counted against
-- exactly one customer (no double-subtraction) and two people who merely share
-- a name are never merged.
--
-- security_invoker = true makes the view honor the base tables' RLS, so only
-- authenticated users can read it (Postgres 15+; Supabase supports this).
-- ============================================================

create or replace view public.customer_outstanding
with (security_invoker = true) as
with credit_sales as (
  select
    lower(trim(coalesce(customer_name, ''))) as name_key,
    trim(coalesce(mobile_number, ''))        as mobile_key,
    customer_name,
    mobile_number,
    invoice_number,
    total_amount,
    sale_date,
    created_at
  from public.sales
  where payment_mode = 'Credit'
),
gross as (
  select
    name_key,
    mobile_key,
    sum(total_amount)              as gross_amount,
    count(distinct invoice_number) as invoice_count,
    max(sale_date)                 as last_sale_date
  from credit_sales
  group by name_key, mobile_key
),
-- Representative display name/mobile = the most recent credit sale for the key.
rep as (
  select distinct on (name_key, mobile_key)
    name_key,
    mobile_key,
    customer_name,
    mobile_number
  from credit_sales
  order by name_key, mobile_key, sale_date desc, created_at desc
),
paid as (
  select
    lower(trim(coalesce(customer_name, ''))) as name_key,
    trim(coalesce(mobile_number, ''))        as mobile_key,
    sum(amount)                              as paid_amount
  from public.credit_payments
  group by 1, 2
)
select
  g.name_key || '||' || g.mobile_key                          as customer_key,
  coalesce(nullif(trim(r.customer_name), ''), '(Anonymous)')  as customer_name,
  coalesce(r.mobile_number, '')                               as mobile_number,
  g.gross_amount,
  coalesce(p.paid_amount, 0)                                  as paid_amount,
  greatest(0, g.gross_amount - coalesce(p.paid_amount, 0))    as outstanding,
  g.invoice_count,
  g.last_sale_date
from gross g
left join rep  r on r.name_key = g.name_key and r.mobile_key = g.mobile_key
left join paid p on p.name_key = g.name_key and p.mobile_key = g.mobile_key
where greatest(0, g.gross_amount - coalesce(p.paid_amount, 0)) > 0
order by outstanding desc;

-- Expose the view through PostgREST. security_invoker = true means the base
-- tables' RLS still governs what each role can actually see, so this grant only
-- matches the access the underlying sales/credit_payments tables already allow.
grant select on public.customer_outstanding to anon, authenticated;
