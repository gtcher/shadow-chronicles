-- ════════════════════════════════════════════════════════════════════════════
--  Shadow Chronicles · comptes, sauvegarde cloud et classement en ligne
--  À coller UNE FOIS dans Supabase > SQL Editor > New query, puis « Run ».
--  Le script peut être relancé sans risque (il ne supprime aucune donnée).
--
--  Sécurité :
--   - chaque joueur ne lit et n'écrit QUE sa propre sauvegarde ;
--   - les scores ne s'écrivent que par les fonctions submit_* (contrôles de vraisemblance,
--     anti-rafale) : aucune écriture directe dans les tables de classement ;
--   - le classement (pseudo + scores) est lisible par tout le monde, sans compte.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Profils publics (pseudo) ───────────────────────────────────────────────
create table if not exists public.players (
  id          uuid primary key references auth.users (id) on delete cascade,
  pseudo      text not null,
  created_at  timestamptz not null default now(),
  -- Progression (mise à jour par submit_run uniquement)
  best_wave   int  not null default 0,
  wins        int  not null default 0,
  runs        int  not null default 0,
  best_time   int,                     -- meilleure victoire, en secondes
  chests      int  not null default 0, -- coffres des missions du jour ouverts
  streak_max  int  not null default 0, -- meilleure série du défi du jour
  last_run_at timestamptz,
  constraint pseudo_format check (pseudo ~ '^[A-Za-z0-9À-ÖØ-öø-ÿ _.\-]{3,16}$')
);
create unique index if not exists players_pseudo_lower on public.players (lower(pseudo));
create index if not exists players_rank on public.players (best_wave desc, wins desc, best_time asc nulls last);
create index if not exists players_chests on public.players (chests desc);

-- ─── Runs classées (historique, lisible par tous) ───────────────────────────
create table if not exists public.runs (
  id         bigint generated always as identity primary key,
  player_id  uuid not null references public.players (id) on delete cascade,
  hero       text not null check (hero in ('taro', 'mei', 'sena', 'ren')),
  mode       text not null check (mode in ('survie', 'cauchemar')),
  wave       int  not null check (wave between 1 and 200),
  won        boolean not null,
  time_sec   int  not null check (time_sec between 1 and 36000),
  kills      int  not null check (kills between 0 and 100000),
  pact       int  not null default 0 check (pact between 0 and 100),
  discovery  boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists runs_player on public.runs (player_id, created_at desc);
create index if not exists runs_best on public.runs (hero, wave desc, time_sec asc);

-- ─── Défi du jour : un seul score par joueur et par jour (le premier essai) ─
create table if not exists public.daily_scores (
  player_id  uuid not null references public.players (id) on delete cascade,
  day        date not null,
  hero       text not null check (hero in ('taro', 'mei', 'sena', 'ren')),
  score      int  not null check (score between 0 and 1000000),
  wave       int  not null check (wave between 1 and 200),
  won        boolean not null,
  created_at timestamptz not null default now(),
  primary key (player_id, day)
);
create index if not exists daily_rank on public.daily_scores (day, score desc);

-- ─── Sauvegarde cloud (privée) ──────────────────────────────────────────────
create table if not exists public.cloud_saves (
  player_id  uuid primary key references auth.users (id) on delete cascade,
  profile    jsonb not null,
  settings   jsonb not null default '{}'::jsonb,
  rev        int  not null default 0,
  device     text,
  updated_at timestamptz not null default now(),
  constraint save_size check (pg_column_size(profile) + pg_column_size(settings) < 1000000)
);

-- ─── Règles d'accès (RLS) ───────────────────────────────────────────────────
alter table public.players      enable row level security;
alter table public.runs         enable row level security;
alter table public.daily_scores enable row level security;
alter table public.cloud_saves  enable row level security;

drop policy if exists "classement lisible par tous" on public.players;
create policy "classement lisible par tous" on public.players for select using (true);
drop policy if exists "runs lisibles par tous" on public.runs;
create policy "runs lisibles par tous" on public.runs for select using (true);
drop policy if exists "défis lisibles par tous" on public.daily_scores;
create policy "défis lisibles par tous" on public.daily_scores for select using (true);

drop policy if exists "ma sauvegarde : lire" on public.cloud_saves;
create policy "ma sauvegarde : lire" on public.cloud_saves for select to authenticated using (auth.uid() = player_id);
drop policy if exists "ma sauvegarde : créer" on public.cloud_saves;
create policy "ma sauvegarde : créer" on public.cloud_saves for insert to authenticated with check (auth.uid() = player_id);
drop policy if exists "ma sauvegarde : modifier" on public.cloud_saves;
create policy "ma sauvegarde : modifier" on public.cloud_saves for update to authenticated using (auth.uid() = player_id) with check (auth.uid() = player_id);
drop policy if exists "ma sauvegarde : supprimer" on public.cloud_saves;
create policy "ma sauvegarde : supprimer" on public.cloud_saves for delete to authenticated using (auth.uid() = player_id);

-- Aucune écriture directe dans les tables du classement : seulement via les fonctions ci-dessous.
revoke insert, update, delete on public.players, public.runs, public.daily_scores from anon, authenticated;
grant select on public.players, public.runs, public.daily_scores to anon, authenticated;
grant select, insert, update, delete on public.cloud_saves to authenticated;

-- ─── Fonctions (seul chemin d'écriture des scores) ──────────────────────────

-- Choisir / changer son pseudo.
create or replace function public.set_pseudo(p_pseudo text)
returns public.players
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); out_row public.players;
begin
  if uid is null then raise exception 'Connexion requise' using errcode = '28000'; end if;
  p_pseudo := btrim(p_pseudo);
  if p_pseudo !~ '^[A-Za-z0-9À-ÖØ-öø-ÿ _.\-]{3,16}$' then
    raise exception 'Pseudo : 3 à 16 lettres, chiffres, espaces, . _ -' using errcode = '22023';
  end if;
  if exists (select 1 from players where lower(pseudo) = lower(p_pseudo) and id <> uid) then
    raise exception 'Ce pseudo est déjà pris' using errcode = '23505';
  end if;
  insert into players (id, pseudo) values (uid, p_pseudo)
    on conflict (id) do update set pseudo = excluded.pseudo
    returning * into out_row;
  return out_row;
end $$;

-- Envoyer une run terminée (hors défi du jour).
create or replace function public.submit_run(
  p_hero text, p_mode text, p_wave int, p_won boolean, p_time_sec int, p_kills int,
  p_pact int default 0, p_discovery boolean default false, p_chests int default null, p_streak_max int default null)
returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); pl public.players; r_id bigint;
begin
  if uid is null then raise exception 'Connexion requise' using errcode = '28000'; end if;
  select * into pl from players where id = uid for update;
  if not found then raise exception 'Choisis un pseudo d''abord' using errcode = 'P0002'; end if;
  -- Anti-rafale : une run toutes les 20 secondes au plus.
  if pl.last_run_at is not null and pl.last_run_at > now() - interval '20 seconds' then
    raise exception 'Trop de runs envoyées d''un coup' using errcode = '54000';
  end if;
  -- Vraisemblance : le robot le plus rapide met ~22 s par vague ; on tolère 8 s.
  if p_wave < 1 or p_wave > 200 or p_time_sec < p_wave * 8 or p_time_sec > 36000
     or p_kills < 0 or p_kills > p_time_sec * 4 or p_kills > p_wave * 150
     or (p_won and p_wave < 20) or p_pact < 0 or p_pact > 100
     or p_hero not in ('taro', 'mei', 'sena', 'ren') or p_mode not in ('survie', 'cauchemar') then
    raise exception 'Run invraisemblable' using errcode = '22023';
  end if;
  insert into runs (player_id, hero, mode, wave, won, time_sec, kills, pact, discovery)
    values (uid, p_hero, p_mode, p_wave, p_won, p_time_sec, p_kills, p_pact, p_discovery)
    returning id into r_id;
  update players set
    runs = runs + 1,
    wins = wins + (case when p_won then 1 else 0 end),
    -- Le mode Découverte (ennemis adoucis) ne compte pas pour le record de progression.
    best_wave = case when p_discovery then best_wave else greatest(best_wave, p_wave) end,
    best_time = case when p_won and not p_discovery then least(coalesce(best_time, p_time_sec), p_time_sec) else best_time end,
    -- Coffres / série : ne montent que d'un cran raisonnable par envoi (le premier envoi reprend l'historique local).
    chests = case when p_chests is null then chests
                  when chests = 0 then least(greatest(p_chests, 0), 366)
                  else least(greatest(chests, p_chests), chests + 1) end,
    streak_max = case when p_streak_max is null then streak_max
                      when streak_max = 0 then least(greatest(p_streak_max, 0), 366)
                      else least(greatest(streak_max, p_streak_max), streak_max + 1) end,
    last_run_at = now()
  where id = uid;
  return json_build_object('id', r_id);
end $$;

-- Envoyer le premier essai du défi du jour (les suivants sont ignorés).
create or replace function public.submit_daily(p_day date, p_hero text, p_score int, p_wave int, p_won boolean, p_time_sec int, p_kills int)
returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'Connexion requise' using errcode = '28000'; end if;
  if not exists (select 1 from players where id = uid) then raise exception 'Choisis un pseudo d''abord' using errcode = 'P0002'; end if;
  -- Le jour du défi est en UTC : on accepte la veille et le lendemain (fuseaux, run à cheval sur minuit).
  if p_day < (now() at time zone 'utc')::date - 1 or p_day > (now() at time zone 'utc')::date + 1 then
    raise exception 'Ce défi est terminé' using errcode = '22023';
  end if;
  if p_wave < 1 or p_wave > 200 or p_time_sec < p_wave * 8 or p_kills < 0 or p_kills > p_time_sec * 4
     or p_score < 0 or p_score > p_wave * 4000 + p_kills * 10 + 8000
     or (p_won and p_wave < 5) or p_hero not in ('taro', 'mei', 'sena', 'ren') then
    raise exception 'Score invraisemblable' using errcode = '22023';
  end if;
  insert into daily_scores (player_id, day, hero, score, wave, won)
    values (uid, p_day, p_hero, p_score, p_wave, p_won)
    on conflict (player_id, day) do nothing;
  get diagnostics n = row_count;
  return json_build_object('counted', n > 0);
end $$;

-- ─── Lecture du classement ─────────────────────────────────────────────────

-- Progression : meilleure vague (chapitre), victoires, meilleur temps.
create or replace function public.leaderboard_progress(p_limit int default 50)
returns table (rank bigint, player_id uuid, pseudo text, best_wave int, wins int, best_time int, runs int)
language sql stable security definer set search_path = public as $$
  select rank() over (order by p.best_wave desc, p.wins desc, p.best_time asc nulls last),
         p.id, p.pseudo, p.best_wave, p.wins, p.best_time, p.runs
  from players p where p.runs > 0
  order by 1, p.created_at limit least(greatest(p_limit, 1), 100);
$$;

-- Défi du jour (par défaut : aujourd'hui, UTC).
create or replace function public.leaderboard_daily(p_day date default null, p_limit int default 50)
returns table (rank bigint, player_id uuid, pseudo text, score int, wave int, won boolean, hero text)
language sql stable security definer set search_path = public as $$
  select rank() over (order by d.score desc), d.player_id, p.pseudo, d.score, d.wave, d.won, d.hero
  from daily_scores d join players p on p.id = d.player_id
  where d.day = coalesce(p_day, (now() at time zone 'utc')::date)
  order by 1, d.created_at limit least(greatest(p_limit, 1), 100);
$$;

-- Missions du jour : coffres ouverts, puis meilleure série du défi.
create or replace function public.leaderboard_missions(p_limit int default 50)
returns table (rank bigint, player_id uuid, pseudo text, chests int, streak_max int)
language sql stable security definer set search_path = public as $$
  select rank() over (order by p.chests desc, p.streak_max desc), p.id, p.pseudo, p.chests, p.streak_max
  from players p where p.chests > 0 or p.streak_max > 0
  order by 1, p.created_at limit least(greatest(p_limit, 1), 100);
$$;

-- Mon rang dans chaque classement (même hors du top).
create or replace function public.my_ranks(p_day date default null)
returns json
language sql stable security definer set search_path = public as $$
  with me as (select * from players where id = auth.uid())
  select json_build_object(
    'progress', (select 1 + count(*) from players p, me where p.runs > 0 and
                   (p.best_wave > me.best_wave or (p.best_wave = me.best_wave and (p.wins > me.wins or
                   (p.wins = me.wins and coalesce(p.best_time, 2147483647) < coalesce(me.best_time, 2147483647)))))),
    'daily', (select case when mine.score is null then null else
                (select 1 + count(*) from daily_scores d where d.day = mine.day and d.score > mine.score) end
              from (select max(score) as score, coalesce(p_day, (now() at time zone 'utc')::date) as day from daily_scores
                    where player_id = auth.uid() and day = coalesce(p_day, (now() at time zone 'utc')::date)) mine),
    'missions', (select 1 + count(*) from players p, me where p.chests > me.chests or (p.chests = me.chests and p.streak_max > me.streak_max)),
    'players', (select count(*) from players where runs > 0)
  ) where exists (select 1 from players where id = auth.uid());
$$;

revoke all on function public.set_pseudo(text) from public, anon;
revoke all on function public.submit_run(text, text, int, boolean, int, int, int, boolean, int, int) from public, anon;
revoke all on function public.submit_daily(date, text, int, int, boolean, int, int) from public, anon;
grant execute on function public.set_pseudo(text) to authenticated;
grant execute on function public.submit_run(text, text, int, boolean, int, int, int, boolean, int, int) to authenticated;
grant execute on function public.submit_daily(date, text, int, int, boolean, int, int) to authenticated;
grant execute on function public.leaderboard_progress(int), public.leaderboard_daily(date, int), public.leaderboard_missions(int), public.my_ranks(date) to anon, authenticated;
