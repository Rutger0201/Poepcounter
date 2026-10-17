-- Jarvis voor DeMIX: database voor Supabase (SQL Editor > New query > plakken > Run)
-- Alleen de Jarvis-server leest en schrijft (met de service role key). Row Level Security staat aan
-- zonder policies, zodat de browser met de anon key niets rechtstreeks kan lezen.

create table if not exists medewerkers (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  email text unique,
  locatie text not null check (locatie in ('Almere', 'Nieuwegein')),
  rol text not null check (rol in ('medewerker', 'teamleider', 'clubmanager', 'td')),
  afdeling text not null check (afdeling in ('receptie', 'fitness', 'groepsles', 'td', 'management')),
  actief boolean not null default true,
  pin_hash text
);

create table if not exists tablets (
  id uuid primary key default gen_random_uuid(),
  naam text not null default 'Balie-tablet',
  locatie text not null check (locatie in ('Almere', 'Nieuwegein')),
  email text not null unique
);

create table if not exists apparaten (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  naam text not null,
  locatie text not null,
  actief boolean not null default true
);

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  nummer text not null,
  locatie text not null,
  apparaat_code text,
  apparaat_naam text,
  omschrijving text not null,
  prio int not null check (prio in (1, 2, 3)),
  status text not null default 'open' check (status in ('open', 'bezig', 'klaar')),
  bron text not null default 'app',
  gemeld_door uuid references medewerkers(id),
  gemeld_op timestamptz not null default now(),
  opgepakt_door uuid references medewerkers(id),
  notitie text,
  klaar_op timestamptz,
  unique (locatie, nummer)
);

create table if not exists checklists (
  id uuid primary key default gen_random_uuid(),
  locatie text not null,
  medewerker_id uuid not null references medewerkers(id),
  datum date not null,
  dienst text not null check (dienst in ('ochtend', 'middag', 'avond')),
  taken jsonb not null default '{}',
  leden_contact int not null default 0,
  incident text,
  bijzonderheden text,
  ingeleverd_op timestamptz not null default now(),
  afgetekend_door uuid references medewerkers(id),
  afgetekend_op timestamptz,
  unique (medewerker_id, datum, dienst)
);

create table if not exists overuren (
  id uuid primary key default gen_random_uuid(),
  locatie text not null,
  medewerker_id uuid not null references medewerkers(id),
  datum date not null,
  start text not null,
  eind text not null,
  pauze int not null default 0,
  uren numeric(5, 2) not null,
  reden text not null,
  status text not null default 'wacht' check (status in ('wacht', 'goed', 'afgewezen')),
  aangevraagd_op timestamptz not null default now(),
  beoordeeld_door uuid references medewerkers(id),
  beoordeeld_op timestamptz
);

create table if not exists ruilverzoeken (
  id uuid primary key default gen_random_uuid(),
  locatie text not null,
  aanvrager_id uuid not null references medewerkers(id),
  collega_id uuid not null references medewerkers(id),
  datum date not null,
  dienst text not null check (dienst in ('ochtend', 'middag', 'avond')),
  reden text,
  status text not null default 'collega' check (status in ('collega', 'wacht', 'goed', 'afgewezen', 'geweigerd', 'ingetrokken')),
  aangevraagd_op timestamptz not null default now(),
  beoordeeld_door uuid references medewerkers(id),
  beoordeeld_op timestamptz
);

create index if not exists tickets_locatie on tickets (locatie, status);
create index if not exists checklists_locatie on checklists (locatie, datum);
create index if not exists overuren_locatie on overuren (locatie, datum);
create index if not exists ruil_locatie on ruilverzoeken (locatie, datum);

alter table medewerkers enable row level security;
alter table tablets enable row level security;
alter table apparaten enable row level security;
alter table tickets enable row level security;
alter table checklists enable row level security;
alter table overuren enable row level security;
alter table ruilverzoeken enable row level security;

-- Startgegevens: pas namen en e-mailadressen aan. De clubmanagers voegen daarna zelf collega's toe in de app.
insert into medewerkers (naam, email, locatie, rol, afdeling) values
  ('Clubmanager Almere', 'clubmanager-almere@example.com', 'Almere', 'clubmanager', 'management'),
  ('Clubmanager Nieuwegein', 'clubmanager-nieuwegein@example.com', 'Nieuwegein', 'clubmanager', 'management')
on conflict (email) do nothing;
insert into tablets (naam, locatie, email) values
  ('Balie-tablet', 'Almere', 'tablet-almere@example.com'),
  ('Balie-tablet', 'Nieuwegein', 'tablet-nieuwegein@example.com')
on conflict (email) do nothing;
