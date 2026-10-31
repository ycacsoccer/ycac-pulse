-- Confirm a completed match's squad and actual appearances atomically.
-- A named substitute counts as an appearance only when explicitly marked played.
-- The existing public access model is retained: anyone may confirm, but once
-- confirmed the squad and appearances are immutable through the site's roles.
begin;

alter table public.matches add column if not exists squad_confirmed_at timestamptz;
alter table public.saved_squads add column if not exists played boolean;

-- Lock the parent match row before examining its confirmation state. This
-- serializes direct REST writes and old clients with the confirmation RPC.
create or replace function public.guard_confirmed_squad_rows()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  old_match text;
  new_match text;
  parent record;
begin
  if tg_op <> 'INSERT' then old_match := old.match_id; end if;
  if tg_op <> 'DELETE' then new_match := new.match_id; end if;
  for parent in
    select id, squad_confirmed_at from public.matches
    where id = old_match or id = new_match order by id for update
  loop
    if parent.squad_confirmed_at is not null then
      raise exception 'squad_locked' using errcode = 'P0001';
    end if;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists guard_confirmed_saved_squad on public.saved_squads;
create trigger guard_confirmed_saved_squad before insert or update or delete on public.saved_squads
  for each row execute function public.guard_confirmed_squad_rows();
drop trigger if exists guard_confirmed_appearances on public.appearances;
create trigger guard_confirmed_appearances before insert or update or delete on public.appearances
  for each row execute function public.guard_confirmed_squad_rows();

create or replace function public.guard_confirmed_match()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if tg_op = 'INSERT' then
    if new.squad_confirmed_at is not null then
      raise exception 'use_confirm_squad' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.squad_confirmed_at is not null then
      raise exception 'squad_locked' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.squad_confirmed_at is not null and
     (new.squad_confirmed_at is distinct from old.squad_confirmed_at or new.id is distinct from old.id) then
    raise exception 'squad_locked' using errcode = 'P0001';
  end if;
  if old.squad_confirmed_at is null and new.squad_confirmed_at is not null and
     current_setting('ycac.confirming_squad', true) is distinct from 'yes' then
    raise exception 'use_confirm_squad' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_confirmed_match on public.matches;
create trigger guard_confirmed_match before insert or update or delete on public.matches
  for each row execute function public.guard_confirmed_match();

-- The old client retired and inserted in separate requests. This RPC saves a
-- complete draft in one transaction and rejects stale edits from other tabs.
create or replace function public.save_match_squad_draft(
  p_match_id text, p_expected_group text, p_new_group text, p_formation text, p_players jsonb, p_saved_by text default null
)
returns text language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  match_row public.matches%rowtype;
  active_groups integer;
  active_group text;
  player_count integer;
begin
  select * into match_row from public.matches where id = p_match_id for update;
  if not found then raise exception 'match_missing' using errcode = 'P0001'; end if;
  if match_row.squad_confirmed_at is not null then raise exception 'squad_locked' using errcode = 'P0001'; end if;
  select count(distinct saved_squad_id), min(saved_squad_id) into active_groups, active_group
    from public.saved_squads where match_id = p_match_id and active = true;
  if active_groups > 1 or active_group is distinct from p_expected_group then
    raise exception 'squad_stale' using errcode = 'P0001';
  end if;
  if p_new_group is null or p_new_group = '' or p_formation not in ('433', '4231', '442', '352')
     or jsonb_typeof(p_players) is distinct from 'array' then
    raise exception 'squad_invalid' using errcode = 'P0001';
  end if;
  player_count := jsonb_array_length(p_players);
  if player_count < 1 or player_count > 20 then raise exception 'squad_invalid' using errcode = 'P0001'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_players) as p(player_id text, selection_type text, slot_order integer, played boolean)
    where p.player_id is null or p.selection_type not in ('starter', 'sub') or p.slot_order is null
       or (p.selection_type = 'starter' and p.slot_order not between 0 and 10)
       or (p.selection_type = 'sub' and p.slot_order not between 0 and 8)
       or (p.selection_type = 'sub' and p.played is null and match_row.ycac_goals is not null and match_row.opponent_goals is not null)
  ) or exists (
    select 1 from jsonb_to_recordset(p_players) as p(player_id text, selection_type text, slot_order integer, played boolean)
    group by p.player_id having count(*) > 1
  ) or exists (
    select 1 from jsonb_to_recordset(p_players) as p(player_id text, selection_type text, slot_order integer, played boolean)
    group by p.selection_type, p.slot_order having count(*) > 1
  ) then raise exception 'squad_invalid' using errcode = 'P0001'; end if;
  if not exists (
    select 1 from jsonb_to_recordset(p_players) as p(player_id text, selection_type text, slot_order integer, played boolean)
    where p.selection_type = 'starter'
  ) then raise exception 'squad_invalid' using errcode = 'P0001'; end if;

  update public.saved_squads set active = false where match_id = p_match_id and active = true;
  insert into public.saved_squads (saved_squad_id, match_id, formation, player_id, selection_type, slot_order, played, saved_by)
    select p_new_group, p_match_id, p_formation, p.player_id, p.selection_type::public.selection_type,
           p.slot_order, case when p.selection_type = 'sub' then p.played else null end, p_saved_by
    from jsonb_to_recordset(p_players) as p(player_id text, selection_type text, slot_order integer, played boolean);
  return p_new_group;
end;
$$;

create or replace function public.confirm_match_squad(p_match_id text, p_saved_squad_id text)
returns timestamptz language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  match_row public.matches%rowtype;
  active_groups integer;
  active_group text;
  starting_count integer;
  confirmed_at timestamptz := now();
begin
  select * into match_row from public.matches where id = p_match_id for update;
  if not found then raise exception 'match_missing' using errcode = 'P0001'; end if;
  if match_row.squad_confirmed_at is not null then raise exception 'squad_locked' using errcode = 'P0001'; end if;
  if match_row.ycac_goals is null or match_row.opponent_goals is null then
    raise exception 'result_required' using errcode = 'P0001';
  end if;
  select count(distinct saved_squad_id), min(saved_squad_id), count(*) filter (where selection_type = 'starter')
    into active_groups, active_group, starting_count from public.saved_squads where match_id = p_match_id and active = true;
  if active_groups <> 1 or active_group is distinct from p_saved_squad_id then
    raise exception 'squad_stale' using errcode = 'P0001';
  end if;
  if starting_count <> 11 or exists (
    select 1 from public.saved_squads where match_id = p_match_id and active = true and selection_type = 'sub' and played is null
  ) or exists (
    select 1 from public.saved_squads where match_id = p_match_id and active = true group by player_id having count(*) > 1
  ) or exists (
    select 1 from public.saved_squads where match_id = p_match_id and active = true
      and ((selection_type = 'starter' and slot_order not between 0 and 10)
        or (selection_type = 'sub' and slot_order not between 0 and 8))
  ) or exists (
    select 1 from public.saved_squads where match_id = p_match_id and active = true
      group by selection_type, slot_order having count(*) > 1
  ) or (select count(distinct formation) from public.saved_squads where match_id = p_match_id and active = true) <> 1
    or exists (
      select 1 from public.saved_squads where match_id = p_match_id and active = true and formation not in ('433', '4231', '442', '352')
  ) then raise exception 'squad_invalid' using errcode = 'P0001'; end if;
  -- A scorer or assister necessarily played; never lock a contradictory record.
  if exists (
    select 1 from public.goals g cross join lateral (values (g.scorer_id), (g.assist_id)) as contributor(player_id)
    where g.match_id = p_match_id and contributor.player_id is not null and not exists (
      select 1 from public.saved_squads s where s.match_id = p_match_id and s.active = true
        and s.player_id = contributor.player_id and (s.selection_type = 'starter' or (s.selection_type = 'sub' and s.played = true))
    )
  ) then raise exception 'squad_contributor_missing' using errcode = 'P0001'; end if;

  delete from public.appearances a where a.match_id = p_match_id and not exists (
    select 1 from public.saved_squads s where s.match_id = p_match_id and s.active = true and s.player_id = a.player_id
      and (s.selection_type = 'starter' or (s.selection_type = 'sub' and s.played = true))
  );
  insert into public.appearances (match_id, player_id, role)
    select p_match_id, s.player_id, s.selection_type::text::public.appearance_role
    from public.saved_squads s where s.match_id = p_match_id and s.active = true
      and (s.selection_type = 'starter' or (s.selection_type = 'sub' and s.played = true))
    on conflict (match_id, player_id) do update set role = excluded.role;
  perform set_config('ycac.confirming_squad', 'yes', true);
  update public.matches set squad_confirmed_at = confirmed_at where id = p_match_id;
  perform set_config('ycac.confirming_squad', '', true);
  return confirmed_at;
end;
$$;

revoke all on function public.save_match_squad_draft(text, text, text, text, jsonb, text) from public;
revoke all on function public.confirm_match_squad(text, text) from public;
grant execute on function public.save_match_squad_draft(text, text, text, text, jsonb, text) to anon, authenticated;
grant execute on function public.confirm_match_squad(text, text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
