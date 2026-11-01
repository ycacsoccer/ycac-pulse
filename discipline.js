/* League and team-reported yellow-card ledger. Every third booking earns one
   ban in the next league game, not a friendly. Team reports remain provisional;
   only published cards can independently trigger a squad restriction. */
(() => {
  const norm = (value) => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const seasonOf = (date) => Number(String(date).slice(0, 4)) - (Number(String(date).slice(5, 7)) < 8 ? 1 : 0);
  const keyOf = (row) => `${row.date}|${norm(row.home)}|${norm(row.away)}`;

  function ledger(feed, { club = "YCAC Pulse", date, upcoming = false, matches = [], players: roster = [], reports = [], today = date } = {}) {
    const season = seasonOf(date);
    const involves = (row) => norm(row.home) === norm(club) || norm(row.away) === norm(club);
    const results = [...new Map((feed.results || []).filter((row) => involves(row) && seasonOf(row.date) === season && row.date <= today).map((row) => [keyOf(row), row])).values()];
    const dbGames = norm(club) === norm("YCAC Pulse") ? matches.filter((row) => row.competition === feed.competition).map((row) => ({
      id: row.id, date: row.date, home: row.home_away === "away" ? row.opponent : club, away: row.home_away === "away" ? club : row.opponent,
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
    // Only exact, unique roster names establish an identity. In particular,
    // never guess a league full name from a player's nickname or ID.
    const rosterById = new Map(roster.map((player) => [player.id, player]));
    const nameIds = new Map();
    for (const player of roster) {
      for (const name of [player.display_name, player.display_name_full].filter(Boolean)) {
        const nameKey = norm(name);
        if (!nameKey) continue;
        if (!nameIds.has(nameKey)) nameIds.set(nameKey, new Set());
        nameIds.get(nameKey).add(player.id);
      }
    }
    const uniqueId = (name) => {
      const ids = nameIds.get(norm(name));
      return ids?.size === 1 ? [...ids][0] : null;
    };
    const sameFixture = (a, b) => a.date === b.date && norm(opponentOf(a)) === norm(opponentOf(b));
    const localIdFor = (game) => {
      const local = dbGames.filter((row) => sameFixture(row, game));
      const published = results.filter((row) => sameFixture(row, game));
      return local.length === 1 && published.length === 1 ? local[0].id : null;
    };
    const cards = [];
    for (const game of results.sort((a, b) => a.date.localeCompare(b.date))) {
      if (game.date > date || (upcoming && game.date === date)) continue;
      const side = norm(game.home) === norm(club) ? "home" : "away";
      for (const name of (game.yellowCards && game.yellowCards[side]) || []) {
        if (!norm(name)) continue;
        cards.push({ name, playerId: uniqueId(name), date: game.date, opponent: opponentOf(game), matchId: localIdFor(game), source: "league" });
      }
    }

    // A published card replaces at most one reported card for the same
    // uniquely identified player and match; preserve any other yellow cards.
    const publishedByMatch = new Map();
    for (const card of cards) {
      if (!card.matchId || !card.playerId) continue;
      const key = JSON.stringify([card.matchId, card.playerId]);
      publishedByMatch.set(key, (publishedByMatch.get(key) || 0) + 1);
    }
    const seenReports = new Set();
    if (norm(club) === norm("YCAC Pulse")) for (const report of reports) {
      if (!report.id || !report.match_id || !report.player_id || seenReports.has(report.id)) continue;
      seenReports.add(report.id);
      const game = dbGames.find((row) => row.id === report.match_id);
      if (!game || seasonOf(game.date) !== season || game.date > today || game.date > date || (upcoming && game.date === date)) continue;
      const key = JSON.stringify([report.match_id, report.player_id]);
      const publishedCount = publishedByMatch.get(key) || 0;
      if (publishedCount) { publishedByMatch.set(key, publishedCount - 1); continue; }
      const rosterPlayer = rosterById.get(report.player_id);
      cards.push({ name: rosterPlayer?.display_name || report.player_id, playerId: report.player_id,
        date: game.date, opponent: opponentOf(game), matchId: report.match_id, source: "team" });
    }

    const grouped = new Map();
    for (const card of cards.sort((a, b) => a.date.localeCompare(b.date))) {
      const key = card.playerId ? `id:${card.playerId}` : `name:${norm(card.name)}`;
      if (!grouped.has(key)) grouped.set(key, { name: rosterById.get(card.playerId)?.display_name || card.name, playerId: card.playerId, history: [] });
      grouped.get(key).history.push(card);
    }
    const bansFor = (history, provisional) => history.flatMap((card, index) => {
      if ((index + 1) % 3 !== 0) return [];
      if (provisional && !history.slice(0, index + 1).some((item) => item.source === "team")) return [];
      const next = games.find((row) => row.date > card.date);
      return [{ earned: card.date, date: next?.date || null, opponent: next ? opponentOf(next) : null,
        served: Boolean(next && played.has(keyOf(next)) && (upcoming ? next.date < date : next.date <= date)), provisional }];
    });
    return [...grouped.values()].map((player) => {
      const published = player.history.filter((card) => card.source === "league");
      const officialBans = bansFor(published, false);
      const projected = bansFor(player.history, true).filter((ban) => !officialBans.some((officialBan) => officialBan.earned === ban.earned && officialBan.date === ban.date));
      const suspensions = officialBans.concat(projected).sort((a, b) => a.earned.localeCompare(b.earned));
      return { ...player, total: player.history.length, publishedTotal: published.length, reportedTotal: player.history.length - published.length,
        cycle: player.history.length % 3, suspensions,
        suspended: officialBans.some((ban) => ban.date === date), pending: officialBans.some((ban) => !ban.date),
        provisionalSuspended: projected.some((ban) => ban.date === date),
        provisionalPending: projected.some((ban) => !ban.served && (!ban.date || ban.date > date)) };
    }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }
  const api = { norm, seasonOf, ledger };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.YCACDiscipline = api;
})();
