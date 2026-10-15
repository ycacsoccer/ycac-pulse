/* YC&AC Pulse — pre-match forecast engine (wave 30).
   Pure data in / data out: no DOM, no network — unit tested in
   tests/unit/forecast.test.cjs, rendered by match.js for upcoming fixtures.
   It combines the three honest public sources:
     · standings.js    — the hand-maintained league table (rank + rates)
     · recorded finals — our form, season rate stats, goals
     · head-to-head    — every past meeting against this opponent
   The probability card is a small Poisson score grid over expected goals:
   league-table rates first (largest sample), falling back to head-to-head
   averages; with neither, no forecast is offered — just the season numbers. */
const YCACForecast = (() => {
  const outcomeOf = (match) => {
    const us = Number(match.ycac_goals), them = Number(match.opponent_goals);
    return us > them ? "win" : us < them ? "loss" : "draw";
  };
  // "Corinthians Harbour F.C." and "corinthians harbour fc" are the same club.
  const normName = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const bucketOf = (competition) => (/friendly/i.test(competition || "") ? "friendly" : /tml/i.test(competition || "") ? "tml" : "other");
  const round1 = (value) => Math.round(value * 10) / 10;

  function recordOf(list) {
    const record = { played: list.length, w: 0, d: 0, l: 0, gf: 0, ga: 0, cleanSheets: 0 };
    list.forEach((match) => {
      const outcome = outcomeOf(match);
      record[outcome === "win" ? "w" : outcome === "draw" ? "d" : "l"] += 1;
      record.gf += Number(match.ycac_goals) || 0;
      record.ga += Number(match.opponent_goals) || 0;
      if (Number(match.opponent_goals) === 0) record.cleanSheets += 1;
    });
    return record;
  }

  const factorial = (n) => { let value = 1; for (let i = 2; i <= n; i += 1) value *= i; return value; };
  const poisson = (goals, lambda) => (Math.exp(-lambda) * lambda ** goals) / factorial(goals);

  /* Score grid 0–8 per side → win/draw/loss shares + the most likely score. */
  function scoreGrid(lambdaUs, lambdaThem) {
    const grid = { win: 0, draw: 0, loss: 0, projected: { us: 0, them: 0 }, best: -1 };
    for (let us = 0; us <= 8; us += 1) {
      for (let them = 0; them <= 8; them += 1) {
        const p = poisson(us, lambdaUs) * poisson(them, lambdaThem);
        if (us > them) grid.win += p;
        else if (us === them) grid.draw += p;
        else grid.loss += p;
        if (p > grid.best) { grid.best = p; grid.projected = { us, them }; }
      }
    }
    delete grid.best;
    return grid;
  }

  function topScorerIn(goals, matchIds) {
    const counts = new Map();
    goals.forEach((goal) => {
      if (matchIds.has(goal.match_id)) counts.set(goal.scorer_id, (counts.get(goal.scorer_id) || 0) + 1);
    });
    const [playerId, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || [];
    return count ? { playerId, count } : null;
  }

  function build({ match, finals = [], standingsRows = [], goals = [] }) {
    const bucket = bucketOf(match.competition);
    const byDate = (a, b) => String(a.date).localeCompare(String(b.date));

    const sameCompetition = finals.filter((row) => bucketOf(row.competition) === bucket).sort(byDate);
    const ourFinals = sameCompetition.length ? sameCompetition : [...finals].sort(byDate);
    const h2h = finals.filter((row) => normName(row.opponent) === normName(match.opponent)).sort(byDate).reverse();

    const ourRowIndex = standingsRows.findIndex((row) => row.us);
    const themRowIndex = standingsRows.findIndex((row) => normName(row.team) === normName(match.opponent));
    const table = ourRowIndex > -1 && themRowIndex > -1
      ? { us: { row: standingsRows[ourRowIndex], pos: ourRowIndex + 1 }, them: { row: standingsRows[themRowIndex], pos: themRowIndex + 1 } }
      : null;

    const record = recordOf(ourFinals);
    const stats = {
      played: record.played, w: record.w, d: record.d, l: record.l, gf: record.gf, ga: record.ga,
      gfPerGame: record.played ? round1(record.gf / record.played) : 0,
      gaPerGame: record.played ? round1(record.ga / record.played) : 0,
      cleanSheets: record.cleanSheets,
      winPct: record.played ? Math.round((record.w / record.played) * 100) : null,
    };
    const form = ourFinals.slice(-5).map((row) => ({
      date: row.date, opponent: row.opponent, venue: row.venue,
      gf: Number(row.ycac_goals), ga: Number(row.opponent_goals), outcome: outcomeOf(row),
    }));

    // Expected goals: league rates first (largest sample), then head-to-head.
    let lambdas = null;
    if (table) {
      const us = table.us.row, them = table.them.row;
      const pUs = Number(us.p) || 1, pThem = Number(them.p) || 1;
      lambdas = {
        us: (Number(us.gf) / pUs + Number(them.ga) / pThem) / 2,
        them: (Number(them.gf) / pThem + Number(us.ga) / pUs) / 2,
      };
    } else if (h2h.length) {
      lambdas = {
        us: h2h.reduce((sum, row) => sum + (Number(row.ycac_goals) || 0), 0) / h2h.length,
        them: h2h.reduce((sum, row) => sum + (Number(row.opponent_goals) || 0), 0) / h2h.length,
      };
    }

    let probs = null, edge = null;
    if (lambdas && Number.isFinite(lambdas.us) && Number.isFinite(lambdas.them)) {
      probs = scoreGrid(lambdas.us, lambdas.them);
      const { win, draw, loss } = probs;
      edge = (draw >= win && draw >= loss) || Math.abs(win - loss) < 0.1 ? "even" : win > loss ? "us" : "them";
    }

    return {
      bucket,
      table,
      stats,
      form,
      h2h: { rows: h2h.slice(0, 5), record: recordOf(h2h) },
      lambdas: probs ? { us: round1(lambdas.us), them: round1(lambdas.them) } : null,
      probs,
      edge,
      topScorer: topScorerIn(goals, new Set(ourFinals.map((row) => row.id))),
      h2hScorer: topScorerIn(goals, new Set(h2h.map((row) => row.id))),
    };
  }

  return { build, outcomeOf, normName, bucketOf };
})();
if (typeof module !== "undefined" && module.exports) module.exports = YCACForecast;
if (typeof window !== "undefined") window.YCACForecast = YCACForecast;
