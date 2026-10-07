/* YC&AC Pulse — player grid (Phase 6, requirement 5).
   Public page: player CARDS (wave 17) — photo, shirt/position, tier + injury
   badge, season apps + goals — filtered by position group / tier / name.
   Tiers come from stats.js (TML-first rules); no session needed. */
(() => {
  const t = (key, vars) => (window.YCACI18n ? YCACI18n.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);
  const TIER_EMOJI = { core: "🟢", rotation: "🔵", depth: "🟡", inactive: "⚪" };
  const TIER_KEYS = { core: "tierCore", rotation: "tierRotation", depth: "tierDepth", inactive: "tierInactive" };
  const POSITION_FILTERS = ["ALL", "GK", "DF", "MF", "AT"];
  // Grid sections, in formation order — the list is broken down by position.
  const POSITION_SECTIONS = [["GK", "playersGk"], ["DF", "playersDf"], ["MF", "playersMf"], ["AT", "playersAt"], ["Other", "playersOther"]];

  const state = { season: null, entries: [], position: "ALL", tier: "ALL", query: "", injured: new Set() };

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const monogram = (name) => String(name || "?").split(/\s+/).map((word) => word[0]).slice(0, 2).join("").toUpperCase();

  function photoMarkup(entry) {
    const initials = `<span class="monogram" aria-hidden="true">${esc(monogram(entry.display_name))}</span>`;
    if (!entry.photo_path) return `<span class="pc-photo">${initials}</span>`;
    return `<span class="pc-photo avatar">${initials}<img src="${esc(YCACData.publicUrl(entry.photo_path))}" alt="" loading="lazy" onerror="this.remove()" /></span>`;
  }

  const visible = () => state.entries.filter((entry) =>
    (state.position === "ALL" || entry.position_group === state.position)
    && (state.tier === "ALL" || entry.tier === state.tier)
    && (!state.query || String(entry.display_name).toLowerCase().includes(state.query)));

  function renderChips() {
    const tierOrder = ["ALL", ...YCACStats.TIER_ORDER];
    $("position-filters").innerHTML = POSITION_FILTERS.map((value) =>
      `<button type="button" class="filter-chip${state.position === value ? " active" : ""}" data-filter="position" data-value="${value}">${esc(value === "ALL" ? t("filterAll") : value)}</button>`).join("");
    $("tier-filters").innerHTML = tierOrder.map((value) =>
      `<button type="button" class="filter-chip chip-${value === "ALL" ? "all" : value}${state.tier === value ? " active" : ""}" data-filter="tier" data-value="${value}">${value === "ALL" ? esc(t("filterAll")) : `${TIER_EMOJI[value]} ${esc(t(TIER_KEYS[value]))}`}</button>`).join("");
    document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
      state[button.dataset.filter] = button.dataset.value;
      renderChips();
      renderGrid();
    }));
  }

  function renderGrid() {
    const rows = visible();
    $("players-count").textContent = t("playersCount", { count: rows.length, total: state.entries.length });
    if (!rows.length) {
      $("players-grid").innerHTML = `<p class="empty">${esc(t("playersNoMatch"))}</p>`;
      return;
    }
    // wave 17 — cards carry the key facts: shirt/position, selection group
    // (+ injury), season apps + goals (wave 21: appearance-% cells removed).
    const card = (entry) => {
      const all = entry.competitions.all;
      return `<a class="player-card" href="player.html?id=${encodeURIComponent(entry.id)}">
        ${photoMarkup(entry)}
        <strong class="pc-name">${esc(entry.display_name)}</strong>
        <span class="pc-meta">${entry.shirt_number != null ? `#${entry.shirt_number} · ` : ""}${esc(entry.primary_position || "")}</span>
        <span class="pc-badges">
          <span class="tier-badge chip-${entry.tier}">${TIER_EMOJI[entry.tier]} ${esc(t(TIER_KEYS[entry.tier]))}</span>
          ${state.injured.has(entry.id) ? `<span class="injured-badge">${esc(t("injuredBadge"))}</span>` : ""}
        </span>
        <span class="pc-tot">${all.played}/${state.season.buckets.all.length} ${esc(t("statApps").toLowerCase())} · ${all.goals} ${esc(t("statGoals").toLowerCase())}</span>
      </a>`;
    };
    // wave 18 — one section per position group (formation order), skipping empty ones.
    $("players-grid").innerHTML = POSITION_SECTIONS
      .map(([group, key]) => ({ key, members: rows.filter((entry) => entry.position_group === group) }))
      .filter((section) => section.members.length)
      .map((section) => `<section class="position-section">
        <div class="position-section-head"><h3>${esc(t(section.key))}</h3><span class="position-count">${section.members.length}</span></div>
        <div class="players-grid">${section.members.map(card).join("")}</div>
      </section>`)
      .join("");
  }

  function renderAll() {
    if (!state.season) return;
    renderChips();
    renderGrid();
  }

  (async () => {
    $("players-search").addEventListener("input", (event) => {
      state.query = event.target.value.trim().toLowerCase();
      if (state.season) renderGrid();
    });
    if (window.YCACI18n) YCACI18n.onChange(() => renderAll());
    try {
      const [players, matches, appearances, goals, injuries] = await Promise.all([
        YCACData.select("players", "select=*&order=display_name"),
        YCACData.select("matches", "select=*&order=date"),
        YCACData.select("appearances", "select=*"),
        YCACData.select("goals", "select=*"),
        YCACData.select("injuries", "select=player_id").catch(() => []), // badge only: never block the grid
      ]);
      state.injured = new Set(injuries.map((row) => row.player_id));
      state.season = YCACStats.computeSeason({ players, matches, appearances, goals });
      state.entries = YCACStats.ranked(state.season.players);
      renderAll();
    } catch (error) {
      console.error(error);
      $("players-grid").innerHTML = `<p class="login-error">${esc(t("coachError"))}</p>`;
    }
  })();
})();
