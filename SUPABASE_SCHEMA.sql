-- 1. COMPANY STAFF (Empleados)
create table if not exists company_staff (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  role text not null, -- 'Technician', 'Admin', 'Manager'
  gross_salary_monthly numeric not null,
  social_security_cost_monthly numeric not null,
  contract_hours_yearly numeric default 1760,
  holidays_days numeric default 30
);

alter table company_staff enable row level security;

create policy "Enable all access for authenticated users" on company_staff
  for all using (auth.role() = 'authenticated');


-- 2. COMPANY ASSETS (Activos: Furgonetas, Herramientas)
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

alter table company_assets enable row level security;

create policy "Enable all access for authenticated users" on company_assets
  for all using (auth.role() = 'authenticated');


-- 3. COMPANY TAXES (Impuestos)
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

alter table company_taxes enable row level security;

create policy "Enable all access for authenticated users" on company_taxes
  for all using (auth.role() = 'authenticated');

-- 4. INTERNAL LEDGER (Gastos Generales / OPEX)
-- (Incluido por si acaso no existe, ya que se usa en la app)
create table if not exists internal_ledger (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  record_type text not null, -- 'INCOME', 'EXPENSE'
  name text not null,
  amount numeric not null,
  details jsonb default '{}'::jsonb -- frequency, category, nextDueDate
);

alter table internal_ledger enable row level security;

create policy "Enable all access for authenticated users" on internal_ledger
  for all using (auth.role() = 'authenticated');
