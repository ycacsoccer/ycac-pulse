-- YC&AC Pulse — wave 33: full public access (view + write).
-- The site opens every feature to the public: match page (squad picker,
-- signups, notes), coach dashboard, admin, team content and the profile
-- editors no longer require a login, and this migration makes the database
-- agree — anon gets read + write on the site's tables and the photo bucket.
--
-- Run in the Supabase SQL editor, or via `supabase db push` from this repo.
-- Idempotent: safe to paste twice (every statement guards with IF EXISTS).
--
-- coach_roster stays service-only (login bookkeeping, not a site feature);
-- is_coach() keeps working for attribution. RLS stays ENABLED everywhere —
-- the new policies are simply open to anon + authenticated, and `for all`
-- covers SELECT too, so one policy per table is enough.

-- ---------------------------------------------------------------------------
-- Site tables: drop the old public-read / team-read / coach-manage policies
-- and replace each with a single open policy (read + write for everyone).
-- ---------------------------------------------------------------------------
drop policy if exists "public read players"       on players;
drop policy if exists "coach manage players"      on players;
drop policy if exists "open players"              on players;
create policy "open players"      on players      for all to anon, authenticated using (true) with check (true);

drop policy if exists "public read matches"       on matches;
drop policy if exists "coach manage matches"      on matches;
drop policy if exists "open matches"              on matches;
create policy "open matches"      on matches      for all to anon, authenticated using (true) with check (true);

drop policy if exists "public read appearances"   on appearances;
drop policy if exists "coach manage appearances"  on appearances;
drop policy if exists "open appearances"          on appearances;
create policy "open appearances"  on appearances  for all to anon, authenticated using (true) with check (true);

drop policy if exists "public read goals"         on goals;
drop policy if exists "coach manage goals"        on goals;
drop policy if exists "open goals"                on goals;
create policy "open goals"        on goals        for all to anon, authenticated using (true) with check (true);

drop policy if exists "team read signups"         on signups;
drop policy if exists "coach manage signups"      on signups;
drop policy if exists "open signups"              on signups;
create policy "open signups"      on signups      for all to anon, authenticated using (true) with check (true);

drop policy if exists "team read saved squads"    on saved_squads;
drop policy if exists "coach manage saved squads" on saved_squads;
drop policy if exists "open saved squads"         on saved_squads;
create policy "open saved squads" on saved_squads for all to anon, authenticated using (true) with check (true);

drop policy if exists "team read match notes"     on match_notes;
drop policy if exists "coach manage match notes"  on match_notes;
drop policy if exists "open match notes"          on match_notes;
create policy "open match notes"  on match_notes  for all to anon, authenticated using (true) with check (true);

drop policy if exists "team read team content"    on team_content;
drop policy if exists "coach manage team content" on team_content;
drop policy if exists "open team content"         on team_content;
create policy "open team content" on team_content for all to anon, authenticated using (true) with check (true);

drop policy if exists "public read injuries"      on injuries;
drop policy if exists "coach manage injuries"     on injuries;
drop policy if exists "open injuries"             on injuries;
create policy "open injuries"     on injuries     for all to anon, authenticated using (true) with check (true);

drop policy if exists "coach only notes"          on coach_notes;
drop policy if exists "open coach notes"          on coach_notes;
create policy "open coach notes"  on coach_notes  for all to anon, authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Photo storage: the bucket was public-read; writing is open too now
-- ---------------------------------------------------------------------------
drop policy if exists "public read player photos"    on storage.objects;
drop policy if exists "coaches upload player photos" on storage.objects;
drop policy if exists "coaches replace player photos" on storage.objects;
drop policy if exists "coaches delete player photos" on storage.objects;
drop policy if exists "open player photos"           on storage.objects;
create policy "open player photos" on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'player-photos')
  with check (bucket_id = 'player-photos');

-- coach_roster: intentionally untouched — no policy, service-role only.

-- ---------------------------------------------------------------------------
-- Confirmation report — the results panel must print 10 / 1 / 0 below.
-- (10 open table policies, the storage policy, 0 policies on coach_roster.)
-- ---------------------------------------------------------------------------
select (select count(*) from pg_policies where schemaname = 'public' and policyname like 'open %')            as "open table policies (expect 10)",
       (select count(*) from pg_policies where schemaname = 'storage' and policyname = 'open player photos')  as "storage policy (expect 1)",
       (select count(*) from pg_policies where schemaname = 'public' and tablename = 'coach_roster')          as "coach_roster policies (expect 0)";
