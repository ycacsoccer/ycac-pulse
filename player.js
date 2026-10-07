/* YC&AC Pulse — player profile (Phase 6, requirements 9 + photo).
   Public page: TML/Friendly hero summaries (apps, appearance rate, goals,
   assists), info, detailed TML/Friendly/All stats, positions, and a
   PERFORMANCE TIMELINE of every
   final match — absences labelled — and goals. Coaches get an "Update photo"
   control and a pitch-tap position editor (tap a slot to set the BEST
   position or toggle CAN-PLAY ones) — storage/table RLS enforce is_coach()
   regardless of what the UI shows. */
(() => {
  const t = (key, vars) => (window.YCACI18n ? YCACI18n.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);
  const TIER_EMOJI = { core: "🟢", rotation: "🔵", depth: "🟡", inactive: "⚪" };
  const TIER_KEYS = { core: "tierCore", rotation: "tierRotation", depth: "tierDepth", inactive: "tierInactive" };
  const FOOT_KEYS = { left: "footLeft", right: "footRight", both: "footBoth" };
  const VALID_ID = /^[a-z0-9_-]+$/i;

  const id = new URLSearchParams(location.search).get("id") || "";
  // posEdit: coach position editor draft (wave 20) — posMode picks what a tap
  // means (set BEST vs toggle CAN-PLAY); posStatus is an i18n key or "".
  const state = { player: null, players: [], matches: [], appearances: [], goals: [], entry: null, injury: null, isCoach: false,
    posEdit: false, posMode: "best", posBest: "", posCapable: [], posStatus: "" };

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const formatDate = (value) => (value && window.YCACI18n ? YCACI18n.formatDate(value) : value || "");
  const monogram = (name) => String(name || "?").split(/\s+/).map((word) => word[0]).slice(0, 2).join("").toUpperCase();
  const compClass = (match) => /friendly/i.test(match?.competition || "") ? "friendly" : "tml";
  const rate = (value) => (value == null ? "–" : String(Number(value.toFixed(2)))); // 1.50 → "1.5"
  const outcomeOf = (match) => { const gf = Number(match.ycac_goals), ga = Number(match.opponent_goals); return gf > ga ? "win" : gf === ga ? "draw" : "loss"; };

  async function load() {
    const [players, matches, appearances, goals] = await Promise.all([
      YCACData.select("players", "select=*&order=display_name"),
      YCACData.select("matches", "select=*&order=date"),
      YCACData.select("appearances", `select=*,matches(date,opponent,competition,ycac_goals,opponent_goals)&player_id=eq.${id}`),
      // competition must come with the embedded match: renderGoals() badges each
      // row TML/FND from match.competition (without it every goal read as TML).
      YCACData.select("goals", `select=*,matches(date,opponent,competition)&or=(scorer_id.eq.${id},assist_id.eq.${id})`),
    ]);
    const player = players.find((row) => row.id === id);
    if (!player) return false;

    state.player = player;
    state.players = players;
    state.matches = matches;
    state.appearances = appearances;
    state.goals = goals;
    try { // current injury badge — supplementary, never blocks the profile
      const injury = await YCACData.select("injuries", `select=*&player_id=eq.${id}`);
      state.injury = injury[0] || null;
    } catch (error) { state.injury = null; }
    // Profiles render for inactive/retired players too — force-include this row.
    state.entry = YCACStats.computeSeason({ players: [{ ...player, active: true }], matches, appearances, goals }).players[0];
    return true;
  }

  function renderHero() {
    const player = state.player;
    const entry = state.entry;
    const initials = `<span class="monogram monogram-lg" aria-hidden="true">${esc(monogram(player.display_name))}</span>`;
    const photo = player.photo_path
      ? `<span class="profile-photo avatar">${initials}<img src="${esc(YCACData.publicUrl(player.photo_path))}" alt="${esc(player.display_name)}" onerror="this.remove()" /></span>`
      : `<span class="profile-photo">${initials}</span>`;

    const sub = [player.nickname, player.display_name_full && player.display_name_full !== player.display_name ? player.display_name_full : ""]
      .filter(Boolean).map(esc).join(" · ");
    const positions = [player.primary_position, ...(player.secondary_positions || [])].filter(Boolean);

    const facts = [
      positions.length ? [t("position"), positions.map(esc).join(" · ")] : "",
      player.shirt_number != null ? [t("shirtNumber"), `#${player.shirt_number}`] : "",
      player.preferred_foot && FOOT_KEYS[player.preferred_foot] ? [t("infoFoot"), t(FOOT_KEYS[player.preferred_foot])] : "",
      entry.reliability != null ? [t("statReliability"), String(entry.reliability)] : "",
    ].filter(Boolean);

    // Wave 26 — the player summary follows the way the team is actually used:
    // TML first, friendlies second. Keep "All" in the detailed table only.
    const competitionCard = (name, label, chip) => {
      const comp = entry.competitions[name];
      const total = state.entry.competitions[name] && state.matches.filter((match) => YCACStats.isFinal(match)
        && (name === "tml" ? match.competition === "TML Division 3" : match.competition === "Friendly Match")).length;
      const pct = comp.appearance_pct == null ? "–" : `${comp.appearance_pct}%`;
      return `<article class="profile-competition ${name}">
        <div class="profile-competition-head"><span class="comp-chip ${chip}">${esc(label)}</span><strong>${comp.played}<span>/${total}</span></strong><small>${esc(t("statApps"))}</small></div>
        <div class="profile-competition-stats">
          <span><small>${esc(t("statAppearanceRate"))}</small><strong>${pct}</strong></span>
          <span><small>${esc(t("statGoals"))}</small><strong>${comp.goals}</strong></span>
          <span><small>${esc(t("statAssists"))}</small><strong>${comp.assists}</strong></span>
        </div>
      </article>`;
    };

    $("profile-hero").innerHTML = `
      ${photo}
      <div class="profile-id">
        <p class="eyebrow">${esc(t("playersEyebrow"))}</p>
        <h1>${esc(player.display_name)}</h1>
        ${sub ? `<p class="profile-sub">${sub}</p>` : ""}
        <div class="profile-facts">
          ${facts.map(([label, value]) => `<span><small>${esc(label)}</small>${value}</span>`).join("")}
          <span><small>${esc(t("filterTier"))}</small><span class="tier-badge chip-${entry.tier}">${TIER_EMOJI[entry.tier]} ${esc(t(TIER_KEYS[entry.tier]))}</span></span>
        </div>
        <div class="profile-competition-grid">
          ${competitionCard("tml", t("lensTml"), "tml")}
          ${competitionCard("friendly", t("lensFriendly"), "friendly")}
        </div>
        ${state.injury ? `<p class="profile-injury"><span class="injured-badge">${esc(t("injuredBadge"))}</span> ${esc(state.injury.detail)}<small>${esc(t("injurySince"))} ${esc(formatDate(state.injury.since_date))}${state.injury.expected_return ? ` · ${esc(t("injuryReturn"))} ${esc(state.injury.expected_return)}` : ""}</small></p>` : ""}
        <div class="profile-upload">
          ${state.isCoach ? `<button id="photo-upload" class="quiet-button" type="button">${esc(t("uploadPhoto"))}</button>` : ""}
          <span id="upload-status" class="upload-status" aria-live="polite"></span>
        </div>
      </div>`;

    if (state.isCoach) $("photo-upload").addEventListener("click", () => $("photo-input").click());

    const bio = $("profile-bio");
    bio.hidden = !player.bio;
    if (player.bio) $("profile-bio-text").textContent = player.bio;

    document.title = `${player.display_name} | YC&AC Pulse`;
  }

  function renderStats() {
    const entry = state.entry;
    const lens = ["tml", "friendly", "all"];
    const cells = (values) => values.map((value) => `<td>${value ?? "–"}</td>`).join("");
    const rows = [
      [t("statApps"), lens.map((name) => entry.competitions[name].played)],
      [t("statAppearanceRate"), lens.map((name) => entry.competitions[name].appearance_pct == null ? "–" : `${entry.competitions[name].appearance_pct}%`)],
      [t("statStarts"), lens.map((name) => entry.competitions[name].starts)],
      [t("statSubs"), lens.map((name) => entry.competitions[name].subs)],
      [t("statGoals"), lens.map((name) => entry.competitions[name].goals)],
      [t("kpiGoalsPerGame"), lens.map((name) => { const comp = entry.competitions[name]; return comp.played ? rate(comp.goals / comp.played) : "–"; })],
      [t("statAssists"), lens.map((name) => entry.competitions[name].assists)],
    ];
    if (entry.position_group === "GK") rows.push([t("statCleanSheets"), lens.map((name) => entry.competitions[name].clean_sheets)]);

    $("profile-stats").innerHTML = `
      <thead><tr><th></th><th title="${esc(t("lensTml"))}">TML</th><th title="${esc(t("lensFriendly"))}">${esc(t("vizFriendly"))}</th><th title="${esc(t("lensAll"))}">${esc(t("filterAll"))}</th></tr></thead>
      <tbody>${rows.map(([label, values]) => `<tr><th>${esc(label)}</th>${cells(values)}</tr>`).join("")}</tbody>`;
  }

  function renderTimeline() { /* wave 17 — every final match for this player,
     absences labelled too; TML group first, friendlies underneath. */
    const finals = state.matches.filter(YCACStats.isFinal)
      .sort((a, b) => String(b.date).localeCompare(String(a.date))); // newest first
    if (!finals.length) { $("profile-timeline").innerHTML = `<p class="empty">${esc(t("historyEmpty"))}</p>`; return; }
    const rest = finals.filter((match) => !/tml|friendly/i.test(match.competition || ""));
    const groups = [
      { badge: "TML", label: "TML Division 3", cls: "tml", matches: finals.filter((match) => /tml/i.test(match.competition || "")) },
      { badge: "FND", label: t("friendlyMatches"), cls: "friendly", matches: finals.filter((match) => /friendly/i.test(match.competition || "")) },
    ].concat(rest.length ? [{ badge: "OTH", label: rest[0].competition || "", cls: "friendly", matches: rest }] : []);

    $("profile-timeline").innerHTML = groups.filter((group) => group.matches.length).map((group) => {
      const counts = { win: 0, draw: 0, loss: 0 };
      group.matches.forEach((match) => { counts[outcomeOf(match)] += 1; });
      const head = `<div class="timeline-group-head"><span class="h-comp ${group.cls}">${group.badge}</span><strong>${esc(group.label)}</strong><small>${counts.win}–${counts.draw}–${counts.loss} ${esc(t("wdl"))} · ${group.matches.length} ${esc(t("matchesRecorded"))}</small></div>`;
      const rows = group.matches.map((match) => {
        const app = state.appearances.find((appearance) => appearance.match_id === match.id);
        const outcome = outcomeOf(match);
        const resultLetter = outcome === "win" ? t("vizWin") : outcome === "draw" ? t("vizDraw") : t("vizLoss");
        const scored = state.goals.filter((goal) => goal.scorer_id === state.player.id && goal.match_id === match.id).length;
        const assisted = state.goals.filter((goal) => goal.assist_id === state.player.id && goal.match_id === match.id).length;
        const contrib = [scored ? `${scored}⚽` : "", assisted ? `${assisted}🅰️` : ""].filter(Boolean).join(" ");
        const status = app
          ? `${app.role === "starter" ? "🟢" : "🔵"} ${esc(t(app.role === "starter" ? "starter" : "substitute"))}${app.position ? ` · ${esc(app.position)}` : ""}`
          : `⚪ ${esc(t("statusAbsent"))}`;
        return `<a class="timeline-entry ${group.cls} ${outcome}${app ? "" : " absent"}" href="match.html?id=${encodeURIComponent(match.id)}">
          <span class="timeline-date">${esc(formatDate(match.date))}</span>
          <span class="timeline-rail"><i class="timeline-marker"></i></span>
          <span class="timeline-match">
            <span class="timeline-opponent">${esc(t("versus"))} ${esc(match.opponent)}</span>
            <span class="timeline-meta">${status}${contrib ? ` · ${contrib}` : ""}</span>
          </span>
          <span class="timeline-score ${outcome}">${Number(match.ycac_goals)}–${Number(match.opponent_goals)}<span>${esc(resultLetter)}</span></span>
        </a>`;
      }).join("");
      return `<div class="timeline-group ${group.cls}">${head}${rows}</div>`;
    }).join("");
  }

  function renderGoals() {
    const nameById = new Map(state.players.map((player) => [player.id, player.display_name]));
    const scored = state.goals.filter((goal) => goal.scorer_id === state.player.id)
      .sort((a, b) => String(b.matches?.date || "").localeCompare(String(a.matches?.date || "")) || (b.minute ?? 0) - (a.minute ?? 0));
    if (!scored.length) { $("profile-goals").innerHTML = `<p class="empty">${esc(t("goalsEmpty"))}</p>`; return; }
    $("profile-goals").innerHTML = scored.map((goal) => {
      const match = goal.matches || {};
      const assist = goal.assist_id ? nameById.get(goal.assist_id) : null;
      return `<a class="history-row" href="match.html?id=${encodeURIComponent(goal.match_id)}">
        <span class="h-date">${esc(formatDate(match.date))}</span>
        <span class="h-comp ${compClass(match)}">${compClass(match) === "friendly" ? "FND" : "TML"}</span>
        <span class="h-opp">${esc(t("versus"))} ${esc(match.opponent)}</span>
        <span class="h-min">${goal.minute != null ? `${goal.minute}′` : ""}</span>
        ${assist ? `<span class="h-assist" title="${esc(assist)}">→ ${esc(assist)}</span>` : ""}
      </a>`;
    }).join("");
  }

  /* View mode — pitch diagram (revamp 13). Coaches get an "Edit positions"
     button + the last save status; the editor itself is rendered when a
     position draft is open (renderPositionEditor below). */
  const posStatusText = () => (state.posStatus === "positionsSaving" ? t("positionsSaving")
    : state.posStatus === "positionsSaved" ? t("positionsSaved")
    : state.posStatus === "positionsSaveFail" ? t("positionsSaveFail") : "");

  function renderPositions() { /* revamp 13 — pitch diagram: best ★ + capable */
    if (state.posEdit) { renderPositionEditor(); return; }
    const player = state.player;
    const best = player.primary_position || "";
    const capable = player.secondary_positions || [];
    const status = posStatusText();
    const coachRow = state.isCoach ? `<div class="pos-edit-row">
        <button class="quiet-button small" type="button" data-pos-action="edit">${esc(t("positionsEdit"))}</button>
        ${status ? `<span class="upload-status" aria-live="polite">${esc(status)}</span>` : ""}
      </div>` : "";
    if (!best && !capable.length) { $("profile-positions").innerHTML = `<p class="empty">${esc(t("positionsEmpty"))}</p>${coachRow}`; return; }
    const diagram = window.YCACPositionMap ? YCACPositionMap.svg(best, capable) : "";
    const label = (cls, key, value) => `<span class="pm-label ${cls}"><small>${esc(t(key))}</small><strong>${esc(value)}</strong></span>`;
    $("profile-positions").innerHTML = `
      <div class="position-map-grid">
        <div class="position-map-figure">${diagram}</div>
        <div class="position-map-key">
          ${best ? label("pm-label-best", "positionBest", best) : ""}
          ${capable.length ? label("pm-label-capable", "positionCapable", capable.join(" · ")) : ""}
        </div>
      </div>${coachRow}`;
  }

  /* Editor mode — every coordinate becomes a tappable slot (positionmap
     .editable). The mode toggle decides what a tap does; Save writes
     primary_position + secondary_positions in one PATCH (RLS still requires
     is_coach() regardless of what the UI shows). */
  function renderPositionEditor() {
    const best = state.posBest;
    const capable = state.posCapable;
    const diagram = window.YCACPositionMap ? YCACPositionMap.editable(best, capable) : "";
    const hint = state.posMode === "best" ? t("positionsEditHintBest") : t("positionsEditHintCapable");
    const status = posStatusText();
    const label = (cls, key, value) => `<span class="pm-label ${cls}"><small>${esc(t(key))}</small><strong>${esc(value || "–")}</strong></span>`;
    const modeBtn = (mode, key) => `<button class="pos-mode${state.posMode === mode ? " is-on" : ""}" type="button" data-pos-mode="${mode}" aria-pressed="${state.posMode === mode}">${esc(t(key))}</button>`;
    $("profile-positions").innerHTML = `
      <div class="position-map-grid editing">
        <div class="position-map-figure">${diagram}</div>
        <div class="position-map-key">
          <div class="pos-mode-row" role="group">${modeBtn("best", "positionBest")}${modeBtn("capable", "positionCapable")}</div>
          <p class="pos-hint">${esc(hint)}</p>
          ${label("pm-label-best", "positionBest", best)}
          ${label("pm-label-capable", "positionCapable", capable.join(" · "))}
          <div class="pos-edit-row">
            <button class="primary-button small" type="button" data-pos-action="save" ${state.posStatus === "positionsSaving" ? "disabled" : ""}>${esc(t("adminSave"))}</button>
            <button class="quiet-button small" type="button" data-pos-action="cancel">${esc(t("adminCancel"))}</button>
            ${status ? `<span class="upload-status" aria-live="polite">${esc(status)}</span>` : ""}
          </div>
        </div>
      </div>`;
  }

  function startEdit() {
    if (!state.isCoach || !state.player) return;
    state.posEdit = true;
    state.posMode = "best";
    state.posBest = state.player.primary_position || "";
    state.posCapable = [...(state.player.secondary_positions || [])];
    state.posStatus = "";
    renderPositions();
  }

  function pickSlot(code) {
    const slot = String(code || "").toUpperCase();
    if (!window.YCACPositionMap || !YCACPositionMap.known(slot)) return;
    if (state.posMode === "best") {
      if (slot !== state.posBest) { // a best pick supersedes any can-play entry
        state.posBest = slot;
        state.posCapable = state.posCapable.filter((item) => String(item).toUpperCase() !== slot);
      }
    } else if (slot !== String(state.posBest || "").toUpperCase()) {
      // unknown (non-_COORDS) codes already stored are left untouched
      state.posCapable = state.posCapable.some((item) => String(item).toUpperCase() === slot)
        ? state.posCapable.filter((item) => String(item).toUpperCase() !== slot)
        : [...state.posCapable, slot];
    }
    state.posStatus = "";
    renderPositions();
  }

  async function savePositions() {
    if (!state.posEdit || !state.isCoach || state.posStatus === "positionsSaving") return;
    state.posStatus = "positionsSaving";
    renderPositions();
    const patch = {
      primary_position: state.posBest || null,
      secondary_positions: state.posCapable.filter((item) => String(item).toUpperCase() !== String(state.posBest || "").toUpperCase()),
    };
    try {
      const rows = await YCACData.update("players", patch, `id=eq.${state.player.id}`);
      // RLS may let the request through while writing NOTHING (0 rows) —
      // that is a failed save, never a success.
      if (!Array.isArray(rows) || rows.length !== 1) throw new Error(`position save affected ${Array.isArray(rows) ? rows.length : "?"} row(s)`);
      state.player.primary_position = patch.primary_position;
      state.player.secondary_positions = patch.secondary_positions;
      state.posEdit = false;
      state.posStatus = "positionsSaved";
      // position_group feeds the stats table (GK clean sheets) + hero facts
      state.entry = YCACStats.computeSeason({ players: [{ ...state.player, active: true }], matches: state.matches, appearances: state.appearances, goals: state.goals }).players[0];
      renderAll();
    } catch (error) {
      console.error(error);
      state.posStatus = "positionsSaveFail";
      renderPositions(); // stay in the editor so the coach can retry
    }
  }

  function handlePosAction(action) {
    if (action === "edit") return startEdit();
    if (!state.posEdit || !state.isCoach) return; // stale listeners no-op
    if (action === "cancel") { state.posEdit = false; state.posStatus = ""; renderPositions(); }
    else if (action === "save") savePositions();
  }

  /* One delegated listener each on #profile-positions (the panel element
     survives every innerHTML swap). Slots are SVG <g role="button"> — they
     need an explicit keydown; the mode/action controls are real buttons. */
  function onPositionsClick(event) {
    const target = event && event.target;
    if (!target || typeof target.closest !== "function") return;
    const action = target.closest("[data-pos-action]");
    if (action) { handlePosAction(action.getAttribute("data-pos-action")); return; }
    if (!state.posEdit || !state.isCoach) return;
    const mode = target.closest("[data-pos-mode]");
    if (mode) {
      state.posMode = mode.getAttribute("data-pos-mode") === "capable" ? "capable" : "best";
      state.posStatus = "";
      renderPositions();
      return;
    }
    const slot = target.closest("[data-pos]");
    if (slot) pickSlot(slot.getAttribute("data-pos"));
  }

  function onPositionsKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event && event.target;
    if (!target || typeof target.closest !== "function") return;
    const slot = target.closest("[data-pos]");
    if (slot && state.posEdit && state.isCoach) { event.preventDefault(); pickSlot(slot.getAttribute("data-pos")); }
  }

  function renderAll() {
    if (!state.player) return;
    renderHero();
    renderPositions();
    renderStats();
    renderTimeline();
    renderGoals();
  }

  function renderNotFound() {
    $("profile-hero").innerHTML = `<div class="profile-id"><h1>${esc(t("playerNotFound"))}</h1></div>`;
    document.querySelectorAll(".player-main .panel").forEach((panel) => { panel.hidden = true; });
    document.title = `${t("playerNotFound")} | YC&AC Pulse`;
  }

  async function uploadPhoto(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file || !state.player) return;
    if (!file.type.startsWith("image/")) { $("upload-status").textContent = t("uploadFail"); return; }
    $("upload-status").textContent = t("uploadUploading");
    try {
      const extension = (file.name.match(/\.(jpe?g|png|webp|gif)$/i)?.[1] || file.type.split("/")[1] || "img").toLowerCase();
      const path = `${state.player.id}-${Date.now()}.${extension}`;
      await YCACData.upload(path, file);
      await YCACData.update("players", { photo_path: path }, `id=eq.${state.player.id}`);
      state.player.photo_path = path;
      renderHero();
      $("upload-status").textContent = t("uploadDone");
    } catch (error) {
      console.error(error);
      $("upload-status").textContent = t("uploadFail");
    }
  }

  (async () => {
    $("photo-input").addEventListener("change", uploadPhoto);
    $("profile-positions").addEventListener("click", onPositionsClick);
    $("profile-positions").addEventListener("keydown", onPositionsKeydown);
    if (window.YCACI18n) YCACI18n.onChange(() => renderAll());
    if (!VALID_ID.test(id)) { renderNotFound(); return; }
    try {
      const found = await load();
      if (!found) { renderNotFound(); return; }
      renderAll();
      if (YCACAuth.session) {
        try { state.isCoach = await YCACAuth.isCoach(); } catch (error) { state.isCoach = false; }
        if (state.isCoach) renderAll(); // hero photo button + positions Edit control
      }
    } catch (error) {
      console.error(error);
      $("profile-hero").innerHTML = `<div class="profile-id"><p class="login-error">${esc(t("coachError"))}</p></div>`;
    }
  })();
})();
