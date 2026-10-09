-- Sentinel — schéma initial : 7 tables, index, politiques RLS.
-- Les scénarios ne sont pas stockés : ils sont recalculés à l'affichage.

create extension if not exists pgcrypto;

-- Mise à jour automatique de updated_at.
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 1. Profils d'investissement -------------------------------------------------
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nom text not null check (char_length(nom) between 1 and 120),
  params jsonb not null,
  par_defaut boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_user_idx on public.profiles (user_id);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- 2. Zones de recherche ------------------------------------------------------
create table public.zones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nom text not null check (char_length(nom) between 1 and 120),
  -- Polygone GeoJSON (WGS84, EPSG:4326).
  geojson jsonb not null,
  -- Communes intersectées : [{ "code": "92012", "nom": "Boulogne-Billancourt" }, ...]
  communes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index zones_user_idx on public.zones (user_id);
create trigger zones_updated_at before update on public.zones
  for each row execute function public.set_updated_at();

-- 3. Biens ---------------------------------------------------------------------
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type_actif text not null check (type_actif in
    ('appartement','maison','immeuble','murs_commerciaux','fonds_commerce','titres_societe','murs_et_fonds')),
  titre text not null default '',
  adresse text not null default '',
  commune text,
  code_insee text,
  lat double precision,
  lon double precision,
  geocode_score real,
  geocode_label text,
  ban_id text,
  url text not null,
  url_normalisee text not null,
  profile_id uuid references public.profiles (id) on delete set null,
  -- Entrées { valeur, statut, source, date } (validées par Zod côté serveur).
  inputs jsonb not null default '{}'::jsonb,
  statut text not null default 'a_analyser' check (statut in
    ('a_analyser','a_visiter','offre_faite','rejete','acquis','archive')),
  motif_rejet text,
  notes text not null default '',
  checklist jsonb not null default '{}'::jsonb,
  -- Résultats d'enrichissement par source (statut, millésime, date de récupération).
  enrichissement jsonb not null default '{}'::jsonb,
  -- Instantanés d'analyse figés au passage « Offre faite ».
  instantanes jsonb not null default '[]'::jsonb,
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint properties_url_unique unique (user_id, url_normalisee),
  constraint properties_rejet_motif check (statut <> 'rejete' or coalesce(motif_rejet, '') <> '')
);
create index properties_user_statut_idx on public.properties (user_id, statut);
create index properties_user_url_idx on public.properties (user_id, url_normalisee);
create trigger properties_updated_at before update on public.properties
  for each row execute function public.set_updated_at();

-- 4. Historique des prix -------------------------------------------------------
create table public.price_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  date timestamptz not null default now(),
  prix numeric(14,2) not null check (prix > 0),
  origine text not null check (origine in ('saisie','import','restauration')),
  created_at timestamptz not null default now()
);
create index price_observations_property_date_idx on public.price_observations (property_id, date);
create index price_observations_user_idx on public.price_observations (user_id);

-- 5. Ventes DVF filtrées (données publiques partagées) ---------------------------
create table public.dvf_sales (
  id_mutation text primary key,
  date_mutation date not null,
  prix numeric(14,2) not null,
  type_local text not null,
  surface numeric(10,2),
  pieces integer,
  lon double precision,
  lat double precision,
  code_insee text not null,
  adresse text,
  millesime text not null,
  recupere_le timestamptz not null default now()
);
create index dvf_sales_insee_date_idx on public.dvf_sales (code_insee, date_mutation);

-- 6. Cache des sources externes (données publiques partagées) ---------------------
create table public.market_cache (
  id bigint generated always as identity primary key,
  source text not null,
  cle text not null,
  millesime text not null default '',
  url text,
  recupere_le timestamptz,
  derniere_tentative timestamptz not null default now(),
  statut text not null check (statut in ('ok','erreur')),
  message text,
  payload jsonb,
  constraint market_cache_unique unique (source, cle, millesime)
);
create index market_cache_source_idx on public.market_cache (source, derniere_tentative desc);

-- 7. Imports CSV ---------------------------------------------------------------
create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fichier text not null,
  lignes_acceptees integer not null default 0,
  lignes_rejetees integer not null default 0,
  erreurs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index import_jobs_user_idx on public.import_jobs (user_id);

-- Row Level Security ---------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.zones enable row level security;
alter table public.properties enable row level security;
alter table public.price_observations enable row level security;
alter table public.dvf_sales enable row level security;
alter table public.market_cache enable row level security;
alter table public.import_jobs enable row level security;

-- Tables du propriétaire : chaque utilisateur ne voit et ne modifie que ses lignes.
do $$
declare t text;
begin
  foreach t in array array['profiles','zones','properties','price_observations','import_jobs'] loop
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_delete_own', t);
  end loop;
end $$;

-- Une observation de prix ne peut viser qu'un bien du même utilisateur.
create policy price_observations_property_owner on public.price_observations
  as restrictive for insert to authenticated
  with check (exists (select 1 from public.properties p where p.id = property_id and p.user_id = (select auth.uid())));

-- Données publiques : lecture pour tout utilisateur connecté, écriture réservée au serveur (clé de service, qui contourne RLS).
create policy dvf_sales_read on public.dvf_sales for select to authenticated using (true);
create policy market_cache_read on public.market_cache for select to authenticated using (true);

-- Aucun accès anonyme.
revoke all on public.profiles, public.zones, public.properties, public.price_observations,
  public.dvf_sales, public.market_cache, public.import_jobs from anon;
