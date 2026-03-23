-- 1. CLEANUP (Optional - be careful in production)
-- drop table if exists company_taxes;
-- drop table if exists company_staff;
-- drop table if exists company_assets;
-- drop table if exists internal_ledger;

-- 2. TABLES STRUCTURE

-- COMPANY TAXES (Impuestos)
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

-- COMPANY STAFF (Empleados - Para IRPF 111)
create table if not exists company_staff (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  role text not null, -- 'Technician', 'Admin', 'Manager'
  gross_salary_monthly numeric not null,
  social_security_cost_monthly numeric not null,
  contract_hours_yearly numeric default 1760,
  holidays_days numeric default 30,
  calculation_mode text default 'manual',
  net_salary_monthly numeric,
  irpf_percentage numeric,
  payments numeric
);

-- COMPANY ASSETS (Activos - Para Amortizaciones)
create table if not exists company_assets (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  type text not null, -- 'Vehicle', 'Tool', 'Equipment'
  purchase_date date not null,
  cost numeric not null,
  useful_life_years numeric not null,
  residual_value numeric default 0
);

-- INTERNAL LEDGER (Gastos Fijos / OPEX)
create table if not exists internal_ledger (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  record_type text not null, -- 'INCOME', 'EXPENSE'
  name text not null,
  amount numeric not null,
  details jsonb default '{}'::jsonb -- frequency, category, nextDueDate
);

-- 3. SECURITY POLICIES (RLS)

alter table company_taxes enable row level security;
alter table company_staff enable row level security;
alter table company_assets enable row level security;
alter table internal_ledger enable row level security;

-- Policy: Allow full access to authenticated users
-- Drop first to avoid "policy already exists" error (Idempotency)
drop policy if exists "Enable all access for authenticated users" on company_taxes;
create policy "Enable all access for authenticated users" on company_taxes for all using (auth.role() = 'authenticated');

drop policy if exists "Enable all access for authenticated users" on company_staff;
create policy "Enable all access for authenticated users" on company_staff for all using (auth.role() = 'authenticated');

drop policy if exists "Enable all access for authenticated users" on company_assets;
create policy "Enable all access for authenticated users" on company_assets for all using (auth.role() = 'authenticated');

drop policy if exists "Enable all access for authenticated users" on internal_ledger;
create policy "Enable all access for authenticated users" on internal_ledger for all using (auth.role() = 'authenticated');

-- 4. SEED DATA (Datos de Ejemplo)

-- Staff
insert into company_staff (name, role, gross_salary_monthly, social_security_cost_monthly) values
('Juan Pérez', 'Technician', 1800, 600),
('Ana García', 'Technician', 1950, 650),
('Carlos Ruiz', 'Manager', 2500, 800),
('Laura M.', 'Admin', 1600, 550);

-- Assets
insert into company_assets (name, type, purchase_date, cost, useful_life_years) values
('Furgoneta Ford Transit', 'Vehicle', '2023-01-15', 22000, 10),
('Taladro Hilti Pro', 'Tool', '2023-03-10', 850, 5),
('Portátil Dell XPS', 'Equipment', '2023-06-01', 1500, 4);

-- Fixed Expenses (Ledger)
insert into internal_ledger (record_type, name, amount, details) values
('EXPENSE', 'Alquiler Nave', 1200, '{"frequency": "Monthly", "category": "Rent"}'),
('EXPENSE', 'Seguro RC', 2500, '{"frequency": "Yearly", "category": "Insurance"}'),
('EXPENSE', 'Software Licencias', 150, '{"frequency": "Monthly", "category": "Software"}'),
('EXPENSE', 'Gestoría', 180, '{"frequency": "Monthly", "category": "Professional Services"}');

-- Taxes (Historical & Upcoming)
insert into company_taxes (name, model, amount, due_date, status) values
('IVA 4T 2023', '303', 4500, '2024-01-30', 'Paid'),
('IRPF 4T 2023', '111', 2100, '2024-01-20', 'Paid'),
('IVA 1T 2024', '303', 3800, '2024-04-20', 'Pending'),
('IRPF 1T 2024', '111', 2150, '2024-04-20', 'Pending'),
('Imp. Sociedades (Pago a cuenta)', '202', 1200, '2024-04-20', 'Pending');
