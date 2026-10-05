-- YC&AC Pulse — initial schema (Phase 0, plan v3)
-- Run once in the Supabase SQL editor, or via `supabase db push` from this repo.
-- Replaces the Google Sheets tabs: Players, Matches, Appearances, Goals, Signups,
-- EventSignups, SavedSquads — and adds match feedback, team content, auth roles.
--
-- Access model:
--   anon (public site)  : SELECT players, matches, appearances, goals
--   authenticated       : + SELECT signups, saved_squads, match_notes, team_content
--   coach (is_coach())  : + every write, + coach_notes, coach_roster
--   nobody but service  : coach_roster membership

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type match_competition as enum ('TML Division 3', 'Friendly Match');
create type appearance_role   as enum ('starter', 'sub');
create type signup_state      as enum ('confirmed', 'waitlist', 'declined', 'unavailable');
create type squad_tier        as enum ('core', 'rotation', 'depth', 'inactive');
create type home_away         as enum ('home', 'away');
create type selection_type    as enum ('starter', 'sub');

-- ---------------------------------------------------------------------------
-- Core tables (public)
-- ---------------------------------------------------------------------------
create table players (
  id                  text primary key check (id ~ '^[a-z0-9_-]+$'),
  display_name        text not null,
  display_name_full   text,
  nickname            text,
  shirt_number        int,
  primary_position    text,
  secondary_positions text[] not null default '{}',
  preferred_foot      text check (preferred_foot in ('left', 'right', 'both')),
  photo_path          text,               -- Storage path in the player-photos bucket
  bio                 text,
  active              boolean not null default true,
  created_at          timestamptz not null default now()
);

create table matches (
  id                  text primary key check (id ~ '^[a-z0-9_-]+$'),
  date                date not null,
  competition         match_competition not null,
  opponent            text not null,
  venue               text,
  home_away           home_away,
  ycac_goals          int,                -- null = fixture not played yet
  opponent_goals      int,                -- null = fixture not played yet
  kickoff             text,
  standard_signup_url text,
  priority_signup_url text,
  created_at          timestamptz not null default now()
);

create table appearances (
  match_id   text not null references matches(id) on delete cascade,
  player_id  text not null references players(id) on delete restrict,
  role       appearance_role not null,
  position   text,
  minutes    int,
  primary key (match_id, player_id)
);

create table goals (
  id         bigint generated always as identity primary key,
  match_id   text not null references matches(id) on delete cascade,
  scorer_id  text not null references players(id) on delete restrict,
  assist_id  text references players(id) on delete set null,
  minute     int
);

-- ---------------------------------------------------------------------------
-- Team-only tables (require the shared team password or a coach login)
-- ---------------------------------------------------------------------------
create table signups (
  match_id     text not null references matches(id) on delete cascade,
  player_id    text not null references players(id) on delete cascade,
  status       signup_state not null,
  responded_at timestamptz,
  entered_by   text,                      -- who recorded it (admin tool sets this)
  primary key (match_id, player_id)
);

create table saved_squads (
  id             bigint generated always as identity primary key,
  saved_squad_id text not null,
  match_id       text not null references matches(id) on delete cascade,
  formation      text not null,
  player_id      text not null references players(id) on delete cascade,
  selection_type selection_type not null,
  slot_order     int not null default 0,
  saved_at       timestamptz not null default now(),
  saved_by       text,
  active         boolean not null default true
);

-- Requirement 6 — coach reflection and feedback for each match.
create table match_notes (
  match_id        text primary key references matches(id) on delete cascade,
  reflection      text,                   -- how the match went
  coaching_points text,                   -- instruction for next time
  squad_review    text,                   -- selection / performance notes
  updated_at      timestamptz not null default now(),
  updated_by      text
);

-- Requirement 7 — team guideline and coach instruction, edited in admin.
create table team_content (
  slug       text primary key check (slug in ('guidelines', 'coach-instructions', 'club-info')),
  title      text not null,
  body       text not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- ---------------------------------------------------------------------------
-- Coach-only tables (no read for anon or ordinary team sessions)
-- ---------------------------------------------------------------------------
create table coach_notes (
  player_id    text primary key references players(id) on delete cascade,
  squad_status squad_tier,                -- manual override of the derived tier
  availability text,                      -- free text: injury, travel, work rota...
  updated_at   timestamptz not null default now(),
  updated_by   text
);

-- Membership: add your coach email here after creating the auth user.
create table coach_roster (
  email    text primary key,
  added_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes for the queries the dashboard runs constantly
-- ---------------------------------------------------------------------------
create index appearances_player_idx on appearances (player_id);
create index goals_match_idx        on goals (match_id);
create index goals_scorer_idx       on goals (scorer_id);
create index signups_match_idx      on signups (match_id);
create index matches_date_idx       on matches (date desc);
create index saved_squads_match_idx on saved_squads (match_id);

-- ---------------------------------------------------------------------------
-- Coach identity — SECURITY DEFINER so policies can consult the roster without
-- exposing it. Add yourself: insert into coach_roster (email) values ('you@...');
-- ---------------------------------------------------------------------------
alter table coach_roster enable row level security;

create or replace function public.is_coach() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from coach_roster
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke execute on function public.is_coach() from public;
grant execute on function public.is_coach() to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table players       enable row level security;
alter table matches       enable row level security;
alter table appearances   enable row level security;
alter table goals         enable row level security;
alter table signups       enable row level security;
alter table saved_squads  enable row level security;
alter table match_notes   enable row level security;
alter table team_content  enable row level security;
alter table coach_notes   enable row level security;

-- public site
create policy "public read players"      on players      for select using (true);
create policy "public read matches"      on matches      for select using (true);
create policy "public read appearances"  on appearances  for select using (true);
create policy "public read goals"        on goals        for select using (true);

-- team password / coach sessions
create policy "team read signups"        on signups      for select to authenticated using (true);
create policy "team read saved squads"   on saved_squads for select to authenticated using (true);
create policy "team read match notes"    on match_notes  for select to authenticated using (true);
create policy "team read team content"   on team_content for select to authenticated using (true);

-- coach writes (team sessions can read but never write)
create policy "coach manage players"      on players      for all to authenticated using (is_coach()) with check (is_coach());
create policy "coach manage matches"      on matches      for all to authenticated using (is_coach()) with check (is_coach());
create policy "coach manage appearances"  on appearances  for all to authenticated using (is_coach()) with check (is_coach());
create policy "coach manage goals"        on goals        for all to authenticated using (is_coach()) with check (is_coach());
create policy "coach manage signups"      on signups      for all to authenticated using (is_coach()) with check (is_coach());
create policy "coach manage saved squads" on saved_squads for all to authenticated using (is_coach()) with check (is_coach());
create policy "coach manage match notes"  on match_notes  for all to authenticated using (is_coach()) with check (is_coach());
create policy "coach manage team content" on team_content for all to authenticated using (is_coach()) with check (is_coach());
create policy "coach only notes"          on coach_notes  for all to authenticated using (is_coach()) with check (is_coach());

-- ---------------------------------------------------------------------------
-- Photo storage: public-read bucket, coach-writable
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('player-photos', 'player-photos', true)
on conflict (id) do nothing;

create policy "public read player photos" on storage.objects
  for select using (bucket_id = 'player-photos');
create policy "coaches upload player photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'player-photos' and is_coach());
create policy "coaches replace player photos" on storage.objects
  for update to authenticated using (bucket_id = 'player-photos' and is_coach());
create policy "coaches delete player photos" on storage.objects
  for delete to authenticated using (bucket_id = 'player-photos' and is_coach());
