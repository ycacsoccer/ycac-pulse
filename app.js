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
  const playedMatches = [...tmlMatches, ...friendlyMatches].sort((a, b) => b.date.localeCompare(a.date));
  const fixtures = data.matches.filter((match) => !YCACStats.isFinal(match)).sort((a, b) => a.date.localeCompare(b.date));
  const setStats = (prefix, matches) => { const wins = matches.filter((match) => Number(match.ycac_goals) > Number(match.opponent_goals)).length; const draws = matches.filter((match) => Number(match.ycac_goals) === Number(match.opponent_goals)).length; const losses = matches.length - wins - draws; const record = document.querySelector(`#${prefix}-record`); record.innerHTML = `${wins}–${draws}–${losses}<small>${t("wdl")}</small>`; record.setAttribute("aria-label", t("recordAria", { wins, draws, losses })); document.querySelector(`#${prefix}-goals-for`).textContent = matches.reduce((total, match) => total + Number(match.ycac_goals), 0); document.querySelector(`#${prefix}-goals-against`).textContent = matches.reduce((total, match) => total + Number(match.opponent_goals), 0); document.querySelector(`#${prefix}-clean-sheets`).textContent = matches.filter((match) => Number(match.opponent_goals) === 0).length; };
  setStats("tml", tmlMatches); setStats("friendly", friendlyMatches);
  const friendlyLabel = t("friendlyMatches");
  const competitionLabel = (match) => match.competition === "Friendly Match" ? friendlyLabel : match.competition;
  document.querySelector("#friendly-title").textContent = friendlyLabel; document.querySelector("#friendly-results-label").textContent = friendlyLabel;
  document.querySelector("#updated").textContent = `${t("liveData")} · ${tmlMatches.length} ${t("matchesRecorded")}`;
  document.querySelector("#friendly-updated").textContent = `${friendlyMatches.length} ${t("matchesRecorded")}`;
  const visualLabels = { eyebrow: t("vizEyebrow"), distribution: t("vizTopScorers"), timeline: t("vizTimeline"), friendly: t("vizFriendly"), win: t("vizWin"), draw: t("vizDraw"), loss: t("vizLoss") };
  document.querySelector("#distribution-eyebrow").textContent = visualLabels.eyebrow; document.querySelector("#distribution-title").textContent = visualLabels.distribution; document.querySelector("#timeline-eyebrow").textContent = t("seasonEyebrow"); document.querySelector("#timeline-title").textContent = visualLabels.timeline; document.querySelector("#friendly-timeline-label").textContent = visualLabels.friendly;
  const scorerTotals = (matches) => { const ids = new Set(matches.map((match) => match.id)); const totals = new Map(); for (const goal of data.goals.filter((goal) => ids.has(goal.match_id))) totals.set(goal.scorer_id, (totals.get(goal.scorer_id) || 0) + 1); return [...totals.entries()].sort((a, b) => b[1] - a[1]); };
  const tmlScorers = scorerTotals(tmlMatches), friendlyScorers = scorerTotals(friendlyMatches), largestScorerTotal = Math.max(1, ...tmlScorers.map(([, goals]) => goals), ...friendlyScorers.map(([, goals]) => goals));
  const distribution = (label, scorers, competition) => `<div class="goal-group ${competition}"><div class="goal-group-head"><span>${label}</span><span>${scorers.reduce((total, [, goals]) => total + goals, 0)} ${t("goals")}</span></div><div class="goal-bars">${scorers.map(([id, goals]) => `<div class="goal-bar scorer-bar"><span>${esc(playerName(players, id))}</span><div class="goal-track"><div class="goal-fill" style="width:${goals / largestScorerTotal * 100}%"></div></div><strong class="goal-value">${goals}</strong></div>`).join("")}</div></div>`;
  document.querySelector("#goal-distribution").innerHTML = distribution("TML Division 3", tmlScorers, "tml") + distribution(friendlyLabel, friendlyScorers, "friendly");
  document.querySelector("#season-timeline").innerHTML = playedMatches.map((match) => { const goalsFor = Number(match.ycac_goals), goalsAgainst = Number(match.opponent_goals); const outcome = goalsFor > goalsAgainst ? "win" : goalsFor === goalsAgainst ? "draw" : "loss"; return `<div class="timeline-entry ${match.competition === "Friendly Match" ? "friendly" : "tml"}"><div class="timeline-date">${formatDate(match.date)}</div><div class="timeline-rail"><i class="timeline-marker"></i></div><div class="timeline-match"><div class="timeline-opponent">${t("versus")} ${esc(match.opponent)}</div><div class="timeline-meta">${esc(competitionLabel(match))}</div></div><div class="timeline-score ${outcome}">${goalsFor}–${goalsAgainst}<span>${visualLabels[outcome]}</span></div></div>`; }).join("") || document.querySelector("#empty-state").innerHTML;
  document.querySelector("#fixtures").innerHTML = fixtures.map((match) => { const signups = `${match.standard_signup_url ? `<a href="${esc(match.standard_signup_url)}" target="_blank" rel="noreferrer">${t("standardSignup")}</a>` : ""}${match.priority_signup_url ? `<a href="${esc(match.priority_signup_url)}" target="_blank" rel="noreferrer">${t("prioritySignup")}</a>` : ""}`; return `<div class="fixture"><div class="fixture-date">${formatDate(match.date)}</div><div><div class="fixture-opponent"><a href="match.html?id=${encodeURIComponent(match.id)}">${t("versus")} ${esc(match.opponent)}</a></div><div class="fixture-meta">${esc(competitionLabel(match))}${match.venue ? ` · ${esc(match.venue)}` : ""}</div>${signups ? `<div class="fixture-actions">${signups}</div>` : ""}</div><div class="fixture-time">${esc(match.kickoff || "TBC")}<br /><small>${t("kickoff")}</small></div></div>`; }).join("") || document.querySelector("#empty-state").innerHTML;
  const renderResults = (target, matches) => { document.querySelector(target).innerHTML = matches.map((match) => `<a class="match" href="match.html?id=${encodeURIComponent(match.id)}"><div class="match-date">${formatDate(match.date)}</div><div><div class="match-opponent">${t("versus")} ${esc(match.opponent)}</div><div class="match-meta">${esc(match.venue || competitionLabel(match))}</div></div><div class="match-score ${Number(match.ycac_goals) > Number(match.opponent_goals) ? "win" : ""}">${match.ycac_goals}–${match.opponent_goals}</div></a>`).join("") || document.querySelector("#empty-state").innerHTML; };
  renderResults("#tml-results", tmlMatches); renderResults("#friendly-results", friendlyMatches);
  // Stable squad — the TML-core group, same engine as the coach dashboard (tiers = derived only).
  const season = YCACStats.computeSeason({ players: data.players, matches: data.matches, appearances: data.appearances, goals: data.goals });
  const core = YCACStats.ranked(season.tiers.core);
  document.querySelector("#squad-chips").innerHTML = core.map((entry) => `<a class="squad-chip" href="player.html?id=${encodeURIComponent(entry.id)}">${photoCell(entry)}<span class="sc-name">${esc(entry.display_name)}</span><small>${esc(entry.primary_position || "")}</small></a>`).join("") || document.querySelector("#empty-state").innerHTML;
  const appearancesByMatch = new Map(data.appearances.map((appearance) => [`${appearance.match_id}:${appearance.player_id}`, appearance]));
  const goalsByMatch = new Map(); for (const goal of data.goals) { const key = `${goal.match_id}:${goal.scorer_id}`; goalsByMatch.set(key, (goalsByMatch.get(key) || 0) + 1); }
  const playerRows = [...players.values()].sort((a, b) => YCACStats.POSITION_ORDER[YCACStats.positionGroup(a.primary_position)] - YCACStats.POSITION_ORDER[YCACStats.positionGroup(b.primary_position)] || a.display_name.localeCompare(b.display_name));
  const playerSummary = (player, matches) => { const ids = new Set(matches.map((match) => match.id)); const appearances = matches.filter((match) => appearancesByMatch.has(`${match.match_id}:${player.id}`)).length; const goals = [...goalsByMatch.entries()].filter(([key]) => ids.has(key.split(":")[0]) && key.endsWith(`:${player.id}`)).reduce((total, [, value]) => total + value, 0); const cleanSheets = matches.filter((match) => player.primary_position === "GK" && appearancesByMatch.get(`${match.match_id}:${player.id}`)?.role === "starter" && Number(match.opponent_goals) === 0).length; const summary = [`${goals}⚽`, `${cleanSheets}🧤`].filter((value) => value[0] !== "0").join(" "); return `${appearances ? `${Math.round(appearances / matches.length * 100)}%` : "—"}${summary ? ` · ${summary}` : ""}`; };
  document.querySelector("#attendance-head").innerHTML = `<tr><th>${t("player")}</th><th><span class="attendance-long">TML ${t("summary")}</span><span class="attendance-short">TML</span></th><th><span class="attendance-long">${friendlyLabel} ${t("summary")}</span><span class="attendance-short">FND</span></th><th>${t("position")}</th>${playedMatches.map((match) => `<th class="match-column ${match.competition === "Friendly Match" ? "friendly-match" : "tml-match"}" title="${esc(match.opponent)}">${formatDate(match.date)}<small>${esc(match.opponent)}</small></th>`).join("")}</tr>`;
  document.querySelector("#attendance").innerHTML = playerRows.filter((player) => player.display_name.toLocaleLowerCase().includes(attendanceSearch)).map((player) => `<tr><td><a class="attendance-player" href="player.html?id=${encodeURIComponent(player.id)}">${photoCell(player)}<span class="ap-name">${esc(player.display_name)}</span></a></td><td>${playerSummary(player, tmlMatches)}</td><td>${playerSummary(player, friendlyMatches)}</td><td>${YCACStats.positionGroup(player.primary_position)}${player.primary_position && YCACStats.positionGroup(player.primary_position) !== player.primary_position ? ` · ${esc(player.primary_position)}` : ""}</td>${playedMatches.map((match) => { const competitionClass = match.competition === "Friendly Match" ? "friendly-match" : "tml-match"; const appearance = appearancesByMatch.get(`${match.match_id}:${player.id}`); if (!appearance) return `<td class="match-cell empty-cell ${competitionClass}">—</td>`; const goals = goalsByMatch.get(`${match.match_id}:${player.id}`) || 0; const cleanSheet = player.primary_position === "GK" && appearance.role === "starter" && Number(match.opponent_goals) === 0; return `<td class="match-cell ${competitionClass}">${appearance.role === "starter" ? "🟢" : "🔵"}${"⚽".repeat(goals)}${cleanSheet ? "🧤" : ""}</td>`; }).join("")}</tr>`).join("");
}

YCACI18n.apply(document);
YCACI18n.onChange(() => { YCACI18n.apply(document); if (dashboardData) render(dashboardData); });
document.querySelector("#attendance-search").addEventListener("input", (event) => { attendanceSearch = event.target.value.trim().toLocaleLowerCase(); if (dashboardData) render(dashboardData); });
(async () => {
  try {
    const [players, matches, appearances, goals] = await Promise.all([
      YCACData.select("players", "select=*&order=display_name"),
      YCACData.select("matches", "select=*&order=date"),
      YCACData.select("appearances", "select=*"),
      YCACData.select("goals", "select=*"),
    ]);
    dashboardData = { players, matches, appearances, goals };
    render(dashboardData);
  } catch (error) {
    console.error(error);
    document.querySelector("#updated").textContent = t("unavailable");
  }
})();
