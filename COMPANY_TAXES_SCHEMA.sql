-- Schema for Company Taxes (Fiscal Module)
-- Run this in your Supabase SQL Editor

create table if not exists company_taxes (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  model text not null, -- '303', '111', '202'
  amount numeric not null,
  due_date date not null,
  status text not null default 'Pending', -- 'Pending', 'Paid'
  payment_date date
);

-- Enable Row Level Security (RLS)
alter table company_taxes enable row level security;

-- Policy: Allow authenticated users to read/write
create policy "Enable all access for authenticated users" on company_taxes
  for all using (auth.role() = 'authenticated');
