const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");

test("the membership migration is nullable, preserves existing data and is safe to retry", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec("create table public.players (id text primary key, display_name text not null);");
  await db.exec("insert into public.players(id, display_name) values ('a', 'Ada'), ('b', 'Ben'), ('c', 'Chris');");
  const migration = fs.readFileSync(path.join(__dirname, "../../supabase/migrations/0006_player_membership.sql"), "utf8");
  await db.exec(migration);
  let rows = (await db.query("select id, display_name, is_ycac_member from public.players order by id")).rows;
  assert.deepEqual(rows, [
    { id: "a", display_name: "Ada", is_ycac_member: null },
    { id: "b", display_name: "Ben", is_ycac_member: null },
    { id: "c", display_name: "Chris", is_ycac_member: null },
  ]);
  await db.exec("update public.players set is_ycac_member = true where id = 'a'; update public.players set is_ycac_member = false where id = 'b';");
  await db.exec(migration);
  rows = (await db.query("select id, display_name, is_ycac_member from public.players order by id")).rows;
  assert.deepEqual(rows, [
    { id: "a", display_name: "Ada", is_ycac_member: true },
    { id: "b", display_name: "Ben", is_ycac_member: false },
    { id: "c", display_name: "Chris", is_ycac_member: null },
  ]);
  await db.exec("insert into public.players(id, display_name) values ('d', 'Dana');");
  assert.equal((await db.query("select is_ycac_member from public.players where id = 'd'")).rows[0].is_ycac_member, null);
});
