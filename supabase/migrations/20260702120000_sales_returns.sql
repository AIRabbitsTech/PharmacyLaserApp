-- ============================================================
-- Phase 2 — Sales Returns (Customer Credit Note)
-- ============================================================
-- Adds a first-class `sales_returns` ledger so a medicine return is
-- recorded as a NEW, dated transaction that references the original
-- sale — never a mutation or deletion of public.sales.
--
-- WHY A SEPARATE TABLE (not an invoice edit):
--   * Editing the original sale would land the reversal on the ORIGINAL
--     sale_date, silently rewriting a closed day's / month's totals.
--     A return is an event that happens on the RETURN date.
--   * Editing keeps no record of the refund (how much, which mode, why),
--     and erases the fact that the medicine was ever dispensed (batch
--     traceability). A ledger row preserves the full audit trail.
--
-- This migration is purely ADDITIVE and provably non-lossy:
--   * new table only — no existing table/index/constraint is altered
--   * the ONLY existing object changed is the customer_outstanding view,
--     and with zero return rows its output is byte-identical to today
--     (the new term subtracts 0). Nothing moves until a credit return
--     is actually recorded.
--
-- REFUND SEMANTICS:
--   * refund_mode = 'Cash' / 'UPI' → money handed back (recorded here;
--     netted into reports on the return_date in a later phase).
--   * refund_mode = 'Credit'       → reduces the customer's outstanding
--     balance (no cash moves), symmetric with credit_payments. THIS is
--     the only mode the customer_outstanding view subtracts.
--
-- Over-return protection (returned qty <= sold − already-returned) is
-- enforced in the app layer, not declaratively here.
--
-- RUN ORDER: AFTER 20260628120000_phase1_customers.sql and
-- 20260701120000_phase1b_customer_id_trigger.sql (this reuses the
-- customers table and the resolve_customer_id() trigger function).
--
-- RUN ON STAGING FIRST. Take a backup (scripts/db-backup.sh) before prod.
-- ============================================================

begin;

-- ── 1. sales_returns table ──────────────────────────────────
create table if not exists public.sales_returns (
  id                      uuid primary key default gen_random_uuid(),
  return_date             date not null default current_date,
  -- Line-level link back to the sale being reversed. original_sale_id is
  -- nullable so a return can still be recorded if the exact line can't be
  -- resolved (e.g. legacy/imported invoice), while original_invoice_number
  -- always ties it to the paper invoice the customer holds.
  original_sale_id        uuid references public.sales (id),
  original_invoice_number text not null,
  -- customer_id is auto-resolved by the shared resolve_customer_id() trigger
  -- (Phase 1b) from customer_name + mobile_number, exactly like sales.
  customer_id             uuid references public.customers (id),
  customer_name           text,
  mobile_number           text,
  medicine_name           text not null,
  batch_number            text,
  quantity_returned       numeric(10, 2) not null check (quantity_returned > 0),
  refund_amount           numeric(10, 2) not null check (refund_amount >= 0),
  refund_mode             text not null check (refund_mode in ('Cash', 'UPI', 'Credit')),
  -- Reserved for a future inventory phase. Dispensed medicine is treated as
  -- non-resaleable today, so this stays false and drives no logic yet.
  restocked               boolean not null default false,
  reason                  text,
  remarks                 text,
  created_at              timestamptz not null default now()
);

create index if not exists sales_returns_invoice_idx  on public.sales_returns (original_invoice_number);
create index if not exists sales_returns_customer_idx on public.sales_returns (customer_id);
create index if not exists sales_returns_date_idx     on public.sales_returns (return_date desc);

-- ── 2. auto-populate customer_id (reuse Phase 1b resolver) ──
-- Same identity rule as sales/credit_payments: lower(btrim(name)) +
-- btrim(mobile), creating the customer on first sight. Fires on insert and
-- whenever the identity columns change.
drop trigger if exists sales_returns_resolve_customer on public.sales_returns;
create trigger sales_returns_resolve_customer
  before insert or update of customer_name, mobile_number on public.sales_returns
  for each row execute function public.resolve_customer_id();

-- ── 3. RLS + grants (mirror sales / customers) ──────────────
alter table public.sales_returns enable row level security;

drop policy if exists "Allow authenticated access to sales_returns" on public.sales_returns;
create policy "Allow authenticated access to sales_returns"
  on public.sales_returns for all
  to authenticated
  using (true) with check (true);

grant select on public.sales_returns to anon, authenticated;
grant insert, update on public.sales_returns to authenticated;

-- ── 4. subtract Credit returns in customer_outstanding ──────
-- Rebuilds the Phase 1 (customer_id-based) view with one extra term:
-- outstanding = gross(credit sales) − paid(credit_payments) − credit_returns.
-- Columns, security_invoker and grants are unchanged; with no return rows
-- the `returns` CTE contributes 0 and the output is identical to before.
create or replace view public.customer_outstanding
with (security_invoker = true) as
with credit as (
  select customer_id, invoice_number, total_amount, sale_date
  from public.sales
  where payment_mode = 'Credit' and customer_id is not null
),
gross as (
  select customer_id,
         sum(total_amount)              as gross_amount,
         count(distinct invoice_number) as invoice_count,
         max(sale_date)                 as last_sale_date
  from credit
  group by customer_id
),
paid as (
  -- Subtract payments by customer_id when set; otherwise fall back to the
  -- normalized name+mobile match (belt-and-suspenders during transition).
  select
    coalesce(p.customer_id, c2.id) as customer_id,
    sum(p.amount)                  as paid_amount
  from public.credit_payments p
  left join public.customers c2
    on p.customer_id is null
   and lower(btrim(coalesce(p.customer_name, ''))) = c2.name_norm
   and btrim(coalesce(p.mobile_number, '')) = c2.phone_norm
  where coalesce(p.customer_id, c2.id) is not null
  group by coalesce(p.customer_id, c2.id)
),
credit_returns as (
  -- Only 'Credit' returns reduce outstanding (Cash/UPI returns move real
  -- money and are handled in the sales reports, not the credit ledger).
  -- Same customer_id-or-name-fallback resolution as `paid`.
  select
    coalesce(r.customer_id, c3.id) as customer_id,
    sum(r.refund_amount)           as return_amount
  from public.sales_returns r
  left join public.customers c3
    on r.customer_id is null
   and lower(btrim(coalesce(r.customer_name, ''))) = c3.name_norm
   and btrim(coalesce(r.mobile_number, '')) = c3.phone_norm
  where r.refund_mode = 'Credit'
    and coalesce(r.customer_id, c3.id) is not null
  group by coalesce(r.customer_id, c3.id)
)
select
  c.id                                                       as customer_id,
  c.name_norm || '||' || c.phone_norm                        as customer_key,
  c.name                                                     as customer_name,
  coalesce(c.phone, '')                                      as mobile_number,
  g.gross_amount,
  coalesce(p.paid_amount, 0)                                 as paid_amount,
  greatest(
    0,
    g.gross_amount - coalesce(p.paid_amount, 0) - coalesce(rt.return_amount, 0)
  )                                                          as outstanding,
  g.invoice_count,
  g.last_sale_date
from gross g
join public.customers c on c.id = g.customer_id
left join paid           p  on p.customer_id  = g.customer_id
left join credit_returns rt on rt.customer_id = g.customer_id
where greatest(
        0,
        g.gross_amount - coalesce(p.paid_amount, 0) - coalesce(rt.return_amount, 0)
      ) > 0
order by outstanding desc;

grant select on public.customer_outstanding to anon, authenticated;

commit;

-- ============================================================
-- VERIFICATION (run after)
-- ============================================================
-- 1. Table + view exist and outstanding is UNCHANGED (no returns yet).
--    Compare this total to the pre-migration value — must be identical:
--      select round(sum(outstanding)) as total, count(*) as customers
--      from public.customer_outstanding;
--
-- 2. A Credit return reduces exactly that customer's outstanding.
--    Pick a customer that currently has outstanding > 0, note their id and
--    outstanding, then:
--      insert into public.sales_returns
--        (original_invoice_number, medicine_name, quantity_returned,
--         refund_amount, refund_mode, customer_name, mobile_number, reason)
--      values ('RET-TEST', 'RETURN CHECK', 1, 100, 'Credit',
--              '<their exact name>', '<their exact mobile>', 'verify');
--    -- expect: customer_id auto-populated on the new row
--      select customer_id from public.sales_returns where original_invoice_number = 'RET-TEST';
--    -- expect: their outstanding dropped by 100 (floored at 0)
--      select outstanding from public.customer_outstanding where customer_id = '<their id>';
--    -- cleanup:
--      delete from public.sales_returns where original_invoice_number = 'RET-TEST';
--
-- 3. A Cash/UPI return does NOT change outstanding (money moved outside the
--    credit ledger): repeat (2) with refund_mode = 'Cash' → outstanding same.

-- ============================================================
-- ROLLBACK (before relying on the new structures)
-- ============================================================
-- begin;
--   drop trigger if exists sales_returns_resolve_customer on public.sales_returns;
--   drop table if exists public.sales_returns;
--   -- restore the Phase 1 view (no returns term):
--   create or replace view public.customer_outstanding
--   with (security_invoker = true) as
--   with credit as (
--     select customer_id, invoice_number, total_amount, sale_date
--     from public.sales where payment_mode = 'Credit' and customer_id is not null
--   ),
--   gross as (
--     select customer_id, sum(total_amount) as gross_amount,
--            count(distinct invoice_number) as invoice_count,
--            max(sale_date) as last_sale_date
--     from credit group by customer_id
--   ),
--   paid as (
--     select coalesce(p.customer_id, c2.id) as customer_id, sum(p.amount) as paid_amount
--     from public.credit_payments p
--     left join public.customers c2
--       on p.customer_id is null
--      and lower(btrim(coalesce(p.customer_name, ''))) = c2.name_norm
--      and btrim(coalesce(p.mobile_number, '')) = c2.phone_norm
--     where coalesce(p.customer_id, c2.id) is not null
--     group by coalesce(p.customer_id, c2.id)
--   )
--   select c.id as customer_id, c.name_norm || '||' || c.phone_norm as customer_key,
--          c.name as customer_name, coalesce(c.phone, '') as mobile_number,
--          g.gross_amount, coalesce(p.paid_amount, 0) as paid_amount,
--          greatest(0, g.gross_amount - coalesce(p.paid_amount, 0)) as outstanding,
--          g.invoice_count, g.last_sale_date
--   from gross g
--   join public.customers c on c.id = g.customer_id
--   left join paid p on p.customer_id = g.customer_id
--   where greatest(0, g.gross_amount - coalesce(p.paid_amount, 0)) > 0
--   order by outstanding desc;
--   grant select on public.customer_outstanding to anon, authenticated;
-- commit;
