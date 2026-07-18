-- ============================================================
-- Phase 1b — Keep customer_id populated on every new/edited row
-- ============================================================
-- Run AFTER 20260628120000_phase1_customers.sql and BEFORE relying on
-- the customer_id-based customer_outstanding view in production.
--
-- WHY THIS EXISTS:
-- The Phase 1 view counts gross credit as
--     ... from public.sales where payment_mode = 'Credit' and customer_id is not null
-- The backfill linked every EXISTING row, but the app does not write
-- customer_id on new sales/payments (see src/hooks/useSales.ts createSale /
-- saveInvoiceEdit / bulkCreateSales, and src/pages/ImportData.tsx). Without
-- this trigger, every NEW credit sale lands with customer_id = NULL and
-- silently drops out of the outstanding total.
--
-- WHAT IT DOES:
-- A BEFORE INSERT/UPDATE trigger resolves customer_id from the same
-- normalized identity the rest of Phase 1 uses — lower(btrim(name)) +
-- btrim(mobile) — creating the customer on first sight. One DB object
-- covers every write path, so the frontend needs no changes.
--
-- Identity & creation rules deliberately match the Phase 1 migration:
--   * name_norm  = lower(btrim(customer_name))
--   * phone_norm = btrim(coalesce(mobile_number, ''))
--   * blank name -> left unlinked (cannot identify an anonymous buyer)
--   * new identity -> a customers row is created (race-safe via the
--     customers_identity_idx unique index)
--
-- RUN ON STAGING FIRST.
-- ============================================================

begin;

-- ── Resolver: set NEW.customer_id from the normalized name+phone ─────
-- SECURITY INVOKER (default): inserts into customers run as the calling
-- user, which already holds the insert grant + RLS from Phase 1.
-- `set search_path` pins schema resolution so the unqualified customers
-- lookups can't be redirected by a caller-controlled search_path.
create or replace function public.resolve_customer_id()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
declare
  v_name_norm  text;
  v_phone_norm text;
  v_id         uuid;
begin
  -- No usable name → cannot identify a customer; leave unlinked.
  if coalesce(btrim(NEW.customer_name), '') = '' then
    NEW.customer_id := null;
    return NEW;
  end if;

  v_name_norm  := lower(btrim(NEW.customer_name));
  v_phone_norm := btrim(coalesce(NEW.mobile_number, ''));

  -- Existing identity?
  select id into v_id
  from public.customers
  where name_norm = v_name_norm and phone_norm = v_phone_norm;

  -- First time we've seen this (name, phone) → create it. The conflict
  -- target is the Phase 1 identity index; on a concurrent insert we lose
  -- the race harmlessly and re-select the winner's id.
  if v_id is null then
    insert into public.customers (name, phone)
    values (btrim(NEW.customer_name), nullif(v_phone_norm, ''))
    on conflict (name_norm, phone_norm) do nothing
    returning id into v_id;

    if v_id is null then
      select id into v_id
      from public.customers
      where name_norm = v_name_norm and phone_norm = v_phone_norm;
    end if;
  end if;

  NEW.customer_id := v_id;
  return NEW;
end;
$$;

-- ── Triggers ────────────────────────────────────────────────────────
-- `update of customer_name, mobile_number` applies to UPDATE only; every
-- INSERT fires regardless. So we re-resolve exactly when identity columns
-- change and on every new row, but skip churn on unrelated edits
-- (quantity, price, etc.).
drop trigger if exists sales_resolve_customer on public.sales;
create trigger sales_resolve_customer
  before insert or update of customer_name, mobile_number on public.sales
  for each row execute function public.resolve_customer_id();

drop trigger if exists credit_payments_resolve_customer on public.credit_payments;
create trigger credit_payments_resolve_customer
  before insert or update of customer_name, mobile_number on public.credit_payments
  for each row execute function public.resolve_customer_id();

commit;

-- ============================================================
-- VERIFICATION (run after)
-- ============================================================
-- 1. New named sale gets a customer_id automatically (then clean up):
  --   insert into public.sales
  --     (invoice_number, medicine_name, quantity, mrp, selling_rate,
  --      total_amount, payment_mode, customer_name, mobile_number)
  --   values ('TRIG-TEST', 'TRIGGER CHECK', 1, 1, 1, 1, 'Credit',
  --           'TRIGGER TEST CUSTOMER', '0000000000')
  --   returning customer_id;   -- expect NON-NULL
--   delete from public.sales where invoice_number = 'TRIG-TEST';
--   delete from public.customers where name_norm = 'trigger test customer';
--
-- 2. Anonymous (blank name) stays unlinked:
--   -- a row with customer_name = '' / NULL must come back with customer_id IS NULL
--
-- 3. No named row should ever be left unlinked again:
--   select count(*) from public.sales
--     where coalesce(btrim(customer_name),'') <> '' and customer_id is null;  -- expect 0

-- ============================================================
-- ROLLBACK
-- ============================================================
-- begin;
--   drop trigger if exists sales_resolve_customer on public.sales;
--   drop trigger if exists credit_payments_resolve_customer on public.credit_payments;
--   drop function if exists public.resolve_customer_id();
-- commit;
