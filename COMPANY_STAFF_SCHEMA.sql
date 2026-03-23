-- Schema for Company Staff (HR Module)
-- Run this in your Supabase SQL Editor

create table if not exists company_staff (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  role text not null default 'Technician', -- Technician, Admin, Manager
  gross_salary_monthly numeric not null,
  social_security_cost_monthly numeric not null,
  contract_hours_yearly numeric default 1760,
  holidays_days numeric default 30,
  calculation_mode text default 'manual',
  net_salary_monthly numeric,
  irpf_percentage numeric,
  payments numeric
);

-- Enable Row Level Security (RLS)
alter table company_staff enable row level security;

-- Policy: Allow authenticated users to read/write
create policy "Enable all access for authenticated users" on company_staff
  for all using (auth.role() = 'authenticated');
