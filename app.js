const sheetId = "1KpxZeFlFUKIxTxB6_4_MgcdBAqi6He44aSW-0P4SPcM";
const tabs = ["Players", "Matches", "Appearances", "Goals"];
let language = YCACI18n.language;
let dashboardData;
let attendanceSearch = "";


const t = (key, vars) => YCACI18n.t(key, vars);

async function getSheet(tab) {
  const callback = `ycacSheet_${tab.replace(/\W/g, "_")}_${Date.now()}`;
  const query = new URLSearchParams({ tqx: `out:json;responseHandler:${callback}`, sheet: tab });
  const json = await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const cleanup = () => { script.remove(); delete window[callback]; };
    window[callback] = (response) => { cleanup(); if (response.status !== "ok") { reject(new Error(`Could not load ${tab}`)); return; } resolve(response); };
    script.onerror = () => { cleanup(); reject(new Error(`Could not load ${tab}`)); };
    script.src = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?${query}`;
    document.head.append(script);
  });
  let headers = json.table.cols.map((column) => column.label);
  let rows = json.table.rows;
  // Google occasionally returns a first-row header as data for imported tabs.
  if (headers.every((header) => !header) && rows.length) {
    headers = rows[0].c.map((cell) => cell?.v ?? "");
    rows = rows.slice(1);
  }
  return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row.c[index]?.v ?? ""])));
}

function playerName(players, id) { return players.get(id)?.display_name || id; }
function formatDate(value) { return YCACI18n.formatDate(value); }

function render(data) {
  const players = new Map(data.Players.filter((player) => player.active !== false).map((player) => [player.player_id, player]));
  const isComplete = (match) => match.ycac_goals !== "" && match.opponent_goals !== "";
  const tmlMatches = data.Matches.filter((match) => match.competition === "TML Division 3" && isComplete(match)).sort((a, b) => b.date.localeCompare(a.date));
  const friendlyMatches = data.Matches.filter((match) => match.competition === "Friendly Match" && isComplete(match)).sort((a, b) => b.date.localeCompare(a.date));
  const playedMatches = [...tmlMatches, ...friendlyMatches].sort((a, b) => b.date.localeCompare(a.date));
  const fixtures = data.Matches.filter((match) => !isComplete(match)).sort((a, b) => a.date.localeCompare(b.date));
  const setStats = (prefix, matches) => { const wins = matches.filter((match) => Number(match.ycac_goals) > Number(match.opponent_goals)).length; const draws = matches.filter((match) => Number(match.ycac_goals) === Number(match.opponent_goals)).length; const losses = matches.length - wins - draws; const record = document.querySelector(`#${prefix}-record`); record.innerHTML = `${wins}–${draws}–${losses}<small>${t("wdl")}</small>`; record.setAttribute("aria-label", t("recordAria", { wins, draws, losses })); document.querySelector(`#${prefix}-goals-for`).textContent = matches.reduce((total, match) => total + Number(match.ycac_goals), 0); document.querySelector(`#${prefix}-goals-against`).textContent = matches.reduce((total, match) => total + Number(match.opponent_goals), 0); document.querySelector(`#${prefix}-clean-sheets`).textContent = matches.filter((match) => Number(match.opponent_goals) === 0).length; };
  setStats("tml", tmlMatches); setStats("friendly", friendlyMatches);
  const friendlyLabel = t("friendlyMatches");
  const competitionLabel = (match) => match.competition === "Friendly Match" ? friendlyLabel : match.competition;
  document.querySelector("#friendly-title").textContent = friendlyLabel; document.querySelector("#friendly-results-label").textContent = friendlyLabel;
  document.querySelector("#updated").textContent = `${t("liveData")} · ${tmlMatches.length} ${t("matchesRecorded")}`;
  document.querySelector("#friendly-updated").textContent = `${friendlyMatches.length} ${t("matchesRecorded")}`;
  const visualLabels = { eyebrow: t("vizEyebrow"), distribution: t("vizTopScorers"), timeline: t("vizTimeline"), friendly: t("vizFriendly"), win: t("vizWin"), draw: t("vizDraw"), loss: t("vizLoss") };
  document.querySelector("#distribution-eyebrow").textContent = visualLabels.eyebrow; document.querySelector("#distribution-title").textContent = visualLabels.distribution; document.querySelector("#timeline-eyebrow").textContent = t("seasonEyebrow"); document.querySelector("#timeline-title").textContent = visualLabels.timeline; document.querySelector("#friendly-timeline-label").textContent = visualLabels.friendly;
  const scorerTotals = (matches) => { const ids = new Set(matches.map((match) => match.match_id)); const totals = new Map(); for (const goal of data.Goals.filter((goal) => ids.has(goal.match_id))) totals.set(goal.scorer_id, (totals.get(goal.scorer_id) || 0) + 1); return [...totals.entries()].sort((a, b) => b[1] - a[1]); };
  const tmlScorers = scorerTotals(tmlMatches), friendlyScorers = scorerTotals(friendlyMatches), largestScorerTotal = Math.max(1, ...tmlScorers.map(([, goals]) => goals), ...friendlyScorers.map(([, goals]) => goals));
  const distribution = (label, scorers, competition) => `<div class="goal-group ${competition}"><div class="goal-group-head"><span>${label}</span><span>${scorers.reduce((total, [, goals]) => total + goals, 0)} ${t("goals")}</span></div><div class="goal-bars">${scorers.map(([id, goals]) => `<div class="goal-bar scorer-bar"><span>${playerName(players, id)}</span><div class="goal-track"><div class="goal-fill" style="width:${goals / largestScorerTotal * 100}%"></div></div><strong class="goal-value">${goals}</strong></div>`).join("")}</div></div>`;
  document.querySelector("#goal-distribution").innerHTML = distribution("TML Division 3", tmlScorers, "tml") + distribution(friendlyLabel, friendlyScorers, "friendly");
  document.querySelector("#season-timeline").innerHTML = playedMatches.map((match) => { const goalsFor = Number(match.ycac_goals), goalsAgainst = Number(match.opponent_goals); const outcome = goalsFor > goalsAgainst ? "win" : goalsFor === goalsAgainst ? "draw" : "loss"; return `<div class="timeline-entry ${match.competition === "Friendly Match" ? "friendly" : "tml"}"><div class="timeline-date">${formatDate(match.date)}</div><div class="timeline-rail"><i class="timeline-marker"></i></div><div class="timeline-match"><div class="timeline-opponent">${t("versus")} ${match.opponent}</div><div class="timeline-meta">${competitionLabel(match)}</div></div><div class="timeline-score ${outcome}">${goalsFor}–${goalsAgainst}<span>${visualLabels[outcome]}</span></div></div>`; }).join("") || document.querySelector("#empty-state").innerHTML;
  document.querySelector("#fixtures").innerHTML = fixtures.map((match) => { const signups = `${match.standard_signup_url ? `<a href="${match.standard_signup_url}" target="_blank" rel="noreferrer">${t("standardSignup")}</a>` : ""}${match.priority_signup_url ? `<a href="${match.priority_signup_url}" target="_blank" rel="noreferrer">${t("prioritySignup")}</a>` : ""}`; return `<div class="fixture"><div class="fixture-date">${formatDate(match.date)}</div><div><div class="fixture-opponent">${t("versus")} ${match.opponent}</div><div class="fixture-meta">${competitionLabel(match)}${match.venue ? ` · ${match.venue}` : ""}</div>${signups ? `<div class="fixture-actions">${signups}</div>` : ""}</div><div class="fixture-time">${match.kickoff || "TBC"}<br /><small>${t("kickoff")}</small></div></div>`; }).join("") || document.querySelector("#empty-state").innerHTML;
  const renderResults = (target, matches) => { document.querySelector(target).innerHTML = matches.map((match) => `<div class="match"><div class="match-date">${formatDate(match.date)}</div><div><div class="match-opponent">${t("versus")} ${match.opponent}</div><div class="match-meta">${match.venue || competitionLabel(match)}</div></div><div class="match-score ${Number(match.ycac_goals) > Number(match.opponent_goals) ? "win" : ""}">${match.ycac_goals}–${match.opponent_goals}</div></div>`).join("") || document.querySelector("#empty-state").innerHTML; };
  renderResults("#tml-results", tmlMatches); renderResults("#friendly-results", friendlyMatches);
  const appearancesByMatch = new Map(data.Appearances.map((appearance) => [`${appearance.match_id}:${appearance.player_id}`, appearance]));
  const goalsByMatch = new Map(); for (const goal of data.Goals) { const key = `${goal.match_id}:${goal.scorer_id}`; goalsByMatch.set(key, (goalsByMatch.get(key) || 0) + 1); }
  const positionGroup = (position) => ({ GK: "GK", CB: "DF", LB: "DF", RB: "DF", LWB: "DF", RWB: "DF", DM: "MF", CM: "MF", AM: "MF", AMC: "MF", AMF: "MF", LW: "AT", RW: "AT", ST: "AT", CF: "AT", FW: "AT" })[position] || "Other";
  const positionOrder = { GK: 0, DF: 1, MF: 2, AT: 3, Other: 4 };
  const playerRows = [...players.values()].sort((a, b) => positionOrder[positionGroup(a.primary_position)] - positionOrder[positionGroup(b.primary_position)] || a.display_name.localeCompare(b.display_name));
  const playerSummary = (player, matches) => { const ids = new Set(matches.map((match) => match.match_id)); const appearances = matches.filter((match) => appearancesByMatch.has(`${match.match_id}:${player.player_id}`)).length; const goals = [...goalsByMatch.entries()].filter(([key]) => ids.has(key.split(":")[0]) && key.endsWith(`:${player.player_id}`)).reduce((total, [, value]) => total + value, 0); const cleanSheets = matches.filter((match) => player.primary_position === "GK" && appearancesByMatch.get(`${match.match_id}:${player.player_id}`)?.role === "starter" && Number(match.opponent_goals) === 0).length; const summary = [`${goals}⚽`, `${cleanSheets}🧤`].filter((value) => value[0] !== "0").join(" "); return `${appearances ? `${Math.round(appearances / matches.length * 100)}%` : "—"}${summary ? ` · ${summary}` : ""}`; };
  document.querySelector("#attendance-head").innerHTML = `<tr><th>${t("player")}</th><th>${t("position")}</th><th><span class="attendance-long">TML ${t("summary")}</span><span class="attendance-short">TML</span></th><th><span class="attendance-long">${friendlyLabel} ${t("summary")}</span><span class="attendance-short">FND</span></th>${playedMatches.map((match) => `<th class="match-column ${match.competition === "Friendly Match" ? "friendly-match" : "tml-match"}" title="${match.opponent}">${formatDate(match.date)}<small>${match.opponent}</small></th>`).join("")}</tr>`;
  document.querySelector("#attendance").innerHTML = playerRows.filter((player) => player.display_name.toLocaleLowerCase().includes(attendanceSearch)).map((player) => `<tr><td>${player.display_name}</td><td>${positionGroup(player.primary_position)}${player.primary_position && positionGroup(player.primary_position) !== player.primary_position ? ` · ${player.primary_position}` : ""}</td><td>${playerSummary(player, tmlMatches)}</td><td>${playerSummary(player, friendlyMatches)}</td>${playedMatches.map((match) => { const competitionClass = match.competition === "Friendly Match" ? "friendly-match" : "tml-match"; const appearance = appearancesByMatch.get(`${match.match_id}:${player.player_id}`); if (!appearance) return `<td class="match-cell empty-cell ${competitionClass}">—</td>`; const goals = goalsByMatch.get(`${match.match_id}:${player.player_id}`) || 0; const cleanSheet = player.primary_position === "GK" && appearance.role === "starter" && Number(match.opponent_goals) === 0; return `<td class="match-cell ${competitionClass}">${appearance.role === "starter" ? "🟢" : "🔵"}${"⚽".repeat(goals)}${cleanSheet ? "🧤" : ""}</td>`; }).join("")}</tr>`).join("");
}

YCACI18n.apply(document);
YCACI18n.onChange(() => { language = YCACI18n.language; YCACI18n.apply(document); if (dashboardData) render(dashboardData); });
document.querySelector("#attendance-search").addEventListener("input", (event) => { attendanceSearch = event.target.value.trim().toLocaleLowerCase(); if (dashboardData) render(dashboardData); });
Promise.all(tabs.map(async (tab) => [tab, await getSheet(tab)])).then((entries) => { dashboardData = Object.fromEntries(entries); render(dashboardData); }).catch((error) => { console.error(error); document.querySelector("#updated").textContent = t("unavailable"); });
