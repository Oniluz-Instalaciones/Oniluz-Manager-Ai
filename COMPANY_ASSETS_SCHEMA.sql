-- Schema for Company Assets (Assets & Amortization Module)
-- Run this in your Supabase SQL Editor

create table if not exists company_assets (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  type text not null default 'Equipment', -- Vehicle, Tool, Equipment, Other
  purchase_date date not null,
  cost numeric not null,
  useful_life_years numeric not null,
  residual_value numeric default 0
);

-- Enable Row Level Security (RLS)
alter table company_assets enable row level security;

-- Policy: Allow authenticated users to read/write
create policy "Enable all access for authenticated users" on company_assets
  for all using (auth.role() = 'authenticated');
