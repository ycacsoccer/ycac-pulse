-- YC&AC club membership on player profiles.
-- NULL means unknown; existing players are not classified automatically.
-- Safe to run more than once in the Supabase SQL Editor.
alter table public.players
  add column if not exists is_ycac_member boolean;

comment on column public.players.is_ycac_member is
  'YC&AC club membership: true = member, false = non-member, null = unknown. Publicly readable and editable under the existing players policy.';

notify pgrst, 'reload schema';

select 'player membership ready' as status;
