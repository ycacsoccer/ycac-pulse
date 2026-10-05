/* YC&AC Pulse — match & squad review (Phase 8, requirements 4 + 6).
   Team-login page behind requireTeam(): ?id=<match> shows the result hero,
   the lineup with photos (starters / substitutes), scorers & assists, that
   fixture's signups, and the coach's reflection / coaching points edited in
   admin.html (match_notes — team-readable, coach-writable via RLS). */
(() => {
  const t = (key, vars) => (window.YCACI18n ? YCACI18n.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);
  const VALID_ID = /^[a-z0-9_-]+$/i;
  const SIGNUP_STATES = ["confirmed", "waitlist", "declined", "unavailable"];
  const SIGNUP_KEYS = { confirmed: "signupConfirmed", waitlist: "signupWaitlist", declined: "signupDeclined", unavailable: "signupUnavailable" };

  const state = {
    mode: "loading", // loading | ok | missing | error
    match: null, apps: [], goals: [], signups: [], notes: [],
    playersById: new Map(),
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
    const target = $("match-lineup");
    if (state.mode !== "ok") { target.innerHTML = ""; return; }
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

  function renderSignups() {
    const target = $("match-signups");
    if (state.mode !== "ok") { target.innerHTML = ""; return; }
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
    const target = $("match-notes");
    if (state.mode !== "ok") { target.innerHTML = ""; return; }
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

  function renderAll() {
    renderHero();
    document.querySelectorAll(".match-panel").forEach((panel) => { panel.hidden = state.mode !== "ok"; });
    if (state.mode !== "ok") { $("goals-panel").hidden = true; return; }
    renderLineup();
    renderGoals();
    renderSignups();
    renderNotes();
  }

  function showMissing() { state.mode = "missing"; state.match = null; renderAll(); }
  function showError() { state.mode = "error"; state.match = null; renderAll(); }

  // ---- boot -----------------------------------------------------------------

  (async () => {
    const session = await YCACAuth.requireTeam(); // redirects to login.html?next=…
    if (!session) return;
    if (window.YCACI18n) YCACI18n.onChange(() => renderAll()); // re-render in the new language

    const id = new URLSearchParams(location.search).get("id") || "";
    if (!VALID_ID.test(id)) { showMissing(); return; }

    try {
      const [matches, apps, goals, signups, notes, players] = await Promise.all([
        YCACData.select("matches", `select=*&id=eq.${id}`),
        YCACData.select("appearances", `select=*,players(id,display_name,shirt_number,photo_path,primary_position)&match_id=eq.${id}`),
        YCACData.select("goals", `select=*&match_id=eq.${id}`),
        YCACData.select("signups", `select=*,players(id,display_name,shirt_number,photo_path)&match_id=eq.${id}`),
        YCACData.select("match_notes", `select=*&match_id=eq.${id}`),
        YCACData.select("players", "select=*"),
      ]);
      if (!matches.length) { showMissing(); return; }
      state.match = matches[0];
      state.apps = apps;
      state.goals = goals;
      state.signups = signups;
      state.notes = notes;
      state.playersById = new Map(players.map((player) => [player.id, player]));
      state.mode = "ok";
      renderAll();
    } catch (error) {
      console.error(error);
      showError();
    }
  })();
})();
