/* YC&AC Pulse — shared season metrics engine.
   Pure data in / data out: no DOM, no network. Loaded by every page via
   <script src="stats.js"> and by verify-stats.cjs in Node.

   Everything is reported per competition (tml / friendly / all) because the
   league squad and the friendly squad are genuinely different groups. */

const YCACStats = (() => {
  const POSITION_GROUPS = { GK: "GK", CB: "DF", LB: "DF", RB: "DF", LWB: "DF", RWB: "DF", DM: "MF", CM: "MF", AM: "MF", AMC: "MF", AMF: "MF", LW: "AT", RW: "AT", ST: "AT", CF: "AT", FW: "AT" };
  const POSITION_ORDER = { GK: 0, DF: 1, MF: 2, AT: 3, Other: 4 };

  // Squad tiers are derived from participation. Tune these here — the UI just renders what it's given.
  // Core is decided by TML matches alone (decision: TML-first revamp) — skipping friendlies
  // never demotes a player who turns up for the league.
  const TIER_RULES = {
    core: { tml: 67 },                 // >= 67% of TML matches
    rotation: { tml: 33, overall: 50 }, // >= 33% of TML matches OR >= 50% overall
    // any appearance below that = "depth"; no appearances = "inactive"
  };

  // Single sortable number for "how much can I rely on this player?", TML weighted by design.
  const RELIABILITY_WEIGHTS = { tml: 0.6, friendly: 0.4 };
  const TIER_ORDER = ["core", "rotation", "depth", "inactive"];
  const DECLINED_STATES = ["declined", "out", "unavailable"];

  const positionGroup = (position) => POSITION_GROUPS[position] || "Other";
  const percent = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : null);
  const isFinal = (match) => match.ycac_goals !== "" && match.ycac_goals != null && match.opponent_goals !== "" && match.opponent_goals != null;
  const competitionBucket = (competition) => /friendly/i.test(competition || "") ? "friendly" : /tml/i.test(competition || "") ? "tml" : "other";

  /* Participation / output for one player across one list of played matches.
     Row keys differ by source: sheet rows carry `player_id`, Supabase rows `id`. */
  function summarize(player, matchList, apps, goalRows, signupRows) {
    const playerId = player.player_id ?? player.id;
    const matchKey = (match) => match.match_id ?? match.id; // sheet rows key on match_id, Supabase rows on id
    const matchIds = new Set(matchList.map(matchKey));
    const matchById = new Map(matchList.map((match) => [matchKey(match), match]));
    const mine = apps.filter((app) => app.player_id === playerId && matchIds.has(app.match_id));
    const playedIds = new Set(mine.map((app) => app.match_id));
    const starts = mine.filter((app) => app.role === "starter").length;
    const isKeeper = positionGroup(player.primary_position) === "GK";

    const dates = mine.map((app) => matchById.get(app.match_id)?.date).filter(Boolean).sort();
    let currentRun = 0;
    for (let index = matchList.length - 1; index >= 0; index -= 1) {
      if (playedIds.has(matchKey(matchList[index]))) currentRun += 1;
      else break;
    }

    const responded = signupRows.filter((signup) => signup.player_id === playerId && matchIds.has(signup.match_id));
    const declined = responded.filter((signup) => DECLINED_STATES.includes(String(signup.status).toLowerCase())).length;
    const confirmed = responded.filter((signup) => signup.status === "confirmed").length;

    return {
      played: mine.length,
      starts,
      subs: mine.length - starts,
      appearance_pct: percent(mine.length, matchList.length),
      goals: goalRows.filter((goal) => matchIds.has(goal.match_id) && goal.scorer_id === playerId).length,
      assists: goalRows.filter((goal) => matchIds.has(goal.match_id) && goal.assist_id === playerId).length,
      clean_sheets: isKeeper ? mine.filter((app) => app.role === "starter" && Number(matchById.get(app.match_id)?.opponent_goals) === 0).length : 0,
      last_appearance: dates.length ? dates[dates.length - 1] : null,
      current_run: currentRun,
      signups: { confirmed, declined, confirmed_but_missed: responded.filter((signup) => signup.status === "confirmed" && !playedIds.has(signup.match_id)).length },
    };
  }

  function reliabilityOf(entry) {
    const tml = entry.competitions.tml.appearance_pct;
    const friendly = entry.competitions.friendly.appearance_pct;
    if (tml == null && friendly == null) return null;
    if (tml == null) return friendly;
    if (friendly == null) return tml;
    return Math.round(RELIABILITY_WEIGHTS.tml * tml + RELIABILITY_WEIGHTS.friendly * friendly);
  }

  function tierOf(entry, override) {
    if (override && TIER_ORDER.includes(override)) return override;
    const overall = entry.competitions.all;
    const tml = entry.competitions.tml;
    if (overall.played === 0) return "inactive";
    if (tml.appearance_pct != null && tml.appearance_pct >= TIER_RULES.core.tml) return "core";
    if ((tml.appearance_pct ?? 0) >= TIER_RULES.rotation.tml || (overall.appearance_pct ?? 0) >= TIER_RULES.rotation.overall) return "rotation";
    return "depth";
  }

  /* One pass over the raw rows for every page to share.
     `statusOverrides` comes from the coach-only coach_notes table, so public
     pages simply omit it and get fully derived tiers. */
  function computeSeason({ players, matches, appearances, goals, signups = [], statusOverrides = {} }) {
    const finals = matches.filter(isFinal).sort((a, b) => a.date.localeCompare(b.date));
    const fixtures = matches.filter((match) => !isFinal(match)).sort((a, b) => a.date.localeCompare(b.date));
    const buckets = { tml: [], friendly: [], other: [], all: finals };
    finals.forEach((match) => buckets[competitionBucket(match.competition)].push(match));

    const entries = players.filter((player) => player.active !== false).map((player) => {
      const competitions = Object.fromEntries(Object.entries(buckets).map(([name, list]) => [name, summarize(player, list, appearances, goals, signups)]));
      const entry = {
        ...player,
        position_group: positionGroup(player.primary_position),
        competitions,
        reliability: null,
        tier: "inactive",
      };
      entry.reliability = reliabilityOf(entry);
      entry.tier = tierOf(entry, statusOverrides[player.id]?.squad_status);
      return entry;
    });

    const tiers = Object.fromEntries(TIER_ORDER.map((tier) => [tier, entries.filter((entry) => entry.tier === tier)]));

    return {
      buckets,
      fixtures,
      players: entries,
      tiers,
      counts: {
        players: entries.length,
        used: entries.filter((entry) => entry.competitions.all.played > 0).length,
        matches: { tml: buckets.tml.length, friendly: buckets.friendly.length, other: buckets.other.length, all: finals.length, upcoming: fixtures.length },
      },
    };
  }

  // Core/rotation first, then reliability, then name — the board's default order.
  function ranked(entries) {
    return [...entries].sort((a, b) =>
      TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) ||
      (b.reliability ?? -1) - (a.reliability ?? -1) ||
      a.display_name.localeCompare(b.display_name));
  }

  // How many reliable players do we have per position, for the coverage matrix?
  function coverage(entries) {
    const groups = ["GK", "DF", "MF", "AT", "Other"];
    return Object.fromEntries(groups.map((group) => [group, Object.fromEntries(TIER_ORDER.map((tier) => [tier, entries.filter((entry) => entry.position_group === group && entry.tier === tier)]))]));
  }

  return { POSITION_GROUPS, POSITION_ORDER, TIER_RULES, RELIABILITY_WEIGHTS, TIER_ORDER, positionGroup, isFinal, summarize, computeSeason, ranked, coverage };
})();

if (typeof window !== "undefined") window.YCACStats = YCACStats;
if (typeof module !== "undefined" && module.exports) module.exports = YCACStats;
