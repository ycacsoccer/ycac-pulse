/* YC&AC Pulse — TML Division 3 standings (wave 25).
   The league table is maintained BY HAND from the competition's published
   table (footyjapancompetitions.com): our own results live in Supabase, but
   the cross-fixtures that produce the table do not, so a shipped data file is
   the honest source. Update `rows` whenever the league publishes a new round,
   keeping the published order — points first, then goal difference. Goal
   difference is never stored: the renderer derives gf − ga so it cannot drift.
   The club row carries `us: true` and renders highlighted on the index. */
(() => {
  const standings = {
    competition: "TML Division 3",
    updated: "2026-10-07",
    rows: [
      { team: "BFC Tokyo", p: 4, w: 4, d: 0, l: 0, gf: 17, ga: 4, pts: 12 },
      { team: "Corinthians Harbour FC", p: 4, w: 3, d: 0, l: 1, gf: 18, ga: 8, pts: 9 },
      { team: "F. Lions FC", p: 5, w: 2, d: 2, l: 1, gf: 21, ga: 12, pts: 8 },
      { team: "YCAC Pulse", p: 4, w: 2, d: 0, l: 2, gf: 14, ga: 9, pts: 6, us: true },
      { team: "Jetro FC", p: 4, w: 2, d: 0, l: 2, gf: 8, ga: 9, pts: 6 },
      { team: "Votty SC", p: 3, w: 1, d: 1, l: 1, gf: 5, ga: 7, pts: 4 },
      { team: "Inter Tokyo FC", p: 4, w: 1, d: 1, l: 2, gf: 6, ga: 9, pts: 4 },
      { team: "Kilimanjaro FC", p: 4, w: 1, d: 1, l: 2, gf: 7, ga: 17, pts: 4 },
      { team: "Saitama JETS FC", p: 3, w: 0, d: 1, l: 2, gf: 7, ga: 9, pts: 1 },
      { team: "Albion Old Boys FC", p: 3, w: 0, d: 0, l: 3, gf: 5, ga: 24, pts: 0 },
    ],
  };
  if (typeof module !== "undefined" && module.exports) module.exports = standings;
  if (typeof window !== "undefined") window.YCACStandings = standings;
})();
