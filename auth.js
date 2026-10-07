/* YC&AC Pulse — auth (Phase 4; simplified in wave 26).
   The site is public by default. The only login shown in the UI is COACH:
   a rostered Supabase account recognised by is_coach() (coach_roster), with
   access to the dashboard, admin, squad picker and private team content.
   The old read-only team account can remain in Supabase for backwards
   compatibility, but no page or login control asks players to use it.

   Page API:
      await YCACAuth.requireCoach()   → redirects unless a rostered coach is signed in
     YCACAuth.mountAuthUI()          → fills every [data-auth-slot] with log in / out
     YCACAuth.onChange(fn)           → re-render when the session changes        */

const YCACAuth = (() => {
  const config = (typeof window !== "undefined" && window.YCAC_CONFIG) || {};
  const AUTH = `${config.supabaseUrl}/auth/v1`;
  const KEY = config.supabaseAnonKey || "";
  const STORE = "ycac-session";
  const MARGIN = 60; // refresh tokens expiring within this many seconds
  const listeners = [];

  let session = load();
  let refreshing = null;
  let coachCache = null; // { token, value }

  function load() {
    try {
      const raw = typeof localStorage !== "undefined" && localStorage.getItem(STORE);
      return raw ? JSON.parse(raw) : null;
    } catch (error) { return null; }
  }

  function save(next) {
    session = next;
    try {
      if (next) localStorage.setItem(STORE, JSON.stringify(next));
      else localStorage.removeItem(STORE);
    } catch (error) { /* private mode — session stays in memory */ }
    coachCache = null;
    listeners.forEach((listener) => listener(session));
  }

  function rememberGrant(grant) {
    return {
      access_token: grant.access_token,
      refresh_token: grant.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (grant.expires_in || 3600),
      user: grant.user ? { id: grant.user.id, email: grant.user.email } : undefined,
    };
  }

  async function grant(path, body) {
    const response = await fetch(`${AUTH}/${path}`, {
      method: "POST",
      headers: { apikey: KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = new Error(`login rejected (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return rememberGrant(await response.json());
  }

  /* Called by data.js before every request: returns a token that is not about
     to expire, refreshing it once (single-flight) when needed. */
  async function ensureFresh() {
    if (!session) return null;
    if (!session.expires_at || session.expires_at - Date.now() / 1000 > MARGIN) return session.access_token;
    if (!refreshing) {
      refreshing = grant("token?grant_type=refresh_token", { refresh_token: session.refresh_token })
        .then((next) => { save(next); return next.access_token; })
        .catch(() => { save(null); return null; })
        .finally(() => { refreshing = null; });
    }
    return refreshing;
  }

  async function signIn(email, password) {
    const next = await grant("token?grant_type=password", { email, password });
    save(next);
    return next.user;
  }

  async function signOut() {
    const token = session?.access_token;
    save(null); // local first — never leave a stale session behind
    if (token) {
      try {
        await fetch(`${AUTH}/logout`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${token}` } });
      } catch (error) { /* token already dead — nothing to clean up */ }
    }
  }

  /* Is the current session a coach? (coach_roster is invisible to clients;
     is_coach() is SECURITY DEFINER and grants EXECUTE to authenticated.) */
  async function isCoach() {
    const token = await ensureFresh();
    if (!token) return false;
    if (coachCache && coachCache.token === token) return coachCache.value;
    let value = false;
    try {
      value = Boolean(await window.YCACData.rpc("is_coach", {}));
    } catch (error) { value = false; }
    coachCache = { token, value };
    return value;
  }

  const loginUrl = () => {
    const next = encodeURIComponent(`${location.pathname.split("/").pop()}${location.search}`);
    return `login.html?next=${next}`;
  };

  // Compatibility alias for any old cached page: there is now one private
  // access level, so a former "team" gate is a coach gate too.
  async function requireTeam() {
    return requireCoach();
  }

  async function requireCoach() {
    if (!session) { location.replace(loginUrl()); return null; }
    if (await isCoach()) return session;
    location.replace(loginUrl());
    return null;
  }

  function onChange(listener) { listeners.push(listener); }

  /* Masthead widget: fills [data-auth-slot] with a log-in link or the signed-in
     account + log-out button. Call once on load; onChange keeps it fresh. */
  function mountAuthUI(root) {
    const t = (key) => (window.YCACI18n ? YCACI18n.t(key) : key);
    (root || document).querySelectorAll("[data-auth-slot]").forEach((slot) => {
      slot.classList.add("auth-slot");
      if (session) {
        slot.innerHTML = `<a class="auth-action" href="coach.html">${t("authCoachDashboard")}</a><button class="auth-action" type="button" data-auth-signout>${t("authLogout")}</button>`;
        slot.querySelector("[data-auth-signout]").addEventListener("click", () => signOut());
      } else {
        slot.innerHTML = `<a class="auth-action" href="login.html">${t("authCoachLogin")}</a>`;
      }
    });
  }

  function boot() {
    mountAuthUI(document);
    onChange(() => mountAuthUI(document));
    if (window.YCACI18n) YCACI18n.onChange(() => mountAuthUI(document)); // re-translate on language switch
  }

  const api = { get session() { return session; }, ensureFresh, signIn, signOut, isCoach, requireTeam, requireCoach, onChange, mountAuthUI };
  if (typeof window !== "undefined") {
    window.YCACAuth = api;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
  return api;
})();
