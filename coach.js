/* YC&AC Pulse — coach dashboard (Phase 5, requirement 10).
   Coach-login page: shows the stable-squad board by tier, the next fixture with
   signups, position coverage, and review flags — all live from Supabase.

   Lens (TML / Friendly / All) switches the participation numbers on the board;
   tiers and reliability stay season-wide by design (Core = TML ≥ 67% only).
   coach_notes.squad_status is coach-readable only, so a team session simply
   gets fully derived tiers. */
(() => {
  const t = (key, vars) => (window.YCACI18n ? YCACI18n.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);
  const TIER_EMOJI = { core: "🟢", rotation: "🔵", depth: "🟡", inactive: "⚪" };
  const TIER_KEYS = { core: "tierCore", rotation: "tierRotation", depth: "tierDepth", inactive: "tierInactive" };
  const tierLabel = (tier) => t(TIER_KEYS[tier]);
  const LENS_KEYS = { tml: "lensTml", friendly: "lensFriendly", all: "lensAll" };
  const SIGNUP_STATES = ["confirmed", "waitlist", "declined", "unavailable"];
  const SIGNUP_KEYS = { confirmed: "signupConfirmed", waitlist: "signupWaitlist", declined: "signupDeclined", unavailable: "signupUnavailable" };
  const DECLINED_STATES = ["declined", "unavailable"];
  const GROUPS = ["GK", "DF", "MF", "AT", "Other"];

  const state = { lens: "tml", formation: "4-2-3-1", tacticSlot: "", season: null, players: [], signups: [], appearances: [], fixtures: [], injuries: [] };

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const formatDate = (value) => (value && window.YCACI18n ? YCACI18n.formatDate(value) : value || "");
  const monogram = (name) => String(name || "?").split(/\s+/).map((word) => word[0]).slice(0, 2).join("").toUpperCase();

  function photoCell(entry) {
    const initials = `<span class="monogram" aria-hidden="true">${esc(monogram(entry.display_name))}</span>`;
    if (!entry.photo_path) return initials;
    const url = YCACData.publicUrl(entry.photo_path);
    return `<span class="avatar">${initials}<img src="${esc(url)}" alt="" loading="lazy" onerror="this.remove()" /></span>`;
  }

  async function load() {
    const [players, matches, appearances, goals, signups, injuries] = await Promise.all([
      YCACData.select("players", "select=id,display_name,shirt_number,primary_position,secondary_positions,photo_path,active&order=display_name"),
      YCACData.select("matches", "select=*&order=date"),
      YCACData.select("appearances", "select=*"),
      YCACData.select("goals", "select=*"),
      YCACData.select("signups", "select=match_id,player_id,status"), // team table: needs the session
      YCACData.select("injuries", "select=*&order=since_date"),
    ]);
    let overrides = {};
    try {
      const notes = await YCACData.select("coach_notes", "select=player_id,squad_status"); // coach sessions only → [] for team
      overrides = Object.fromEntries(notes.filter((note) => note.squad_status).map((note) => [note.player_id, { squad_status: note.squad_status }]));
    } catch (error) { /* derived tiers are fine */ }

    state.players = players;
    state.signups = signups;
    state.appearances = appearances;
    state.injuries = injuries;
    state.season = YCACStats.computeSeason({ players, matches, appearances, goals, signups, statusOverrides: overrides });
    state.fixtures = state.season.fixtures;
  }

  // ---- sections -------------------------------------------------------------

  function renderSummary() {
    const counts = state.season.counts;
    $("coach-summary").innerHTML = [
      [counts.players, t("coachPlayers")],
      [counts.used, t("coachUsed")],
      [counts.matches.all, t("coachMatches")],
      [counts.matches.upcoming, t("upcoming")],
    ].map(([value, label]) => `<div><strong>${value}</strong><span>${esc(label)}</span></div>`).join("");
  }

  function renderFixture() {
    const target = $("next-fixture");
    const fixture = state.fixtures[0];
    if (!fixture) { target.innerHTML = `<p class="empty">${esc(t("coachNoFixture"))}</p>`; return; }

    const rows = state.signups.filter((signup) => signup.match_id === fixture.id);
    const nameById = new Map(state.players.map((player) => [player.id, player.display_name]));
    const links = [
      fixture.standard_signup_url ? `<a href="${esc(fixture.standard_signup_url)}" target="_blank" rel="noreferrer">${esc(t("standardSignup"))}</a>` : "",
      fixture.priority_signup_url ? `<a href="${esc(fixture.priority_signup_url)}" target="_blank" rel="noreferrer">${esc(t("prioritySignup"))}</a>` : "",
    ].join("");

    const groups = SIGNUP_STATES.map((status) => {
      const names = rows.filter((row) => row.status === status).map((row) => nameById.get(row.player_id) || row.player_id).sort();
      if (!names.length) return "";
      return `<div class="signup-group s-${status}"><h4>${esc(t(SIGNUP_KEYS[status]))} · ${names.length}</h4><div class="name-cloud">${names.map((name) => `<span>${esc(name)}</span>`).join("")}</div></div>`;
    }).join("");

    target.innerHTML = `
      <div class="fixture-card">
        <div class="fixture-date">${esc(formatDate(fixture.date))}</div>
        <div class="fixture-body">
          <div class="fixture-opponent"><a href="match.html?id=${encodeURIComponent(fixture.id)}">${esc(t("versus"))} ${esc(fixture.opponent)}</a></div>
          <div class="fixture-meta">${esc(fixture.competition)}${fixture.venue ? ` · ${esc(fixture.venue)}` : ""}${fixture.home_away ? ` · ${esc(fixture.home_away)}` : ""}</div>
          ${links ? `<div class="fixture-actions">${links}</div>` : ""}
        </div>
        <div class="fixture-time">${esc(fixture.kickoff || "TBC")}<br /><small>${esc(t("kickoff"))}</small></div>
      </div>
      ${rows.length
        ? `<p class="signup-responded">${esc(t("coachResponded", { count: rows.length, total: state.season.counts.players }))}</p><div class="signup-groups">${groups}</div>`
        : `<p class="empty">${esc(t("coachNoSignups"))}</p>`}`;
  }

  function renderBoard() {
    const lens = state.lens;
    $("board-lens-note").textContent = t(LENS_KEYS[lens]);

    $("tier-chips").innerHTML = YCACStats.TIER_ORDER.map((tier) =>
      `<span class="tier-chip chip-${tier}">${TIER_EMOJI[tier]} ${esc(tierLabel(tier))} <strong>${state.season.tiers[tier].length}</strong></span>`
    ).join("");

    $("squad-board").innerHTML = YCACStats.TIER_ORDER.map((tier) => {
      const group = YCACStats.ranked(state.season.tiers[tier]);
      if (!group.length) return "";
      const rows = group.map((entry) => {
        const stats = entry.competitions[lens];
        const cs = stats.clean_sheets > 0 ? ` <small class="cs">· ${stats.clean_sheets} CS</small>` : "";
        return `<tr>
          <td class="b-player">${photoCell(entry)}<a class="b-name" href="player.html?id=${encodeURIComponent(entry.id)}">${esc(entry.display_name)}</a></td>
          <td>${esc(entry.primary_position || "–")}</td>
          <td>${entry.shirt_number ?? "–"}</td>
          <td>${stats.played}</td>
          <td>${stats.starts}</td>
          <td>${stats.appearance_pct ?? "–"}</td>
          <td>${stats.goals}${cs}</td>
          <td>${stats.assists}</td>
          <td>${entry.reliability ?? "–"}</td>
        </tr>`;
      }).join("");
      return `<div class="tier-group">
        <div class="tier-head"><span class="tier-badge chip-${tier}">${TIER_EMOJI[tier]} ${esc(tierLabel(tier))}</span><small>${group.length} ${esc(t("coachPlayers")).toLowerCase()}</small></div>
        <div class="table-wrap"><table class="board-table">
          <thead><tr>
            <th>${esc(t("player"))}</th><th>${esc(t("position"))}</th><th>${esc(t("shirtNumber"))}</th>
            <th>${esc(t("statApps"))}</th><th>${esc(t("statStarts"))}</th><th>%</th>
            <th>${esc(t("statGoals"))}</th><th>${esc(t("statAssists"))}</th><th>${esc(t("statReliability"))}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>`;
    }).join("");
  }

  function renderCoverage() {
    const coverage = YCACStats.coverage(state.season.players);
    const groups = GROUPS.filter((group) => YCACStats.TIER_ORDER.some((tier) => coverage[group][tier].length));
    const head = `<thead><tr><th>${esc(t("position"))}</th>${YCACStats.TIER_ORDER.map((tier) =>
      `<th>${TIER_EMOJI[tier]} ${esc(tierLabel(tier))}</th>`).join("")}</tr></thead>`;
    const body = `<tbody>${groups.map((group) => `<tr><th>${group}</th>${YCACStats.TIER_ORDER.map((tier) => {
      const names = coverage[group][tier].map((entry) => entry.display_name).join(", ");
      const count = coverage[group][tier].length;
      return `<td${names ? ` title="${esc(names)}"` : ""}>${count || "–"}</td>`;
    }).join("")}</tr>`).join("")}</tbody>`;
    $("coverage-table").innerHTML = head + body;
  }

  function renderTactics() {
    const target = $("tactics-map");
    if (!target || !window.YCACTactics) return;
    const unavailable = new Set(state.injuries.map((injury) => injury.player_id));
    const slots = YCACTactics.coverage(state.season.players, state.formation, unavailable);
    if (!slots.some((slot) => slot.id === state.tacticSlot)) {
      state.tacticSlot = [...slots].sort((a, b) => a.count - b.count)[0]?.id || "";
    }
    const selected = slots.find((slot) => slot.id === state.tacticSlot) || slots[0];
    const node = (slot) => {
      const level = YCACTactics.heat(slot.count);
      const names = slot.candidates.map((player) => player.display_name).join(", ");
      return `<button class="tactic-node heat-${level}${slot.id === selected?.id ? " is-selected" : ""}" type="button" data-tactic-slot="${esc(slot.id)}" style="--tx:${slot.x}%;--ty:${slot.y}%" title="${esc(names || t("coachNoCoverage"))}" aria-label="${esc(`${slot.label}: ${slot.count} ${t("coachAvailable")}`)}"><span>${esc(slot.label)}</span><strong>${slot.count}</strong>${slot.unavailableCount ? `<i>+${slot.unavailableCount}</i>` : ""}</button>`;
    };
    const playerLinks = (players) => players.length
      ? players.map((player) => `<a href="player.html?id=${encodeURIComponent(player.id)}">${esc(player.display_name)}${player.unavailable ? ` <small>${esc(t("coachUnavailable"))}</small>` : ""}</a>`).join("")
      : `<span class="empty">${esc(t("coachNoCoverage"))}</span>`;
    const best = selected ? selected.candidates.filter((player) => player.fit === "best") : [];
    const capable = selected ? selected.candidates.filter((player) => player.fit === "capable") : [];
    target.innerHTML = `<div>
        <div class="formation-pitch" aria-label="${esc(state.formation)} ${esc(t("coachTactics"))}"><i class="pitch-half"></i><i class="pitch-circle"></i>${slots.map(node).join("")}</div>
        <div class="coverage-legend"><span class="heat-empty">0 ${esc(t("coverageEmpty"))}</span><span class="heat-thin">1 ${esc(t("coverageThin"))}</span><span class="heat-fair">2 ${esc(t("coverageFair"))}</span><span class="heat-strong">3+ ${esc(t("coverageStrong"))}</span></div>
      </div>
      <aside class="tactic-detail">
        <p class="eyebrow">${esc(state.formation)}</p><h3>${esc(selected?.label || "")}</h3>
        <div><strong>${esc(t("coachBestFit"))}</strong><div class="tactic-names">${playerLinks(best)}</div></div>
        <div><strong>${esc(t("positionCapable"))}</strong><div class="tactic-names">${playerLinks(capable)}</div></div>
      </aside>`;
  }

  function renderFlags() {
    const entries = state.season.players;
    const nameById = new Map(state.players.map((player) => [player.id, player.display_name]));

    const missingPhotos = entries.filter((entry) => !entry.photo_path).map((entry) => entry.display_name);

    const byNumber = new Map();
    entries.forEach((entry) => {
      if (entry.shirt_number == null) return;
      byNumber.set(entry.shirt_number, [...(byNumber.get(entry.shirt_number) || []), entry.display_name]);
    });
    const duplicateNumbers = [...byNumber.entries()].filter(([, names]) => names.length > 1)
      .map(([number, names]) => `#${number} — ${names.join(", ")}`);

    const friendlyOnly = entries.filter((entry) => entry.competitions.friendly.played > 0 && entry.competitions.tml.played === 0)
      .map((entry) => entry.display_name);

    const played = new Set(state.season.buckets.all.map((match) => match.match_id ?? match.id));
    const appearanceKeys = new Set(state.appearances.map((app) => `${app.match_id}:${app.player_id}`));
    // declined-but-started: a declined/unavailable signup for a match the player actually played
    const matchById = new Map(state.season.buckets.all.map((match) => [match.match_id ?? match.id, match]));
    const declinedButPlayed = state.signups
      .filter((signup) => DECLINED_STATES.includes(String(signup.status).toLowerCase())
        && played.has(signup.match_id)
        && appearanceKeys.has(`${signup.match_id}:${signup.player_id}`))
      .map((signup) => {
        const match = matchById.get(signup.match_id);
        return `${nameById.get(signup.player_id) || signup.player_id} · ${match?.opponent || ""} (${formatDate(match?.date)})`;
      });

    const rows = [
      { label: t("flagMissingPhotos"), items: missingPhotos },
      { label: t("flagDuplicateNumbers"), items: duplicateNumbers },
      { label: t("flagFriendlyOnly"), items: friendlyOnly },
      { label: t("flagDeclinedButPlayed"), items: declinedButPlayed },
    ].filter((row) => row.items.length);

    $("flags").innerHTML = rows.length
      ? rows.map((row) => `<div class="flag-row"><i></i><div><strong>${esc(row.label)} · ${row.items.length}</strong><div class="name-cloud">${row.items.map((item) => `<span>${esc(item)}</span>`).join("")}</div></div></div>`).join("")
      : `<p class="empty">${esc(t("flagNone"))}</p>`;
  }

  function renderInjuries() { /* revamp 15 — squad status cards, empty state is good news */
    const target = $("coach-injuries");
    if (!target) return;
    if (!state.injuries.length) { target.innerHTML = `<p class="empty">${esc(t("injuriesEmpty"))}</p>`; return; }
    const byId = new Map(state.players.map((player) => [player.id, player]));
    target.innerHTML = state.injuries.map((row) => {
      const player = byId.get(row.player_id) || { display_name: row.player_id };
      const meta = [`${t("injurySince")} ${esc(formatDate(row.since_date))}`, row.expected_return ? `${t("injuryReturn")} ${esc(row.expected_return)}` : ""]
        .filter(Boolean).join(" · ");
      return `<a class="injury-card" href="player.html?id=${encodeURIComponent(row.player_id)}">${photoCell(player)}<span class="ic-body"><strong class="ic-name">${esc(player.display_name)}</strong><span class="ic-detail">${esc(row.detail)}</span><span class="ic-meta">${meta}</span></span></a>`;
    }).join("");
  }

  function renderAll() {
    if (!state.season) return;
    renderSummary();
    renderFixture();
    renderBoard();
    renderCoverage();
    renderTactics();
    renderInjuries();
    renderFlags();
  }

  function showError() {
    const message = `<p class="login-error">${esc(t("coachError"))}</p>`;
    ["next-fixture", "squad-board", "flags"].forEach((id) => { $(id).innerHTML = message; });
  }

  (async () => {
    const session = await YCACAuth.requireCoach();
    if (!session) return; // redirecting to login.html?next=coach.html
    $("lens").value = state.lens;
    $("lens").addEventListener("change", (event) => { state.lens = event.target.value; renderBoard(); });
    $("formation-lens").value = state.formation;
    $("formation-lens").addEventListener("change", (event) => { state.formation = event.target.value; state.tacticSlot = ""; renderTactics(); });
    $("tactics-map").addEventListener("click", (event) => {
      const button = event.target.closest && event.target.closest("[data-tactic-slot]");
      if (!button) return;
      state.tacticSlot = button.getAttribute("data-tactic-slot");
      renderTactics();
    });
    if (window.YCACI18n) YCACI18n.onChange(() => renderAll());
    try {
      await load();
      renderAll();
    } catch (error) {
      console.error(error);
      showError();
    }
  })();
})();
