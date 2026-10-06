/* YC&AC Pulse — player position diagram (revamp wave 13).
   Hand-rolled SVG pitch (no libraries): a portrait pitch with one dot per
   position code — filled + gold ring for the BEST position, outlined dots for
   CAPABLE positions. Used by player.html; pure functions so verify-profiles
   can render it under Node. */
(() => {
  const COORDS = {
    GK: { x: 100, y: 268 },
    LB: { x: 30, y: 218 },
    CB: { x: 100, y: 232 },
    RB: { x: 170, y: 218 },
    LWB: { x: 24, y: 160 },
    RWB: { x: 176, y: 160 },
    DM: { x: 100, y: 196 },
    CM: { x: 122, y: 152 },
    MC: { x: 78, y: 152 },
    AM: { x: 100, y: 116 },
    AMC: { x: 78, y: 110 },
    AMF: { x: 122, y: 110 },
    LW: { x: 30, y: 78 },
    RW: { x: 170, y: 78 },
    ST: { x: 100, y: 48 },
    CF: { x: 100, y: 66 },
    FW: { x: 100, y: 84 },
  };

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

  function known(code) { return Object.prototype.hasOwnProperty.call(COORDS, String(code || "").toUpperCase()); }

  function pitchOutline() {
    return `
      <rect class="pm-pitch" x="8" y="8" width="184" height="284" rx="4" />
      <line x1="8" y1="150" x2="192" y2="150" />
      <circle cx="100" cy="150" r="26" />
      <rect x="55" y="8" width="90" height="44" />
      <rect x="78" y="8" width="44" height="18" />
      <rect x="55" y="248" width="90" height="44" />
      <rect x="78" y="274" width="44" height="18" />`;
  }

  function dot(code, isBest) {
    const point = COORDS[String(code).toUpperCase()];
    if (!point) return "";
    const label = esc(String(code).toUpperCase());
    if (isBest) {
      return `<g class="pm-best"><circle cx="${point.x}" cy="${point.y}" r="10" /><text x="${point.x}" y="${point.y}" dy="3">${label}</text></g>`;
    }
    return `<g class="pm-capable"><circle cx="${point.x}" cy="${point.y}" r="9" /><text x="${point.x}" y="${point.y}" dy="3">${label}</text></g>`;
  }

  /* svg(primary, secondary) → an <svg> string marking best + capable spots. */
  function svg(primary, secondary = []) {
    const best = String(primary || "").toUpperCase();
    const capable = [...new Set((secondary || []).map((code) => String(code).toUpperCase()).filter((code) => code && code !== best))].filter(known);
    const bestDot = known(best) ? dot(best, true) : "";
    return `<svg class="position-map" viewBox="0 0 200 300" role="img" aria-hidden="true" focusable="false">
      <g class="pm-lines">${pitchOutline()}</g>
      ${capable.map((code) => dot(code, false)).join("")}
      ${bestDot}
    </svg>`;
  }

  /* editable(primary, secondary) — wave 20 coach editor: EVERY coordinate
     becomes a tappable slot (data-pos) so positions are chosen from the pitch
     itself. States: pm-best (gold ring) / pm-capable / pm-empty (open slot).
     Not aria-hidden — slots are focusable buttons (role/tabindex). */
  function editable(primary, secondary = []) {
    const best = String(primary || "").toUpperCase();
    const capable = [...new Set((secondary || []).map((code) => String(code).toUpperCase()).filter((code) => code && code !== best))].filter(known);
    const slots = Object.keys(COORDS).map((code) => {
      const state = best && code === best ? "pm-best" : capable.includes(code) ? "pm-capable" : "pm-empty";
      const point = COORDS[code];
      const radius = state === "pm-best" ? 10 : state === "pm-capable" ? 9 : 8;
      return `<g class="pm-slot ${state}" data-pos="${code}" role="button" tabindex="0" aria-label="${esc(code)}"><circle cx="${point.x}" cy="${point.y}" r="${radius}" /><text x="${point.x}" y="${point.y}" dy="3">${esc(code)}</text></g>`;
    }).join("");
    return `<svg class="position-map editable" viewBox="0 0 200 300">
      <g class="pm-lines">${pitchOutline()}</g>${slots}
    </svg>`;
  }

  const api = { COORDS, known, svg, editable };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.YCACPositionMap = api;
})();
