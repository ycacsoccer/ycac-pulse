/* YC&AC Pulse — public match page + private coach detail.
   Everyone can open ?id=<match> for fixture/result, lineup, scorers & assists
   and — for an upcoming fixture — the public match forecast.
   A signed-in coach additionally sees the full squad picker (pitch, bench,
   roster with signup badges — integrated from the retired squad-picker.html),
   editable signups, private reflection / coaching points, and saves the squad
   to saved_squads. Wave 26 removed the old player/team gate. */
(() => {
  const t = (key, vars) => (window.YCACI18n ? YCACI18n.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);
  const VALID_ID = /^[a-z0-9_-]+$/i;
  const SIGNUP_STATES = ["confirmed", "waitlist", "declined", "unavailable"];
  const SIGNUP_KEYS = { confirmed: "signupConfirmed", waitlist: "signupWaitlist", declined: "signupDeclined", unavailable: "signupUnavailable" };
  const MAX_SUBS = 9;
  const FORMATIONS = {
    433: [["AT", "AT", "AT"], ["MF", "MF", "MF"], ["DF", "DF", "DF", "DF"], ["GK"]],
    4231: [["AT"], ["MF", "MF", "MF"], ["MF", "MF"], ["DF", "DF", "DF", "DF"], ["GK"]],
    442: [["AT", "AT"], ["MF", "MF", "MF", "MF"], ["DF", "DF", "DF", "DF"], ["GK"]],
    352: [["AT", "AT"], ["MF", "MF", "MF", "MF", "MF"], ["DF", "DF", "DF"], ["GK"]],
  };
  const FORMATION_NAMES = { 433: "4-3-3", 4231: "4-2-3-1", 442: "4-4-2", 352: "3-5-2" };

  const state = {
    mode: "loading", // loading | ok | missing | error
    match: null, allMatches: [], apps: [], allAppearances: [], goals: [], allGoals: [], signups: [], notes: [], savedSquad: [], isCoach: false,
    playersById: new Map(), seasonIndex: new Map(),
  };

  // Coach-only draft of the match squad for an upcoming fixture: formation
  // pitch slots + a 9-slot bench + search/roster with signup badges.
  const squad = {
    formation: "4231", slots: [], subs: Array(MAX_SUBS).fill(null),
    active: null, search: "", availability: "", dirty: false, saving: false, status: null,
  };

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

  /* Signups (coach): every status is editable on an upcoming fixture — add a
     player as confirmed (or any status), move a player between statuses, or
     remove a signup entirely. The squad picker's roster badges read the same
     state.signups, so both panels stay aligned. Played matches stay read-only. */
  function renderSignups() {
    const panel = $("signups-panel");
    const target = $("match-signups");
    panel.hidden = state.mode !== "ok" || !state.isCoach;
    if (panel.hidden) { target.innerHTML = ""; return; }
    const editable = !isFinal(state.match);
    if (!state.signups.length && !editable) { target.innerHTML = empty("matchNoSignups"); return; }
    const options = (selected) => SIGNUP_STATES
      .map((status) => `<option value="${status}" ${status === selected ? "selected" : ""}>${esc(t(SIGNUP_KEYS[status]))}</option>`)
      .join("");
    const chosen = new Set(state.signups.map((signup) => signup.player_id));
    const addable = [...state.playersById.values()]
      .filter((player) => player.active !== false && !chosen.has(player.id))
      .sort((a, b) => String(a.display_name).localeCompare(String(b.display_name)));
    const addRow = editable ? `
      <form class="signup-add" id="signup-add">
        <select id="signup-player" data-i18n-aria="signupAddPlayer">
          <option value="">${esc(t("signupAddPlayer"))}</option>
          ${addable.map((player) => `<option value="${esc(player.id)}">${esc(player.display_name)}</option>`).join("")}
        </select>
        <select id="signup-status" aria-label="${esc(t("signupStatus"))}">${options("confirmed")}</select>
        <button class="primary-button small" type="submit" ${addable.length ? "" : "disabled"} data-i18n="signupAdd">Add signup</button>
      </form>
      <p id="signup-notice" class="signup-notice" aria-live="polite"></p>` : "";
    const chip = (signup) => {
      const p = signup.players || {};
      const controls = editable ? `
        <select class="sc-status" data-signup-status="${esc(signup.player_id)}" aria-label="${esc(t("signupStatus"))}">${options(signup.status)}</select>
        <button class="sc-drop" type="button" data-signup-drop="${esc(signup.player_id)}" aria-label="${esc(`${t("injuryRemove")} ${p.display_name || signup.player_id}`)}">&times;</button>` : "";
      return `<span class="signup-chip">
        ${photoCell(p)}<span>${esc(p.display_name || signup.player_id)}</span>
        ${controls}
      </span>`;
    };
    const groups = SIGNUP_STATES
      .map((status) => ({ status, rows: state.signups.filter((signup) => signup.status === status) }))
      .filter((group) => group.rows.length);
    const body = groups.length
      ? groups.map(({ status, rows }) => {
        const sorted = [...rows].sort((a, b) => String(a.players?.display_name || "").localeCompare(String(b.players?.display_name || "")));
        return `<div class="signup-group sg-${status}">
            <h4>${esc(t(SIGNUP_KEYS[status]))} <small>${sorted.length}</small></h4>
            <div class="signup-chips">${sorted.map(chip).join("")}</div>
          </div>`;
      }).join("")
      : empty("matchNoSignups");
    target.innerHTML = addRow + body;
  }

  const signupNotice = (text) => { const el = $("signup-notice"); if (el) el.textContent = text; };

  /* Write the change first, then re-render both panels — the picker roster
     badges come from the same state.signups so they follow automatically. */
  async function setSignupStatus(playerId, status) {
    const name = squadPlayer(playerId).display_name;
    try {
      await YCACData.update("signups", { status, responded_at: new Date().toISOString() }, `match_id=eq.${state.match.id}&player_id=eq.${playerId}`);
      const signup = state.signups.find((row) => row.player_id === playerId);
      if (signup) signup.status = status;
      renderSignups();
      renderSquad();
      signupNotice(t("signupUpdated", { name, status: t(SIGNUP_KEYS[status]) }));
    } catch (error) {
      console.error(error);
      renderSignups();
      signupNotice(t("signupSaveFail"));
    }
  }

  async function removeSignup(playerId) {
    const name = squadPlayer(playerId).display_name;
    try {
      await YCACData.remove("signups", `match_id=eq.${state.match.id}&player_id=eq.${playerId}`);
      state.signups = state.signups.filter((row) => row.player_id !== playerId);
      renderSignups();
      renderSquad();
      signupNotice(t("signupRemoved", { name }));
    } catch (error) {
      console.error(error);
      renderSignups();
      signupNotice(t("signupSaveFail"));
    }
  }

  async function addSignup() {
    const playerId = $("signup-player")?.value;
    const status = $("signup-status")?.value || "confirmed";
    if (!playerId) return;
    const name = squadPlayer(playerId).display_name;
    try {
      await YCACData.insert("signups", [{
        match_id: state.match.id, player_id: playerId, status,
        responded_at: new Date().toISOString(), entered_by: email(),
      }]);
      state.signups.push({
        match_id: state.match.id, player_id: playerId, status,
        players: state.playersById.get(playerId) || null, // same shape as the embedded GET
      });
      renderSignups();
      renderSquad();
      signupNotice(t("signupAdded", { name, status: t(SIGNUP_KEYS[status]) }));
    } catch (error) {
      console.error(error);
      renderSignups();
      signupNotice(t("signupSaveFail"));
    }
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
  // The full pitch-based squad picker integrated from the retired standalone
  // squad-picker.html: formation pitch + 9-slot bench + roster with signup
  // badges, core-weighted "Suggest squad", copy and image export. The squad
  // lives in saved_squads (coach-write RLS): one active group of starters +
  // subs per match, deactivate-then-insert on save.

  const email = () => YCACAuth.session?.user?.email || null;
  const setSquadStatus = (key, vars) => { squad.status = { key, vars }; $("squad-status").textContent = t(key, vars); };
  const squadPlayer = (id) => state.playersById.get(id) || { id, display_name: id };
  const activePlayers = () => [...state.playersById.values()].filter((player) => player.active !== false);

  const signupStatusOf = (playerId) => String(state.signups.find((signup) => signup.player_id === playerId)?.status || "");
  /* Signup-status badge on roster cards: every status shows so attending
     players stand out and declined/unavailable are flagged at a glance. */
  function signupBadge(playerId) {
    const status = signupStatusOf(playerId);
    const key = SIGNUP_KEYS[status] || "adminNoResponse";
    return `<span class="sa-status ${status ? `ss-${status}` : "ss-none"}">${esc(t(key))}</span>`;
  }

  // Attending first: confirmed → waitlist → no response → declined → unavailable.
  const SIGNUP_RANK = { confirmed: 0, waitlist: 1, declined: 3, unavailable: 4 };
  const rankOf = (player) => { const status = signupStatusOf(player.id); return status ? SIGNUP_RANK[status] ?? 2 : 2; };
  const rosterSorted = () => activePlayers().sort((a, b) => rankOf(a) - rankOf(b)
    || YCACStats.POSITION_ORDER[YCACStats.positionGroup(a.primary_position)] - YCACStats.POSITION_ORDER[YCACStats.positionGroup(b.primary_position)]
    || String(a.display_name).localeCompare(String(b.display_name)));

  // Core-weighted suggest: the same tier engine the coach dashboard uses.
  const TIER_RANK = { core: 0, rotation: 1, depth: 2, inactive: 3 };
  const tierRank = (player) => TIER_RANK[state.seasonIndex.get(player.id)?.tier] ?? 3;
  function historicalScore(player, role) {
    const completedIds = new Set(state.allMatches.filter(isFinal).map((match) => match.id));
    const appearances = state.allAppearances.filter((appearance) => appearance.player_id === player.id && completedIds.has(appearance.match_id));
    const goals = state.allGoals.filter((goal) => goal.scorer_id === player.id && completedIds.has(goal.match_id)).length;
    const appearanceScore = appearances.reduce((score, appearance) => {
      const sameRole = YCACStats.positionGroup(appearance.position || player.primary_position) === role;
      if (appearance.role === "starter") return score + (sameRole ? 8 : 3);
      return score + (sameRole ? 3 : 1);
    }, 0);
    const attackingBonus = role === "AT" ? goals * 10 : role === "MF" ? goals * 4 : goals;
    return appearanceScore + attackingBonus;
  }

  function resetFormation() {
    squad.slots = FORMATIONS[squad.formation].flat().map((role, index) => ({ id: index, role, playerId: null }));
    squad.subs = Array(MAX_SUBS).fill(null);
    squad.active = null;
    renderSquad();
  }

  function assignToStarter(playerId, role) {
    const target = squad.slots.find((slot) => !slot.playerId && slot.role === role) || squad.slots.find((slot) => !slot.playerId);
    if (target) target.playerId = playerId;
    return Boolean(target);
  }

  function initSquad() {
    const active = state.savedSquad.filter((row) => row.active !== false && String(row.active).toLowerCase() !== "false");
    const latestId = active.map((row) => row.saved_squad_id).filter(Boolean).pop();
    const saved = active.filter((row) => row.saved_squad_id === latestId).sort((a, b) => Number(a.slot_order) - Number(b.slot_order));
    squad.formation = FORMATIONS[saved[0]?.formation] ? saved[0].formation : "4231";
    squad.slots = FORMATIONS[squad.formation].flat().map((role, index) => ({ id: index, role, playerId: null }));
    squad.subs = Array(MAX_SUBS).fill(null);
    saved.filter((row) => row.selection_type === "starter")
      .forEach((row) => assignToStarter(row.player_id, YCACStats.positionGroup(squadPlayer(row.player_id).primary_position)));
    const savedSubs = saved.filter((row) => row.selection_type === "sub").slice(0, MAX_SUBS);
    squad.subs = Array.from({ length: MAX_SUBS }, (_, index) => savedSubs[index]?.player_id || null);
    squad.active = null;
    squad.dirty = false;
    squad.status = null;
  }

  const pickedIds = () => new Set([...squad.slots.map((slot) => slot.playerId), ...squad.subs].filter(Boolean));

  /* The bench is the strongest of the players not in the XI: attending first,
     then core tier, then historical output for their position. */
  function refreshBench() {
    const startingIds = new Set(squad.slots.map((slot) => slot.playerId).filter(Boolean));
    squad.subs = rosterSorted()
      .filter((player) => !startingIds.has(player.id))
      .sort((a, b) => tierRank(a) - tierRank(b)
        || historicalScore(b, YCACStats.positionGroup(b.primary_position)) - historicalScore(a, YCACStats.positionGroup(a.primary_position)))
      .slice(0, MAX_SUBS)
      .map((player) => player.id);
    while (squad.subs.length < MAX_SUBS) squad.subs.push(null);
  }

  function suggestSquad() {
    resetFormation();
    const roster = rosterSorted();
    squad.slots.forEach((slot) => {
      const candidate = roster
        .filter((player) => !squad.slots.some((item) => item.playerId === player.id) && YCACStats.positionGroup(player.primary_position) === slot.role)
        .sort((a, b) => tierRank(a) - tierRank(b) || historicalScore(b, slot.role) - historicalScore(a, slot.role))[0];
      if (candidate) slot.playerId = candidate.id;
    });
    refreshBench();
    squad.dirty = true;
    setSquadStatus("pickerStatusSuggested");
    renderSquad();
  }

  function assignPlayer(playerId) {
    squad.slots.forEach((slot) => { if (slot.playerId === playerId) slot.playerId = null; });
    squad.subs = squad.subs.map((id) => (id === playerId ? null : id));
    const player = squadPlayer(playerId);
    if (squad.active?.area === "start") squad.slots[squad.active.index].playerId = playerId;
    else if (squad.active?.area === "bench") squad.subs[squad.active.index] = playerId;
    else if (!assignToStarter(playerId, YCACStats.positionGroup(player.primary_position))) {
      const index = squad.subs.findIndex((id) => !id);
      if (index >= 0) squad.subs[index] = playerId;
      else { setSquadStatus("matchSquadFull"); renderSquad(); return; }
    }
    squad.active = null;
    squad.dirty = true;
    setSquadStatus("matchSquadAdded", { name: player.display_name });
    renderSquad();
  }

  /* Clicking an assigned slot frees it — and leaves the slot active so the
     next roster click fills that exact position. */
  function clearSlot(index) {
    const slot = squad.slots[index];
    if (!slot?.playerId) return;
    const name = squadPlayer(slot.playerId).display_name;
    slot.playerId = null;
    squad.active = { area: "start", index };
    squad.dirty = true;
    setSquadStatus("matchSquadRemoved", { name });
    renderSquad();
  }

  function clearBenchSlot(index) {
    if (!squad.subs[index]) return;
    const name = squadPlayer(squad.subs[index]).display_name;
    squad.subs[index] = null;
    squad.active = { area: "bench", index };
    squad.dirty = true;
    setSquadStatus("matchSquadRemoved", { name });
    renderSquad();
  }

  function renderPitch() {
    const rows = [];
    const formation = FORMATIONS[squad.formation];
    let cursor = 0;
    for (const row of formation) {
      const rowSlots = squad.slots.slice(cursor, cursor + row.length);
      cursor += row.length;
      rows.push(`<div class="pk-row">${rowSlots.map((slot) => {
        const player = slot.playerId ? squadPlayer(slot.playerId) : null;
        const activeClass = squad.active?.area === "start" && squad.active.index === slot.id ? " active" : "";
        return `<button class="pk-slot ${player ? "assigned" : ""}${activeClass}" type="button" data-slot="${slot.id}">
          ${player ? `<span class="pk-num">${player.shirt_number || ""}</span><span class="pk-name">${esc(player.display_name)}</span>` : `<span class="pk-role">${slot.role}</span>`}
        </button>`;
      }).join("")}</div>`);
    }
    const pitch = $("squad-pitch");
    pitch.style.gridTemplateRows = `repeat(${formation.length}, 1fr)`;
    pitch.innerHTML = rows.join("");
  }

  function renderBench() {
    $("squad-bench").innerHTML = Array.from({ length: MAX_SUBS }, (_, index) => {
      const player = squad.subs[index] ? squadPlayer(squad.subs[index]) : null;
      const activeClass = squad.active?.area === "bench" && squad.active.index === index ? " active" : "";
      return `<button class="pk-bench-slot ${player ? "assigned" : ""}${activeClass}" type="button" data-bench-slot="${index}">
        <span class="pk-bench-index">${index + 1}</span><span class="pk-bench-name">${player ? esc(player.display_name) : esc(t("pickerOpen"))}</span>
      </button>`;
    }).join("");
    $("squad-bench-count").textContent = squad.subs.filter(Boolean).length;
  }

  function renderRoster() {
    const starting = new Set(squad.slots.map((slot) => slot.playerId).filter(Boolean));
    const bench = new Set(squad.subs.filter(Boolean));
    /* Search + availability are roster view filters only — Suggest and the
       bench still weigh every active player, and picked XI/bench members stay
       visible under any filter so the coach keeps the full picture. */
    const matchesAvailability = (player) => {
      if (!squad.availability) return true;
      const status = signupStatusOf(player.id);
      return squad.availability === "none" ? !status : status === squad.availability;
    };
    const visible = rosterSorted()
      .filter((player) => String(player.display_name).toLocaleLowerCase().includes(squad.search))
      .filter(matchesAvailability);
    const html = ["GK", "DF", "MF", "AT", "Other"].map((group) => {
      const members = visible.filter((player) => YCACStats.positionGroup(player.primary_position) === group);
      if (!members.length) return "";
      return `<section class="pk-group"><h4>${group} <small>${members.length}</small></h4>
        <div class="pk-list">${members.map((player) => {
          const pickedState = starting.has(player.id) ? "xi" : bench.has(player.id) ? "sub" : "";
          const label = starting.has(player.id) ? "XI" : bench.has(player.id) ? t("pickerSubsOutput") : player.primary_position || group;
          return `<button class="pk-card ${pickedState}" type="button" data-squad-add="${esc(player.id)}">
            ${photoCell(player)}
            <span class="pk-card-num">${player.shirt_number || "–"}</span>
            <span class="pk-card-name">${esc(player.display_name)}</span>
            ${signupBadge(player.id)}
            <span class="pk-card-pos">${esc(label)}</span>
          </button>`;
        }).join("")}</div></section>`;
    }).join("");
    const emptyState = activePlayers().length ? t("playersNoMatch") : t("pickerStatusNoEligible");
    $("squad-roster").innerHTML = html || `<p class="empty">${esc(emptyState)}</p>`;
  }

  function renderSheet() {
    const starting = squad.slots.filter((slot) => slot.playerId).map((slot) => squadPlayer(slot.playerId).display_name);
    const bench = squad.subs.filter(Boolean).map((id) => squadPlayer(id).display_name);
    $("squad-sheet").textContent = starting.length
      ? `${FORMATION_NAMES[squad.formation]} ${t("pickerStartingOutput")}: ${starting.join(" · ")}${bench.length ? ` | ${t("pickerSubsOutput")}: ${bench.join(" · ")}` : ""}`
      : t("pickerOutput");
  }

  async function saveMatchSquad() {
    const starters = squad.slots.map((slot) => slot.playerId).filter(Boolean);
    const subs = squad.subs.filter(Boolean);
    if (!starters.length) { setSquadStatus("pickerStatusNeedXI"); return; }
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
        ...starters.map((playerId, order) => row(playerId, "starter", order)),
        ...subs.map((playerId, order) => row(playerId, "sub", order)),
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

  async function copyLineup() {
    if (!pickedIds().size) return;
    try {
      await navigator.clipboard.writeText(`YC&AC Pulse Matchday Squad\n${$("squad-sheet").textContent}`);
      setSquadStatus("pickerCopied");
    } catch { setSquadStatus("pickerCopyUnavailable"); }
  }

  // ---- squad image export (ported from the standalone picker) ---------------

  function escapeSVG(value) { return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]); }

  function showSquadImagePreview(blob, filename) {
    const url = URL.createObjectURL(blob);
    const existing = document.querySelector("#squad-image-preview");
    if (existing) existing.remove();
    const overlay = document.createElement("div"), panel = document.createElement("div"), image = document.createElement("img"), download = document.createElement("a"), close = document.createElement("button");
    overlay.id = "squad-image-preview";
    Object.assign(overlay.style, { position: "fixed", inset: "0", zIndex: "1000", display: "grid", placeItems: "center", padding: "20px", background: "rgba(0,0,0,.72)" });
    Object.assign(panel.style, { maxWidth: "560px", maxHeight: "92vh", overflow: "auto", padding: "16px", background: "#fff", textAlign: "center" });
    image.src = url;
    image.alt = "Matchday squad";
    image.style.cssText = "display:block;width:100%;height:auto";
    download.href = url;
    download.download = filename;
    download.textContent = t("pickerDownloadImage");
    download.style.cssText = "display:inline-block;margin:16px 8px 0;padding:12px 16px;background:#112950;color:#fff;text-decoration:none;font:700 14px Arial";
    close.type = "button";
    close.textContent = t("pickerClose");
    close.style.cssText = "margin:16px 8px 0;padding:12px 16px;border:0;font:700 14px Arial";
    close.addEventListener("click", () => { URL.revokeObjectURL(url); overlay.remove(); });
    panel.append(image, download, close);
    overlay.append(panel);
    document.body.append(overlay);
  }

  async function saveSquadImage() {
    if (!pickedIds().size) { setSquadStatus("pickerNeedPlayers"); return; }
    const match = state.match;
    const filename = `ycac-pulse-${match.date}-squad.png`;
    const svgBlob = new Blob([squadImageSVG()], { type: "image/svg+xml" });
    let output = svgBlob, outputName = filename.replace(".png", ".svg");
    try {
      const imageUrl = URL.createObjectURL(svgBlob), image = new Image();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = imageUrl; });
      const canvas = document.createElement("canvas"), context = canvas.getContext("2d");
      canvas.width = 1200;
      canvas.height = 1600;
      context.drawImage(image, 0, 0);
      output = await new Promise((resolve) => canvas.toBlob(resolve, "image/png")) || svgBlob;
      outputName = output.type === "image/png" ? filename : outputName;
      URL.revokeObjectURL(imageUrl);
    } catch (error) { console.warn(t("pickerPngFailed"), error); }
    if (window.File) {
      const file = new File([output], outputName, { type: output.type });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: "YC&AC Pulse squad" }); setSquadStatus("pickerShareOpened"); return; } catch (error) { if (error.name !== "AbortError") console.warn(t("pickerShareFailed"), error); }
      }
    }
    showSquadImagePreview(output, outputName);
    setSquadStatus("pickerImageCreated");
  }

  function squadImageSVG() {
    const match = state.match || {}, formation = FORMATIONS[squad.formation] || FORMATIONS[4231], formationName = FORMATION_NAMES[squad.formation], pitch = { x: 68, y: 315, width: 1064, height: 860 };
    let cursor = 0;
    const detail = (label, value, x) => `<text x="${x}" y="61" class="event-label">${label}</text><text x="${x + 54}" y="61" class="event-value">${escapeSVG(value || "TBC")}</text>`;
    const playerCircle = (x, y, role, player) => `<g transform="translate(${x} ${y})"><circle r="55" fill="${player ? "#f4ecdc" : "rgba(8,26,53,.58)"}" stroke="#c5a059" stroke-width="3"/><text y="-7" class="shirt-number">${escapeSVG(player?.shirt_number || role)}</text><text y="24" class="player-name">${escapeSVG(player?.display_name || "Open")}</text></g>`;
    const starters = formation.map((row, rowIndex) => row.map((role, playerIndex) => {
      const slot = squad.slots[cursor++] || {}, player = slot.playerId ? squadPlayer(slot.playerId) : null;
      const x = pitch.x + pitch.width * (playerIndex + 1) / (row.length + 1);
      const y = pitch.y + 115 + (pitch.height - 210) * rowIndex / Math.max(formation.length - 1, 1);
      return playerCircle(x, y, role, player);
    }).join("")).join("");
    const bench = Array.from({ length: MAX_SUBS }, (_, index) => {
      const player = squad.subs[index] ? squadPlayer(squad.subs[index]) : null;
      const x = 68 + (index % 3) * 356, y = 1275 + Math.floor(index / 3) * 82, assigned = Boolean(player);
      return `<rect x="${x}" y="${y}" width="340" height="64" fill="#fff" stroke="${assigned ? "#112950" : "#b8c5d3"}" stroke-width="${assigned ? 2 : 1}" stroke-dasharray="${assigned ? "0" : "5 4"}"/><text x="${x + 18}" y="${y + 41}" class="bench-index">${index + 1}</text><text x="${x + 55}" y="${y + 41}" class="bench-name">${escapeSVG(player?.display_name || t("pickerOpen"))}</text>`;
    }).join("");
    const stripes = Array.from({ length: 8 }, (_, index) => `<rect x="${pitch.x + index * pitch.width / 8}" y="${pitch.y}" width="${pitch.width / 8}" height="${pitch.height}" fill="${index % 2 ? "#3b865a" : "#367c54"}"/>`).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1560" viewBox="0 0 1200 1560"><style>.event-label{font:700 14px Arial,sans-serif;fill:#c5a059;letter-spacing:1.5px}.event-value{font:700 16px Arial,sans-serif;fill:#f4ecdc}.eyebrow{font:700 16px Arial,sans-serif;fill:#c5a059;letter-spacing:3px}.formation{font:400 42px Georgia,serif;fill:#112950}.bench-copy{font:700 15px Arial,sans-serif;fill:#66758b}.shirt-number{font:400 21px Georgia,serif;fill:#07469a;text-anchor:middle}.player-name{font:700 15px Arial,sans-serif;fill:#112950;text-anchor:middle}.watermark{font:700 32px Georgia,serif;fill:#fff;text-anchor:middle;opacity:.25}.watermark-small{font:700 13px Arial,sans-serif;fill:#fff;text-anchor:middle;opacity:.25}.bench-index{font:400 28px Georgia,serif;fill:#c5a059}.bench-name{font:700 16px Arial,sans-serif;fill:#112950}</style><rect width="1200" height="1560" fill="#f4f6f8"/><rect x="10" y="20" width="1180" height="78" fill="#112950"/>${detail("DATE", match.date, 38)}${detail("OPPONENT", match.opponent, 220)}${detail("COMPETITION", match.competition, 475)}${detail("VENUE", match.venue, 730)}${detail("KICKOFF", match.kickoff, 930)}<rect x="10" y="128" width="1180" height="1415" fill="#fff" stroke="#dbe1e7"/><text x="58" y="195" class="eyebrow">${t("pickerArtStarting")}</text><text x="58" y="250" class="formation">${formationName}</text><text x="1140" y="240" class="bench-copy" text-anchor="end">YC&amp;AC Pulse Matchday Squad</text><rect x="${pitch.x - 6}" y="${pitch.y - 6}" width="${pitch.width + 12}" height="${pitch.height + 12}" fill="#d8ead8"/>${stripes}<path d="M68 745H1132M600 315V1175M600 660a92 92 0 1 0 0 184a92 92 0 1 0 0-184M68 1095H1132M68 315L190 1175H1010L1132 315M190 1175V1100H1010V1175" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="2"/><g transform="translate(600 760)"><text y="-8" class="watermark">YC&amp;AC</text><text y="18" class="watermark-small">EST. 1868</text></g>${starters}<text x="68" y="1235" class="eyebrow">${t("pickerArtBench")}</text><text x="1132" y="1235" class="bench-copy" text-anchor="end">${squad.subs.filter(Boolean).length} / 9 substitutes</text>${bench}</svg>`;
  }

  function renderSquad() {
    const panel = $("squad-panel");
    const visible = state.mode === "ok" && state.isCoach && !isFinal(state.match);
    panel.hidden = !visible;
    if (!visible) return;
    $("squad-formation").value = squad.formation;
    $("squad-save").disabled = squad.saving || !squad.dirty;
    renderPitch();
    renderBench();
    renderRoster();
    renderSheet();
    if (!squad.status) setSquadStatus(pickedIds().size ? "pickerStatusSavedLoaded" : "matchSquadHint");
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
    resetFormation();
  });
  $("squad-panel").addEventListener("click", (event) => {
    const slot = event.target.closest && event.target.closest("[data-slot]");
    if (slot) {
      const index = Number(slot.dataset.slot);
      if (squad.slots[index].playerId) clearSlot(index);
      else { squad.active = { area: "start", index }; setSquadStatus("pickerStatusPickSlot", { role: squad.slots[index].role }); renderSquad(); }
      return;
    }
    const benchSlot = event.target.closest && event.target.closest("[data-bench-slot]");
    if (benchSlot) {
      const index = Number(benchSlot.dataset.benchSlot);
      if (squad.subs[index]) clearBenchSlot(index);
      else { squad.active = { area: "bench", index }; setSquadStatus("pickerStatusPickSlot", { role: "SUB" }); renderSquad(); }
      return;
    }
    const add = event.target.closest && event.target.closest("[data-squad-add]");
    if (add) assignPlayer(add.dataset.squadAdd);
  });
  $("squad-search").addEventListener("input", (event) => { squad.search = event.target.value.trim().toLocaleLowerCase(); renderRoster(); });
  $("squad-availability").addEventListener("change", (event) => { squad.availability = event.target.value; renderRoster(); });
  $("squad-suggest").addEventListener("click", suggestSquad);
  $("squad-refresh-bench").addEventListener("click", () => { refreshBench(); squad.dirty = true; setSquadStatus("pickerStatusBenchRefreshed"); renderSquad(); });
  $("squad-clear").addEventListener("click", () => { resetFormation(); squad.dirty = true; setSquadStatus("pickerStatusCleared"); });
  $("squad-copy").addEventListener("click", copyLineup);
  $("squad-save").addEventListener("click", saveMatchSquad);
  $("squad-image").addEventListener("click", saveSquadImage);

  // ---- signups events (coach, upcoming fixtures) ----------------------------

  $("match-signups").addEventListener("change", (event) => {
    const select = event.target.closest && event.target.closest("[data-signup-status]");
    if (select) setSignupStatus(select.dataset.signupStatus, select.value);
  });
  $("match-signups").addEventListener("click", (event) => {
    const drop = event.target.closest && event.target.closest("[data-signup-drop]");
    if (drop) removeSignup(drop.dataset.signupDrop);
  });
  $("match-signups").addEventListener("submit", (event) => {
    if (event.target.id === "signup-add") { event.preventDefault(); addSignup(); }
  });

  // ---- boot -----------------------------------------------------------------

  (async () => {
    if (window.YCACI18n) YCACI18n.onChange(() => renderAll()); // re-render in the new language

    const id = new URLSearchParams(location.search).get("id") || "";
    if (!VALID_ID.test(id)) { showMissing(); return; }

    try {
      state.isCoach = Boolean(YCACAuth.session && await YCACAuth.isCoach());
      const [matches, apps, goals, signups, notes, players, savedSquad] = await Promise.all([
        YCACData.select("matches", "select=*"), // all fixtures: the forecast needs history + standings context
        YCACData.select("appearances", "select=*,players(id,display_name,shirt_number,photo_path,primary_position)"), // all: lineup by match + Suggest weighs history
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
      state.apps = apps.filter((row) => row.match_id === id);
      state.allAppearances = apps;
      state.goals = goals.filter((row) => row.match_id === id);
      state.allGoals = goals;
      state.signups = signups;
      state.notes = notes;
      state.savedSquad = savedSquad;
      state.playersById = new Map(players.map((player) => [player.id, player]));
      if (state.isCoach && window.YCACStats) {
        // tiers for the core-weighted "Suggest squad" (same engine as the coach dashboard)
        state.seasonIndex = new Map(YCACStats.computeSeason({ players, matches, appearances: apps, goals })
          .players.map((entry) => [entry.id, entry]));
        initSquad();
      }
      state.mode = "ok";
      renderAll();
    } catch (error) {
      console.error(error);
      showError();
    }
  })();
})();
