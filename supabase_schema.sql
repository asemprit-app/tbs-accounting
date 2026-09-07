-- Corre esto en Supabase: Project -> SQL Editor -> New query -> pega todo -> Run

create table if not exists transactions (
  id text primary key,
  date date not null,
  description text not null,
  amount numeric not null,
  gl text,
  status text default 'REVIEW',
  created_at timestamptz default now()
);

create table if not exists invoices (
  id text primary key,
  number text,
  client text not null,
  date date not null,
  lines jsonb not null,
  retention boolean default false,
  retention_pct numeric default 0,
  status text default 'Pendiente',
  paid numeric default 0,
  created_at timestamptz default now()
);

create table if not exists customers (
  id text primary key,
  name text not null,
  created_at timestamptz default now()
);

-- Habilita acceso (para empezar, abierto a cualquiera con la anon key --
-- suficiente para un solo negocio usando su propio proyecto de Supabase).
alter table transactions enable row level security;
alter table invoices enable row level security;
alter table customers enable row level security;

create policy "allow all transactions" on transactions for all using (true) with check (true);
create policy "allow all invoices" on invoices for all using (true) with check (true);
create policy "allow all customers" on customers for all using (true) with check (true);









Project ID: 

dtprdaukmcwmrijlasms

Anon public key: 

eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0cHJkYXVrbWN3bXJpamxhc21zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3ODA3MTUsImV4cCI6MjEwNDM1NjcxNX0.ss8ymhHzZt3WyeffEFz_gE_J2ISvu2pYTieMpPAXOas

