/* Copy-ready BAND descriptions. Pure, bilingual and independent of the UI
   language; drafts never post to BAND or write to the match database. */
(() => {
  const TBC = "未定 / TBC";
  const weekdaysJA = ["日", "月", "火", "水", "木", "金", "土"];
  const weekdaysEN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (number) => String(number).padStart(2, "0");
  function dateOf(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
  }
  function formatDate(value) {
    const date = dateOf(value);
    if (!date) return TBC;
    const year = date.getUTCFullYear(), month = date.getUTCMonth(), day = date.getUTCDate(), weekday = date.getUTCDay();
    return `${year}年${month + 1}月${day}日（${weekdaysJA[weekday]}） / ${weekdaysEN[weekday]}, ${pad(day)} ${months[month]} ${year}`;
  }
  function daysBefore(value, days) {
    const date = dateOf(value);
    if (!date) return null;
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
  }
  function atNine(value) {
    return dateOf(value) ? `${formatDate(value)} · 21:00 JST（日本時間 / Japan time）` : TBC;
  }
  function priorityDeadline(value) {
    return atNine(daysBefore(value, 15));
  }
  function standardDeadline(value) {
    return atNine(daysBefore(value, 2));
  }
  function schedule(kickoff) {
    const parts = /^(\d{1,2}):(\d{2})(?::00)?$/.exec(String(kickoff || "").trim());
    if (!parts || Number(parts[1]) > 23 || Number(parts[2]) > 59) return { meet: TBC, warmup: TBC, kickoff: TBC };
    const minutes = Number(parts[1]) * 60 + Number(parts[2]);
    const time = (offset) => {
      const raw = minutes + offset, value = (raw + 1440) % 1440;
      return `${pad(Math.floor(value / 60))}:${pad(value % 60)}${raw < 0 ? "（前日 / previous day）" : ""}`;
    };
    return { meet: time(-60), warmup: time(-40), kickoff: time(0) };
  }
  function competitionNames(competition) {
    return {
      ja: competition === "TML Division 3" ? "TMLディビジョン3"
        : /friendly/i.test(competition || "") ? "親善試合" : competition || TBC,
      en: /friendly/i.test(competition || "") ? "Friendly Match" : competition || TBC,
    };
  }
  function generate(match) {
    const times = schedule(match.kickoff);
    const { ja: competitionJA, en: competitionEN } = competitionNames(match.competition);
    const competition = `${competitionJA} / ${competitionEN}`;
    const title = (ja, en) => `${competitionJA} vs ${match.opponent || TBC} [${ja}] / ${competitionEN} vs ${match.opponent || TBC} [${en}]`;
    const deadlines = { standard: standardDeadline(match.date), priority: priorityDeadline(match.date) };
    const alerts = {
      standard: atNine(daysBefore(match.date, 3)),
      priority: atNine(daysBefore(match.date, 16)),
      match: atNine(daysBefore(match.date, 1)),
    };
    const common = `⚽ 試合情報 / Match Information

📅 ${formatDate(match.date)}
🏟 会場 / Venue: ${match.venue || TBC}
🆚 ${match.opponent || TBC}
📋 ${competition}
👥 11人制 / 11-a-side
🕠 集合・ミーティング / Meet & Briefing: ${times.meet}
🔥 ウォームアップ / Warm-up: ${times.warmup}
⚽ キックオフ / KO: ${times.kickoff}
⏱ 40分 × 2 / 40 mins × 2

ウォームアップ開始までに準備を整え、全員で一緒にウォームアップを始められるようご協力をお願いします。

Please ensure you are ready to warm up together at the scheduled warm-up time.

━━━━━━━━━━━━━━

👕 ユニフォーム / Kit

**ホーム（白）＋アウェイ（赤／黒）**の両方をご持参ください。当日の使用ユニフォームは試合日が近づきましたらご案内します。

ユニフォームをお持ちでない場合はYC&ACで貸出可能です。スパイク・すね当てをご持参ください。

Please bring both Home (White) + Away (Red/Black). The match kit will be confirmed closer to match day.

If you don't have your own kit, a YC&AC kit can be provided. Please bring boots & shin pads.

━━━━━━━━━━━━━━`;
    const standard = `${common}

💴 参加費 / Participation Fee

YC&AC非会員：1,000円
30分以上の出場時間を確保できない場合は、参加費を免除します。

Non-YC&AC Member: 1,000 JPY
If we are unable to arrange 30 minutes or more of playing time, the participation fee will be waived.

━━━━━━━━━━━━━━

===== STANDARD Sign-Up / STANDARD サインアップ =====

先着順 / First-come, first-served

STANDARDサインアップは試合日の2日前の21:00（日本時間）に締め切ります。
📅 STANDARD締切 / STANDARD deadline: ${deadlines.standard}

STANDARD sign-up closes 2 days before match day at 9pm Japan time.

YC&AC優先サインアップは試合日の15日前の21:00（日本時間）に締め切ります。締切後、STANDARD枠が増え、ウェイティングリストから繰り上がる場合があります。
📅 YC&AC優先締切 / YC&AC Priority deadline: ${deadlines.priority}

YC&AC Priority Sign-Up closes 15 days before match day at 9pm Japan time. After it closes, additional STANDARD places may become available and waiting-list players may move into the confirmed list.`;
    const priority = `${common}

===== YC&AC Priority + Starting GK Sign-Up / YC&AC優先 + スターティングGK サインアップ =====

YC&ACメンバー＋スターティングGK対象です。
優先サインアップは試合日の15日前の21:00（日本時間）に締め切ります。
📅 YC&AC優先締切 / YC&AC Priority deadline: ${deadlines.priority}

For YC&AC Members + Starting GK.
Priority sign-up closes 15 days before match day at 9pm Japan time.`;
    return { standard, priority, standardTitle: title("STANDARD", "STANDARD"), priorityTitle: title("YC&AC 優先", "YC&AC Priority"), deadlines, alerts };
  }

  // The reminder is a draft, not a declaration that a squad has been confirmed.
  // Only use the forecast's table for its own competition and before the match;
  // otherwise fall back to recorded form / meetings without inventing a ranking.
  function generateReminder(match = {}, forecast = null, standings = {}) {
    const times = schedule(match.kickoff);
    const competition = competitionNames(match.competition);
    const competitionLabel = competition.ja === competition.en ? competition.ja : `${competition.ja} / ${competition.en}`;
    const opponent = match.opponent || TBC;
    const sameCompetition = Boolean(match.competition && standings.competition
      && String(match.competition).trim().toLowerCase() === String(standings.competition).trim().toLowerCase());
    const tableDate = dateOf(standings.updated);
    const matchDate = dateOf(match.date);
    const tableUsable = sameCompetition && (!tableDate || !matchDate || tableDate <= matchDate);
    const tableSide = (side) => {
      if (!side?.row || !Number.isInteger(Number(side.pos)) || Number(side.pos) < 1) return null;
      const keys = ["p", "w", "d", "l", "gf", "ga"];
      if (keys.some((key) => side.row[key] == null || side.row[key] === "" || !Number.isInteger(Number(side.row[key])) || Number(side.row[key]) < 0)) return null;
      const values = Object.fromEntries(keys.map((key) => [key, Number(side.row[key])]));
      const points = side.row.pts;
      const pts = points != null && points !== "" && Number.isInteger(Number(points)) && Number(points) >= 0 ? Number(points) : null;
      return values.p === values.w + values.d + values.l ? { pos: Number(side.pos), ...values, pts } : null;
    };
    const us = tableUsable ? tableSide(forecast?.table?.us) : null;
    const them = tableUsable ? tableSide(forecast?.table?.them) : null;
    const haveTable = Boolean(us && them);
    const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th")}`;
    const count = (n, singular, plural = `${singular}s`) => `${n} ${n === 1 ? singular : plural}`;
    const recordEN = (r) => `${count(r.w, "win")}, ${count(r.d, "draw")} and ${count(r.l, "loss", "losses")}`;
    const recordJA = (r) => `${r.w}勝${r.d}分${r.l}敗`;

    const introJA = match.opponent
      ? `次の試合は${match.opponent}との${match.competition ? competition.ja : "一戦"}です！⚽️`
      : "次の試合に向けて、準備をお願いします！⚽️";
    const introEN = match.opponent
      ? `Our next match is against ${match.opponent}${match.competition ? ` (${competition.en})` : ""}! ⚽️`
      : "Our next match is coming up! ⚽️";
    const tableJA = haveTable
      ? `${tableDate ? `${standings.updated}時点で、` : ""}相手はリーグ${them.pos}位。${them.p}試合で${recordJA(them)}、${them.gf}得点・${them.ga}失点です。僕たちは${us.pos}位（${recordJA(us)}）です。`
      : "";
    const tableEN = haveTable
      ? `${tableDate ? `As of ${standings.updated}, our` : "Our"} opponents are ${ordinal(them.pos)} in the league with ${recordEN(them)} in ${count(them.p, "match", "matches")}, scoring ${them.gf} and conceding ${them.ga}. We are ${ordinal(us.pos)} with ${recordEN(us)}.`
      : "";
    const canCloseGap = haveTable && them.pos < us.pos && them.pts != null && us.pts != null && them.pts > us.pts;
    const gapJA = canCloseGap ? "上位との差を縮めるためにも、大事な一戦になります。" : "";
    const gapEN = canCloseGap ? "This is an important opportunity to close the gap with the teams above us." : "";

    const beforeMatch = (row) => matchDate && dateOf(row.date) && row.date < match.date;
    const form = !haveTable && Array.isArray(forecast?.form)
      ? forecast.form.filter((row) => beforeMatch(row) && ["win", "draw", "loss"].includes(row.outcome)) : [];
    const formRecord = { w: form.filter((row) => row.outcome === "win").length, d: form.filter((row) => row.outcome === "draw").length, l: form.filter((row) => row.outcome === "loss").length };
    const formJA = form.length ? `直近${form.length}試合の記録は${recordJA(formRecord)}です。` : "";
    const formEN = form.length === 1 ? `Our most recent recorded match ended in ${form[0].outcome === "win" ? "a win" : form[0].outcome === "draw" ? "a draw" : "a loss"}.`
      : form.length ? `Our last ${count(form.length, "recorded match", "recorded matches")} produced ${recordEN(formRecord)}.` : "";

    const meetings = Array.isArray(forecast?.h2h?.rows) ? forecast.h2h.rows.filter((row) => beforeMatch(row)
      && row.ycac_goals != null && row.opponent_goals != null
      && Number.isFinite(Number(row.ycac_goals)) && Number.isFinite(Number(row.opponent_goals))) : [];
    const h2hRecord = {
      w: meetings.filter((row) => Number(row.ycac_goals) > Number(row.opponent_goals)).length,
      d: meetings.filter((row) => Number(row.ycac_goals) === Number(row.opponent_goals)).length,
      l: meetings.filter((row) => Number(row.ycac_goals) < Number(row.opponent_goals)).length,
    };
    const h2hJA = meetings.length ? `直近${meetings.length}回の対戦記録は${recordJA(h2hRecord)}です。` : "";
    const h2hEN = meetings.length === 1 ? `We ${h2hRecord.w ? "won" : h2hRecord.d ? "drew" : "lost"} our most recent recorded meeting.`
      : meetings.length ? `In our last ${count(meetings.length, "recorded meeting")}, our record is ${recordEN(h2hRecord)}.` : "";
    const motivationJA = sameCompetition
      ? "チーム全員で声を掛け合い、勝ち点3を取りにいきましょう！💪"
      : "チーム全員で声を掛け合い、良い試合にしましょう！💪";
    const motivationEN = sameCompetition
      ? "Let’s stay united, communicate well, and fight together for all three points! 💪"
      : "Let’s stay united, communicate well, and put in a strong performance together! 💪";

    return [
      `⚽ 試合情報 / Match Information\n\n📅 ${formatDate(match.date)}\n🆚 ${opponent} | ${competitionLabel}\n🏟 ${match.venue || TBC} | 11人制 / 11-a-side\n🕔 集合 / Meet: ${times.meet}\n🔥 アップ / Warm-up: ${times.warmup}\n⚽ KO: ${times.kickoff} | 40分 × 2 / 40 mins × 2`,
      "━━━━━━━━━━━━━━",
      "@All",
      "皆さん、お疲れ様です！",
      introJA, tableJA, formJA, h2hJA, gapJA, motivationJA,
      "試合の詳細とメンバーを各自ご確認ください！\n当日もよろしくお願いします！",
      "━━━━━━━━━━━━━━",
      "Hello everyone!",
      introEN, tableEN, formEN, h2hEN, gapEN, motivationEN,
      "Please check the match details and matchday squad!\nSee you all on matchday!",
    ].filter(Boolean).join("\n\n");
  }
  const api = { generate, generateReminder, formatDate, schedule, priorityDeadline, standardDeadline };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.YCACBandTemplates = api;
})();
