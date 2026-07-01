-- ============================================================
-- Find near-duplicate medicine names in public.sales (READ-ONLY)
-- ============================================================
-- The Quick Sale autocomplete is built from DISTINCT medicine_name values in
-- the sales table. Inconsistent manual entry over time (case, extra spaces,
-- space vs no-space, stray punctuation) creates several spellings of the SAME
-- medicine, which then show up as "duplicate" suggestions
-- (e.g. "ACILOC 300" vs "ACILOC300").
--
-- This script ONLY REPORTS. It changes nothing. Use it to review the variants,
-- then write/uncomment targeted UPDATEs to merge them onto a canonical name.
--
-- Two normalization strengths are provided:
--   * SAFE    : case-fold + collapse whitespace. Matches the UI dedup. Merging
--               these is low-risk.
--   * LOOSE   : also strips ALL spaces and non-alphanumerics. Catches
--               "ACILOC 300" vs "ACILOC300" vs "ACILOC-300", but CAN group
--               genuinely different medicines — review each group by hand.
-- ============================================================

-- ── Query A: SAFE groups (case/whitespace only) with >1 distinct spelling ──
-- These are safe to auto-merge to a single canonical spelling.
select
  upper(regexp_replace(btrim(medicine_name), '\s+', ' ', 'g')) as safe_key,
  count(distinct medicine_name)                                as variant_count,
  array_agg(distinct medicine_name order by medicine_name)     as variants,
  count(*)                                                     as total_rows
from public.sales
where medicine_name is not null and btrim(medicine_name) <> ''
group by safe_key
having count(distinct medicine_name) > 1
order by variant_count desc, safe_key;

-- ── Query B: LOOSE groups (also ignores spaces & punctuation) ──────────────
-- Catches "ACILOC 300" vs "ACILOC300". REVIEW EACH GROUP — this can merge
-- unrelated names, so do not blindly trust it.
select
  upper(regexp_replace(btrim(medicine_name), '[^a-zA-Z0-9]', '', 'g')) as loose_key,
  count(distinct medicine_name)                                        as variant_count,
  array_agg(distinct medicine_name order by medicine_name)             as variants,
  count(*)                                                             as total_rows
from public.sales
where medicine_name is not null and btrim(medicine_name) <> ''
group by loose_key
having count(distinct medicine_name) > 1
order by variant_count desc, loose_key;

-- ── Query C: per-variant detail for a chosen group ─────────────────────────
-- Drill into one suspected group to decide the canonical name. Replace the
-- key value below, then run. Shows how often each spelling was used and when
-- it was last sold (most-used / most-recent usually makes the best canonical).
-- select
--   medicine_name,
--   count(*)            as times_used,
--   max(created_at)     as last_used,
--   max(batch_number)   as sample_batch,
--   max(expiry_date)    as sample_expiry
-- from public.sales
-- where upper(regexp_replace(btrim(medicine_name), '[^a-zA-Z0-9]', '', 'g')) = 'ACILOC300'
-- group by medicine_name
-- order by times_used desc;

-- ============================================================
-- MERGE TEMPLATE (commented — run on STAGING / inside a transaction first)
-- ============================================================
-- Once you've picked a canonical spelling for a group, normalize every row.
-- Wrap in a transaction and dry-run with ROLLBACK before COMMIT.
--
-- begin;
--   -- Example: collapse all spellings of ACILOC 300 to one canonical name.
--   update public.sales
--      set medicine_name = 'ACILOC 300'
--    where upper(regexp_replace(btrim(medicine_name), '[^a-zA-Z0-9]', '', 'g')) = 'ACILOC300'
--      and medicine_name <> 'ACILOC 300';
--
--   -- Repeat one update per reviewed group...
-- -- rollback;  -- dry-run: see rows affected without persisting
-- -- commit;    -- persist once verified
--
-- OPTIONAL bulk SAFE normalization (case/whitespace only — low risk):
-- begin;
--   update public.sales
--      set medicine_name = upper(regexp_replace(btrim(medicine_name), '\s+', ' ', 'g'))
--    where medicine_name <> upper(regexp_replace(btrim(medicine_name), '\s+', ' ', 'g'));
-- -- rollback;
-- -- commit;
-- ============================================================


-- ============================================================
-- AUTO-MERGE loose duplicates (e.g. ACILOC300 -> ACILOC 300)
-- ============================================================
-- Canonical spelling per loose group = the one used in the MOST rows
-- (ties: most recently used, then alphabetical). Everything else in the group
-- is rewritten to it.
--
-- !!! REVIEW BEFORE COMMITTING !!!
-- The loose key ignores spaces & punctuation, so it CAN group medicines that
-- are not actually the same. ALWAYS run STEP 1 (preview) first and read the
-- `would_merge` column. If any row fuses unrelated names, do NOT run the bulk
-- merge — instead use the per-group template above for only the safe groups.

-- ── STEP 1: PREVIEW — exactly what the merge would do (changes nothing) ─────
-- Read each row: every name in `would_merge` becomes `canonical_name`.
with ranked as (
  select
    medicine_name,
    upper(regexp_replace(btrim(medicine_name), '[^a-zA-Z0-9]', '', 'g')) as loose_key,
    count(*)        as cnt,
    max(created_at) as last_used
  from public.sales
  where medicine_name is not null and btrim(medicine_name) <> ''
  group by medicine_name
),
canon as (
  select
    loose_key,
    (array_agg(medicine_name order by cnt desc, last_used desc, medicine_name))[1] as canonical_name,
    array_agg(medicine_name order by cnt desc, last_used desc, medicine_name)      as would_merge,
    count(*)  as variant_count,
    sum(cnt)  as rows_affected
  from ranked
  group by loose_key
)
select canonical_name, would_merge, variant_count, rows_affected
from canon
where variant_count > 1
order by variant_count desc, canonical_name;

-- ── STEP 2: APPLY — run only after the preview looks correct ────────────────
-- Wrapped in a transaction. It reports rows changed; finish with COMMIT to keep
-- or ROLLBACK to discard (dry-run).
-- begin;
--   with ranked as (
--     select
--       medicine_name,
--       upper(regexp_replace(btrim(medicine_name), '[^a-zA-Z0-9]', '', 'g')) as loose_key,
--       count(*)        as cnt,
--       max(created_at) as last_used
--     from public.sales
--     where medicine_name is not null and btrim(medicine_name) <> ''
--     group by medicine_name
--   ),
--   canon as (
--     select
--       loose_key,
--       (array_agg(medicine_name order by cnt desc, last_used desc, medicine_name))[1] as canonical_name
--     from ranked
--     group by loose_key
--     having count(*) > 1
--   )
--   update public.sales s
--      set medicine_name = c.canonical_name
--     from canon c
--    where upper(regexp_replace(btrim(s.medicine_name), '[^a-zA-Z0-9]', '', 'g')) = c.loose_key
--      and s.medicine_name <> c.canonical_name;
-- -- rollback;  -- dry-run: see how many rows would change
-- -- commit;    -- persist once verified
-- ============================================================

