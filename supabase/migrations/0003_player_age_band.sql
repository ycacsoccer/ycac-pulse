-- YC&AC Pulse — coach-maintained public player age bands (wave 27).
-- Safe to run more than once in the Supabase SQL Editor.

alter table public.players
  add column if not exists age_band text;

alter table public.players
  drop constraint if exists players_age_band_check;

alter table public.players
  add constraint players_age_band_check
  check (age_band is null or age_band in ('17-20', '20s', '30s', '40s', '50s'));

comment on column public.players.age_band is
  'Public age band maintained by a coach; exact date of birth is not stored.';

notify pgrst, 'reload schema';

select 'player age bands ready' as status;
