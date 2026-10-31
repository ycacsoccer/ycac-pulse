/* Copy-ready BAND descriptions. Bilingual and independent of the UI language;
   drafts never post to BAND or write to the match database. */
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
  function todayInJapan(now) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(now).map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
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

ユニフォームをお持ちでない場合は、YC&ACで貸し出し可能です。スパイクとすね当てをご持参ください。

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

  // Relative wording follows the current date in Japan (injectable for tests).
  // Do not declare a squad confirmed or use another competition's table.
  function generateReminder(match = {}, forecast = null, standings = {}, now = new Date()) {
    const times = schedule(match.kickoff);
    const competition = competitionNames(match.competition);
    const competitionLabel = competition.ja === competition.en ? competition.ja : `${competition.ja} / ${competition.en}`;
    const opponent = match.opponent || TBC;
    const sameCompetition = Boolean(match.competition && standings.competition
      && String(match.competition).trim().toLowerCase() === String(standings.competition).trim().toLowerCase());
    const tableDate = dateOf(standings.updated);
    const matchDate = dateOf(match.date);
    const today = dateOf(todayInJapan(now));
    const daysUntil = matchDate && today ? Math.round((matchDate - today) / 86400000) : null;
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
    const recordEN = (r) => {
      const parts = [r.w && count(r.w, "win"), r.d && count(r.d, "draw"), r.l && count(r.l, "loss", "losses")].filter(Boolean);
      if (!parts.length) return "0 wins";
      return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
    };
    const recordJA = (r) => [r.w && `${r.w}勝`, r.d && `${r.d}分`, r.l && `${r.l}敗`].filter(Boolean).join("") || "0勝";

    const whenJA = daysUntil === 1 ? "明日は" : daysUntil === 0 ? "今日は" : daysUntil > 1 ? "次の試合は" : "今回の試合は";
    const matchTypeJA = sameCompetition ? "リーグ戦" : match.competition ? competition.ja : "試合";
    const introJA = `${whenJA}${match.opponent ? `${match.opponent}との` : ""}${matchTypeJA}です！⚽️`;
    const introEN = daysUntil === 1
      ? match.opponent ? `Tomorrow we’re up against ${match.opponent}! ⚽️` : "We’ve got a match tomorrow! ⚽️"
      : daysUntil === 0
        ? match.opponent ? `It’s matchday! We’re playing ${match.opponent} today. ⚽️` : "It’s matchday! ⚽️"
        : daysUntil > 1
          ? match.opponent ? `Next up, we’ve got ${match.opponent}! ⚽️` : "We’ve got a match coming up! ⚽️"
          : match.opponent ? `Here are the details for our match against ${match.opponent}. ⚽️` : "Here are the match details. ⚽️";
    // Only describe their attack as strong with a meaningful, high-scoring sample.
    const strongAttack = haveTable && them.p >= 3 && them.gf / them.p >= 2.5;
    const tableJA = haveTable
      ? `相手はリーグ${them.pos}位${them.p ? `で、${them.p}試合を終えて${recordJA(them)}。${them.gf}得点・${them.ga}失点${strongAttack ? "。得点力のあるチーム" : ""}` : ""}です。僕たちは${us.pos}位${us.p ? `で、${recordJA(us)}` : ""}です。`
      : "";
    const tableEN = haveTable
      ? `They’re ${ordinal(them.pos)} in the league${them.p ? ` with ${recordEN(them)} from ${count(them.p, "game")}. They’ve scored ${them.gf} and conceded ${them.ga} so far${strongAttack ? ", so we’ll need to stay sharp at the back" : ""}` : ""}. We’re ${ordinal(us.pos)}${us.p ? ` with ${recordEN(us)}` : ""}.`
      : "";
    const canCloseGap = haveTable && them.pos < us.pos && them.pts != null && us.pts != null && them.pts > us.pts;
    const gapJA = canCloseGap ? "上位との差を縮めるチャンスです！" : "";
    const gapEN = canCloseGap ? "A good chance for us to close the gap!" : "";

    const beforeMatch = (row) => matchDate && dateOf(row.date) && row.date < match.date;
    const form = !haveTable && Array.isArray(forecast?.form)
      ? forecast.form.filter((row) => beforeMatch(row) && ["win", "draw", "loss"].includes(row.outcome)) : [];
    const formRecord = { w: form.filter((row) => row.outcome === "win").length, d: form.filter((row) => row.outcome === "draw").length, l: form.filter((row) => row.outcome === "loss").length };
    const meetings = Array.isArray(forecast?.h2h?.rows) ? forecast.h2h.rows.filter((row) => beforeMatch(row)
      && row.ycac_goals != null && row.opponent_goals != null
      && Number.isFinite(Number(row.ycac_goals)) && Number.isFinite(Number(row.opponent_goals))) : [];
    // One recorded game can be both our form and the only meeting: say it once.
    const sameOnlyGame = form.length === 1 && meetings.length === 1 && form[0].date === meetings[0].date
      && form[0].opponent && String(form[0].opponent).toLowerCase() === String(meetings[0].opponent || "").toLowerCase()
      && form[0].gf === Number(meetings[0].ycac_goals) && form[0].ga === Number(meetings[0].opponent_goals);
    const formJA = form.length && !sameOnlyGame ? `僕たちの直近${form.length}試合は${recordJA(formRecord)}です。` : "";
    const formEN = !sameOnlyGame && form.length === 1 ? `Our last game ended in ${form[0].outcome === "win" ? "a win" : form[0].outcome === "draw" ? "a draw" : "a loss"}.`
      : !sameOnlyGame && form.length ? `We’ve had ${recordEN(formRecord)} in our last ${count(form.length, "game")}.` : "";
    const h2hRecord = {
      w: meetings.filter((row) => Number(row.ycac_goals) > Number(row.opponent_goals)).length,
      d: meetings.filter((row) => Number(row.ycac_goals) === Number(row.opponent_goals)).length,
      l: meetings.filter((row) => Number(row.ycac_goals) < Number(row.opponent_goals)).length,
    };
    const h2hJA = meetings.length === 1 ? `前回の対戦は${h2hRecord.w ? "勝ち" : h2hRecord.d ? "引き分け" : "負け"}でした。`
      : meetings.length ? `直近${meetings.length}回の対戦は${recordJA(h2hRecord)}です。` : "";
    const h2hEN = meetings.length === 1 ? h2hRecord.d ? "Our last game against them ended in a draw." : `We ${h2hRecord.w ? "won" : "lost"} our last game against them.`
      : meetings.length ? `We’ve had ${recordEN(h2hRecord)} in our last ${count(meetings.length, "game")} against them.` : "";
    const motivationJA = sameCompetition
      ? "みんなで声を掛け合って、勝ち点3を取りにいきましょう！💪"
      : "みんなで声を掛け合って、いい試合にしましょう！💪";
    const motivationEN = sameCompetition
      ? "Let’s keep talking, work for each other and go for the three points! 💪"
      : "Let’s keep talking, work for each other and enjoy the game! 💪";
    const closingJA = daysUntil === 1 ? "それでは、明日よろしくお願いします！" : daysUntil === 0 ? "それでは、今日もよろしくお願いします！" : daysUntil > 1 ? "当日はよろしくお願いします！" : "よろしくお願いします！";
    const closingEN = daysUntil === 1 ? "See you tomorrow!" : daysUntil >= 0 && daysUntil != null ? "See you at the match!" : "Thanks, everyone!";

    return [
      `⚽ 試合情報 / Match Information\n\n📅 ${formatDate(match.date)}\n🆚 ${opponent} | ${competitionLabel}\n🏟 ${match.venue || TBC} | 11人制 / 11-a-side\n🕔 集合 / Meet: ${times.meet}\n🔥 アップ / Warm-up: ${times.warmup}\n⚽ KO: ${times.kickoff} | 40分 × 2 / 40 mins × 2`,
      "━━━━━━━━━━━━━━",
      "@All",
      "皆さん、お疲れ様です！",
      introJA, tableJA, formJA, h2hJA, gapJA, motivationJA,
      `試合の詳細とメンバーも各自チェックしてください！\n${closingJA}`,
      "━━━━━━━━━━━━━━",
      "Hi everyone!",
      introEN, tableEN, formEN, h2hEN, gapEN, motivationEN,
      `Please check the match details and squad. ${closingEN}`,
    ].filter(Boolean).join("\n\n");
  }
  const api = { generate, generateReminder, formatDate, schedule, priorityDeadline, standardDeadline };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.YCACBandTemplates = api;
})();
