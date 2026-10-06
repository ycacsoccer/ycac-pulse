/* YC&AC Pulse — performance trend chart (revamp wave 14).
   Hand-rolled SVG, no chart library: paired bars (goals for / goals against)
   along the fixture timeline, a W-D-L result chip and the score above each
   column, date + opponent below the axis. Pure functions so verify-index can
   render it under Node against the live data. */
(() => {
  const W = 680, H = 300, PAD_L = 30, PAD_R = 10, TOP = 64, BASE = 236;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

  function resultOf(match) {
    const gf = Number(match.ycac_goals), ga = Number(match.opponent_goals);
    return gf > ga ? "W" : gf === ga ? "D" : "L";
  }

  /* Final matches only, oldest → newest, reduced to what the chart plots. */
  function series(matches) {
    return (matches || [])
      .filter((match) => match.ycac_goals != null && match.opponent_goals != null)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map((match) => ({
        date: match.date,
        opponent: match.opponent || "",
        gf: Number(match.ycac_goals),
        ga: Number(match.opponent_goals),
        result: resultOf(match),
      }));
  }

  /* Gridline step: at most ~5 lines whatever the scale (12-0 friendlies happen). */
  function stepFor(max) {
    return [1, 2, 4, 5, 10, 20].find((step) => max / step <= 5) || 20;
  }

  function truncate(text, max) {
    const value = String(text || "");
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
  }

  /* trendSVG(matches, opts) → the <svg> markup. opts:
       labels.dateFmt   (date) => string
       labels.result    { W, D, L } localized chip text
       maxOppChars      opponent label truncation (default 16) */
  function trendSVG(matches, opts = {}) {
    const rows = series(matches);
    if (!rows.length) return "";
    const labels = opts.labels || {};
    const maxOppChars = opts.maxOppChars || 16;
    const max = Math.max(1, ...rows.flatMap((row) => [row.gf, row.ga]));
    const step = stepFor(max);
    const top = Math.ceil(max / step) * step;
    const plotW = W - PAD_L - PAD_R;
    const colW = plotW / rows.length;
    const barMax = BASE - TOP;
    const y = (value) => BASE - (value / top) * barMax;

    const gridlines = [];
    for (let value = 0; value <= top; value += step) {
      gridlines.push(`<line class="tv-grid" x1="${PAD_L}" y1="${y(value)}" x2="${W - PAD_R}" y2="${y(value)}" /><text class="tv-tick" x="${PAD_L - 6}" y="${y(value) + 3}">${value}</text>`);
    }

    const columns = rows.map((row, index) => {
      const cx = PAD_L + colW * (index + 0.5);
      const barW = Math.min(26, colW * 0.3);
      const chipText = esc((labels.result && labels.result[row.result]) || row.result);
      const dateText = esc(labels.dateFmt ? labels.dateFmt(row.date) : row.date);
      return `<g class="tv-col">
        <rect class="tv-bar tv-for" x="${cx - barW - 2}" y="${y(row.gf)}" width="${barW}" height="${BASE - y(row.gf)}" rx="2" />
        <rect class="tv-bar tv-against" x="${cx + 2}" y="${y(row.ga)}" width="${barW}" height="${BASE - y(row.ga)}" rx="2" />
        <g class="tv-chip tv-chip-${row.result.toLowerCase()}"><rect x="${cx - 15}" y="14" width="30" height="20" rx="10" /><text x="${cx}" y="28">${chipText}</text></g>
        <text class="tv-score" x="${cx}" y="54">${row.gf}–${row.ga}</text>
        <text class="tv-date" x="${cx}" y="${BASE + 20}">${dateText}</text>
        <text class="tv-opp" x="${cx}" y="${BASE + 36}">${esc(truncate(row.opponent, maxOppChars))}</text>
      </g>`;
    }).join("");

    return `<svg class="trend-svg" viewBox="0 0 ${W} ${H}" role="img" aria-hidden="true" focusable="false">
      <g class="tv-axis">${gridlines.join("")}</g>
      <line class="tv-baseline" x1="${PAD_L}" y1="${BASE}" x2="${W - PAD_R}" y2="${BASE}" />
      ${columns}
    </svg>`;
  }

  const api = { resultOf, series, stepFor, trendSVG };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.YCACCharts = api;
})();
