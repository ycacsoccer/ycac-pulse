/* YC&AC Pulse — team page (Phase 9, requirement 7).
   Team-login page behind requireTeam(): renders the three team_content slugs
   (guidelines · coach instructions · club info) exactly as the coach wrote
   them in admin.html — the interface is translated, authored text is not.
   Sections the coach hasn't written yet are skipped. */
(() => {
  const t = (key, vars) => (window.YCACI18n ? YCACI18n.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);
  const SLUGS = [
    { slug: "guidelines", key: "contentGuidelines" },
    { slug: "coach-instructions", key: "contentCoachInstructions" },
    { slug: "club-info", key: "contentClubInfo" },
  ];
  const state = { rows: [], mode: "loading" }; // loading | ok | error

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const formatDate = (value) => (value && window.YCACI18n ? YCACI18n.formatDate(value) : value || "");

  // blank lines split paragraphs; single newlines become <br>
  const paragraphs = (text) => String(text).split(/\n{2,}/).map((block) => `<p>${esc(block).replace(/\n/g, "<br />")}</p>`).join("");

  function render() {
    const target = $("team-content");
    if (state.mode !== "ok") {
      target.innerHTML = `<p class="${state.mode === "error" ? "login-error" : "empty"}">${esc(t(state.mode === "error" ? "coachError" : "teamEmpty"))}</p>`;
      return;
    }
    const blocks = SLUGS
      .map(({ slug, key }) => ({ label: t(key), row: state.rows.find((row) => row.slug === slug) }))
      .filter(({ row }) => row && (row.title || row.body));
    if (!blocks.length) {
      target.innerHTML = `<p class="empty">${esc(t("teamEmpty"))}</p>`;
      return;
    }
    target.innerHTML = blocks.map(({ label, row }) => `
      <section class="panel team-section">
        <div class="section-heading"><div><h2>${esc(row.title || label)}</h2></div></div>
        <div class="team-body">${paragraphs(row.body || "")}</div>
        ${row.updated_at ? `<p class="admin-note">${esc(t("adminUpdated"))} ${esc(formatDate(row.updated_at))}${row.updated_by ? ` · ${esc(row.updated_by)}` : ""}</p>` : ""}
      </section>`).join("");
  }

  (async () => {
    const session = await YCACAuth.requireTeam(); // redirects to login.html?next=…
    if (!session) return;
    if (window.YCACI18n) YCACI18n.onChange(render); // re-render in the new language
    try {
      state.rows = await YCACData.select("team_content", "select=*");
      state.mode = "ok";
      render();
    } catch (error) {
      console.error(error);
      state.mode = "error";
      render();
    }
  })();
})();
