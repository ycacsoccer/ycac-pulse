/* YC&AC Pulse — coach login (wave 26 simplification).
   Public pages need no account. This one password-only form signs into the
   configured coach account; `next` returns to the private tool that requested
   access, otherwise Continue opens the coach dashboard. */
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
    if (!coach) { render(false); return; }
    const next = safeNext();
    location.replace(next || "coach.html");
  }

  async function render(forcedCoach) {
    const session = YCACAuth.session;
    $("login-signed-out").hidden = Boolean(session);
    $("login-signed-in").hidden = !session;

    let coach = forcedCoach;
    if (session && coach === undefined) coach = await YCACAuth.isCoach();

    $("login-need-coach").hidden = !session || Boolean(coach);

    if (!session) return;
    $("login-account").textContent = session.user?.email || "";
    $("login-role").textContent = coach ? t("loginRoleCoach") : t("loginNeedCoach");
    $("login-continue").hidden = !coach;
    $("login-continue").setAttribute("href", safeNext() || "coach.html");
  }

  $("coach-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("login-error").hidden = true;
    try {
      await YCACAuth.signIn(config.coachEmail, $("coach-password").value);
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
