// Exercise the real migration in an isolated, in-process PostgreSQL database.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");

const migration = fs.readFileSync(path.join(__dirname, "../../supabase/migrations/0005_confirmed_squads.sql"), "utf8");
const schema = `
  create role anon; create role authenticated;
  create type public.selection_type as enum ('starter', 'sub');
  create type public.appearance_role as enum ('starter', 'sub');
  create table public.players (id text primary key);
  create table public.matches (id text primary key, ycac_goals int, opponent_goals int);
  create table public.appearances (
    match_id text not null references public.matches(id) on delete cascade,
    player_id text not null references public.players(id), role public.appearance_role not null,
    position text, minutes int, primary key (match_id, player_id)
  );
  create table public.goals (
    id bigint generated always as identity primary key,
    match_id text not null references public.matches(id), scorer_id text not null references public.players(id),
    assist_id text references public.players(id), minute int
  );
  create table public.saved_squads (
    id bigint generated always as identity primary key, saved_squad_id text not null,
    match_id text not null references public.matches(id) on delete cascade,
    formation text not null, player_id text not null references public.players(id),
    selection_type public.selection_type not null, slot_order int not null default 0,
    saved_at timestamptz not null default now(), saved_by text, active boolean not null default true
  );
  grant usage on schema public to anon, authenticated;
  grant select, insert, update, delete on all tables in schema public to anon, authenticated;
  grant usage, select on all sequences in schema public to anon, authenticated;
`;
const players = Array.from({ length: 14 }, (_, i) => `p${String(i + 1).padStart(2, "0")}`);
const squad = () => players.slice(0, 13).map((player_id, i) => ({
  player_id, selection_type: i < 11 ? "starter" : "sub", slot_order: i < 11 ? i : i - 11,
  played: i < 11 ? null : i === 11,
}));
const save = (db, match, expected, group, rows = squad()) => db.query(
  "select public.save_match_squad_draft($1, $2, $3, $4, $5::jsonb, $6) as id",
  [match, expected, group, "4231", JSON.stringify(rows), null],
);
const confirm = (db, match, group) => db.query("select public.confirm_match_squad($1, $2) as confirmed_at", [match, group]);

test("database confirmation is atomic, conflict-safe and permanently locked", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(schema);
  await db.exec(migration);
  await db.exec(migration); // deployment can safely retry the migration
  for (const player of players) await db.query("insert into public.players(id) values ($1)", [player]);
  await db.exec("insert into public.matches(id, ycac_goals, opponent_goals) values ('valid', 2, 2), ('stale', 1, 0), ('missing-goal', 1, 0), ('incomplete', 1, 0), ('pending', null, null)");

  await t.test("confirmation saves starters and only substitutes marked as played", async () => {
    await db.exec("insert into public.goals(match_id, scorer_id, assist_id) values ('valid', 'p01', 'p02'), ('valid', 'p12', null)");
    await db.exec("insert into public.appearances(match_id, player_id, role, position, minutes) values ('valid', 'p01', 'starter', 'ST', 65), ('valid', 'p14', 'sub', null, null)");
    await save(db, "valid", null, "g-valid");
    const result = await confirm(db, "valid", "g-valid");
    assert.ok(result.rows[0].confirmed_at);
    const apps = (await db.query("select player_id, role, position, minutes from public.appearances where match_id = 'valid' order by player_id")).rows;
    assert.equal(apps.length, 12);
    assert.deepEqual(apps[0], { player_id: "p01", role: "starter", position: "ST", minutes: 65 });
    assert.equal(apps.find((row) => row.player_id === "p12").role, "sub");
    assert.ok(!apps.some((row) => ["p13", "p14"].includes(row.player_id)));
  });

  await t.test("public roles cannot alter the locked squad, appearances or lock flag", async () => {
    await db.exec("set role anon");
    for (const sql of [
      "update public.saved_squads set active = false where match_id = 'valid'",
      "delete from public.saved_squads where match_id = 'valid'",
      "insert into public.saved_squads(saved_squad_id, match_id, formation, player_id, selection_type) values ('bad','valid','4231','p14','sub')",
      "update public.appearances set minutes = 1 where match_id = 'valid' and player_id = 'p01'",
      "delete from public.appearances where match_id = 'valid'",
      "insert into public.appearances(match_id, player_id, role) values ('valid','p14','sub')",
      "update public.matches set squad_confirmed_at = null where id = 'valid'",
      "delete from public.matches where id = 'valid'",
    ]) await assert.rejects(db.exec(sql), /squad_locked/);
    await assert.rejects(save(db, "valid", "g-valid", "g-next"), /squad_locked/);
    await assert.rejects(confirm(db, "valid", "g-valid"), /squad_locked/);
    await assert.rejects(db.exec("update public.matches set squad_confirmed_at = now() where id = 'pending'"), /use_confirm_squad/);
    await assert.rejects(db.exec("insert into public.matches(id, squad_confirmed_at) values ('forged', now())"), /use_confirm_squad/);
    await db.exec("update public.matches set opponent_goals = 3 where id = 'valid'"); // score corrections remain separate
    await db.exec("reset role");
  });

  await t.test("stale drafts cannot replace another browser's save", async () => {
    await save(db, "stale", null, "g-first");
    await save(db, "stale", "g-first", "g-second");
    await assert.rejects(save(db, "stale", "g-first", "g-stale"), /squad_stale/);
    await assert.rejects(confirm(db, "stale", "g-first"), /squad_stale/);
    const active = (await db.query("select distinct saved_squad_id from public.saved_squads where match_id = 'stale' and active")).rows;
    assert.deepEqual(active, [{ saved_squad_id: "g-second" }]);
  });

  await t.test("missing contributors, incomplete lineups and fixtures stay unlocked", async () => {
    await db.exec("insert into public.goals(match_id, scorer_id) values ('missing-goal', 'p13')");
    await save(db, "missing-goal", null, "g-missing"); // p13 is on the bench but not marked played
    await assert.rejects(confirm(db, "missing-goal", "g-missing"), /squad_contributor_missing/);
    await save(db, "incomplete", null, "g-incomplete", squad().filter((row) => row.player_id !== "p01"));
    await assert.rejects(confirm(db, "incomplete", "g-incomplete"), /squad_invalid/);
    const beforeMatch = squad().map((row) => ({ ...row, played: null }));
    await save(db, "pending", null, "g-pending", beforeMatch); // substitutes' appearances are unknown before kickoff
    await assert.rejects(confirm(db, "pending", "g-pending"), /result_required/);
    const rows = (await db.query("select id, squad_confirmed_at from public.matches where id in ('missing-goal','incomplete','pending') order by id")).rows;
    assert.ok(rows.every((row) => row.squad_confirmed_at === null));
    assert.equal((await db.query("select count(*)::int as n from public.appearances where match_id in ('missing-goal','incomplete','pending')")).rows[0].n, 0);
  });
});
