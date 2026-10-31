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

test("pre-match reminder uses match details and a casual league summary without the source date", () => {
  const standings = { competition: "TML Division 3", updated: "2026-10-26", rows: [
    { team: "Kilimanjaro FC", p: 5, w: 3, d: 0, l: 2, gf: 15, ga: 17, pts: 9 },
    { team: "YCAC Pulse", p: 5, w: 2, d: 1, l: 2, gf: 16, ga: 11, pts: 7, us: true },
  ] };
  const data = forecast.build({ match, standingsRows: standings.rows });
  const text = generateReminder(match, data, standings, new Date("2026-10-30T03:00:00Z"));
  assert.match(text, /2026年10月31日（土） \/ Sat, 31 Oct 2026/);
  assert.match(text, /🆚 Kilimanjaro FC \| TMLディビジョン3 \/ TML Division 3/);
  assert.match(text, /🏟 YC&AC \| 11人制 \/ 11-a-side/);
  assert.match(text, /Meet: 17:00/);
  assert.match(text, /Warm-up: 17:20/);
  assert.match(text, /KO: 18:00 \| 40分 × 2 \/ 40 mins × 2/);
  assert.match(text, /相手はリーグ1位で、5試合を終えて3勝2敗。15得点・17失点。得点力のあるチーム/);
  assert.match(text, /僕たちは2位で、2勝1分2敗/);
  assert.match(text, /They’re 1st in the league with 3 wins and 2 losses from 5 games\. They’ve scored 15 and conceded 17 so far, so we’ll need to stay sharp at the back/);
  assert.match(text, /We’re 2nd with 2 wins, 1 draw and 2 losses/);
  assert.doesNotMatch(text, /2026-10-26|as of|時点/i);
  assert.match(text, /上位との差を縮める/);
  assert.match(text, /good chance for us to close the gap/);
  assert.match(text, /勝ち点3/);
  assert.match(text, /the three points/);
  assert.match(text, /@All/);
  assert.match(text, /明日はKilimanjaro FCとのリーグ戦/);
  assert.match(text, /Tomorrow we’re up against Kilimanjaro FC/);
  assert.match(text, /明日よろしくお願いします/);
  assert.match(text, /See you tomorrow!/);
  assert.doesNotMatch(text, /confirmed squad|確定メンバー/i);
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
  assert.match(text, /直近2試合は1勝1分/);
  assert.match(text, /We’ve had 1 win and 1 draw in our last 2 games/);
  assert.match(text, /前回の対戦は勝ちでした/);
  assert.match(text, /We won our last game against them/);
  assert.doesNotMatch(text, /in the league|4 losses|0勝1分1敗/);
  const oneMatch = forecast.build({ match, finals: [finals[0]] });
  const oneText = generateReminder(match, oneMatch);
  assert.match(oneText, /We won our last game against them/);
  assert.doesNotMatch(oneText, /Our last game ended/);
  const formOnly = forecast.build({ match, finals: [finals[1]] });
  assert.match(generateReminder(match, formOnly), /Our last game ended in a draw/);
  const sameDayDifferentOpponents = forecast.build({ match, finals: [
    { ...finals[0], competition: "Friendly Match" },
    { ...finals[0], opponent: "Another FC" },
  ] });
  const separateText = generateReminder(match, sameDayDifferentOpponents);
  assert.match(separateText, /Our last game ended in a win/);
  assert.match(separateText, /We won our last game against them/);
});

test("reminder avoids unrelated, future-dated and malformed standings and handles unknown details", () => {
  const side = { pos: 12, row: { p: 1, w: 1, d: 0, l: 0, gf: 1, ga: 0 } };
  const data = { table: { us: side, them: side } };
  const standings = { competition: "TML Division 3", updated: "2026-10-26" };
  assert.match(generateReminder(match, data, standings), /12th in the league/);
  assert.doesNotMatch(generateReminder(match, data, standings), /得点力のある|stay sharp at the back/); // one game is too small a sample
  assert.doesNotMatch(generateReminder(match, data, standings), /close the gap|上位との差/);
  assert.doesNotMatch(generateReminder({ ...match, competition: "Friendly Match" }, data, standings), /in the league|the three points|勝ち点3/);
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

test("relative reminder language follows Japan's date across midnight and year boundaries", () => {
  const tomorrow = generateReminder(match, null, {}, new Date("2026-10-30T14:59:59Z")); // 23:59 in Japan
  assert.match(tomorrow, /明日はKilimanjaro FC/);
  assert.match(tomorrow, /Tomorrow we’re up against Kilimanjaro FC/);
  assert.match(tomorrow, /See you tomorrow!/);
  const today = generateReminder(match, null, {}, new Date("2026-10-30T15:00:00Z")); // 00:00 in Japan
  assert.match(today, /今日はKilimanjaro FC/);
  assert.match(today, /It’s matchday! We’re playing Kilimanjaro FC today/);
  assert.match(today, /今日もよろしくお願いします/);
  assert.doesNotMatch(today, /tomorrow|明日/i);
  const later = generateReminder(match, null, {}, new Date("2026-10-29T03:00:00Z"));
  assert.match(later, /次の試合はKilimanjaro FC/);
  assert.match(later, /Next up, we’ve got Kilimanjaro FC/);
  assert.doesNotMatch(later, /tomorrow|明日/i);
  const past = generateReminder(match, null, {}, new Date("2026-11-01T03:00:00Z"));
  assert.match(past, /今回の試合はKilimanjaro FC/);
  assert.doesNotMatch(past, /tomorrow|明日|It’s matchday|Next up/i);
  const newYear = generateReminder({ ...match, date: "2027-01-01" }, null, {}, new Date("2026-12-31T10:00:00Z"));
  assert.match(newYear, /See you tomorrow!/);
  const unknown = generateReminder({ ...match, date: null }, null, {}, new Date("2026-10-30T03:00:00Z"));
  assert.doesNotMatch(unknown, /tomorrow|明日|It’s matchday/i);
});
