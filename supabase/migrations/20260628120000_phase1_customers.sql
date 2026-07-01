-- ============================================================
-- Phase 1 — Customer entity
-- ============================================================
-- Introduces a first-class `customers` table and links sales &
-- credit_payments to it via customer_id, WITHOUT changing any
-- balances. This is a structural, non-lossy migration:
--
--   * one customer per existing distinct identity (name_norm, phone_norm)
--   * no rows merged, no money moved, no columns dropped
--   * customer_name / mobile_number stay on `sales` as a snapshot
--     (the invoice/line split is a later phase)
--
-- The opinionated cleanups (RAHUL -> RAHUL PANDEY, flagging the
-- SRIJAN family as shares_phone, blank-mobile backfill) are a
-- SEPARATE reviewed step run AFTER this — they are deliberately
-- not done here so this migration cannot change any figure.
--
-- Identity rule: phone-unique-with-override. Phone is NOT a hard
-- unique constraint; multiple customers may share a phone (family).
-- `shares_phone` marks the deliberate ones so dedup tooling can tell
-- an intentional household apart from a typo duplicate.
--
-- Expected at time of writing (verify after): outstanding unchanged
-- at ~₹22,365 across 29 customers / 114 invoices; 224 customers created;
-- 0 named rows left unlinked.
--
-- RUN ON STAGING FIRST. Take a backup (scripts/db-backup.sh) before prod.
-- ============================================================

begin;

-- ── 1. customers table ──────────────────────────────────────
create table if not exists public.customers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  phone        text,
  -- normalized identity columns (match customerKey() in src/utils/credit.ts:
  -- lower(trim(name)) and trim(mobile)) so customer_id grouping is provably
  -- equivalent to the current string-based grouping.
  name_norm    text generated always as (lower(btrim(coalesce(name, '')))) stored,
  phone_norm   text generated always as (btrim(coalesce(phone, ''))) stored,
  shares_phone boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One customer per distinct (name, phone). Allows same phone with different
-- names (households / the override) but blocks exact-identity duplicates.
create unique index if not exists customers_identity_idx
  on public.customers (name_norm, phone_norm);

create index if not exists customers_phone_norm_idx on public.customers (phone_norm);

-- ── 2. backfill: one customer per distinct identity ─────────
-- Representative raw name/phone = most recent occurrence.
insert into public.customers (name, phone)
select distinct on (lower(btrim(customer_name)), btrim(coalesce(mobile_number, '')))
       btrim(customer_name)                                as name,
       nullif(btrim(coalesce(mobile_number, '')), '')      as phone
from public.sales
where coalesce(btrim(customer_name), '') <> ''
order by lower(btrim(customer_name)),
         btrim(coalesce(mobile_number, '')),
         created_at desc
on conflict (name_norm, phone_norm) do nothing;

-- Also cover customers that appear only in credit_payments (orphan payments).
insert into public.customers (name, phone)
select distinct on (lower(btrim(customer_name)), btrim(coalesce(mobile_number, '')))
       btrim(customer_name),
       nullif(btrim(coalesce(mobile_number, '')), '')
from public.credit_payments
where coalesce(btrim(customer_name), '') <> ''
order by lower(btrim(customer_name)),
         btrim(coalesce(mobile_number, '')),
         created_at desc
on conflict (name_norm, phone_norm) do nothing;

-- ── 3. link sales & credit_payments via customer_id ─────────
alter table public.sales
  add column if not exists customer_id uuid references public.customers (id);
alter table public.credit_payments
  add column if not exists customer_id uuid references public.customers (id);

update public.sales s
set customer_id = c.id
from public.customers c
where lower(btrim(coalesce(s.customer_name, ''))) = c.name_norm
  and btrim(coalesce(s.mobile_number, '')) = c.phone_norm
  and coalesce(btrim(s.customer_name), '') <> '';

update public.credit_payments p
set customer_id = c.id
from public.customers c
where lower(btrim(coalesce(p.customer_name, ''))) = c.name_norm
  and btrim(coalesce(p.mobile_number, '')) = c.phone_norm
  and coalesce(btrim(p.customer_name), '') <> '';

-- Postgres does not auto-index foreign keys.
create index if not exists sales_customer_id_idx           on public.sales (customer_id);
create index if not exists credit_payments_customer_id_idx on public.credit_payments (customer_id);

-- ── 4. updated_at trigger ───────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- ── 5. RLS (mirror existing tables) ─────────────────────────
alter table public.customers enable row level security;

drop policy if exists "Allow authenticated access to customers" on public.customers;
create policy "Allow authenticated access to customers"
  on public.customers for all
  to authenticated
  using (true) with check (true);

grant select on public.customers to anon, authenticated;
grant insert, update on public.customers to authenticated;

-- ── 6. repoint customer_outstanding to customer_id ──────────
-- customer_key stays "name_norm||phone_norm" so the app (and the
-- Reports invoice drill-down keyed by customerKey) keeps working
-- unchanged; customer_id is exposed for future use.
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
  -- normalized name+mobile match. This keeps balances correct during the
  -- transition window if a payment is recorded before the app starts writing
  -- customer_id (belt-and-suspenders for Stage 2).
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
)
select
  c.id                                                       as customer_id,
  c.name_norm || '||' || c.phone_norm                        as customer_key,
  c.name                                                     as customer_name,
  coalesce(c.phone, '')                                      as mobile_number,
  g.gross_amount,
  coalesce(p.paid_amount, 0)                                 as paid_amount,
  greatest(0, g.gross_amount - coalesce(p.paid_amount, 0))   as outstanding,
  g.invoice_count,
  g.last_sale_date
from gross g
join public.customers c on c.id = g.customer_id
left join paid p on p.customer_id = g.customer_id
where greatest(0, g.gross_amount - coalesce(p.paid_amount, 0)) > 0
order by outstanding desc;

grant select on public.customer_outstanding to anon, authenticated;

commit;

-- ============================================================
-- VERIFICATION (run after; compare to pre-migration values)
-- ============================================================
-- Customers created (expected ~224):
--   select count(*) from public.customers;
--
-- No named row left unlinked (expected 0 for both):
--   select count(*) from public.sales
--     where coalesce(btrim(customer_name),'') <> '' and customer_id is null;
--   select count(*) from public.credit_payments
--     where coalesce(btrim(customer_name),'') <> '' and customer_id is null;
--
-- Outstanding unchanged (expected ~₹22,365 / 29 customers at time of writing):
--   select round(sum(outstanding)) as total, count(*) as customers
--   from public.customer_outstanding;
--
-- Phones backfilled into >1 customer (households OR merge candidates):
--   select phone_norm, count(*) from public.customers
--   where phone_norm <> '' group by phone_norm having count(*) > 1;

-- ============================================================
-- ROLLBACK (if needed, before relying on the new structures)
-- ============================================================
-- begin;
--   -- restore the string-based view from supabase/customer_outstanding.sql, then:
--   drop view if exists public.customer_outstanding;
--   alter table public.sales            drop column if exists customer_id;
--   alter table public.credit_payments  drop column if exists customer_id;
--   drop table if exists public.customers;
--   drop function if exists public.set_updated_at();
-- commit;
