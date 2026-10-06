/* YC&AC Pulse — public season dashboard (Phase 10, TML-first public revamp).
   Reads Supabase through data.js — the gviz sheet loader is gone. TML leads:
   scoreline, results and the stable squad; friendlies fold away behind a
   <details>; the attendance table shows photos with the TML summary first.
   Squad tiers and position groups come from stats.js, the same engine the
   coach dashboard uses (public pages get fully derived tiers — no coach_notes). */
const t = (key, vars) => YCACI18n.t(key, vars);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
let dashboardData;
let attendanceSearch = "";

function playerName(players, id) { return players.get(id)?.display_name || id; }
function formatDate(value) { return YCACI18n.formatDate(value); }

function photoCell(player) {
  const initials = `<span class="monogram" aria-hidden="true">${esc(String(player.display_name || "?").split(/\s+/).map((word) => word[0]).slice(0, 2).join("").toUpperCase())}</span>`;
  if (!player.photo_path) return initials;
  return `<span class="avatar">${initials}<img src="${esc(YCACData.publicUrl(player.photo_path))}" alt="" loading="lazy" onerror="this.remove()" /></span>`;
}

function render(data) {
  const players = new Map(data.players.filter((player) => player.active !== false).map((player) => [player.id, player]));
  const tmlMatches = data.matches.filter((match) => match.competition === "TML Division 3" && YCACStats.isFinal(match)).sort((a, b) => b.date.localeCompare(a.date));
  const friendlyMatches = data.matches.filter((match) => match.competition === "Friendly Match" && YCACStats.isFinal(match)).sort((a, b) => b.date.localeCompare(a.date));
  const fixtures = data.matches.filter((match) => !YCACStats.isFinal(match)).sort((a, b) => a.date.localeCompare(b.date));
  const setStats = (prefix, matches) => { const wins = matches.filter((match) => Number(match.ycac_goals) > Number(match.opponent_goals)).length; const draws = matches.filter((match) => Number(match.ycac_goals) === Number(match.opponent_goals)).length; const losses = matches.length - wins - draws; const record = document.querySelector(`#${prefix}-record`); record.innerHTML = `${wins}–${draws}–${losses}<small>${t("wdl")}</small>`; record.setAttribute("aria-label", t("recordAria", { wins, draws, losses })); document.querySelector(`#${prefix}-goals-for`).textContent = matches.reduce((total, match) => total + Number(match.ycac_goals), 0); document.querySelector(`#${prefix}-goals-against`).textContent = matches.reduce((total, match) => total + Number(match.opponent_goals), 0); document.querySelector(`#${prefix}-clean-sheets`).textContent = matches.filter((match) => Number(match.opponent_goals) === 0).length; };
  setStats("tml", tmlMatches); setStats("friendly", friendlyMatches);
  const friendlyLabel = t("friendlyMatches");
  const competitionLabel = (match) => match.competition === "Friendly Match" ? friendlyLabel : match.competition;
  document.querySelector("#friendly-title").textContent = friendlyLabel; document.querySelector("#friendly-results-label").textContent = friendlyLabel;
  document.querySelector("#updated").textContent = `${t("liveData")} · ${tmlMatches.length} ${t("matchesRecorded")}`;
  document.querySelector("#friendly-updated").textContent = `${friendlyMatches.length} ${t("matchesRecorded")}`;
  // Squad status — current injuries (revamp 15): public cards linking to profiles.
  const injuries = data.injuries || [];
  document.querySelector("#squad-status").hidden = !injuries.length;
  document.querySelector("#injury-list").innerHTML = injuries.map((row) => {
    const player = players.get(row.player_id) || { display_name: row.player_id };
    const meta = [`${t("injurySince")} ${esc(formatDate(row.since_date))}`, row.expected_return ? `${t("injuryReturn")} ${esc(row.expected_return)}` : ""]
      .filter(Boolean).join(" · ");
    return `<a class="injury-card" href="player.html?id=${encodeURIComponent(row.player_id)}">${photoCell(player)}<span class="ic-body"><strong class="ic-name">${esc(player.display_name)}</strong><span class="ic-detail">${esc(row.detail)}</span><span class="ic-meta">${meta}</span></span></a>`;
  }).join("");

  // Performance charts — SVG trend per competition (revamp 14): goals for/against
  // bars along the timeline with W-D-L chips, then the scorer bars underneath.
  const perfLegend = `<span><i class="key-for"></i>${t("goalsFor")}</span><span><i class="key-against"></i>${t("goalsAgainst")}</span>`;
  document.querySelector("#perf-tml-key").innerHTML = perfLegend;
  document.querySelector("#perf-friendly-key").innerHTML = perfLegend;
  const trendOpts = { labels: { dateFmt: formatDate, result: { W: t("vizWin"), D: t("vizDraw"), L: t("vizLoss") } } };
  document.querySelector("#perf-tml-trend").innerHTML = YCACCharts.trendSVG(tmlMatches, trendOpts) || document.querySelector("#empty-state").innerHTML;
  document.querySelector("#perf-friendly-trend").innerHTML = YCACCharts.trendSVG(friendlyMatches, trendOpts) || document.querySelector("#empty-state").innerHTML;
  // KPI rate strip (wave 17): goals per game, conceded per game, win rate and
  // attendance per game (average players out per match), one row per panel.
  const kpiStrip = (matches, appearances) => {
    const stats = YCACCharts.kpis(matches, { appearances });
    const rate = (value) => (value == null ? "–" : String(Number(value.toFixed(2))));
    const tiles = [
      [rate(stats.gfPerGame), t("kpiGoalsPerGame")],
      [rate(stats.gaPerGame), t("kpiConcededPerGame")],
      [stats.winPct == null ? "–" : `${stats.winPct}%`, t("kpiWinRate")],
      [rate(stats.appsPerGame), t("kpiAttendancePerGame")],
    ];
    return tiles.map(([value, label]) => `<div class="kpi"><strong>${esc(value)}</strong><small>${esc(label)}</small></div>`).join("");
  };
  const tmlIds = new Set(tmlMatches.map((match) => match.id));
  const fndIds = new Set(friendlyMatches.map((match) => match.id));
  document.querySelector("#perf-tml-kpi").innerHTML = kpiStrip(tmlMatches, data.appearances.filter((app) => tmlIds.has(app.match_id)));
  document.querySelector("#perf-friendly-kpi").innerHTML = kpiStrip(friendlyMatches, data.appearances.filter((app) => fndIds.has(app.match_id)));
  const scorerTotals = (matches) => { const ids = new Set(matches.map((match) => match.id)); const totals = new Map(); for (const goal of data.goals.filter((goal) => ids.has(goal.match_id))) totals.set(goal.scorer_id, (totals.get(goal.scorer_id) || 0) + 1); return [...totals.entries()].sort((a, b) => b[1] - a[1]); };
  const tmlScorers = scorerTotals(tmlMatches), friendlyScorers = scorerTotals(friendlyMatches), largestScorerTotal = Math.max(1, ...tmlScorers.map(([, goals]) => goals), ...friendlyScorers.map(([, goals]) => goals));
  const distribution = (label, scorers, competition) => `<div class="goal-group ${competition}"><div class="goal-group-head"><span>${label}</span><span>${scorers.reduce((total, [, goals]) => total + goals, 0)} ${t("goals")}</span></div><div class="goal-bars">${scorers.map(([id, goals]) => `<div class="goal-bar scorer-bar"><span>${esc(playerName(players, id))}</span><div class="goal-track"><div class="goal-fill" style="width:${goals / largestScorerTotal * 100}%"></div></div><strong class="goal-value">${goals}</strong></div>`).join("")}</div></div>`;
  document.querySelector("#perf-tml-scorers").innerHTML = distribution("TML Division 3", tmlScorers, "tml") || document.querySelector("#empty-state").innerHTML;
  document.querySelector("#perf-friendly-scorers").innerHTML = distribution(friendlyLabel, friendlyScorers, "friendly") || document.querySelector("#empty-state").innerHTML;
  document.querySelector("#fixtures").innerHTML = fixtures.map((match) => { const signups = `${match.standard_signup_url ? `<a href="${esc(match.standard_signup_url)}" target="_blank" rel="noreferrer">${t("standardSignup")}</a>` : ""}${match.priority_signup_url ? `<a href="${esc(match.priority_signup_url)}" target="_blank" rel="noreferrer">${t("prioritySignup")}</a>` : ""}`; return `<div class="fixture"><div class="fixture-date">${formatDate(match.date)}</div><div><div class="fixture-opponent"><a href="match.html?id=${encodeURIComponent(match.id)}">${t("versus")} ${esc(match.opponent)}</a></div><div class="fixture-meta">${esc(competitionLabel(match))}${match.venue ? ` · ${esc(match.venue)}` : ""}</div>${signups ? `<div class="fixture-actions">${signups}</div>` : ""}</div><div class="fixture-time">${esc(match.kickoff || "TBC")}<br /><small>${t("kickoff")}</small></div></div>`; }).join("") || document.querySelector("#empty-state").innerHTML;
  const renderResults = (target, matches) => { document.querySelector(target).innerHTML = matches.map((match) => `<a class="match" href="match.html?id=${encodeURIComponent(match.id)}"><div class="match-date">${formatDate(match.date)}</div><div><div class="match-opponent">${t("versus")} ${esc(match.opponent)}</div><div class="match-meta">${esc(match.venue || competitionLabel(match))}</div></div><div class="match-score ${Number(match.ycac_goals) > Number(match.opponent_goals) ? "win" : ""}">${match.ycac_goals}–${match.opponent_goals}</div></a>`).join("") || document.querySelector("#empty-state").innerHTML; };
  renderResults("#tml-results", tmlMatches); renderResults("#friendly-results", friendlyMatches);
  // Stable squad — the TML-core group, same engine as the coach dashboard (tiers = derived only).
  const season = YCACStats.computeSeason({ players: data.players, matches: data.matches, appearances: data.appearances, goals: data.goals });
  const core = YCACStats.ranked(season.tiers.core);
  document.querySelector("#squad-chips").innerHTML = core.map((entry) => `<a class="squad-chip" href="player.html?id=${encodeURIComponent(entry.id)}">${photoCell(entry)}<span class="sc-name">${esc(entry.display_name)}</span><small>${esc(entry.primary_position || "")}</small></a>`).join("") || document.querySelector("#empty-state").innerHTML;
  const appearancesByMatch = new Map(data.appearances.map((appearance) => [`${appearance.match_id}:${appearance.player_id}`, appearance]));
  const goalsByMatch = new Map(); for (const goal of data.goals) { const key = `${goal.match_id}:${goal.scorer_id}`; goalsByMatch.set(key, (goalsByMatch.get(key) || 0) + 1); }
  // Attendance — TML first: the main table is TML-only, sorted by TML attendance
  // (main consideration); friendly attendance sits in a folded supplement table.
  const compClass = (match) => match.competition === "Friendly Match" ? "friendly-match" : "tml-match";
  const squad = [...players.values()];
  const summaryFor = (player, matches) => {
    const ids = new Set(matches.map((match) => match.id));
    const count = matches.filter((match) => appearancesByMatch.has(`${match.id}:${player.id}`)).length;
    const goals = [...goalsByMatch.entries()].filter(([key]) => ids.has(key.split(":")[0]) && key.endsWith(`:${player.id}`)).reduce((total, [, value]) => total + value, 0);
    const cleanSheets = matches.filter((match) => player.primary_position === "GK" && appearancesByMatch.get(`${match.id}:${player.id}`)?.role === "starter" && Number(match.opponent_goals) === 0).length;
    const pct = matches.length ? Math.round(count / matches.length * 100) : 0;
    const extras = [`${goals}⚽`, `${cleanSheets}🧤`].filter((value) => value[0] !== "0").join(" ");
    return { pct, count, text: `${count ? `${pct}%` : "—"}${extras ? ` · ${extras}` : ""}` };
  };
  const positionCell = (player) => `${YCACStats.positionGroup(player.primary_position)}${player.primary_position && YCACStats.positionGroup(player.primary_position) !== player.primary_position ? ` · ${esc(player.primary_position)}` : ""}`;
  const attHead = (longLabel, shortLabel, matches) => `<tr><th>${t("player")}</th><th><span class="attendance-long">${longLabel} ${t("summary")}</span><span class="attendance-short">${shortLabel}</span></th><th>${t("position")}</th>${matches.map((match) => `<th class="match-column ${compClass(match)}" title="${esc(match.opponent)}">${formatDate(match.date)}<small>${esc(match.opponent)}</small></th>`).join("")}</tr>`;
  const attRow = (player, matches) => {
    const summary = summaryFor(player, matches);
    return `<tr><td><a class="attendance-player" href="player.html?id=${encodeURIComponent(player.id)}">${photoCell(player)}<span class="ap-name">${esc(player.display_name)}</span></a></td><td title="${summary.count}/${matches.length} · ${summary.text}">${summary.text}</td><td>${positionCell(player)}</td>${matches.map((match) => { const appearance = appearancesByMatch.get(`${match.id}:${player.id}`); if (!appearance) return `<td class="match-cell empty-cell ${compClass(match)}">—</td>`; const goals = goalsByMatch.get(`${match.id}:${player.id}`) || 0; const cleanSheet = player.primary_position === "GK" && appearance.role === "starter" && Number(match.opponent_goals) === 0; return `<td class="match-cell ${compClass(match)}">${appearance.role === "starter" ? "🟢" : "🔵"}${"⚽".repeat(goals)}${cleanSheet ? "🧤" : ""}</td>`; }).join("")}</tr>`;
  };
  const visible = squad.filter((player) => player.display_name.toLocaleLowerCase().includes(attendanceSearch));
  const byAttendance = (matches) => (a, b) => summaryFor(b, matches).pct - summaryFor(a, matches).pct
    || YCACStats.POSITION_ORDER[YCACStats.positionGroup(a.primary_position)] - YCACStats.POSITION_ORDER[YCACStats.positionGroup(b.primary_position)]
    || a.display_name.localeCompare(b.display_name);
  const empty = document.querySelector("#empty-state").innerHTML;
  document.querySelector("#tml-attendance-head").innerHTML = attHead("TML", "TML", tmlMatches);
  document.querySelector("#tml-attendance").innerHTML = [...visible].sort(byAttendance(tmlMatches)).map((player) => attRow(player, tmlMatches)).join("") || empty;
  document.querySelector("#fnd-attendance-head").innerHTML = attHead(friendlyLabel, "FND", friendlyMatches);
  document.querySelector("#fnd-attendance").innerHTML = [...visible].sort(byAttendance(friendlyMatches)).map((player) => attRow(player, friendlyMatches)).join("") || empty;
}

YCACI18n.apply(document);
YCACI18n.onChange(() => { YCACI18n.apply(document); if (dashboardData) render(dashboardData); });
document.querySelector("#attendance-search").addEventListener("input", (event) => { attendanceSearch = event.target.value.trim().toLocaleLowerCase(); if (dashboardData) render(dashboardData); });
(async () => {
  try {
    const [players, matches, appearances, goals, injuries] = await Promise.all([
      YCACData.select("players", "select=*&order=display_name"),
      YCACData.select("matches", "select=*&order=date"),
      YCACData.select("appearances", "select=*"),
      YCACData.select("goals", "select=*"),
      YCACData.select("injuries", "select=*&order=since_date").catch(() => []), // supplementary: never block the dashboard
    ]);
    dashboardData = { players, matches, appearances, goals, injuries };
    render(dashboardData);
  } catch (error) {
    console.error(error);
    document.querySelector("#updated").textContent = t("unavailable");
  }
})();
