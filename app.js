/* YC&AC Pulse — public season dashboard (Phase 10, TML-first public revamp).
   Reads Supabase through data.js — the gviz sheet loader is gone. TML leads:
   scoreline, results and the stable squad; friendlies fold away behind a
   <details>. Squad tiers and position groups come from stats.js, the same
   engine the coach dashboard uses (public pages get fully derived tiers —
   no coach_notes). Wave 21: the attendance tables are gone — appearance
   records still power results, timelines and selection groups, but the site
   no longer presents attendance as a purpose. Wave 23: matchday-first hero
   (#matchday cards) + one segmented stat band (#season) driven by activeLens.
   Wave 24: data modules — form guide + streak in the band, assists beside
   the scorers, goal-timing histogram + season trajectory in the bento.
   Wave 25: TML Division 3 standings (#standings) from the shipped standings.js,
   club row highlighted. */
const t = (key, vars) => YCACI18n.t(key, vars);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
let dashboardData;

function playerName(players, id) { return players.get(id)?.display_name || id; }
function formatDate(value) { return YCACI18n.formatDate(value); }
const competitionLabel = (match) => match.competition === "Friendly Match" ? t("friendlyMatches") : match.competition;

/* Season snapshot for one lens (TML / friendly / all) — wins, goals, GD, win
   rate, clean sheets. The band repaints from these without a page reload. */
const statSnapshot = (matches) => {
  const wins = matches.filter((match) => Number(match.ycac_goals) > Number(match.opponent_goals)).length;
  const draws = matches.filter((match) => Number(match.ycac_goals) === Number(match.opponent_goals)).length;
  const losses = matches.length - wins - draws;
  const gf = matches.reduce((total, match) => total + Number(match.ycac_goals), 0);
  const ga = matches.reduce((total, match) => total + Number(match.opponent_goals), 0);
  return { wins, draws, losses, gf, ga, gd: gf - ga, cs: matches.filter((match) => Number(match.opponent_goals) === 0).length,
    winPct: matches.length ? Math.round((wins / matches.length) * 100) : null, count: matches.length };
};
let activeLens = "tml";
let lensStats = null;
let lensMatches = null;
const matchOutcome = (match) => { const gf = Number(match.ycac_goals), ga = Number(match.opponent_goals); return gf > ga ? "win" : gf === ga ? "draw" : "loss"; };
const paintBand = () => {
  if (!lensStats) return;
  const stats = lensStats[activeLens];
  const record = document.querySelector("#season-record");
  record.innerHTML = `${stats.wins}–${stats.draws}–${stats.losses}<small>${t("wdl")}</small>`;
  record.setAttribute("aria-label", t("recordAria", { wins: stats.wins, draws: stats.draws, losses: stats.losses }));
  document.querySelector("#season-goals-for").textContent = stats.gf;
  document.querySelector("#season-goals-against").textContent = stats.ga;
  document.querySelector("#season-goal-diff").textContent = (stats.gd > 0 ? "+" : "") + stats.gd;
  document.querySelector("#season-win-rate").textContent = stats.winPct == null ? "–" : `${stats.winPct}%`;
  document.querySelector("#season-clean-sheets").textContent = stats.cs;
  document.querySelector("#updated").textContent = `${t("liveData")} · ${stats.count} ${stats.count === 1 ? t("matchRecordedOne") : t("matchesRecorded")}`;
  // Wave 24: form guide — last five results, oldest → newest — + current streak.
  const rows = (lensMatches && lensMatches[activeLens]) || [];
  document.querySelector("#season-form").innerHTML = rows.slice(0, 5).reverse().map((match) => {
    const outcome = matchOutcome(match);
    const letter = outcome === "win" ? t("vizWin") : outcome === "draw" ? t("vizDraw") : t("vizLoss");
    return `<i class="form-pill ${outcome}">${esc(letter)}</i>`;
  }).join("") || "–";
  let streak = "";
  if (rows.length) {
    const outcomes = rows.map(matchOutcome);
    const run = (predicate) => { let count = 0; while (count < outcomes.length && predicate(outcomes[count])) count += 1; return count; };
    streak = outcomes[0] === "win" ? t("streakWon", { n: run((outcome) => outcome === "win") })
      : outcomes[0] === "draw" ? t("streakUnbeaten", { n: run((outcome) => outcome !== "loss") })
      : t("streakLost", { n: run((outcome) => outcome === "loss") });
  }
  document.querySelector("#season-streak").textContent = streak;
  document.querySelectorAll("[data-seg]").forEach((button) => {
    const on = button.dataset.seg === activeLens;
    button.classList.toggle("active", on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
  });
};
// Segment switcher — bound once at load (verify-render's stub query returns []).
document.querySelectorAll("[data-seg]").forEach((button) => {
  button.addEventListener("click", () => { activeLens = button.dataset.seg; paintBand(); });
});

/* Matchday-first hero: the next fixture when one is posted, the most recent
   result always, and the static hero-note if neither exists (data failure). */
function renderMatchday(fixtures, finals) {
  const box = document.querySelector("#matchday");
  if (!box) return;
  const next = fixtures[0];
  const last = finals[0];
  const cards = [];
  if (next) {
    const signups = `${next.standard_signup_url ? `<a href="${esc(next.standard_signup_url)}" target="_blank" rel="noreferrer">${t("standardSignup")}</a>` : ""}${next.priority_signup_url ? `<a href="${esc(next.priority_signup_url)}" target="_blank" rel="noreferrer">${t("prioritySignup")}</a>` : ""}`;
    cards.push(`<article class="md-card"><p class="eyebrow">${esc(t("mdNextMatch"))}</p><div class="md-line"><span class="md-date">${formatDate(next.date)}</span><span class="md-kickoff">${esc(next.kickoff || "TBC")}<small>${esc(t("kickoff"))}</small></span></div><div class="md-opponent"><a href="match.html?id=${encodeURIComponent(next.id)}">${esc(t("versus"))} ${esc(next.opponent)}</a></div><div class="md-meta">${esc(competitionLabel(next))}${next.venue ? ` · ${esc(next.venue)}` : ""}</div>${signups ? `<div class="fixture-actions">${signups}</div>` : ""}</article>`);
  }
  if (last) {
    const gf = Number(last.ycac_goals), ga = Number(last.opponent_goals);
    const outcome = gf > ga ? "win" : gf === ga ? "draw" : "loss";
    const letter = outcome === "win" ? t("vizWin") : outcome === "draw" ? t("vizDraw") : t("vizLoss");
    cards.push(`<article class="md-card"><p class="eyebrow">${esc(t("mdLastResult"))}</p><div class="md-line"><span class="result-badge ${outcome}">${esc(letter)}</span><strong class="md-score">${gf}–${ga}</strong><span class="md-opponent"><a href="match.html?id=${encodeURIComponent(last.id)}">${esc(t("versus"))} ${esc(last.opponent)}</a></span></div><div class="md-meta">${formatDate(last.date)} · ${esc(competitionLabel(last))}</div></article>`);
  }
  box.innerHTML = cards.join("") || `<div class="hero-note"><span>${esc(t("officialTeam"))}</span><strong>${esc(t("heroNote"))}</strong></div>`;
}

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
  // Wave 23: one segmented band — three lens snapshots, repainted by paintBand().
  const allFinals = [...tmlMatches, ...friendlyMatches].sort((a, b) => b.date.localeCompare(a.date));
  lensStats = { tml: statSnapshot(tmlMatches), friendly: statSnapshot(friendlyMatches), all: statSnapshot(allFinals) };
  lensMatches = { tml: tmlMatches, friendly: friendlyMatches, all: allFinals };
  paintBand();
  renderMatchday(fixtures, allFinals);
  const friendlyLabel = t("friendlyMatches");
  document.querySelector("#friendly-results-label").textContent = friendlyLabel;
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
  // KPI rate strip (wave 17): goals per game, conceded per game and win rate,
  // one row per panel (wave 21: the attendance-per-game tile is gone).
  const kpiStrip = (matches) => {
    const stats = YCACCharts.kpis(matches);
    const rate = (value) => (value == null ? "–" : String(Number(value.toFixed(2))));
    const tiles = [
      [rate(stats.gfPerGame), t("kpiGoalsPerGame")],
      [rate(stats.gaPerGame), t("kpiConcededPerGame")],
      [stats.winPct == null ? "–" : `${stats.winPct}%`, t("kpiWinRate")],
    ];
    return tiles.map(([value, label]) => `<div class="kpi"><strong>${esc(value)}</strong><small>${esc(label)}</small></div>`).join("");
  };
  document.querySelector("#perf-tml-kpi").innerHTML = kpiStrip(tmlMatches);
  document.querySelector("#perf-friendly-kpi").innerHTML = kpiStrip(friendlyMatches);
  const scorerTotals = (matches) => { const ids = new Set(matches.map((match) => match.id)); const totals = new Map(); for (const goal of data.goals.filter((goal) => ids.has(goal.match_id))) totals.set(goal.scorer_id, (totals.get(goal.scorer_id) || 0) + 1); return [...totals.entries()].sort((a, b) => b[1] - a[1]); };
  const tmlScorers = scorerTotals(tmlMatches), friendlyScorers = scorerTotals(friendlyMatches), largestScorerTotal = Math.max(1, ...tmlScorers.map(([, goals]) => goals), ...friendlyScorers.map(([, goals]) => goals));
  const distribution = (label, scorers, competition) => { const groupTotal = scorers.reduce((total, [, goals]) => total + goals, 0); const bars = scorers.map(([id, goals]) => `<div class="goal-bar scorer-bar"><span>${esc(playerName(players, id))}</span><div class="goal-track"><div class="goal-fill" style="width:${goals / largestScorerTotal * 100}%"></div></div><strong class="goal-value">${goals}</strong></div>`).join(""); return `<div class="goal-group ${competition}"><div class="goal-group-head"><span>${label}</span><span>${groupTotal} ${groupTotal === 1 ? t("goalOne") : t("goals")}</span></div><div class="goal-bars">${bars}</div></div>`; };
  document.querySelector("#perf-tml-scorers").innerHTML = distribution("TML Division 3", tmlScorers, "tml") || document.querySelector("#empty-state").innerHTML;
  document.querySelector("#perf-friendly-scorers").innerHTML = distribution(friendlyLabel, friendlyScorers, "friendly") || document.querySelector("#empty-state").innerHTML;
  // Wave 24: assists — same bar language as the scorers, one group per panel.
  const assistTotals = (matches) => { const ids = new Set(matches.map((match) => match.id)); const totals = new Map(); for (const goal of data.goals) { if (goal.assist_id && ids.has(goal.match_id)) totals.set(goal.assist_id, (totals.get(goal.assist_id) || 0) + 1); } return [...totals.entries()].sort((a, b) => b[1] - a[1]); };
  const tmlAssists = assistTotals(tmlMatches), friendlyAssists = assistTotals(friendlyMatches), largestAssistTotal = Math.max(1, ...tmlAssists.map(([, assists]) => assists), ...friendlyAssists.map(([, assists]) => assists));
  const assistGroup = (label, assists, competition) => { if (!assists.length) return ""; const groupTotal = assists.reduce((total, [, assists]) => total + assists, 0); const bars = assists.map(([id, assists]) => `<div class="goal-bar assist-bar"><span>${esc(playerName(players, id))}</span><div class="goal-track"><div class="goal-fill" style="width:${assists / largestAssistTotal * 100}%"></div></div><strong class="goal-value">${assists}</strong></div>`).join(""); return `<div class="goal-group assist ${competition}"><div class="goal-group-head"><span>${label}</span><span>${groupTotal} ${groupTotal === 1 ? t("assistOne") : t("assists")}</span></div><div class="goal-bars">${bars}</div></div>`; };
  document.querySelector("#perf-tml-assists").innerHTML = assistGroup("TML Division 3", tmlAssists, "tml") || document.querySelector("#empty-state").innerHTML;
  document.querySelector("#perf-friendly-assists").innerHTML = assistGroup(friendlyLabel, friendlyAssists, "friendly") || document.querySelector("#empty-state").innerHTML;
  // Wave 24: goal-timing histogram (goals.minute) + season trajectory (cumulative GD).
  document.querySelector("#timing-chart").innerHTML = YCACCharts.timingSVG(data.goals) || document.querySelector("#empty-state").innerHTML;
  document.querySelector("#trajectory-chart").innerHTML = YCACCharts.trajectorySVG(allFinals, { labels: { dateFmt: formatDate } }) || document.querySelector("#empty-state").innerHTML;
  document.querySelector("#fixtures").innerHTML = fixtures.map((match) => { const signups = `${match.standard_signup_url ? `<a href="${esc(match.standard_signup_url)}" target="_blank" rel="noreferrer">${t("standardSignup")}</a>` : ""}${match.priority_signup_url ? `<a href="${esc(match.priority_signup_url)}" target="_blank" rel="noreferrer">${t("prioritySignup")}</a>` : ""}`; return `<div class="fixture"><div class="fixture-date">${formatDate(match.date)}</div><div><div class="fixture-opponent"><a href="match.html?id=${encodeURIComponent(match.id)}">${t("versus")} ${esc(match.opponent)}</a></div><div class="fixture-meta">${esc(competitionLabel(match))}${match.venue ? ` · ${esc(match.venue)}` : ""}</div>${signups ? `<div class="fixture-actions">${signups}</div>` : ""}</div><div class="fixture-time">${esc(match.kickoff || "TBC")}<br /><small>${t("kickoff")}</small></div></div>`; }).join("") || document.querySelector("#empty-state").innerHTML;
  // Results rows — W/D/L badge + score, competition chip under the opponent.
  const renderResults = (target, matches) => { document.querySelector(target).innerHTML = matches.map((match) => { const gf = Number(match.ycac_goals), ga = Number(match.opponent_goals); const outcome = gf > ga ? "win" : gf === ga ? "draw" : "loss"; const letter = outcome === "win" ? t("vizWin") : outcome === "draw" ? t("vizDraw") : t("vizLoss"); const chip = match.competition === "Friendly Match" ? `<span class="comp-chip friendly">${esc(t("vizFriendly"))}</span>` : `<span class="comp-chip tml">TML</span>`; return `<a class="match" href="match.html?id=${encodeURIComponent(match.id)}"><div class="match-date">${formatDate(match.date)}</div><div><div class="match-opponent">${t("versus")} ${esc(match.opponent)}</div><div class="match-meta">${chip}${match.venue ? esc(match.venue) : ""}</div></div><div class="match-end"><span class="result-badge ${outcome}">${esc(letter)}</span><span class="match-score ${outcome}">${gf}–${ga}</span></div></a>`; }).join("") || document.querySelector("#empty-state").innerHTML; };
  renderResults("#tml-results", tmlMatches); renderResults("#friendly-results", friendlyMatches);
  // Stable squad — the TML-core group, same engine as the coach dashboard (tiers = derived only).
  const season = YCACStats.computeSeason({ players: data.players, matches: data.matches, appearances: data.appearances, goals: data.goals });
  const core = YCACStats.ranked(season.tiers.core);
  document.querySelector("#squad-chips").innerHTML = core.map((entry) => `<a class="squad-chip" href="player.html?id=${encodeURIComponent(entry.id)}">${photoCell(entry)}<span class="sc-name">${esc(entry.display_name)}</span><small>${esc(entry.primary_position || "")}</small></a>`).join("") || document.querySelector("#empty-state").innerHTML;
  // Wave 25: TML Division 3 standings — hand-maintained league table, club row
  // highlighted, GD rendered from gf − ga so it can never drift from the data.
  const standingsBox = document.querySelector("#standings");
  if (standingsBox) {
    const table = window.YCACStandings;
    const rows = (table && table.rows) || [];
    standingsBox.hidden = !rows.length;
    document.querySelector("#standings-body").innerHTML = rows.map((row, index) => {
      const gd = Number(row.gf) - Number(row.ga);
      return `<tr class="${row.us ? "is-us" : ""}"><td class="st-pos">${index + 1}</td><td class="st-team">${esc(row.team)}</td><td>${row.p}</td><td>${row.w}</td><td>${row.d}</td><td>${row.l}</td><td>${row.gf}</td><td>${row.ga}</td><td>${gd}</td><td class="st-pts">${row.pts}</td></tr>`;
    }).join("");
    document.querySelector("#standings-updated").textContent = table && table.updated ? t("standingsAsOf", { date: formatDate(table.updated) }) : "";
  }
}

YCACI18n.apply(document);
YCACI18n.onChange(() => { YCACI18n.apply(document); if (dashboardData) render(dashboardData); });
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
