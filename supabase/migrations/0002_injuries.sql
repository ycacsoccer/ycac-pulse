-- ---------------------------------------------------------------------------
-- 0002: current injury status (revamp wave 15).
-- One active injury per player — row presence = currently injured; deleting
-- the row clears it (no history table: the site shows CURRENT status only).
-- Public read: squad status is team news the index and profiles display.
-- Writes restricted to coaches via is_coach(), same pattern as 0001.
--
-- Idempotent on purpose: this file is pasted into the Supabase SQL Editor by
-- hand (README workflow), so it must be safe to run more than once. The final
-- SELECT reports the seeded rows — run it and expect "injuries ready / 4".
-- ---------------------------------------------------------------------------

create table if not exists injuries (
  player_id       text primary key references players(id) on delete cascade,
  detail          text not null,                    -- coach-authored, shown as written: "Minor knee injury"
  since_date      date not null,                    -- first day out: 2026-09-19
  expected_return text,                             -- free text: "~early Nov", "months"
  updated_at      timestamptz not null default now(),
  updated_by      text
);

alter table injuries enable row level security;

drop policy if exists "public read injuries" on injuries;
create policy "public read injuries"  on injuries for select using (true);

drop policy if exists "coach manage injuries" on injuries;
create policy "coach manage injuries" on injuries for all to authenticated using (is_coach()) with check (is_coach());

-- Seed: the four injuries current at 06 Oct 2026 (coach-provided).
insert into injuries (player_id, detail, since_date, expected_return, updated_by) values
  ('kosei', 'Minor knee injury', '2026-09-19', '~early Nov', 'coach'),
  ('ryoga', 'Minor knee injury', '2026-10-04', '~early Nov', 'coach'),
  ('yuto',  'Hand fracture',     '2026-08-23', 'months',     'coach'),
  ('souta', 'Leg fracture',      '2026-09-19', 'months',     'coach')
on conflict (player_id) do nothing;

-- Refresh PostgREST's schema cache so the new table is served immediately.
notify pgrst, 'reload schema';

select 'injuries ready' as status, count(*) as seeded_rows from injuries;
