const test = require("node:test");
const assert = require("node:assert/strict");
const { generate, schedule, formatDate, priorityDeadline, standardDeadline } = require("../../band.js");
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
