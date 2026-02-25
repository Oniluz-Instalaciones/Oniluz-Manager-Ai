-- Schema for Internal Finance (CFO Module)
-- Run this in your Supabase SQL Editor

create table if not exists internal_ledger (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  record_type text not null check (record_type in ('EXPENSE', 'EMPLOYEE', 'ASSET')),
  name text not null,
  amount numeric not null, -- Stores: Expense Amount, Employee Gross Salary, or Asset Cost
  details jsonb not null default '{}'::jsonb -- Stores specific fields (frequency, role, dates, etc.)
);

-- Enable Row Level Security (RLS)
alter table internal_ledger enable row level security;

-- Policy: Allow authenticated users to read/write (adjust as needed for roles)
create policy "Enable all access for authenticated users" on internal_ledger
  for all using (auth.role() = 'authenticated');
