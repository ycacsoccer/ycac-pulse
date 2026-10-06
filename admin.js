/* YC&AC Pulse — admin tool (Phase 7, requirements 2, 6, 7).
   Coach-login page (requireCoach redirects team/anon sessions). Sections:
   - Players : create / edit / delete, photo upload, activate & deactivate
   - Matches : fixtures & results — score, tap-a-squad lineup, goals & assists
   - Signups : coach-entered availability per fixture (entered_by = this account)
   - Notes   : match_notes reflection / coaching points / squad review (req 6)
   - Content : team_content guidelines / coach instructions / club info (req 7)
   - Backup  : one JSON file with every table (data-loss insurance)
   Every write is re-checked server-side by RLS is_coach() — this file only
   decides what the coach sees. */
(() => {
  const t = (key, vars) => (window.YCACI18n ? YCACI18n.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);
  const VALID_ID = /^[a-z0-9_-]+$/;
  const SIGNUP_STATES = ["confirmed", "waitlist", "declined", "unavailable"];
  const SIGNUP_KEYS = { confirmed: "signupConfirmed", waitlist: "signupWaitlist", declined: "signupDeclined", unavailable: "signupUnavailable" };
  const FOOT = ["left", "right", "both"];
  const FOOT_KEYS = { left: "footLeft", right: "footRight", both: "footBoth" };
  const CONTENT_SLUGS = [
    { slug: "guidelines", key: "contentGuidelines" },
    { slug: "coach-instructions", key: "contentCoachInstructions" },
    { slug: "club-info", key: "contentClubInfo" },
  ];
  const BACKUP_TABLES = ["players", "matches", "appearances", "goals", "signups", "saved_squads", "match_notes", "team_content", "coach_notes", "injuries"];

  const state = {
    tab: "players",
    players: [], matches: [], appearances: [], goals: [], signups: [], notes: [], content: [], injuries: [],
    query: "",
    editingPlayer: null, // { mode: "create"|"edit", row }
    editingMatch: null,  // { mode, row, lineup, goalsRows, originalLineup, originalGoals, search }
    signupMatchId: "", signupsDraft: {},
    noteMatchId: "",
  };

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const formatDate = (value) => (value && window.YCACI18n ? YCACI18n.formatDate(value) : value || "");
  const monogram = (name) => String(name || "?").split(/\s+/).map((word) => word[0]).slice(0, 2).join("").toUpperCase();
  const slugify = (value) => String(value).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const email = () => YCACAuth.session?.user?.email || null;
  const now = () => new Date().toISOString();
  const played = (match) => match.ycac_goals != null && match.opponent_goals != null;
  const compShort = (match) => /friendly/i.test(match.competition || "") ? "FND" : "TML";

  function setStatus(message, kind) {
    const el = $("admin-status");
    el.textContent = message;
    el.className = `admin-status ${kind || ""}`;
  }

  function photoSpan(row) {
    const initials = `<span class="monogram" aria-hidden="true">${esc(monogram(row.display_name))}</span>`;
    if (!row.photo_path) return `<span class="avatar">${initials}</span>`;
    return `<span class="avatar">${initials}<img src="${esc(YCACData.publicUrl(row.photo_path))}" alt="" loading="lazy" onerror="this.remove()" /></span>`;
  }

  async function load() {
    const [players, matches, appearances, goals, signups, notes, content, injuries] = await Promise.all([
      YCACData.select("players", "select=*&order=display_name"),
      YCACData.select("matches", "select=*&order=date.desc"),
      YCACData.select("appearances", "select=*"),
      YCACData.select("goals", "select=*"),
      YCACData.select("signups", "select=*"),
      YCACData.select("match_notes", "select=*"),
      YCACData.select("team_content", "select=*"),
      YCACData.select("injuries", "select=*&order=since_date"),
    ]);
    state.players = players;
    state.matches = matches;
    state.appearances = appearances;
    state.goals = goals;
    state.signups = signups;
    state.notes = notes;
    state.content = content;
    state.injuries = injuries;
    state.signupMatchId = defaultMatchId("signups");
    state.noteMatchId = defaultMatchId("notes");
    initSignupDraft();
  }

  function defaultMatchId(kind) {
    if (!state.matches.length) return "";
    const today = now().slice(0, 10);
    if (kind === "signups") {
      const upcoming = state.matches.filter((match) => match.date >= today).sort((a, b) => a.date.localeCompare(b.date));
      return (upcoming[0] || state.matches[0]).id;
    }
    return (state.matches.find(played) || state.matches[0]).id; // matches are date.desc → most recent result
  }

  /* Next free id for a new fixture: prefix by competition (m… / f…), max+1. */
  function suggestMatchId(competition) {
    const prefix = /tml/i.test(competition || "") ? "m" : "f";
    const numbers = state.matches.filter((match) => match.id.startsWith(prefix))
      .map((match) => Number(match.id.slice(prefix.length)) || 0);
    const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
    return `${prefix}${String(next).padStart(3, "0")}`;
  }

  // ---- navigation -----------------------------------------------------------

  function renderTab() {
    document.querySelectorAll(".admin-tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === state.tab));
    document.querySelectorAll(".admin-panel").forEach((panel) => { panel.hidden = panel.dataset.panel !== state.tab; });
    const renderers = {
      players: renderPlayers, matches: renderMatches, signups: renderSignups,
      notes: renderNotes, content: renderContent, injuries: renderInjuries, backup: () => {},
    };
    renderers[state.tab]();
  }

  function renderAll() { renderTab(); }

  // ---- players tab ----------------------------------------------------------

  const visiblePlayers = () => state.players.filter((player) => !state.query || String(player.display_name).toLowerCase().includes(state.query));

  function playerRow(player) {
    const positions = [player.primary_position, ...(player.secondary_positions || [])].filter(Boolean).join(" · ");
    const badge = player.active !== false
      ? `<span class="badge a-active">${esc(t("adminActive"))}</span>`
      : `<span class="badge a-inactive">${esc(t("tierInactive"))}</span>`;
    return `<div class="admin-row">
      ${photoSpan(player)}
      <div class="ar-id"><a href="player.html?id=${encodeURIComponent(player.id)}">${esc(player.display_name)}</a><small>#${player.shirt_number ?? "–"} · ${esc(positions || "–")}</small></div>
      ${badge}
      <div class="ar-actions">
        <button class="quiet-button small" type="button" data-action="edit-player" data-id="${esc(player.id)}">${esc(t("adminEdit"))}</button>
        <button class="quiet-button small" type="button" data-action="toggle-player" data-id="${esc(player.id)}">${esc(player.active !== false ? t("adminDeactivate") : t("adminActivate"))}</button>
        <button class="quiet-button small danger" type="button" data-action="delete-player" data-id="${esc(player.id)}">${esc(t("adminDelete"))}</button>
      </div>
    </div>`;
  }

  function renderPlayersList() {
    const rows = visiblePlayers();
    $("admin-players").innerHTML = rows.length
      ? rows.map(playerRow).join("")
      : `<p class="empty">${esc(t("playersNoMatch"))}</p>`;
  }

  function startPlayer(mode, id) {
    const source = id ? state.players.find((player) => player.id === id) : null;
    state.editingPlayer = {
      mode,
      row: source
        ? { ...source, secondary_positions: [...(source.secondary_positions || [])] }
        : { id: "", display_name: "", display_name_full: null, nickname: null, shirt_number: null, primary_position: null, secondary_positions: [], preferred_foot: null, photo_path: null, bio: null, active: true },
    };
    renderPlayers();
    if (mode === "create") $("player-f-id")?.focus();
  }

  function syncPlayerForm() {
    const d = state.editingPlayer;
    if (!d || $("player-form").hidden || !$("player-f-name")) return;
    const value = (id) => $(id).value;
    d.row = {
      ...d.row,
      id: d.mode === "create" ? value("player-f-id").trim().toLowerCase() : d.row.id,
      display_name: value("player-f-name").trim(),
      display_name_full: value("player-f-full").trim() || null,
      nickname: value("player-f-nick").trim() || null,
      shirt_number: value("player-f-number") === "" ? null : Number(value("player-f-number")),
      primary_position: value("player-f-pos1").trim().toUpperCase() || null,
      secondary_positions: value("player-f-pos2").split(",").map((item) => item.trim().toUpperCase()).filter(Boolean),
      preferred_foot: value("player-f-foot") || null,
      bio: value("player-f-bio").trim() || null,
      active: $("player-f-active").checked,
    };
  }

  function renderPlayerForm() {
    const d = state.editingPlayer;
    const form = $("player-form");
    if (!d) { form.hidden = true; form.innerHTML = ""; return; }
    syncPlayerForm(); // keep typed values across language switches
    form.hidden = false;
    const p = d.row;
    const preview = p.photo_path
      ? `<span class="avatar">${esc(monogram(p.display_name))}<img src="${esc(YCACData.publicUrl(p.photo_path))}" alt="" onerror="this.remove()" /></span>`
      : `<span class="avatar">${esc(monogram(p.display_name))}</span>`;
    form.innerHTML = `
      <div class="form-head"><h3>${esc(t(d.mode === "create" ? "adminNewPlayer" : "adminEditPlayer"))}</h3></div>
      <div class="fields">
        <label class="field"><span>ID</span>
          <input id="player-f-id" value="${esc(p.id)}" ${d.mode === "edit" ? "disabled" : ""} placeholder="e.g. bangjie" /></label>
        <label class="field"><span>${esc(t("name"))} *</span><input id="player-f-name" value="${esc(p.display_name)}" /></label>
        <label class="field"><span>${esc(t("adminFullName"))}</span><input id="player-f-full" value="${esc(p.display_name_full || "")}" /></label>
        <label class="field"><span>${esc(t("adminNickname"))}</span><input id="player-f-nick" value="${esc(p.nickname || "")}" /></label>
        <label class="field"><span>${esc(t("shirtNumber"))}</span><input id="player-f-number" type="number" min="0" max="99" value="${p.shirt_number ?? ""}" /></label>
        <label class="field"><span>${esc(t("position"))}</span><input id="player-f-pos1" value="${esc(p.primary_position || "")}" placeholder="ST" /></label>
        <label class="field"><span>${esc(t("adminSecondary"))}</span><input id="player-f-pos2" value="${esc((p.secondary_positions || []).join(", "))}" placeholder="ST, LW" /></label>
        <label class="field"><span>${esc(t("infoFoot"))}</span>
          <select id="player-f-foot">
            <option value=""></option>
            ${FOOT.map((foot) => `<option value="${foot}"${p.preferred_foot === foot ? " selected" : ""}>${esc(t(FOOT_KEYS[foot]))}</option>`).join("")}
          </select></label>
        <label class="field check"><input id="player-f-active" type="checkbox" ${p.active !== false ? "checked" : ""} /><span>${esc(t("adminActive"))}</span></label>
        <div class="field field-wide"><span>${esc(t("adminPhoto"))}</span>
          <div class="photo-line">
            <span id="player-photo-preview" class="admin-photo">${preview}</span>
            <input id="player-f-photo" type="file" accept="image/*" hidden />
            <button class="quiet-button small" type="button" data-action="upload-photo">${esc(t("uploadPhoto"))}</button>
            <button class="quiet-button small danger" type="button" data-action="remove-photo">${esc(t("adminRemovePhoto"))}</button>
            <span id="player-photo-status" class="admin-note" aria-live="polite"></span>
          </div>
        </div>
        <label class="field field-wide"><span>${esc(t("infoBio"))}</span><textarea id="player-f-bio" rows="3">${esc(p.bio || "")}</textarea></label>
      </div>
      <div class="form-actions">
        <button class="primary-button" type="button" data-action="save-player">${esc(t("adminSave"))}</button>
        <button class="quiet-button" type="button" data-action="cancel-player">${esc(t("adminCancel"))}</button>
        ${d.mode === "edit" ? `<button class="quiet-button danger" type="button" data-action="delete-player">${esc(t("adminDelete"))}</button>` : ""}
      </div>`;
  }

  function renderPlayers() {
    renderPlayersList();
    renderPlayerForm();
  }

  async function savePlayer() {
    const d = state.editingPlayer;
    syncPlayerForm();
    const row = d.row;
    const name = String(row.display_name || "").trim();
    if (!name) { setStatus(t("adminNameRequired"), "fail"); return; }
    if (d.mode === "create" && !row.id && name) row.id = slugify(name); // convenience, still validated below
    if (!VALID_ID.test(row.id || "")) { setStatus(t("adminIdInvalid"), "fail"); return; }
    if (d.mode === "create" && state.players.some((player) => player.id === row.id)) { setStatus(t("adminIdTaken"), "fail"); return; }
    const clean = { ...row, display_name: name };
    delete clean.created_at;
    try {
      if (d.mode === "create") {
        const saved = await YCACData.insert("players", [clean]);
        state.players.push(saved[0]);
      } else {
        const updated = await YCACData.update("players", clean, `id=eq.${clean.id}`);
        const index = state.players.findIndex((player) => player.id === clean.id);
        state.players[index] = updated?.[0] ?? { ...state.players[index], ...clean };
      }
      state.players.sort((a, b) => a.display_name.localeCompare(b.display_name));
      state.editingPlayer = null;
      setStatus(t("adminSaved"), "ok");
    } catch (error) {
      console.error(error);
      setStatus(t("adminSaveFail"), "fail");
    }
    renderPlayers();
  }

  async function togglePlayer(id) {
    const player = state.players.find((row) => row.id === id);
    if (!player) return;
    try {
      const updated = await YCACData.update("players", { active: player.active === false }, `id=eq.${id}`);
      Object.assign(player, updated?.[0] ?? { active: player.active === false });
      setStatus(t("adminSaved"), "ok");
    } catch (error) {
      console.error(error);
      setStatus(t("adminSaveFail"), "fail");
    }
    renderPlayers();
  }

  async function deletePlayer(id) {
    const player = state.players.find((row) => row.id === id);
    if (!player) return;
    if (!confirm(t("adminDeletePlayerConfirm", { name: player.display_name }))) return;
    try {
      await YCACData.remove("players", `id=eq.${id}`);
      state.players = state.players.filter((row) => row.id !== id);
      if (state.editingPlayer?.row.id === id) state.editingPlayer = null;
      setStatus(t("adminSaved"), "ok");
    } catch (error) {
      console.error(error);
      setStatus(error.status === 409 || error.status === 400 ? t("adminDeleteRestricted") : t("adminSaveFail"), "fail");
    }
    renderPlayers();
  }

  async function uploadPlayerPhoto(file) {
    const d = state.editingPlayer;
    if (!file || !d) return;
    syncPlayerForm(); // pick up an id typed after the form rendered
    const status = $("player-photo-status");
    if (!d.row.id || !VALID_ID.test(d.row.id)) { status.textContent = t("adminIdInvalid"); return; }
    if (!file.type.startsWith("image/")) { status.textContent = t("uploadFail"); return; }
    status.textContent = t("uploadUploading");
    try {
      const extension = (file.name.match(/\.(jpe?g|png|webp|gif)$/i)?.[1] || file.type.split("/")[1] || "img").toLowerCase();
      const path = `${d.row.id}-${Date.now()}.${extension}`;
      await YCACData.upload(path, file);
      await YCACData.update("players", { photo_path: path }, `id=eq.${d.row.id}`);
      d.row.photo_path = path;
      const stored = state.players.find((player) => player.id === d.row.id);
      if (stored) stored.photo_path = path;
      $("player-photo-preview").innerHTML = `<span class="avatar">${esc(monogram(d.row.display_name))}<img src="${esc(YCACData.publicUrl(path))}" alt="" onerror="this.remove()" /></span>`;
      status.textContent = t("uploadDone");
    } catch (error) {
      console.error(error);
      status.textContent = t("uploadFail");
    }
    renderPlayersList();
  }

  async function removePlayerPhoto() {
    const d = state.editingPlayer;
    if (!d || !d.row.photo_path) return;
    const status = $("player-photo-status");
    try {
      await YCACData.update("players", { photo_path: null }, `id=eq.${d.row.id}`);
      d.row.photo_path = null;
      const stored = state.players.find((player) => player.id === d.row.id);
      if (stored) stored.photo_path = null;
      $("player-photo-preview").innerHTML = `<span class="avatar">${esc(monogram(d.row.display_name))}</span>`;
      status.textContent = t("adminSaved");
    } catch (error) {
      console.error(error);
      status.textContent = t("adminSaveFail");
    }
    renderPlayersList();
  }

  // ---- matches tab ----------------------------------------------------------

  function matchRow(match) {
    const apps = state.appearances.filter((app) => app.match_id === match.id).length;
    const score = played(match) ? `${match.ycac_goals}–${match.opponent_goals}` : "–";
    return `<div class="admin-row">
      <div class="ar-id"><strong>${esc(formatDate(match.date))}</strong><small>${compShort(match)} · ${esc(t("versus"))} ${esc(match.opponent)} · ${score} · ${apps} ${esc(t("statApps")).toLowerCase()}</small></div>
      <span class="badge ${played(match) ? "a-active" : "a-inactive"}">${esc(played(match) ? t("results") : t("upcoming"))}</span>
      <div class="ar-actions">
        <button class="quiet-button small" type="button" data-action="edit-match" data-id="${esc(match.id)}">${esc(t("adminEdit"))}</button>
        <button class="quiet-button small danger" type="button" data-action="delete-match" data-id="${esc(match.id)}">${esc(t("adminDelete"))}</button>
      </div>
    </div>`;
  }

  function renderMatches() {
    $("admin-matches").innerHTML = state.matches.length
      ? state.matches.map(matchRow).join("")
      : `<p class="empty">${esc(t("adminNoMatches"))}</p>`;
    renderMatchForm();
  }

  function startMatch(mode, id) {
    const source = id ? state.matches.find((match) => match.id === id) : null;
    const row = source
      ? { ...source }
      : {
          id: suggestMatchId("Friendly Match"), date: now().slice(0, 10), competition: "Friendly Match", opponent: "",
          venue: null, home_away: null, ycac_goals: null, opponent_goals: null,
          kickoff: null, standard_signup_url: null, priority_signup_url: null,
        };
    const lineup = source
      ? state.appearances.filter((app) => app.match_id === source.id).map((app) => ({ player_id: app.player_id, role: app.role, position: app.position || "" }))
      : [];
    const goalsRows = source
      ? state.goals.filter((goal) => goal.match_id === source.id).map((goal) => ({ scorer_id: goal.scorer_id, assist_id: goal.assist_id || "", minute: goal.minute == null ? "" : String(goal.minute) }))
      : [];
    state.editingMatch = {
      mode, row, lineup, goalsRows, search: "",
      suggestedId: mode === "create" ? row.id : null,
      originalLineup: JSON.parse(JSON.stringify(lineup)),
      originalGoals: JSON.parse(JSON.stringify(goalsRows)),
    };
    renderMatches();
  }

  function syncMatchForm() {
    const d = state.editingMatch;
    if (!d || $("match-form").hidden || !$("match-f-date")) return;
    const value = (id) => $(id).value;
    d.row = {
      ...d.row,
      id: d.mode === "create" ? value("match-f-id").trim().toLowerCase() : d.row.id,
      date: value("match-f-date"),
      competition: value("match-f-competition"),
      opponent: value("match-f-opp").trim(),
      venue: value("match-f-venue").trim() || null,
      home_away: value("match-f-ha") || null,
      kickoff: value("match-f-kickoff").trim() || null,
      standard_signup_url: value("match-f-std").trim() || null,
      priority_signup_url: value("match-f-pri").trim() || null,
      ycac_goals: value("match-f-ycac") === "" ? null : Number(value("match-f-ycac")),
      opponent_goals: value("match-f-opp-goals") === "" ? null : Number(value("match-f-opp-goals")),
    };
  }

  function renderMatchForm() {
    const d = state.editingMatch;
    const form = $("match-form");
    if (!d) { form.hidden = true; form.innerHTML = ""; return; }
    syncMatchForm(); // keep typed values across language switches
    form.hidden = false;
    const m = d.row;
    const option = (value, label, current) => `<option value="${esc(value)}"${current === value ? " selected" : ""}>${esc(label)}</option>`;
    form.innerHTML = `
      <div class="form-head"><h3>${esc(t(d.mode === "create" ? "adminNewMatch" : "adminEditMatch"))}</h3></div>
      <div class="fields">
        <label class="field"><span>ID</span>
          <input id="match-f-id" value="${esc(m.id)}" ${d.mode === "edit" ? "disabled" : ""} placeholder="e.g. f008" /></label>
        <label class="field"><span>${esc(t("pickerDate"))} *</span><input id="match-f-date" type="date" value="${esc(String(m.date || "").slice(0, 10))}" /></label>
        <label class="field"><span>${esc(t("pickerCompetition"))} *</span>
          <select id="match-f-competition">
            ${option("TML Division 3", t("lensTml"), m.competition)}
            ${option("Friendly Match", t("lensFriendly"), m.competition)}
          </select></label>
        <label class="field"><span>${esc(t("pickerOpponent"))} *</span><input id="match-f-opp" value="${esc(m.opponent || "")}" /></label>
        <label class="field"><span>${esc(t("pickerVenue"))}</span><input id="match-f-venue" value="${esc(m.venue || "")}" /></label>
        <label class="field"><span>${esc(t("pickerKickoff"))}</span><input id="match-f-kickoff" value="${esc(m.kickoff || "")}" placeholder="14:00" /></label>
        <label class="field"><span>${esc(t("adminResult"))} — ${esc(t("goalsFor"))}</span><input id="match-f-ycac" type="number" min="0" value="${m.ycac_goals ?? ""}" /></label>
        <label class="field"><span>${esc(t("adminResult"))} — ${esc(t("goalsAgainst"))}</span><input id="match-f-opp-goals" type="number" min="0" value="${m.opponent_goals ?? ""}" /></label>
        <label class="field"><span>${esc(t("standardSignup"))}</span><input id="match-f-std" type="url" value="${esc(m.standard_signup_url || "")}" /></label>
        <label class="field"><span>${esc(t("prioritySignup"))}</span><input id="match-f-pri" type="url" value="${esc(m.priority_signup_url || "")}" /></label>
        <label class="field"><span>${esc(t("homeAway"))}</span>
          <select id="match-f-ha">
            <option value=""></option>
            ${option("home", t("adminHome"), m.home_away)}
            ${option("away", t("adminAway"), m.home_away)}
          </select></label>
      </div>
      <div class="form-section">
        <div class="form-section-head"><h4>${esc(t("adminLineup"))}</h4>
          <button class="quiet-button small" type="button" data-action="clear-lineup">${esc(t("adminClear"))}</button></div>
        <p class="admin-note">${esc(t("adminLineupHint"))}</p>
        <input id="lineup-search" class="lineup-search" type="search" data-i18n-placeholder="searchPlayer" placeholder="${esc(t("searchPlayer"))}" />
        <div id="lineup-list" class="lineup-list"></div>
        <div id="lineup-available" class="lineup-available"></div>
      </div>
      <div class="form-section">
        <div class="form-section-head"><h4>${esc(t("statGoals"))}</h4>
          <button class="quiet-button small" type="button" data-action="add-goal">${esc(t("adminAddGoal"))}</button></div>
        <div id="goals-list" class="goals-list"></div>
      </div>
      <div class="form-actions">
        <button class="primary-button" type="button" data-action="save-match">${esc(t("adminSave"))}</button>
        <button class="quiet-button" type="button" data-action="cancel-match">${esc(t("adminCancel"))}</button>
        ${d.mode === "edit" ? `<button class="quiet-button danger" type="button" data-action="delete-match">${esc(t("adminDelete"))}</button>` : ""}
      </div>`;
    renderLineup();
    renderGoals();
  }

  function renderLineup() {
    const d = state.editingMatch;
    if (!d) return;
    const nameById = new Map(state.players.map((player) => [player.id, player.display_name]));
    $("lineup-list").innerHTML = d.lineup.length
      ? d.lineup.map((row, index) => `
        <div class="lineup-row">
          <span class="lr-name">${esc(nameById.get(row.player_id) || row.player_id)}</span>
          <button class="role-toggle r-${row.role}" type="button" data-action="toggle-role" data-index="${index}">${row.role === "starter" ? "🟢" : "🔵"} ${esc(t(row.role === "starter" ? "starter" : "substitute"))}</button>
          <input class="lr-pos" data-index="${index}" value="${esc(row.position)}" placeholder="${esc(t("position"))}" aria-label="${esc(t("position"))}" />
          <button class="lr-x" type="button" data-action="remove-lineup" data-index="${index}" aria-label="✕">✕</button>
        </div>`).join("")
      : `<p class="empty">${esc(t("pickerOutput"))}</p>`;
    renderAvailable();
  }

  function renderAvailable() {
    const d = state.editingMatch;
    if (!d) return;
    const inSquad = new Set(d.lineup.map((row) => row.player_id));
    const search = d.search || "";
    const rows = state.players.filter((player) => !inSquad.has(player.id)
      && (!search || String(player.display_name).toLowerCase().includes(search)));
    $("lineup-available").innerHTML = rows.map((player) =>
      `<button class="lineup-chip${player.active === false ? " off" : ""}" type="button" data-action="add-lineup" data-id="${esc(player.id)}">${esc(player.display_name)}<small>#${player.shirt_number ?? "–"}</small></button>`).join("");
  }

  function renderGoals() {
    const d = state.editingMatch;
    if (!d) return;
    const playerOptions = (selected) => `<option value=""></option>${state.players.map((player) =>
      `<option value="${esc(player.id)}"${selected === player.id ? " selected" : ""}>${esc(player.display_name)}</option>`).join("")}`;
    $("goals-list").innerHTML = `
      <div class="goal-head"><span>${esc(t("adminScorer"))}</span><span>${esc(t("statAssists"))}</span><span>${esc(t("adminMinute"))}</span><span></span></div>
      ${d.goalsRows.map((row, index) => `
        <div class="goal-row">
          <select data-goal="scorer_id" data-index="${index}" aria-label="${esc(t("adminScorer"))}">${playerOptions(row.scorer_id)}</select>
          <select data-goal="assist_id" data-index="${index}" aria-label="${esc(t("statAssists"))}">${playerOptions(row.assist_id)}</select>
          <input type="number" min="0" data-goal="minute" data-index="${index}" value="${esc(row.minute)}" placeholder="${esc(t("adminMinute"))}" aria-label="${esc(t("adminMinute"))}" />
          <button class="lr-x" type="button" data-action="remove-goal" data-index="${index}" aria-label="✕">✕</button>
        </div>`).join("")}`;
  }

  const lineupSignature = (rows) => rows
    .map((row) => [row.player_id, row.role, String(row.position || "").trim().toUpperCase()].join("|"))
    .sort().join(";");
  const goalSignature = (rows) => rows
    .map((row) => [row.scorer_id, row.assist_id || "", row.minute === "" || row.minute == null ? "" : String(Number(row.minute))].join("|"))
    .sort().join(";");

  async function saveMatch() {
    const d = state.editingMatch;
    syncMatchForm();
    const m = d.row;
    if (!VALID_ID.test(m.id || "")) { setStatus(t("adminIdInvalid"), "fail"); return; }
    if (d.mode === "create" && state.matches.some((match) => match.id === m.id)) { setStatus(t("adminIdTaken"), "fail"); return; }
    if (!m.date || !m.opponent) { setStatus(t("adminSaveFail"), "fail"); return; }
    if (d.goalsRows.some((row) => !row.scorer_id)) { setStatus(t("adminSaveFail"), "fail"); return; }
    // a result needs both numbers — one blank means "not played yet"
    const hasScore = m.ycac_goals != null && m.opponent_goals != null;
    const row = { ...m, ycac_goals: hasScore ? m.ycac_goals : null, opponent_goals: hasScore ? m.opponent_goals : null };
    delete row.created_at;
    try {
      if (d.mode === "create") {
        const saved = await YCACData.insert("matches", [row]);
        state.matches.unshift(saved[0]);
      } else {
        const updated = await YCACData.update("matches", row, `id=eq.${row.id}`);
        const stored = state.matches.find((match) => match.id === row.id);
        Object.assign(stored, updated?.[0] ?? row);
      }
      state.matches.sort((a, b) => b.date.localeCompare(a.date));

      if (lineupSignature(d.lineup) !== lineupSignature(d.originalLineup)) {
        await YCACData.remove("appearances", `match_id=eq.${row.id}`);
        if (d.lineup.length) {
          await YCACData.insert("appearances", d.lineup.map((entry) => ({
            match_id: row.id, player_id: entry.player_id, role: entry.role,
            position: String(entry.position || "").trim().toUpperCase() || null,
          })));
        }
      }
      if (goalSignature(d.goalsRows) !== goalSignature(d.originalGoals)) {
        await YCACData.remove("goals", `match_id=eq.${row.id}`);
        if (d.goalsRows.length) {
          await YCACData.insert("goals", d.goalsRows.map((entry) => ({
            match_id: row.id, scorer_id: entry.scorer_id, assist_id: entry.assist_id || null,
            minute: entry.minute === "" ? null : Number(entry.minute),
          })));
        }
      }
      [state.appearances, state.goals] = await Promise.all([
        YCACData.select("appearances", "select=*"),
        YCACData.select("goals", "select=*"),
      ]);
      state.editingMatch = null;
      setStatus(t("adminSaved"), "ok");
    } catch (error) {
      console.error(error);
      setStatus(t("adminSaveFail"), "fail");
    }
    renderMatches();
  }

  async function deleteMatch(id) {
    if (!confirm(t("adminDeleteMatchConfirm"))) return;
    try {
      await YCACData.remove("matches", `id=eq.${id}`);
      state.matches = state.matches.filter((match) => match.id !== id);
      state.appearances = state.appearances.filter((app) => app.match_id !== id);
      state.goals = state.goals.filter((goal) => goal.match_id !== id);
      state.signups = state.signups.filter((signup) => signup.match_id !== id);
      state.notes = state.notes.filter((note) => note.match_id !== id);
      if (state.editingMatch?.row.id === id) state.editingMatch = null;
      if (state.signupMatchId === id) { state.signupMatchId = defaultMatchId("signups"); initSignupDraft(); }
      if (state.noteMatchId === id) state.noteMatchId = defaultMatchId("notes");
      setStatus(t("adminSaved"), "ok");
    } catch (error) {
      console.error(error);
      setStatus(t("adminSaveFail"), "fail");
    }
    renderMatches();
  }

  // ---- signups tab ----------------------------------------------------------

  function matchOptions(select, selectedId, kind) {
    if (!state.matches.length) { select.innerHTML = ""; return ""; }
    const id = state.matches.some((match) => match.id === selectedId) ? selectedId : defaultMatchId(kind);
    select.innerHTML = state.matches.map((match) =>
      `<option value="${esc(match.id)}"${match.id === id ? " selected" : ""}>${esc(formatDate(match.date))} · ${esc(t("versus"))} ${esc(match.opponent)} (${compShort(match)})</option>`).join("");
    return id;
  }

  function initSignupDraft() {
    const existing = new Map(state.signups.filter((signup) => signup.match_id === state.signupMatchId).map((signup) => [signup.player_id, signup.status]));
    state.signupsDraft = {};
    state.players.filter((player) => player.active !== false)
      .forEach((player) => { state.signupsDraft[player.id] = existing.get(player.id) || ""; });
  }

  function renderSignups() {
    const previous = state.signupMatchId;
    state.signupMatchId = matchOptions($("signup-match"), state.signupMatchId, "signups");
    if (state.signupMatchId !== previous) initSignupDraft(); // fell back to another fixture
    if (!state.matches.length) {
      $("admin-signups").innerHTML = `<p class="empty">${esc(t("adminNoMatches"))}</p>`;
      return;
    }
    if (!Object.keys(state.signupsDraft).length) initSignupDraft();
    $("admin-signups").innerHTML = state.players.filter((player) => player.active !== false).map((player) => {
      const current = state.signupsDraft[player.id] || "";
      return `<div class="admin-row signup-row">
        <div class="ar-id"><span>${esc(player.display_name)}</span><small>#${player.shirt_number ?? "–"} · ${esc(player.primary_position || "–")}</small></div>
        <select class="su-status s-${current || "none"}" data-player="${esc(player.id)}">
          <option value="">${esc(t("adminNoResponse"))}</option>
          ${SIGNUP_STATES.map((status) => `<option value="${status}"${current === status ? " selected" : ""}>${esc(t(SIGNUP_KEYS[status]))}</option>`).join("")}
        </select>
      </div>`;
    }).join("");
  }

  async function saveSignups() {
    const matchId = state.signupMatchId;
    if (!matchId) return;
    const original = new Map(state.signups.filter((signup) => signup.match_id === matchId).map((signup) => [signup.player_id, signup.status]));
    const stamp = { responded_at: now(), entered_by: email() };
    const ops = [];
    for (const [playerId, status] of Object.entries(state.signupsDraft)) {
      const before = original.get(playerId) ?? null;
      const wanted = status || null;
      if (before === wanted) continue;
      if (!wanted) ops.push(YCACData.remove("signups", `match_id=eq.${matchId}&player_id=eq.${playerId}`));
      else if (!before) ops.push(YCACData.insert("signups", [{ match_id: matchId, player_id: playerId, status: wanted, ...stamp }]));
      else ops.push(YCACData.update("signups", { status: wanted, ...stamp }, `match_id=eq.${matchId}&player_id=eq.${playerId}`));
    }
    try {
      await Promise.all(ops);
      state.signups = await YCACData.select("signups", "select=*");
      initSignupDraft();
      setStatus(t("adminSaved"), "ok");
    } catch (error) {
      console.error(error);
      setStatus(t("adminSaveFail"), "fail");
    }
    renderSignups();
  }

  // ---- match notes tab (requirement 6) --------------------------------------

  function renderNotes() {
    state.noteMatchId = matchOptions($("note-match"), state.noteMatchId, "notes");
    if (!state.matches.length) {
      $("note-meta").textContent = t("adminNoMatches");
      return;
    }
    const row = state.notes.find((note) => note.match_id === state.noteMatchId);
    $("note-reflection").value = row?.reflection || "";
    $("note-coaching").value = row?.coaching_points || "";
    $("note-squad").value = row?.squad_review || "";
    $("note-meta").textContent = row?.updated_at
      ? `${t("adminUpdated")} ${formatDate(row.updated_at)}${row.updated_by ? ` · ${row.updated_by}` : ""}`
      : "";
  }

  async function saveNotes() {
    const matchId = state.noteMatchId;
    if (!matchId) return;
    const payload = {
      reflection: $("note-reflection").value.trim() || null,
      coaching_points: $("note-coaching").value.trim() || null,
      squad_review: $("note-squad").value.trim() || null,
      updated_at: now(),
      updated_by: email(),
    };
    try {
      const existing = state.notes.find((note) => note.match_id === matchId);
      if (existing) {
        const updated = await YCACData.update("match_notes", payload, `match_id=eq.${matchId}`);
        Object.assign(existing, updated?.[0] ?? payload);
      } else {
        const saved = await YCACData.insert("match_notes", [{ match_id: matchId, ...payload }]);
        state.notes.push(saved[0]);
      }
      setStatus(t("adminSaved"), "ok");
    } catch (error) {
      console.error(error);
      setStatus(t("adminSaveFail"), "fail");
    }
    renderNotes();
  }

  // ---- team content tab (requirement 7) -------------------------------------

  function renderContent() {
    $("admin-content").innerHTML = CONTENT_SLUGS.map(({ slug, key }) => {
      const row = state.content.find((entry) => entry.slug === slug);
      const label = t(key);
      return `<div class="content-card" data-slug="${esc(slug)}">
        <h4>${esc(label)}</h4>
        <label class="field"><span>${esc(t("adminTitleField"))}</span>
          <input data-field="title" value="${esc(row?.title ?? label)}" /></label>
        <label class="field field-wide"><span>${esc(t("adminBodyField"))}</span>
          <textarea data-field="body" rows="9">${esc(row?.body ?? "")}</textarea></label>
        <div class="content-foot">
          <small class="admin-note">${row?.updated_at ? `${esc(t("adminUpdated"))} ${esc(formatDate(row.updated_at))}${row.updated_by ? ` · ${esc(row.updated_by)}` : ""}` : ""}</small>
          <button class="primary-button" type="button" data-action="save-content">${esc(t("adminSave"))}</button>
        </div>
      </div>`;
    }).join("");
  }

  async function saveContent(slug) {
    const card = $("admin-content").querySelector(`[data-slug="${slug}"]`);
    const title = card.querySelector('[data-field="title"]').value.trim();
    const body = card.querySelector('[data-field="body"]').value;
    if (!title || !body.trim()) { setStatus(t("adminSaveFail"), "fail"); return; }
    const payload = { title, body, updated_at: now(), updated_by: email() };
    try {
      const existing = state.content.find((entry) => entry.slug === slug);
      if (existing) {
        const updated = await YCACData.update("team_content", payload, `slug=eq.${slug}`);
        Object.assign(existing, updated?.[0] ?? payload);
      } else {
        const saved = await YCACData.insert("team_content", [{ slug, ...payload }]);
        state.content.push(saved[0]);
      }
      setStatus(t("adminSaved"), "ok");
    } catch (error) {
      console.error(error);
      setStatus(t("adminSaveFail"), "fail");
    }
    renderContent();
  }

  // ---- backup ---------------------------------------------------------------

  async function backup() {
    const status = $("backup-status");
    status.textContent = t("coachLoading");
    try {
      const tables = {};
      await Promise.all(BACKUP_TABLES.map(async (table) => { tables[table] = await YCACData.select(table, "select=*"); }));
      const file = `ycac-pulse-backup-${now().slice(0, 10)}.json`;
      const blob = new Blob([JSON.stringify({ source: "ycac-pulse", exported_at: now(), tables }, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = file;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      status.textContent = t("adminBackupDone", { file });
    } catch (error) {
      console.error(error);
      status.textContent = t("adminSaveFail");
    }
  }

  // ---- injuries tab (revamp wave 15) ----------------------------------------

  function renderInjuries() {
    const injuredIds = new Set(state.injuries.map((row) => row.player_id));
    const choices = state.players.filter((player) => player.active !== false && !injuredIds.has(player.id));
    $("injury-player").innerHTML = choices.map((player) => `<option value="${esc(player.id)}">${esc(player.display_name)}</option>`).join("");
    if (!$("injury-since").value) $("injury-since").value = now().slice(0, 10);
    $("admin-injuries").innerHTML = state.injuries.map((row) => {
      const player = state.players.find((entry) => entry.id === row.player_id);
      const meta = [`${t("injurySince")} ${esc(formatDate(row.since_date))}`, row.expected_return ? `${t("injuryReturn")} ${esc(row.expected_return)}` : ""]
        .filter(Boolean).join(" · ");
      return `<div class="admin-row injury-row">
        ${photoSpan(player || { display_name: row.player_id })}
        <div class="ar-id"><a href="player.html?id=${encodeURIComponent(row.player_id)}">${esc(player?.display_name || row.player_id)}</a><small>${esc(row.detail)}</small></div>
        <span class="ar-meta">${meta}</span>
        <div class="ar-actions">
          <button class="quiet-button small" type="button" data-action="remove-injury" data-id="${esc(row.player_id)}">${esc(t("injuryRemove"))}</button>
        </div>
      </div>`;
    }).join("") || `<p class="empty">${esc(t("injuriesEmpty"))}</p>`;
  }

  async function addInjury(event) {
    event.preventDefault();
    const playerId = $("injury-player").value;
    const detail = $("injury-detail").value.trim();
    const since = $("injury-since").value;
    if (!playerId || !detail || !since) { setStatus(t("adminSaveFail"), "fail"); return; }
    try {
      const [row] = await YCACData.insert("injuries", {
        player_id: playerId, detail, since_date: since,
        expected_return: $("injury-return").value.trim() || null,
        updated_at: new Date().toISOString(), updated_by: YCACAuth.session?.email || "coach",
      });
      state.injuries = [...state.injuries, row].sort((a, b) => String(a.since_date).localeCompare(String(b.since_date)));
      $("injury-detail").value = "";
      $("injury-return").value = "";
      $("injury-since").value = "";
      renderInjuries();
      setStatus(t("adminSaved"), "ok");
    } catch (error) {
      console.error(error);
      setStatus(t("adminSaveFail"), "fail");
    }
  }

  async function removeInjury(id) {
    try {
      await YCACData.remove("injuries", `player_id=eq.${encodeURIComponent(id)}`);
      state.injuries = state.injuries.filter((row) => row.player_id !== id);
      renderInjuries();
      setStatus(t("adminSaved"), "ok");
    } catch (error) {
      console.error(error);
      setStatus(t("adminSaveFail"), "fail");
    }
  }

  // ---- wiring ---------------------------------------------------------------

  function onPlayerRowAction(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    const id = button.dataset.id;
    if (action === "edit-player") startPlayer("edit", id);
    if (action === "toggle-player") togglePlayer(id);
    if (action === "delete-player") deletePlayer(id);
  }

  function onPlayerFormAction(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "save-player") savePlayer();
    if (action === "cancel-player") { state.editingPlayer = null; renderPlayers(); }
    if (action === "delete-player") deletePlayer(state.editingPlayer?.row.id);
    if (action === "upload-photo") $("player-f-photo").click();
    if (action === "remove-photo") removePlayerPhoto();
  }

  function onMatchRowAction(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (button.dataset.action === "edit-match") startMatch("edit", button.dataset.id);
    if (button.dataset.action === "delete-match") deleteMatch(button.dataset.id);
  }

  function onMatchFormAction(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const d = state.editingMatch;
    const action = button.dataset.action;
    const index = Number(button.dataset.index);
    if (action === "save-match") saveMatch();
    if (action === "cancel-match") { state.editingMatch = null; renderMatches(); }
    if (action === "delete-match") deleteMatch(d?.row.id);
    if (action === "clear-lineup") { d.lineup = []; renderLineup(); }
    if (action === "add-lineup") { d.lineup.push({ player_id: button.dataset.id, role: "starter", position: "" }); renderLineup(); }
    if (action === "remove-lineup") { d.lineup.splice(index, 1); renderLineup(); }
    if (action === "toggle-role") {
      d.lineup[index].role = d.lineup[index].role === "starter" ? "sub" : "starter";
      renderLineup();
    }
    if (action === "add-goal") { d.goalsRows.push({ scorer_id: "", assist_id: "", minute: "" }); renderGoals(); }
    if (action === "remove-goal") { d.goalsRows.splice(index, 1); renderGoals(); }
  }

  (async () => {
    const session = await YCACAuth.requireCoach();
    if (!session) return; // redirecting to login.html?next=admin.html&need=coach

    document.querySelectorAll(".admin-tab").forEach((button) => {
      button.addEventListener("click", () => { state.tab = button.dataset.tab; renderTab(); });
    });
    $("new-player").addEventListener("click", () => startPlayer("create"));
    $("new-match").addEventListener("click", () => startMatch("create"));
    $("admin-player-search").addEventListener("input", (event) => {
      state.query = event.target.value.trim().toLowerCase();
      renderPlayersList();
    });
    $("admin-players").addEventListener("click", onPlayerRowAction);
    $("player-form").addEventListener("click", onPlayerFormAction);
    $("player-form").addEventListener("change", (event) => {
      if (event.target.id === "player-f-photo") uploadPlayerPhoto(event.target.files?.[0]);
    });
    $("admin-matches").addEventListener("click", onMatchRowAction);
    $("match-form").addEventListener("click", onMatchFormAction);
    $("match-form").addEventListener("input", (event) => {
      const d = state.editingMatch;
      if (!d) return;
      if (event.target.id === "lineup-search") { d.search = event.target.value.trim().toLowerCase(); renderAvailable(); }
      if (event.target.classList.contains("lr-pos")) d.lineup[Number(event.target.dataset.index)].position = event.target.value;
    });
    $("match-form").addEventListener("change", (event) => {
      const d = state.editingMatch;
      if (!d) return;
      if (event.target.id === "match-f-competition" && d.mode === "create"
        && $("match-f-id").value.trim() === d.suggestedId) {
        d.suggestedId = suggestMatchId(event.target.value); // id still untouched → keep prefix honest
        $("match-f-id").value = d.suggestedId;
      }
      const field = event.target.dataset.goal;
      if (field) d.goalsRows[Number(event.target.dataset.index)][field] = event.target.value;
    });
    $("signup-match").addEventListener("change", (event) => {
      state.signupMatchId = event.target.value;
      initSignupDraft();
      renderSignups();
    });
    $("admin-signups").addEventListener("change", (event) => {
      if (event.target.classList.contains("su-status")) state.signupsDraft[event.target.dataset.player] = event.target.value;
    });
    $("signup-save").addEventListener("click", saveSignups);
    $("note-match").addEventListener("change", (event) => { state.noteMatchId = event.target.value; renderNotes(); });
    $("note-save").addEventListener("click", saveNotes);
    $("admin-content").addEventListener("click", (event) => {
      const button = event.target.closest('[data-action="save-content"]');
      if (button) saveContent(button.closest("[data-slug]").dataset.slug);
    });
    $("backup-button").addEventListener("click", backup);
    $("injury-form").addEventListener("submit", addInjury);
    $("admin-injuries").addEventListener("click", (event) => {
      const button = event.target.closest('[data-action="remove-injury"]');
      if (button) removeInjury(button.dataset.id);
    });
    if (window.YCACI18n) YCACI18n.onChange(() => renderAll());

    try {
      await load();
      renderTab();
    } catch (error) {
      console.error(error);
      setStatus(t("coachError"), "fail");
      const message = `<p class="login-error">${esc(t("coachError"))}</p>`;
      ["admin-players", "admin-matches", "admin-signups"].forEach((id) => { $(id).innerHTML = message; });
    }
  })();
})();
