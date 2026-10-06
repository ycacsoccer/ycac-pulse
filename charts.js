/* YC&AC Pulse — performance charts (revamp waves 14 + 17).
   Hand-rolled SVG, no chart library: a DIVERGING bar chart — goals FOR rise
   above the zero line (positive, navy), goals AGAINST hang below it (negative,
   red) — with a W-D-L result chip and the score above each column, date +
   opponent underneath. Also kpis(): per-competition rate stats (goals per
   game, win rate, attendance per game). Pure functions so verify-index can
   render them under Node against the live data. */
(() => {
  const W = 680, H = 340, PAD_L = 34, PAD_R = 10;
  const CHIP_Y = 14, SCORE_Y = 56;
  const ZERO = 180;    // the baseline: goals for above it, goals against below
  const UP_MAX = 104;  // pixel budget each way, so +N and -N are the same scale
  const DOWN_MAX = UP_MAX;
  const DATE_Y = 304, OPP_Y = 322;

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

  /* Per-competition rate stats for the KPI strip (wave 17).
     `appearances` (optional) = the appearance rows for these matches only;
     played/match gives the average squad out per game ("attendance per game"). */
  function kpis(matches, opts = {}) {
    const rows = series(matches);
    const appearances = opts.appearances || [];
    const played = rows.length;
    const gf = rows.reduce((total, row) => total + row.gf, 0);
    const ga = rows.reduce((total, row) => total + row.ga, 0);
    const wins = rows.filter((row) => row.result === "W").length;
    const draws = rows.filter((row) => row.result === "D").length;
    return {
      played, gf, ga,
      gfPerGame: played ? gf / played : null,
      gaPerGame: played ? ga / played : null,
      wins, draws, losses: played - wins - draws,
      winPct: played ? Math.round((wins / played) * 100) : null,
      appsPerGame: played ? appearances.length / played : null,
    };
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
    const yUp = (value) => ZERO - (value / top) * UP_MAX;     // positive: above the line
    const yDown = (value) => ZERO + (value / top) * DOWN_MAX; // negative: below the line

    const gridlines = [];
    for (let value = 0; value <= top; value += step) {
      const y = yUp(value);
      gridlines.push(`<line class="tv-grid" x1="${PAD_L}" y1="${y}" x2="${W - PAD_R}" y2="${y}" /><text class="tv-tick" x="${PAD_L - 6}" y="${y + 3}">${value === 0 ? "0" : `+${value}`}</text>`);
      if (value > 0) {
        const yNeg = yDown(value);
        gridlines.push(`<line class="tv-grid" x1="${PAD_L}" y1="${yNeg}" x2="${W - PAD_R}" y2="${yNeg}" /><text class="tv-tick" x="${PAD_L - 6}" y="${yNeg + 3}">-${value}</text>`);
      }
    }

    const columns = rows.map((row, index) => {
      const cx = PAD_L + colW * (index + 0.5);
      const barW = Math.min(26, colW * 0.3);
      const hFor = (row.gf / top) * UP_MAX;
      const hAgainst = (row.ga / top) * DOWN_MAX;
      const chipText = esc((labels.result && labels.result[row.result]) || row.result);
      const dateText = esc(labels.dateFmt ? labels.dateFmt(row.date) : row.date);
      return `<g class="tv-col">
        <rect class="tv-bar tv-for" x="${cx - barW - 2}" y="${ZERO - hFor}" width="${barW}" height="${hFor}" rx="2" />
        <rect class="tv-bar tv-against" x="${cx + 2}" y="${ZERO}" width="${barW}" height="${hAgainst}" rx="2" />
        <g class="tv-chip tv-chip-${row.result.toLowerCase()}"><rect x="${cx - 15}" y="${CHIP_Y}" width="30" height="20" rx="10" /><text x="${cx}" y="${CHIP_Y + 14}">${chipText}</text></g>
        <text class="tv-score" x="${cx}" y="${SCORE_Y}">${row.gf}–${row.ga}</text>
        <text class="tv-date" x="${cx}" y="${DATE_Y}">${dateText}</text>
        <text class="tv-opp" x="${cx}" y="${OPP_Y}">${esc(truncate(row.opponent, maxOppChars))}</text>
      </g>`;
    }).join("");

    return `<svg class="trend-svg" viewBox="0 0 ${W} ${H}" role="img" aria-hidden="true" focusable="false">
      <g class="tv-axis">${gridlines.join("")}</g>
      <line class="tv-baseline" x1="${PAD_L}" y1="${ZERO}" x2="${W - PAD_R}" y2="${ZERO}" />
      ${columns}
    </svg>`;
  }

  const api = { resultOf, series, stepFor, kpis, trendSVG, ZERO };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.YCACCharts = api;
})();
