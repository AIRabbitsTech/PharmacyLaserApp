-- ============================================================
-- Phase 1 — Reviewed data cleanup (run AFTER 20260628120000_phase1_customers.sql)
-- ============================================================
-- Collapses duplicate/fragmented customer identities by MERGING customer
-- rows. Because customers now exist, a "merge" is one operation: re-point
-- B's sales & payments to A, fix the name/mobile snapshot, delete B.
--
-- SAFETY:
--   * Tier 1 (blank-mobile backfill) is active — same name, one real number.
--   * Tier 2 / Tier 3 require YOUR decision and are commented out.
--   * A money-preservation guard aborts the whole transaction if total
--     outstanding changes (it must NOT change — only the customer count drops).
--
-- HOW TO RUN: review, uncomment your Tier 2/3 choices, run on STAGING first.
-- Change the final COMMIT to ROLLBACK to do a dry-run.
-- ============================================================

-- ── Reusable merge helper ───────────────────────────────────
-- Merges customer (src_name, src_phone) INTO (dst_name, dst_phone):
-- re-points sales + credit_payments, refreshes the snapshot strings,
-- deletes the source. No-op (with notice) if either side is missing.
create or replace function public.merge_customer(
  p_src_name text, p_src_phone text,
  p_dst_name text, p_dst_phone text
) returns void language plpgsql as $$
declare
  v_src uuid;
  v_dst uuid;
  v_dst_name  text;
  v_dst_phone text;
begin
  select id into v_src from public.customers
   where name_norm = lower(btrim(p_src_name))
     and phone_norm = btrim(coalesce(p_src_phone, ''));

  select id, name, phone into v_dst, v_dst_name, v_dst_phone from public.customers
   where name_norm = lower(btrim(p_dst_name))
     and phone_norm = btrim(coalesce(p_dst_phone, ''));

  if v_src is null or v_dst is null then
    raise notice 'merge skipped: "%"/% or "%"/% not found', p_src_name, p_src_phone, p_dst_name, p_dst_phone;
    return;
  end if;
  if v_src = v_dst then
    raise notice 'merge skipped: source = destination for "%"', p_dst_name;
    return;
  end if;

  update public.sales
     set customer_id   = v_dst,
         customer_name = v_dst_name,
         mobile_number = coalesce(nullif(v_dst_phone, ''), mobile_number)
   where customer_id = v_src;

  update public.credit_payments
     set customer_id   = v_dst,
         customer_name = v_dst_name,
         mobile_number = coalesce(nullif(v_dst_phone, ''), mobile_number)
   where customer_id = v_src;

  delete from public.customers where id = v_src;
  raise notice 'merged "%"/% -> "%"/%', p_src_name, p_src_phone, p_dst_name, p_dst_phone;
end;
$$;

-- ============================================================
begin;

-- Baseline for the money-preservation guard.
create temp table _baseline on commit drop as
  select sum(outstanding) as total, count(*) as customers
  from public.customer_outstanding;

-- ── TIER 1 — blank-mobile backfill (safe; same name, one real number) ──
select public.merge_customer('SACHIN SHUKLA',                '', 'SACHIN SHUKLA',                '6388217877');
select public.merge_customer('RAJAT BAJPAI',                 '', 'RAJAT BAJPAI',                 '8005213199');
select public.merge_customer('UMESH CHANDRA JOSHI',          '', 'UMESH CHANDRA JOSHI',          '8400772802');
select public.merge_customer('AMBUJ VERMA',                  '', 'AMBUJ VERMA',                  '9450593489');
select public.merge_customer('TRIVEDI JI',                   '', 'TRIVEDI JI',                   '8853781094');
select public.merge_customer('IRFAN JI',                     '', 'IRFAN JI',                     '7607216566');
select public.merge_customer('VIJAY AWASTHI',                '', 'VIJAY AWASTHI',                '9919124141');
select public.merge_customer('SHAISHAV KAUSHAL ( TASIRON)',  '', 'SHAISHAV KAUSHAL ( TASIRON)',  '7895970194');

-- ── TIER 2 — name merges (CONFIRM, then uncomment) ──────────
-- GYANENDRA TIWARI JI = GYANENDRA TIWARI (same person, both on 6394369616) —
-- RESOLVED manually by owner.
--
-- SEPARATE identity: "GYANENDRA" sits on a DIFFERENT number (9115056093, a credit
-- customer) — NOT a stray of GYANENDRA TIWARI. Likely a different person or a
-- second number. Owner judgment: merge ONLY if it is the same person, else leave
-- (they do not collide). If same person:
-- select public.merge_customer('GYANENDRA', '9115056093', 'GYANENDRA TIWARI', '6394369616');
--
-- DO NOT MERGE RAHUL / RAHUL PANDEY — owner confirmed they are DIFFERENT people.
-- Owner separated them: RAHUL now has no number, RAHUL PANDEY keeps 9670592337.

-- ── TIER 3 — shared phones (DIFFERENT people, keep both; flag intentional) ──
-- Already resolved manually: SHARAD UNCLE SRIJAN = 9415094232,
-- NEERAJ BHAIYA SRIJAN = 8318493064 (8318493064 no longer shared).
--
-- 3a) 9670592337 -> RAHUL PANDEY + RAHUL — owner-confirmed DIFFERENT people on a
--     shared number. Keep both customers; after Phase 1 mark them intentional so
--     dedup never flags them:
--   update public.customers set shares_phone = true where phone_norm = '9670592337';
--
-- 3b) 7905026794 -> TRIPATHI vs VIVEK PATHAK — YOUR call:
--   • If same person:   select public.merge_customer('VIVEK PATHAK','7905026794','TRIPATHI','7905026794');
--   • If shared phone:  update public.customers set shares_phone = true where phone_norm = '7905026794';

-- ── Money-preservation guard (aborts if total outstanding changed) ──
do $$
declare v_before numeric; v_after numeric;
begin
  select total into v_before from _baseline;
  select coalesce(sum(outstanding), 0) into v_after from public.customer_outstanding;
  if round(v_before) <> round(v_after) then
    raise exception 'ABORT: outstanding changed before=% after=% — review merges', round(v_before), round(v_after);
  end if;
  raise notice 'OK: outstanding unchanged at % (customer rows may have dropped)', round(v_after);
end;
$$;

-- Review the NOTICE above. If happy, COMMIT; to dry-run, change to ROLLBACK.
commit;

-- ============================================================
-- VERIFICATION (run after commit)
-- ============================================================
-- Outstanding total (must equal pre-cleanup value):
--   select round(sum(outstanding)) total, count(*) customers from public.customer_outstanding;
--
-- Remaining phones with >1 customer (should only be deliberate shares_phone=true):
--   select phone_norm, count(*), bool_or(shares_phone) intentional
--   from public.customers where phone_norm <> '' group by phone_norm having count(*) > 1;
--
-- Remaining blank-mobile customers (Tier 1 should have cleared the ones above):
--   select name, phone from public.customers where coalesce(phone,'') = '' order by name;
