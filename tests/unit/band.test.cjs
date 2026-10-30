const test = require("node:test");
const assert = require("node:assert/strict");
const { generate, generateReminder, schedule, formatDate, priorityDeadline, standardDeadline } = require("../../band.js");
const forecast = require("../../forecast.js");
const match = { date: "2026-10-31", venue: "YC&AC", opponent: "Kilimanjaro FC", competition: "TML Division 3", kickoff: "18:00" };

test("BAND drafts match the supplied bilingual match details and relative timings", () => {
  const drafts = generate(match);
  for (const text of [drafts.standard, drafts.priority]) {
    assert.ok(text.startsWith("⚽ 試合情報 / Match Information"));
    assert.match(text, /📅 2026年10月31日（土） \/ Sat, 31 Oct 2026/);
    assert.match(text, /🏟 会場 \/ Venue: YC&AC/);
    assert.match(text, /🆚 Kilimanjaro FC/);
    assert.match(text, /📋 TMLディビジョン3 \/ TML Division 3/);
    assert.match(text, /👥 11人制 \/ 11-a-side/);
    assert.match(text, /Meet & Briefing: 17:00/);
    assert.match(text, /Warm-up: 17:20/);
    assert.match(text, /KO: 18:00/);
    assert.match(text, /40分 × 2 \/ 40 mins × 2/);
    assert.match(text, /Please ensure you are ready to warm up together at the scheduled warm-up time\./);
    assert.match(text, /\*\*ホーム（白）＋アウェイ（赤／黒）\*\*/);
    assert.match(text, /Please bring both Home \(White\) \+ Away \(Red\/Black\)\./);
    assert.match(text, /Please bring boots & shin pads\./);
  }
  assert.equal(drafts.deadlines.standard, "2026年10月29日（木） / Thu, 29 Oct 2026 · 21:00 JST（日本時間 / Japan time）");
  assert.equal(drafts.deadlines.priority, "2026年10月16日（金） / Fri, 16 Oct 2026 · 21:00 JST（日本時間 / Japan time）");
});

test("STANDARD alone includes the fee/waiver and waiting-list policy; Priority targets members and starting GK", () => {
  const { standard, priority } = generate(match);
  assert.match(standard, /Non-YC&AC Member: 1,000 JPY/);
  assert.match(standard, /30 minutes or more of playing time, the participation fee will be waived/);
  assert.match(standard, /===== STANDARD Sign-Up \/ STANDARD サインアップ =====/);
  assert.match(standard, /先着順 \/ First-come, first-served/);
  assert.match(standard, /waiting-list players may move into the confirmed list/);
  assert.doesNotMatch(priority, /Participation Fee|1,000|First-come|waiting-list/);
  assert.match(priority, /===== YC&AC Priority \+ Starting GK Sign-Up \/ YC&AC優先 \+ スターティングGK サインアップ =====/);
  assert.match(priority, /YC&ACメンバー＋スターティングGK対象です。/);
  assert.match(priority, /Priority sign-up closes 15 days before match day at 9pm Japan time\./);
  assert.match(standard, /STANDARD sign-up closes 2 days before match day at 9pm Japan time\./);
  assert.match(standard, /Thu, 29 Oct 2026 · 21:00 JST/);
  for (const text of [standard, priority]) {
    assert.match(text, /Fri, 16 Oct 2026 · 21:00 JST/);
    assert.doesNotMatch(text, /2 weeks|2週間|17 Oct 2026/);
  }
});

test("event titles use the exact bilingual STANDARD and Priority naming", () => {
  const drafts = generate(match);
  assert.equal(drafts.standardTitle, "TMLディビジョン3 vs Kilimanjaro FC [STANDARD] / TML Division 3 vs Kilimanjaro FC [STANDARD]");
  assert.equal(drafts.priorityTitle, "TMLディビジョン3 vs Kilimanjaro FC [YC&AC 優先] / TML Division 3 vs Kilimanjaro FC [YC&AC Priority]");
  assert.equal(generate({ ...match, competition: "Friendly Match", opponent: "Jetro FC" }).priorityTitle, "親善試合 vs Jetro FC [YC&AC 優先] / Friendly Match vs Jetro FC [YC&AC Priority]");
});

test("both sign-up and match alert instructions carry exact Japan-time dates", () => {
  const { alerts } = generate(match);
  assert.equal(alerts.standard, "2026年10月28日（水） / Wed, 28 Oct 2026 · 21:00 JST（日本時間 / Japan time）");
  assert.equal(alerts.priority, "2026年10月15日（木） / Thu, 15 Oct 2026 · 21:00 JST（日本時間 / Japan time）");
  assert.equal(alerts.match, "2026年10月30日（金） / Fri, 30 Oct 2026 · 21:00 JST（日本時間 / Japan time）");
});

test("every fixture gets its own date, venue, opponent, competition and schedule", () => {
  const { standard } = generate({ date: "2026-11-15", opponent: "Jetro FC", venue: "Away ground", competition: "Friendly Match", kickoff: "11:00:00" });
  assert.match(standard, /2026年11月15日（日） \/ Sun, 15 Nov 2026/);
  assert.match(standard, /Venue: Away ground/);
  assert.match(standard, /🆚 Jetro FC/);
  assert.match(standard, /親善試合 \/ Friendly Match/);
  assert.match(standard, /Meet & Briefing: 10:00/);
  assert.match(standard, /Warm-up: 10:20/);
  assert.doesNotMatch(standard.split("━━━━━━━━━━━━━━")[0], /Kilimanjaro|31 Oct|17:00|TMLディビジョン3/);
  assert.match(standard, /STANDARD deadline: .*Fri, 13 Nov 2026 · 21:00 JST/);
  assert.match(standard, /YC&AC Priority deadline: .*Sat, 31 Oct 2026 · 21:00 JST/);
});

test("unknown details are marked TBC instead of inventing a kickoff or schedule", () => {
  const text = generate({}).standard;
  assert.match(text, /KO: 未定 \/ TBC/);
  assert.match(text, /Warm-up: 未定 \/ TBC/);
  assert.match(text, /Venue: 未定 \/ TBC/);
  for (const value of [null, "", "25:00", "18:99", "TBC"]) assert.equal(schedule(value).meet, "未定 / TBC");
  assert.equal(formatDate("2026-02-30"), "未定 / TBC");
  assert.deepEqual(generate({}).deadlines, { standard: "未定 / TBC", priority: "未定 / TBC" });
  assert.deepEqual(generate({}).alerts, { standard: "未定 / TBC", priority: "未定 / TBC", match: "未定 / TBC" });
});

test("dates and deadlines are timezone-independent, including month/year rollovers", () => {
  assert.equal(priorityDeadline("2027-01-05"), "2026年12月21日（月） / Mon, 21 Dec 2026 · 21:00 JST（日本時間 / Japan time）");
  assert.equal(priorityDeadline("2026-03-01"), "2026年2月14日（土） / Sat, 14 Feb 2026 · 21:00 JST（日本時間 / Japan time）");
  assert.equal(standardDeadline("2028-03-01"), "2028年2月28日（月） / Mon, 28 Feb 2028 · 21:00 JST（日本時間 / Japan time）");
  assert.match(generate({ ...match, date: "2027-01-01" }).alerts.standard, /Tue, 29 Dec 2026 · 21:00 JST/);
  assert.equal(schedule("00:30").meet, "23:30（前日 / previous day）");
  assert.equal(schedule("9:05").warmup, "08:25");
});

test("pre-match reminder uses match details and the forecast's dated league table in both languages", () => {
  const standings = { competition: "TML Division 3", updated: "2026-10-26", rows: [
    { team: "Kilimanjaro FC", p: 5, w: 3, d: 0, l: 2, gf: 15, ga: 17, pts: 9 },
    { team: "YCAC Pulse", p: 5, w: 2, d: 1, l: 2, gf: 16, ga: 11, pts: 7, us: true },
  ] };
  const data = forecast.build({ match, standingsRows: standings.rows });
  const text = generateReminder(match, data, standings);
  assert.match(text, /2026年10月31日（土） \/ Sat, 31 Oct 2026/);
  assert.match(text, /🆚 Kilimanjaro FC \| TMLディビジョン3 \/ TML Division 3/);
  assert.match(text, /🏟 YC&AC \| 11人制 \/ 11-a-side/);
  assert.match(text, /Meet: 17:00/);
  assert.match(text, /Warm-up: 17:20/);
  assert.match(text, /KO: 18:00 \| 40分 × 2 \/ 40 mins × 2/);
  assert.match(text, /2026-10-26時点で、相手はリーグ1位。5試合で3勝0分2敗、15得点・17失点/);
  assert.match(text, /僕たちは2位（2勝1分2敗）/);
  assert.match(text, /As of 2026-10-26, our opponents are 1st in the league with 3 wins, 0 draws and 2 losses in 5 matches, scoring 15 and conceding 17/);
  assert.match(text, /We are 2nd with 2 wins, 1 draw and 2 losses/);
  assert.match(text, /上位との差を縮める/);
  assert.match(text, /opportunity to close the gap/);
  assert.match(text, /勝ち点3/);
  assert.match(text, /all three points/);
  assert.match(text, /@All/);
  assert.doesNotMatch(text, /tomorrow|明日|confirmed squad|確定メンバー/i);
  standings.rows[1].pts = 9; // higher table position but no points gap to close
  assert.doesNotMatch(generateReminder(match, data, standings), /close the gap|上位との差/);
});

test("reminder falls back to recent form and head-to-head when the table cannot identify the opponent", () => {
  const finals = [
    { date: "2026-09-01", competition: match.competition, opponent: "Kilimanjaro FC", ycac_goals: 2, opponent_goals: 1 },
    { date: "2026-09-08", competition: match.competition, opponent: "Another FC", ycac_goals: 0, opponent_goals: 0 },
    { date: "2026-11-01", competition: match.competition, opponent: "Kilimanjaro FC", ycac_goals: 0, opponent_goals: 4 },
  ];
  const data = forecast.build({ match, finals });
  const text = generateReminder(match, data, { competition: match.competition, updated: "2026-10-26" });
  assert.match(text, /直近2試合の記録は1勝1分0敗/);
  assert.match(text, /Our last 2 recorded matches produced 1 win, 1 draw and 0 losses/);
  assert.match(text, /直近1回の対戦記録は1勝0分0敗/);
  assert.match(text, /We won our most recent recorded meeting/);
  assert.doesNotMatch(text, /in the league|4 losses|0勝1分1敗/);
  const oneMatch = forecast.build({ match, finals: [finals[0]] });
  assert.match(generateReminder(match, oneMatch), /Our most recent recorded match ended in a win/);
});

test("reminder avoids unrelated, future-dated and malformed standings and handles unknown details", () => {
  const side = { pos: 12, row: { p: 1, w: 1, d: 0, l: 0, gf: 1, ga: 0 } };
  const data = { table: { us: side, them: side } };
  const standings = { competition: "TML Division 3", updated: "2026-10-26" };
  assert.match(generateReminder(match, data, standings), /12th in the league/);
  assert.doesNotMatch(generateReminder(match, data, standings), /close the gap|上位との差/);
  assert.doesNotMatch(generateReminder({ ...match, competition: "Friendly Match" }, data, standings), /in the league|all three points|勝ち点3/);
  assert.doesNotMatch(generateReminder(match, data, { ...standings, updated: "2026-11-01" }), /in the league/);
  const bad = { table: { us: side, them: { ...side, row: { ...side.row, p: null } } } };
  assert.doesNotMatch(generateReminder(match, bad, standings), /in the league/);
  const unknown = generateReminder({ kickoff: null });
  assert.match(unknown, /📅 未定 \/ TBC/);
  assert.match(unknown, /🏟 未定 \/ TBC/);
  assert.match(unknown, /Meet: 未定 \/ TBC/);
  assert.match(unknown, /Warm-up: 未定 \/ TBC/);
  assert.match(unknown, /KO: 未定 \/ TBC/);
  assert.doesNotMatch(unknown, /in the league|NaN|undefined/);
});
