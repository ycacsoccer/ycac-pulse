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
  function generate(match) {
    const times = schedule(match.kickoff);
    const competitionJA = match.competition === "TML Division 3" ? "TMLディビジョン3"
      : /friendly/i.test(match.competition || "") ? "親善試合" : match.competition || TBC;
    const competitionEN = /friendly/i.test(match.competition || "") ? "Friendly Match" : match.competition || TBC;
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
  const api = { generate, formatDate, schedule, priorityDeadline, standardDeadline };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.YCACBandTemplates = api;
})();
