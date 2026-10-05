/* YC&AC Pulse — login page (Phase 4).
   Two cards: players/team (shared team password → config.teamEmail) and
   coach (own account). When arrived via requireTeam/requireCoach the `next`
   parameter carries the page that wanted a session; log in and Continue goes
   there. `need=coach` shows the coach-required notice. */
(() => {
  const config = window.YCAC_CONFIG || {};
  const params = new URLSearchParams(location.search);
  const t = (key) => (window.YCACI18n ? YCACI18n.t(key) : key);
  const $ = (id) => document.getElementById(id);

  // Only our own pages — never an absolute URL (blocks open redirects).
  const safeNext = () => {
    const next = params.get("next") || "";
    return /^[a-z0-9._-]+\.html(\?[^#]*)?$/i.test(next) ? next : "";
  };

  function showError() {
    const error = $("login-error");
    error.textContent = t("loginFailed");
    error.hidden = false;
  }

  async function afterSignIn() {
    const coach = await YCACAuth.isCoach();
    if (params.get("need") === "coach" && !coach) {
      render(coach); // wrong account for this page — stay and explain
      return;
    }
    const next = safeNext();
    if (next) location.replace(next);
    else render(coach);
  }

  async function render(forcedCoach) {
    const session = YCACAuth.session;
    $("login-signed-out").hidden = Boolean(session);
    $("login-signed-in").hidden = !session;

    let coach = forcedCoach;
    if (session && coach === undefined) coach = await YCACAuth.isCoach();

    // The notice shows when we're where a coach account is required but don't have one.
    $("login-need-coach").hidden = !(params.get("need") === "coach" && (!session || !coach));

    if (!session) return;
    $("login-account").textContent = session.user?.email || "";
    $("login-role").textContent = coach ? t("loginRoleCoach") : t("loginRoleTeam");
    $("login-continue").setAttribute("href", safeNext() || "./");
  }

  $("team-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("login-error").hidden = true;
    try {
      await YCACAuth.signIn(config.teamEmail, $("team-password").value);
      await afterSignIn();
    } catch (error) {
      $("team-password").value = "";
      showError();
    }
  });

  $("coach-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("login-error").hidden = true;
    try {
      await YCACAuth.signIn($("coach-email").value.trim(), $("coach-password").value);
      await afterSignIn();
    } catch (error) {
      $("coach-password").value = "";
      showError();
    }
  });

  $("login-signout").addEventListener("click", () => YCACAuth.signOut());

  YCACAuth.onChange(() => render());
  if (window.YCACI18n) YCACI18n.onChange(() => render()); // role line follows the language
  render();
})();
