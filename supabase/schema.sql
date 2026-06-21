-- ============================================================
-- Pharmacy Sales Ledger - Supabase Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- Sales Table
-- ============================================================
create table if not exists public.sales (
  id              uuid default uuid_generate_v4() primary key,
  sale_date       date not null default current_date,
  -- invoice_number is NOT unique: one invoice can span multiple rows (one per medicine)
  invoice_number  text not null,
  medicine_name   text not null,
  quantity        numeric(10, 2) not null check (quantity > 0),
  mrp             numeric(10, 2) not null check (mrp >= 0),
  -- selling_rate = mrp × (1 − row_discount%), stored per row for margin reporting
  selling_rate    numeric(10, 2) not null check (selling_rate >= 0),
  total_amount    numeric(10, 2) not null check (total_amount >= 0),
  payment_mode    text not null check (payment_mode in ('Cash', 'UPI', 'Credit')),
  customer_name   text,
  mobile_number   text,
  batch_number    text,
  expiry_date     text,
  discount        numeric(5, 2) default 0 check (discount >= 0 and discount <= 100),
  bill_discount   numeric(5, 2) default 0 check (bill_discount >= 0 and bill_discount <= 100),
  remarks         text,
  created_at      timestamptz default now() not null
);

-- Indexes for fast queries
create index if not exists sales_sale_date_idx        on public.sales (sale_date desc);
create index if not exists sales_invoice_number_idx   on public.sales (invoice_number);
create index if not exists sales_medicine_name_idx    on public.sales (medicine_name);
create index if not exists sales_payment_mode_idx     on public.sales (payment_mode);
create index if not exists sales_customer_name_idx    on public.sales (customer_name);
create index if not exists sales_mobile_number_idx    on public.sales (mobile_number);
create index if not exists sales_expiry_date_idx      on public.sales (expiry_date);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
alter table public.sales enable row level security;

-- Policy: Require authentication for all operations.
-- Only users logged in via Supabase Auth can read or write data.
create policy "Allow authenticated access to sales"
  on public.sales
  for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- Credit Payments Table
-- ============================================================
create table if not exists public.credit_payments (
  id            uuid default uuid_generate_v4() primary key,
  customer_name text not null,
  mobile_number text,
  amount        numeric(10, 2) not null check (amount > 0),
  payment_mode  text not null check (payment_mode in ('Cash', 'UPI')),
  paid_date     date not null default current_date,
  remarks       text,
  created_at    timestamptz default now() not null
);

create index if not exists credit_payments_customer_idx on public.credit_payments (customer_name);
create index if not exists credit_payments_paid_date_idx on public.credit_payments (paid_date desc);

alter table public.credit_payments enable row level security;

create policy "Allow authenticated access to credit_payments"
  on public.credit_payments
  for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- RLS Migration (run this in Supabase SQL Editor if tables
-- already exist with the old permissive policies)
-- ============================================================
-- drop policy if exists "Allow all access to sales" on public.sales;
-- drop policy if exists "Allow all access to credit_payments" on public.credit_payments;
--
-- create policy "Allow authenticated access to sales"
--   on public.sales for all to authenticated
--   using (true) with check (true);
--
-- create policy "Allow authenticated access to credit_payments"
--   on public.credit_payments for all to authenticated
--   using (true) with check (true);

-- ============================================================
-- Sample Data (optional - remove in production)
-- ============================================================
-- insert into public.sales (sale_date, invoice_number, medicine_name, quantity, mrp, selling_rate, total_amount, payment_mode, customer_name)
-- values
--   (current_date, 'INV-0001', 'Paracetamol 500mg', 2, 15.00, 14.00, 28.00, 'Cash', 'Rahul Sharma'),
--   (current_date, 'INV-0002', 'Amoxicillin 250mg', 1, 45.00, 42.00, 42.00, 'UPI', NULL),
--   (current_date, 'INV-0003', 'Cetirizine 10mg', 3, 8.00, 7.50, 22.50, 'Credit', 'Priya Patel');
