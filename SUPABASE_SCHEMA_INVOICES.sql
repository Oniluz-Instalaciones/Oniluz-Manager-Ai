-- 5. INVOICES (Facturación Relacional)
-- Ejecuta este script si quieres que las facturas se guarden también en tablas SQL
-- además de en el JSON del proyecto.

create table if not exists invoices (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  project_id text not null, -- ID del proyecto (puede ser string timestamp o UUID)
  number text not null,
  date date not null,
  due_date date,
  client_name text,
  client_address text,
  client_nif text,
  subtotal numeric default 0,
  tax_rate numeric default 21,
  tax_amount numeric default 0,
  total numeric default 0,
  status text default 'Draft', -- 'Draft', 'Sent', 'Paid'
  stock_deducted boolean default false
);

alter table invoices enable row level security;

create policy "Enable all access for authenticated users" on invoices
  for all using (auth.role() = 'authenticated');


create table if not exists invoice_items (
  id uuid default gen_random_uuid() primary key,
  invoice_id uuid references invoices(id) on delete cascade,
  description text,
  quantity numeric default 1,
  unit_price numeric default 0,
  amount numeric default 0
);

alter table invoice_items enable row level security;

create policy "Enable all access for authenticated users" on invoice_items
  for all using (auth.role() = 'authenticated');
