/* YC&AC Pulse — data layer (Phase 4).
   Dependency-free client for Supabase PostgREST + Storage. Reads run with the
   publishable key (anon role → RLS decides); anything needing a session asks
   auth.js (YCACAuth) for the current access token automatically.

   Credentials come from config.js (window.YCAC_CONFIG) — load config.js first. */

const YCACData = (() => {
  const config = (typeof window !== "undefined" && window.YCAC_CONFIG) || {};
  const key = config.supabaseAnonKey || "";
  const REST = `${config.supabaseUrl}/rest/v1`;
  const STORAGE = `${config.supabaseUrl}/storage/v1`;

  // Token for a request: the signed-in session if there is one, else anon.
  async function sessionToken() {
    try {
      if (window.YCACAuth) return await window.YCACAuth.ensureFresh();
    } catch (error) { /* session expired / refresh failed → fall back to anon */ }
    return null;
  }

  /* Lowest-level call; auth.js reuses it for GoTrue endpoints via `url`. */
  async function request(url, { method = "GET", body, headers = {}, token } = {}) {
    const bearer = token !== undefined ? token : await sessionToken();
    const finalHeaders = { apikey: key, Authorization: `Bearer ${bearer || key}` };
    if (body !== undefined) finalHeaders["Content-Type"] = "application/json";
    Object.assign(finalHeaders, headers);
    const response = await fetch(url, {
      method,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const text = await response.text();
      const error = new Error(`${method} ${url} → ${response.status}: ${text.slice(0, 300)}`);
      error.status = response.status;
      error.body = text;
      throw error;
    }
    if (response.status === 204) return null;
    const text = await response.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch (error) { return text; }
  }

  /* PostgREST helpers — `query` is everything after "?" on the table URL:
     YCACData.select("matches", "select=*&order=date.desc")
     YCACData.select("signups", "select=*,players(display_name)&match_id=eq.abc")
     Writes ask for the affected rows back (pass a different Prefer to override). */
  const select = (table, query = "select=*") => request(`${REST}/${table}?${query}`);
  const rowsBack = { Prefer: "return=representation" };
  const insert = (table, rows) => request(`${REST}/${table}`, { method: "POST", body: rows, headers: rowsBack });
  const update = (table, rows, query) => request(`${REST}/${table}?${query}`, { method: "PATCH", body: rows, headers: rowsBack });
  const remove = (table, query) => request(`${REST}/${table}?${query}`, { method: "DELETE", headers: rowsBack });

  /* Postgres RPC — e.g. rpc("is_coach") → boolean (needs a session). */
  const rpc = (fn, args = {}) => request(`${REST}/rpc/${fn}`, { method: "POST", body: args });

  /* Storage: upload a player photo. `path` is inside the public bucket. */
  async function upload(path, file, { bucket = "player-photos", upsert = false } = {}) {
    const form = new FormData();
    form.append("file", file, file.name || path);
    const bearer = await sessionToken();
    const response = await fetch(`${STORAGE}/object/${bucket}/${path}${upsert ? "?upsert=true" : ""}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${bearer || key}`, "x-upsert": String(upsert) },
      body: form,
    });
    if (!response.ok) {
      const text = await response.text();
      const error = new Error(`storage upload ${path} → ${response.status}: ${text.slice(0, 300)}`);
      error.status = response.status;
      error.body = text;
      throw error;
    }
    return publicUrl(path, bucket);
  }

  const publicUrl = (path, bucket = "player-photos") =>
    `${config.supabaseUrl}/storage/v1/object/public/${bucket}/${encodeURI(path)}`;

  const api = { request, select, insert, update, remove, rpc, upload, publicUrl };
  if (typeof window !== "undefined") window.YCACData = api;
  return api;
})();
