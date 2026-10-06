-- =============================================================
-- Versiunea 2: cămară, congelator și raioane
-- -------------------------------------------------------------
-- Rulează o singură dată: Supabase → SQL Editor → New query →
-- lipești tot fișierul → Run. Datele existente rămân neatinse;
-- tot ce e acum în aplicație ajunge automat la „Frigider".
-- =============================================================


-- 1) Unde stă fiecare produs ---------------------------------------
alter table public.items
  add column location text not null default 'frigider'
  check (location in ('frigider', 'congelator', 'camara'));

-- Butoanele rapide au și ele un loc. Același nume poate exista în
-- două locuri (ex. „Carne tocată" la frigider și la congelator).
alter table public.quick_items
  add column location text not null default 'frigider'
  check (location in ('frigider', 'congelator', 'camara'));

alter table public.quick_items drop constraint if exists quick_items_name_key;
alter table public.quick_items add constraint quick_items_name_location_key unique (name, location);

insert into public.quick_items (name, location) values
  ('Carne tocată', 'congelator'), ('Piept de pui', 'congelator'), ('Pește', 'congelator'),
  ('Legume congelate', 'congelator'), ('Broccoli congelat', 'congelator'),
  ('Orez', 'camara'), ('Paste', 'camara'), ('Făină', 'camara'), ('Ulei', 'camara'),
  ('Ceapă', 'camara'), ('Cartofi', 'camara'), ('Usturoi', 'camara'),
  ('Năut la borcan', 'camara'), ('Pâine Wasa', 'camara')
on conflict do nothing;


-- 2) Raioanele alese de voi ----------------------------------------
-- Când mutați un produs în alt raion, alegerea se ține minte aici.
-- id = numele produsului, cu litere mici și fără diacritice.
create table public.aisles (
  id     text primary key,
  aisle  text not null
);

alter table public.aisles enable row level security;

create policy "doar membrii casei" on public.aisles
  for all to authenticated using (public.is_member()) with check (public.is_member());

alter publication supabase_realtime add table public.aisles;
