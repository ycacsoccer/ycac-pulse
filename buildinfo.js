/* YC&AC Pulse — build badge (wave 33).
   Footer chip on every page: which commit the site was built from and how
   long ago — `8ecd377 · 3 hours ago`, the hash linking to the commit.
   Reads build-info.json (written into _site by scripts/build-site.js, and
   synthesized by scripts/serve-static.js for local dev); stays hidden when
   the file is unavailable. Re-renders on language switch and every minute so
   the relative time does not go stale. */
(() => {
  const SHORT = 7;
  const REPO = "https://github.com/ycacsoccer/ycac-pulse";
  let info = null;

  const lang = () => (window.YCACI18n ? YCACI18n.language : document.documentElement.lang || "en");

  /* "3 hours ago" / Japanese and Chinese equivalents — Intl does the
     translating, so no i18n keys are needed. */
  const relative = (iso) => {
    const when = new Date(iso);
    if (Number.isNaN(when.getTime())) return "";
    const seconds = (when.getTime() - Date.now()) / 1000; // negative = in the past
    const ago = Math.abs(seconds);
    const rtf = new Intl.RelativeTimeFormat(lang(), { numeric: "auto" });
    if (ago < 45) return rtf.format(0, "minute"); // "now"
    if (ago < 45 * 60) return rtf.format(Math.round(seconds / 60), "minute");
    if (ago < 22 * 3600) return rtf.format(Math.round(seconds / 3600), "hour");
    if (ago < 6 * 86400) return rtf.format(Math.round(seconds / 86400), "day");
    if (ago < 320 * 86400) return rtf.format(Math.round(seconds / (30 * 86400)), "month");
    return rtf.format(Math.round(seconds / (365 * 86400)), "year");
  };

  function render() {
    const chip = document.getElementById("build-info");
    if (!chip || !info) return;
    const sha = String(info.commit || "");
    const when = relative(info.builtAt);
    chip.title = [sha, info.builtAt, info.node && `node ${info.node}`].filter(Boolean).join(" · ");
    chip.innerHTML = sha
      ? `<a class="build-commit" href="${REPO}/commit/${encodeURIComponent(sha)}" target="_blank" rel="noreferrer">${sha.slice(0, SHORT)}</a>${when ? ` · ${when}` : ""}`
      : when;
    chip.hidden = !chip.textContent.trim();
  }

  async function boot() {
    if (!document.getElementById("build-info")) return;
    try {
      const response = await fetch("build-info.json", { cache: "no-store" });
      if (!response.ok) return; // older publish without the file — no badge
      info = await response.json();
    } catch (error) { return; } // offline / file:// — badge stays hidden
    render();
    if (window.YCACI18n) YCACI18n.onChange(render); // re-translate on language switch
    setInterval(render, 60_000); // "3 hours ago" should keep being true
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
})();
