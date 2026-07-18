-- ============================================================
-- Sales edit-tracking — add updated_at, stamped on every write
-- ============================================================
-- WHY THIS EXISTS:
-- The sales table only had created_at, so there was no reliable way to
-- tell which bills had been edited. "Item added later" edits could be
-- inferred (a new row with the same invoice_number but a later
-- created_at), but edits that only CHANGED a value (price, quantity,
-- customer name) or DELETED a line left no trace at all.
--
-- WHAT IT DOES:
--   1. Adds sales.updated_at (defaults to now() for new rows).
--   2. Backfills existing rows so updated_at = created_at — otherwise
--      every historical bill would falsely look "just edited".
--   3. A BEFORE UPDATE trigger refreshes updated_at on any change, so
--      from now on updated_at > created_at means the row was edited.
--
-- SAFE / ADDITIVE:
--   * Inserts (createSale / bulkCreateSales / ImportData) name their
--     columns, so the new column just takes its default.
--   * select('*') simply returns the extra field; the UI ignores it.
--   * Views (customer_outstanding, etc.) select explicit columns and
--     are unaffected.
--
-- RUN ON STAGING FIRST.
-- ============================================================

begin;

-- ── 1. Column ───────────────────────────────────────────────
alter table public.sales
  add column if not exists updated_at timestamptz not null default now();

-- ── 2. Backfill: existing rows were last touched when created ─
update public.sales
  set updated_at = created_at
  where updated_at is distinct from created_at;

-- ── 3. Keep updated_at fresh on every UPDATE ────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sales_set_updated_at on public.sales;
create trigger sales_set_updated_at
  before update on public.sales
  for each row execute function public.set_updated_at();

commit;

-- ── Verify (run separately) ─────────────────────────────────
-- Bills edited after creation, most recently first:
--   select invoice_number, customer_name, min(created_at) as created,
--          max(updated_at) as last_edited
--     from public.sales
--     group by invoice_number, customer_name
--     having max(updated_at) > min(created_at) + interval '2 seconds'
--     order by last_edited desc;
