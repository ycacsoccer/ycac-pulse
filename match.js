/* YC&AC Pulse — public match page + private coach detail.
   Everyone can open ?id=<match> for fixture/result, lineup, scorers & assists.
   A signed-in coach additionally sees that fixture's signups, private
   reflection / coaching points, and — for an upcoming fixture — the squad
   picker: add/remove players in the match squad and save it to saved_squads.
   Wave 26 removed the old player/team gate. */
(() => {
  const t = (key, vars) => (window.YCACI18n ? YCACI18n.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);
  const VALID_ID = /^[a-z0-9_-]+$/i;
  const SIGNUP_STATES = ["confirmed", "waitlist", "declined", "unavailable"];
  const SIGNUP_KEYS = { confirmed: "signupConfirmed", waitlist: "signupWaitlist", declined: "signupDeclined", unavailable: "signupUnavailable" };
  const MAX_STARTERS = 11;
  const MAX_SUBS = 9;

  const state = {
    mode: "loading", // loading | ok | missing | error
    match: null, allMatches: [], apps: [], goals: [], allGoals: [], signups: [], notes: [], savedSquad: [], isCoach: false,
    playersById: new Map(),
  };

  // Coach-only draft of the match squad for an upcoming fixture.
  const squad = { formation: "4231", starters: [], subs: [], dirty: false, saving: false, status: null };

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const formatDate = (value) => (value && window.YCACI18n ? YCACI18n.formatDate(value) : value || "");
  const monogram = (name) => String(name || "?").split(/\s+/).map((word) => word[0]).slice(0, 2).join("").toUpperCase();
  const empty = (key) => `<p class="empty">${esc(t(key))}</p>`;
  const isFinal = (match) => match.ycac_goals != null && match.opponent_goals != null;

  function photoCell(player) {
    const initials = `<span class="monogram" aria-hidden="true">${esc(monogram(player.display_name))}</span>`;
    if (!player.photo_path) return `<span class="avatar">${initials}</span>`;
    return `<span class="avatar">${initials}<img src="${esc(YCACData.publicUrl(player.photo_path))}" alt="" loading="lazy" onerror="this.remove()" /></span>`;
  }

  const playerName = (id) => state.playersById.get(id)?.display_name || id;

  // ---- renderers ------------------------------------------------------------

  function renderHero() {
    const target = $("match-hero");
    const m = state.match;
    if (state.mode === "missing") {
      target.innerHTML = `<p class="eyebrow">YC&amp;AC</p><h1>${esc(t("matchNotFound"))}</h1>`;
      return;
    }
    if (state.mode === "error") {
      target.innerHTML = `<p class="eyebrow">YC&amp;AC</p><h1>${esc(t("coachError"))}</h1>`;
      return;
    }
    const final = isFinal(m);
    const score = final
      ? `YC&amp;AC <span class="match-score">${m.ycac_goals}–${m.opponent_goals}</span> ${esc(m.opponent)}`
      : `YC&amp;AC ${esc(t("versus"))} ${esc(m.opponent)}`;
    const meta = [
      esc(formatDate(m.date)),
      m.venue ? esc(m.venue) : "",
      m.kickoff ? `${esc(t("kickoff"))} ${esc(m.kickoff)}` : "",
      m.home_away ? esc(t(m.home_away === "home" ? "adminHome" : "adminAway")) : "",
    ].filter(Boolean).join(" · ");
    target.innerHTML = `
      <p class="eyebrow">${esc(m.competition)}</p>
      <h1>${score}</h1>
      <p class="match-meta">${meta}</p>
      <span class="badge">${esc(t(final ? "results" : "upcoming"))}</span>`;
  }

  function renderLineup() {
    const panel = $("lineup-panel");
    const target = $("match-lineup");
    if (state.mode !== "ok") { panel.hidden = true; target.innerHTML = ""; return; }
    if (!state.apps.length && !isFinal(state.match)) { panel.hidden = true; return; }
    panel.hidden = false;
    if (!state.apps.length) { target.innerHTML = empty("matchNoLineup"); return; }
    const byShirt = (a, b) =>
      (a.players?.shirt_number ?? 99) - (b.players?.shirt_number ?? 99)
      || String(a.players?.display_name || "").localeCompare(String(b.players?.display_name || ""));
    const starters = state.apps.filter((app) => app.role === "starter").sort(byShirt);
    const subs = state.apps.filter((app) => app.role !== "starter").sort(byShirt);
    const row = (app) => {
      const p = app.players || {};
      return `<a class="match-player" href="player.html?id=${encodeURIComponent(p.id || app.player_id)}">
        ${photoCell(p)}
        <span class="mp-name">${esc(p.display_name || app.player_id)}</span>
        <span class="mp-num">${p.shirt_number != null ? `#${p.shirt_number}` : ""}</span>
        <span class="mp-pos">${esc(app.position || p.primary_position || "")}</span>
      </a>`;
    };
    const block = (label, rows) => rows.length
      ? `<div class="match-group"><h4>${esc(label)} <small>${rows.length}</small></h4><div class="match-players">${rows.map(row).join("")}</div></div>`
      : "";
    target.innerHTML = block(t("matchStarters"), starters) + block(t("matchSubs"), subs);
  }

  function renderGoals() {
    const panel = $("goals-panel");
    const target = $("match-goals");
    if (state.mode !== "ok") { panel.hidden = true; return; }
    const goals = [...state.goals].sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999));
    if (!goals.length && !isFinal(state.match)) { panel.hidden = true; return; } // fixture: nothing to review yet
    panel.hidden = false;
    if (!goals.length) { target.innerHTML = empty("matchNoGoals"); return; }
    target.innerHTML = goals.map((goal) => `
      <div class="match-goal">
        <span class="mg-min">${goal.minute != null ? `${goal.minute}′` : ""}</span>
        <a class="mg-scorer" href="player.html?id=${encodeURIComponent(goal.scorer_id)}">${esc(playerName(goal.scorer_id))}</a>
        ${goal.assist_id ? `<span class="mg-assist">· ${esc(t("matchAssist"))} <a href="player.html?id=${encodeURIComponent(goal.assist_id)}">${esc(playerName(goal.assist_id))}</a></span>` : ""}
      </div>`).join("");
  }

  // Wave 30 — public pre-match forecast for upcoming fixtures: league position,
  // head-to-head, form, season rates and a Poisson probability card.
  function renderForecast() {
    const panel = $("forecast-panel");
    const target = $("match-forecast");
    const visible = state.mode === "ok" && !isFinal(state.match);
    panel.hidden = !visible;
    if (!visible) { target.innerHTML = ""; return; }
    if (!window.YCACForecast) { panel.hidden = true; return; }
    const f = YCACForecast.build({
      match: state.match,
      finals: state.allMatches.filter(isFinal),
      standingsRows: (window.YCACStandings && YCACStandings.rows) || [],
      goals: state.allGoals,
    });

    const letter = (outcome) => (outcome === "win" ? t("vizWin") : outcome === "draw" ? t("vizDraw") : t("vizLoss"));
    const recordLine = (record) => `${record.w}${t("vizWin")} ${record.d}${t("vizDraw")} ${record.l}${t("vizLoss")} · ${record.gf}–${record.ga}`;
    const blocks = [];

    if (f.probs) {
      const pct = (value) => `${Math.round(value * 100)}%`;
      const edgeLabel = f.edge === "us" ? t("matchForecastEdgeUs")
        : f.edge === "them" ? t("matchForecastEdgeThem", { opponent: state.match.opponent })
        : t("matchForecastEven");
      const seg = (cls, value) => `<i class="fc-seg fc-seg-${cls}" style="width:${(value * 100).toFixed(1)}%"></i>`;
      blocks.push(`<div class="fc-verdict">
        <span class="fc-edge fc-edge-${f.edge}">${esc(edgeLabel)}</span>
        <span class="fc-metric"><span>${esc(t("matchForecastXg"))}</span><strong>${f.lambdas.us.toFixed(1)} – ${f.lambdas.them.toFixed(1)}</strong></span>
        <span class="fc-metric"><span>${esc(t("matchForecastProjected"))}</span><strong>${f.probs.projected.us}–${f.probs.projected.them}</strong></span>
      </div>
      <div class="fc-bar" aria-hidden="true">${seg("us", f.probs.win)}${seg("draw", f.probs.draw)}${seg("them", f.probs.loss)}</div>
      <div class="fc-legend">
        <span><i class="lg-us"></i>${esc(t("matchForecastWin"))} <strong>${pct(f.probs.win)}</strong></span>
        <span><i class="lg-draw"></i>${esc(t("matchForecastDraw"))} <strong>${pct(f.probs.draw)}</strong></span>
        <span><i class="lg-them"></i>${esc(t("matchForecastLoss"))} <strong>${pct(f.probs.loss)}</strong></span>
      </div>`);
    } else {
      blocks.push(`<p class="fc-note">${esc(t("matchForecastNoData"))}</p>`);
    }

    if (f.table) {
      const us = f.table.us, them = f.table.them;
      const gd = (row) => Number(row.gf) - Number(row.ga);
      const better = (a, b, lowerWins) => (a === b ? null : (a < b) === Boolean(lowerWins) ? "us" : "them");
      const rows = [
        [String(us.pos), String(them.pos), t("position"), better(us.pos, them.pos, true)],
        [`${us.row.w}–${us.row.d}–${us.row.l}`, `${them.row.w}–${them.row.d}–${them.row.l}`, t("record"), null],
        [us.row.pts, them.row.pts, t("matchForecastPoints"), better(Number(us.row.pts), Number(them.row.pts))],
        [us.row.gf, them.row.gf, t("goalsFor"), better(Number(us.row.gf), Number(them.row.gf))],
        [us.row.ga, them.row.ga, t("goalsAgainst"), better(Number(us.row.ga), Number(them.row.ga), true)],
        [gd(us.row), gd(them.row), t("goalDiff"), better(gd(us.row), gd(them.row))],
      ];
      blocks.push(`<div class="match-group"><h4>${esc(t("matchForecastTable"))} <small>${esc((window.YCACStandings && YCACStandings.competition) || "")}</small></h4>
        <table class="fc-compare">
          <thead><tr><th>YC&amp;AC</th><th aria-hidden="true"></th><th>${esc(state.match.opponent)}</th></tr></thead>
          <tbody>${rows.map(([ours, theirs, label, side]) => `<tr><td class="${side === "us" ? "fc-better" : ""}">${ours}</td><th scope="row">${esc(label)}</th><td class="${side === "them" ? "fc-better" : ""}">${theirs}</td></tr>`).join("")}</tbody>
        </table></div>`);
    }

    if (f.h2h.rows.length) {
      blocks.push(`<div class="match-group"><h4>${esc(t("matchForecastHead"))} <small>${esc(t("matchForecastMeetings", { n: f.h2h.record.played }))} · ${esc(recordLine(f.h2h.record))}</small></h4>
        <div class="fc-meetings">${f.h2h.rows.map((row) => {
          const outcome = YCACForecast.outcomeOf(row);
          return `<div class="fc-meeting"><span class="fc-date">${esc(formatDate(row.date))}</span><span class="fc-score">${row.ycac_goals}–${row.opponent_goals}</span><i class="form-pill ${outcome}">${esc(letter(outcome))}</i></div>`;
        }).join("")}</div></div>`);
    } else {
      blocks.push(`<div class="match-group"><h4>${esc(t("matchForecastHead"))}</h4><p class="empty">${esc(t("matchForecastFirstMeeting"))}</p></div>`);
    }

    if (f.form.length) {
      blocks.push(`<div class="match-group"><h4>${esc(t("matchForecastForm"))} <small>${esc(recordLine(f.stats))}</small></h4>
        <div class="fc-form form-pills">${f.form.map((row) => `<i class="form-pill ${row.outcome}" title="${esc(`${row.gf}–${row.ga} ${t("versus")} ${row.opponent} · ${formatDate(row.date)}`)}">${esc(letter(row.outcome))}</i>`).join("")}</div></div>`);
    }

    const s = f.stats;
    const cells = [
      [`${s.w}–${s.d}–${s.l}`, t("record")],
      [s.gfPerGame.toFixed(1), t("kpiGoalsPerGame")],
      [s.gaPerGame.toFixed(1), t("kpiConcededPerGame")],
      [s.cleanSheets, t("cleanSheets")],
      [s.winPct == null ? "–" : `${s.winPct}%`, t("kpiWinRate")],
    ];
    blocks.push(`<div class="match-group"><h4>${esc(t("seasonStats"))} <small>${esc(state.match.competition)}</small></h4>
      <div class="fc-stats">${cells.map(([value, label]) => `<div class="fc-stat"><strong>${value}</strong><span>${esc(label)}</span></div>`).join("")}</div></div>`);

    const link = (playerId) => `<a href="player.html?id=${encodeURIComponent(playerId)}">${esc(playerName(playerId))}</a>`;
    const watch = [];
    if (f.topScorer) watch.push(`${link(f.topScorer.playerId)} <strong>${f.topScorer.count}</strong> ${esc(t("statGoals"))}`);
    if (f.h2hScorer && (!f.topScorer || f.h2hScorer.playerId !== f.topScorer.playerId)) {
      watch.push(`${esc(t("matchForecastVsThem", { opponent: state.match.opponent }))}: ${link(f.h2hScorer.playerId)} <strong>${f.h2hScorer.count}</strong>`);
    }
    if (watch.length) blocks.push(`<div class="match-group"><h4>${esc(t("matchForecastWatch"))}</h4><p class="fc-watch">${watch.join(" · ")}</p></div>`);

    if (f.table && window.YCACStandings && YCACStandings.updated) {
      blocks.push(`<p class="standings-updated">${esc(t("standingsAsOf", { date: formatDate(YCACStandings.updated) }))}</p>`);
    }

    target.innerHTML = blocks.join("");
  }

  function renderSignups() {
    const panel = $("signups-panel");
    const target = $("match-signups");
    panel.hidden = state.mode !== "ok" || !state.isCoach;
    if (panel.hidden) { target.innerHTML = ""; return; }
    if (!state.signups.length) { target.innerHTML = empty("matchNoSignups"); return; }
    const groups = SIGNUP_STATES
      .map((status) => ({ status, rows: state.signups.filter((signup) => signup.status === status) }))
      .filter((group) => group.rows.length);
    target.innerHTML = groups.map(({ status, rows }) => {
      const sorted = [...rows].sort((a, b) => String(a.players?.display_name || "").localeCompare(String(b.players?.display_name || "")));
      const chip = (signup) => {
        const p = signup.players || {};
        return `<a class="signup-chip" href="player.html?id=${encodeURIComponent(p.id || signup.player_id)}">
          ${photoCell(p)}<span>${esc(p.display_name || signup.player_id)}</span>
        </a>`;
      };
      return `<div class="signup-group sg-${status}">
        <h4>${esc(t(SIGNUP_KEYS[status]))} <small>${sorted.length}</small></h4>
        <div class="signup-chips">${sorted.map(chip).join("")}</div>
      </div>`;
    }).join("");
  }

  function renderNotes() {
    const panel = $("notes-panel");
    const target = $("match-notes");
    panel.hidden = state.mode !== "ok" || !state.isCoach;
    if (panel.hidden) { target.innerHTML = ""; return; }
    const note = state.notes[0];
    const blocks = note
      ? [["noteReflection", note.reflection], ["noteCoachingPoints", note.coaching_points], ["noteSquadReview", note.squad_review]]
        .filter(([, text]) => text)
      : [];
    if (!blocks.length) { target.innerHTML = empty("matchNoNotes"); return; }
    target.innerHTML = blocks.map(([key, text]) => `
      <div class="note-block"><span class="note-label">${esc(t(key))}</span><p>${esc(text).replace(/\n/g, "<br />")}</p></div>`).join("")
      + (note.updated_at
        ? `<p class="admin-note">${esc(t("adminUpdated"))} ${esc(formatDate(note.updated_at))}${note.updated_by ? ` · ${esc(note.updated_by)}` : ""}</p>`
        : "");
  }

  // ---- match squad (coach, upcoming fixtures only) --------------------------
  // The squad lives in saved_squads (coach-write RLS): one active group of
  // starters + subs per match, exactly like the standalone squad picker.

  const email = () => YCACAuth.session?.user?.email || null;
  const setSquadStatus = (key, vars) => { squad.status = { key, vars }; $("squad-status").textContent = t(key, vars); };

  function initSquad() {
    const FORMATIONS = ["433", "4231", "442", "352"];
    const active = state.savedSquad.filter((row) => row.active !== false && String(row.active).toLowerCase() !== "false");
    const latestId = active.map((row) => row.saved_squad_id).filter(Boolean).pop();
    const saved = active.filter((row) => row.saved_squad_id === latestId).sort((a, b) => Number(a.slot_order) - Number(b.slot_order));
    squad.formation = FORMATIONS.includes(saved[0]?.formation) ? saved[0].formation : "4231";
    squad.starters = saved.filter((row) => row.selection_type === "starter").map((row) => row.player_id);
    squad.subs = saved.filter((row) => row.selection_type === "sub").map((row) => row.player_id);
    squad.dirty = false;
    squad.status = null;
  }

  function squadPlayer(id) { return state.playersById.get(id) || { id, display_name: id }; }

  /* Signup-status badge for the squad picker. Add cards show every status so
     attending players (confirmed/waitlist) stand out; squad chips only flag
     declined/unavailable members — the ones worth removing. */
  function signupBadge(playerId, { onlyProblems = false } = {}) {
    if (!state.signups.length) return "";
    const status = String(state.signups.find((signup) => signup.player_id === playerId)?.status || "");
    if (onlyProblems && (status === "confirmed" || status === "waitlist" || !status)) return "";
    const key = SIGNUP_KEYS[status] || "adminNoResponse";
    return `<span class="sa-status ${status ? `ss-${status}` : "ss-none"}">${esc(t(key))}</span>`;
  }

  function squadChip(id) {
    const p = squadPlayer(id);
    return `<span class="squad-chip">
      ${photoCell(p)}
      <span class="sc-name">${esc(p.display_name)}</span>
      <span class="sc-num">${p.shirt_number != null ? `#${p.shirt_number}` : ""}</span>
      ${signupBadge(id, { onlyProblems: true })}
      <button class="sc-remove" type="button" data-squad-remove="${esc(id)}" aria-label="${esc(`${t("injuryRemove")} ${p.display_name}`)}">&times;</button>
    </span>`;
  }

  function addToSquad(playerId) {
    if (squad.starters.length >= MAX_STARTERS && squad.subs.length >= MAX_SUBS) { setSquadStatus("matchSquadFull"); return; }
    if (squad.starters.length < MAX_STARTERS) squad.starters.push(playerId);
    else squad.subs.push(playerId);
    squad.dirty = true;
    setSquadStatus("matchSquadAdded", { name: squadPlayer(playerId).display_name });
    renderSquad();
  }

  function removeFromSquad(playerId) {
    const before = squad.starters.length + squad.subs.length;
    squad.starters = squad.starters.filter((id) => id !== playerId);
    squad.subs = squad.subs.filter((id) => id !== playerId);
    if (squad.starters.length + squad.subs.length === before) return;
    squad.dirty = true;
    setSquadStatus("matchSquadRemoved", { name: squadPlayer(playerId).display_name });
    renderSquad();
  }

  async function saveMatchSquad() {
    if (!squad.starters.length) { setSquadStatus("pickerStatusNeedXI"); return; }
    const button = $("squad-save");
    squad.saving = true;
    button.disabled = true;
    setSquadStatus("matchSquadSaving");
    const savedSquadId = `sq-${Date.now().toString(36)}`;
    const row = (playerId, selectionType, order) => ({
      saved_squad_id: savedSquadId, match_id: state.match.id, formation: squad.formation,
      player_id: playerId, selection_type: selectionType, slot_order: order, saved_by: email(),
    });
    try {
      // saved_squads is coach-write-only (RLS): retire this fixture's previous save, then insert the new one.
      await YCACData.update("saved_squads", { active: false }, `match_id=eq.${state.match.id}&active=eq.true`);
      state.savedSquad = await YCACData.insert("saved_squads", [
        ...squad.starters.map((playerId, order) => row(playerId, "starter", order)),
        ...squad.subs.map((playerId, order) => row(playerId, "sub", order)),
      ]);
      squad.dirty = false;
      setSquadStatus("matchSquadSaved");
    } catch (error) {
      console.error(error);
      setSquadStatus("matchSquadSaveFail");
    } finally {
      squad.saving = false;
      button.disabled = !squad.dirty;
    }
  }

  function renderSquad() {
    const panel = $("squad-panel");
    const target = $("match-squad");
    const visible = state.mode === "ok" && state.isCoach && !isFinal(state.match);
    panel.hidden = !visible;
    if (!visible) return;
    $("squad-formation").value = squad.formation;
    $("squad-save").disabled = squad.saving || !squad.dirty;
    const picked = new Set([...squad.starters, ...squad.subs]);
    // Attending first: confirmed → waitlist → no response → declined → unavailable.
    const signupByPlayer = new Map(state.signups.map((signup) => [signup.player_id, String(signup.status || "")]));
    const SIGNUP_RANK = { confirmed: 0, waitlist: 1, declined: 3, unavailable: 4 };
    const rankOf = (player) => (signupByPlayer.has(player.id) ? SIGNUP_RANK[signupByPlayer.get(player.id)] ?? 2 : 2);
    const available = [...state.playersById.values()]
      .filter((player) => player.active !== false && !picked.has(player.id))
      .sort((a, b) => rankOf(a) - rankOf(b)
        || (window.YCACStats ? YCACStats.POSITION_ORDER[YCACStats.positionGroup(a.primary_position)] - YCACStats.POSITION_ORDER[YCACStats.positionGroup(b.primary_position)] : 0)
        || String(a.display_name).localeCompare(String(b.display_name)));
    const block = (labelKey, rows) => `<div class="match-group"><h4>${esc(t(labelKey))} <small>${rows.length}</small></h4>
      <div class="squad-chips">${rows.length ? rows.map(squadChip).join("") : `<p class="empty">${esc(t("matchSquadEmptySlot"))}</p>`}</div></div>`;
    const addCard = (player) => `<button class="squad-add" type="button" data-squad-add="${esc(player.id)}">
      ${photoCell(player)}<span class="sa-name">${esc(player.display_name)}</span>${signupBadge(player.id)}<span class="sa-pos">${esc(player.primary_position || "")}</span><span class="sa-plus" aria-hidden="true">+</span>
    </button>`;
    target.innerHTML = block("matchStarters", squad.starters)
      + block("matchSubs", squad.subs)
      + `<div class="match-group"><h4>${esc(t("matchSquadAvailable"))} <small>${available.length}</small></h4>
        <div class="squad-add-list">${available.map(addCard).join("") || `<p class="empty">${esc(t("matchSquadAllPicked"))}</p>`}</div></div>`;
    if (!squad.status) setSquadStatus(picked.size ? "pickerStatusSavedLoaded" : "matchSquadHint");
    else $("squad-status").textContent = t(squad.status.key, squad.status.vars);
  }

  function renderAll() {
    renderHero();
    document.querySelectorAll(".match-panel").forEach((panel) => { panel.hidden = state.mode !== "ok"; });
    if (state.mode !== "ok") { $("goals-panel").hidden = true; return; }
    renderForecast();
    renderSquad();
    renderLineup();
    renderGoals();
    renderSignups();
    renderNotes();
  }

  function showMissing() { state.mode = "missing"; state.match = null; renderAll(); }
  function showError() { state.mode = "error"; state.match = null; renderAll(); }

  // ---- squad picker events --------------------------------------------------

  $("squad-formation").addEventListener("change", (event) => {
    squad.formation = event.target.value;
    squad.dirty = true;
    renderSquad();
  });
  $("match-squad").addEventListener("click", (event) => {
    const add = event.target.closest && event.target.closest("[data-squad-add]");
    if (add) { addToSquad(add.dataset.squadAdd); return; }
    const remove = event.target.closest && event.target.closest("[data-squad-remove]");
    if (remove) removeFromSquad(remove.dataset.squadRemove);
  });
  $("squad-save").addEventListener("click", saveMatchSquad);

  // ---- boot -----------------------------------------------------------------

  (async () => {
    if (window.YCACI18n) YCACI18n.onChange(() => renderAll()); // re-render in the new language

    const id = new URLSearchParams(location.search).get("id") || "";
    if (!VALID_ID.test(id)) { showMissing(); return; }

    try {
      state.isCoach = Boolean(YCACAuth.session && await YCACAuth.isCoach());
      const [matches, apps, goals, signups, notes, players, savedSquad] = await Promise.all([
        YCACData.select("matches", "select=*"), // all fixtures: the forecast needs history + standings context
        YCACData.select("appearances", `select=*,players(id,display_name,shirt_number,photo_path,primary_position)&match_id=eq.${id}`),
        YCACData.select("goals", "select=*"), // all goals: form scorers + head-to-head scorers
        state.isCoach ? YCACData.select("signups", `select=*,players(id,display_name,shirt_number,photo_path)&match_id=eq.${id}`) : Promise.resolve([]),
        state.isCoach ? YCACData.select("match_notes", `select=*&match_id=eq.${id}`) : Promise.resolve([]),
        YCACData.select("players", "select=*"),
        state.isCoach ? YCACData.select("saved_squads", `select=*&match_id=eq.${id}&order=saved_at`) : Promise.resolve([]),
      ]);
      const match = matches.find((row) => row.id === id);
      if (!match) { showMissing(); return; }
      state.match = match;
      state.allMatches = matches;
      state.apps = apps;
      state.goals = goals.filter((row) => row.match_id === id);
      state.allGoals = goals;
      state.apps = apps;
      state.goals = goals;
      state.signups = signups;
      state.notes = notes;
      state.savedSquad = savedSquad;
      state.playersById = new Map(players.map((player) => [player.id, player]));
      state.mode = "ok";
      initSquad();
      renderAll();
    } catch (error) {
      console.error(error);
      showError();
    }
  })();
})();
