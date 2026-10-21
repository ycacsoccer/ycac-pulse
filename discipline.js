/* Published league yellow-card ledger. Every third booking earns one ban in
   the next league game, not a friendly. Future allocations are projections;
   only a completed league result counts as a served ban. Seasons start in August. */
(() => {
  const norm = (value) => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const seasonOf = (date) => Number(String(date).slice(0, 4)) - (Number(String(date).slice(5, 7)) < 8 ? 1 : 0);
  const keyOf = (row) => `${row.date}|${norm(row.home)}|${norm(row.away)}`;

  function ledger(feed, { club = "YCAC Pulse", date, upcoming = false, matches = [], today = date } = {}) {
    const season = seasonOf(date);
    const involves = (row) => norm(row.home) === norm(club) || norm(row.away) === norm(club);
    const results = [...new Map((feed.results || []).filter((row) => involves(row) && seasonOf(row.date) === season && row.date <= today).map((row) => [keyOf(row), row])).values()];
    const dbGames = norm(club) === norm("YCAC Pulse") ? matches.filter((row) => row.competition === feed.competition).map((row) => ({
      date: row.date, home: row.home_away === "away" ? row.opponent : club, away: row.home_away === "away" ? club : row.opponent,
      final: row.ycac_goals != null && row.opponent_goals != null,
    })) : [];
    const completed = dbGames.filter((row) => row.final && row.date <= today);
    const played = new Set(results.concat(completed).map(keyOf));
    const official = (feed.fixtures || []).filter((row) => involves(row) && row.date >= today && seasonOf(row.date) === season);
    const opponentOf = (row) => norm(row.home) === norm(club) ? row.away : row.home;
    // The published schedule wins over a stale local date after a reschedule.
    // Local games supplement opponents for whom no official fixture exists.
    const publishedOpponents = new Set(official.map((row) => norm(opponentOf(row))));
    const scheduled = official.concat(dbGames.filter((row) => !row.final && !publishedOpponents.has(norm(opponentOf(row)))));
    // A past unplayed listing cannot serve a suspension. Deduplicate the
    // database/feed overlap, and prefer actual results over stale fixtures.
    const games = [...new Map(completed.concat(results, scheduled.filter((row) => row.date >= today && !played.has(keyOf(row))))
      .filter((row) => seasonOf(row.date) === season).map((row) => [keyOf(row), row])).values()]
      .sort((a, b) => a.date.localeCompare(b.date) || keyOf(a).localeCompare(keyOf(b)));
    const players = new Map();
    for (const game of results.sort((a, b) => a.date.localeCompare(b.date))) {
      if (game.date > date || (upcoming && game.date === date)) continue;
      const side = norm(game.home) === norm(club) ? "home" : "away";
      for (const name of (game.yellowCards && game.yellowCards[side]) || []) {
        const id = norm(name);
        if (!players.has(id)) players.set(id, { name, total: 0, cycle: 0, history: [], suspensions: [] });
        const player = players.get(id);
        player.total++;
        player.history.push({ date: game.date, opponent: side === "home" ? game.away : game.home });
        if (player.total % 3 === 0) {
          const next = games.find((row) => row.date > game.date);
          player.suspensions.push({ earned: game.date, date: next?.date || null, opponent: next ? (norm(next.home) === norm(club) ? next.away : next.home) : null, served: Boolean(next && played.has(keyOf(next)) && (upcoming ? next.date < date : next.date <= date)) });
        }
      }
    }
    return [...players.values()].map((player) => ({ ...player, cycle: player.total % 3,
      suspended: player.suspensions.some((ban) => ban.date === date),
      pending: player.suspensions.some((ban) => !ban.date),
    })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }
  const api = { norm, seasonOf, ledger };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.YCACDiscipline = api;
})();
