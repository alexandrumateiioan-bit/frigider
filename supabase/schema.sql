-- =============================================================
-- Baza de date pentru "Frigiderul nostru"
-- -------------------------------------------------------------
-- Cum o rulezi: Supabase → proiectul tău → SQL Editor → New query
-- → lipești tot fișierul → Run. Se rulează o singură dată.
--
-- ÎNAINTE de Run: înlocuiește cele două adrese de email de la
-- pasul 1 cu adresele voastre reale.
-- =============================================================


-- 1) Cine are voie în aplicație --------------------------------
-- Doar emailurile din tabelul ăsta văd și modifică datele.
-- Oricine altcineva reușește să se logheze vede o aplicație goală
-- și nu poate scrie nimic.
create table public.members (
  email text primary key
);

insert into public.members (email) values
  ('emailul-tau@exemplu.ro'),
  ('emailul-sotiei@exemplu.ro');

-- Tabelul members nu poate fi citit din aplicație (RLS fără reguli).
alter table public.members enable row level security;

-- Funcție care răspunde la întrebarea: „utilizatorul logat e din casă?"
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members
    where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;


-- 2) Tabelele aplicației ---------------------------------------

-- Ce e acum în frigider
create table public.items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  quantity    text check (char_length(quantity) <= 40),
  expires_on  date,
  added_by    text default (auth.jwt() ->> 'email'),
  created_at  timestamptz not null default now()
);

-- Lista de cumpărături comună
create table public.shopping (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  done        boolean not null default false,
  added_by    text default (auth.jwt() ->> 'email'),
  created_at  timestamptz not null default now()
);

-- Butoanele rapide (produsele cumpărate des)
create table public.quick_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(name) between 1 and 40),
  created_at  timestamptz not null default now()
);

insert into public.quick_items (name) values
  ('Lapte'), ('Ouă'), ('Unt'), ('Telemea'), ('Cașcaval'), ('Iaurt'),
  ('Smântână'), ('Șuncă'), ('Roșii'), ('Castraveți'), ('Ardei'),
  ('Piept de pui'), ('Carne tocată');


-- 3) Reguli de acces (Row Level Security) ----------------------
-- Fără regulile astea, cheia publică din config.js ar permite
-- oricui să citească datele. Cu ele, doar membrii casei au acces.
alter table public.items       enable row level security;
alter table public.shopping    enable row level security;
alter table public.quick_items enable row level security;

create policy "doar membrii casei" on public.items
  for all to authenticated using (public.is_member()) with check (public.is_member());

create policy "doar membrii casei" on public.shopping
  for all to authenticated using (public.is_member()) with check (public.is_member());

create policy "doar membrii casei" on public.quick_items
  for all to authenticated using (public.is_member()) with check (public.is_member());


-- 4) Sincronizare în timp real ---------------------------------
-- Când unul dintre voi modifică ceva, telefonul celuilalt află imediat.
alter publication supabase_realtime add table public.items, public.shopping, public.quick_items;


-- 5) Rețete private ---------------------------------------------
-- Rețetele din planul nutrițional nu stau în cod (care e public pe
-- GitHub), ci aici. Le adaugi rulând fișierul retete-plan.sql.
create table public.recipes (
  id    text primary key,
  data  jsonb not null
);

alter table public.recipes enable row level security;

create policy "doar membrii casei" on public.recipes
  for all to authenticated using (public.is_member()) with check (public.is_member());
