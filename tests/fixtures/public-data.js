/* Deterministic Supabase rows for the mocked E2E suite (tests/e2e/mocks.js).
   Small but complete: every renderer path is exercised — TML vs friendly
   split, an upcoming fixture, a core/rotation/depth/inactive spread, GK clean
   sheets, a player with absences, goals in BOTH competitions (TML/FND badge
   check) and a current injury. Nothing here touches the network. */

const players = [
  { id: "p-ada", display_name: "Ada Sato", primary_position: "GK", shirt_number: 1, age_band: "17-20", photo_path: null, active: true, secondary_positions: [] },
  { id: "p-ben", display_name: "Ben Miller", primary_position: "CB", shirt_number: 4, age_band: "20s", photo_path: null, active: true, secondary_positions: ["RB", "LB"] },
  { id: "p-chr", display_name: "Chris Ito", primary_position: "CM", shirt_number: 8, age_band: "30s", photo_path: null, active: true, secondary_positions: ["DM"] },
  { id: "p-dan", display_name: "Dana Park", primary_position: "LW", shirt_number: 7, age_band: "30s", photo_path: null, active: true, secondary_positions: ["ST"] },
  { id: "p-evn", display_name: "Evan Cole", primary_position: "ST", shirt_number: 9, age_band: "40s", photo_path: null, active: true, secondary_positions: ["LW"] },
  // inactive: must not appear in the grid or the squad chips
  { id: "p-fum", display_name: "Fumi Sato", primary_position: "RW", shirt_number: 11, age_band: "50s", photo_path: null, active: false, secondary_positions: ["ST"] },
];

const matches = [
  // 4 TML finals → record 2–1–1, 7 for / 1 against… (m3 is the loss)
  { id: "m1", date: "2026-03-07", competition: "TML Division 3", opponent: "Rovers AFC", venue: "Home", ycac_goals: 2, opponent_goals: 0, kickoff: "14:00", standard_signup_url: null, priority_signup_url: null },
  { id: "m2", date: "2026-03-21", competition: "TML Division 3", opponent: "Lakeside Utd", venue: "Away", ycac_goals: 1, opponent_goals: 1, kickoff: "15:30", standard_signup_url: "https://example.test/signup/standard", priority_signup_url: null },
  { id: "m3", date: "2026-04-11", competition: "TML Division 3", opponent: "Hilltop FC", venue: "Home", ycac_goals: 0, opponent_goals: 3, kickoff: null, standard_signup_url: null, priority_signup_url: null },
  { id: "m4", date: "2026-05-02", competition: "TML Division 3", opponent: "Comets SC", venue: "Away", ycac_goals: 4, opponent_goals: 1, kickoff: "13:00", standard_signup_url: null, priority_signup_url: "https://example.test/signup/priority" },
  // 3 friendly finals → 1–1–1
  { id: "f1", date: "2026-02-14", competition: "Friendly Match", opponent: "Blades XI", venue: "Home", ycac_goals: 3, opponent_goals: 2, kickoff: null, standard_signup_url: null, priority_signup_url: null },
  { id: "f2", date: "2026-02-28", competition: "Friendly Match", opponent: "Harriers", venue: "Away", ycac_goals: 0, opponent_goals: 0, kickoff: null, standard_signup_url: null, priority_signup_url: null },
  { id: "f3", date: "2026-04-25", competition: "Friendly Match", opponent: "Nomads", venue: "Home", ycac_goals: 1, opponent_goals: 2, kickoff: null, standard_signup_url: null, priority_signup_url: null },
  // 1 upcoming fixture (null scores → not a final)
  { id: "x1", date: "2026-06-06", competition: "TML Division 3", opponent: "Titans FC", venue: "Home", ycac_goals: null, opponent_goals: null, kickoff: "14:00", standard_signup_url: "https://example.test/signup/standard", priority_signup_url: null },
];

const A = (match_id, player_id, role) => ({ id: `${match_id}:${player_id}`, match_id, player_id, role });
const appearances = [
  // Ada (GK): every match → 100% TML, two clean sheets (m1, f2)
  A("m1", "p-ada", "starter"), A("m2", "p-ada", "starter"), A("m3", "p-ada", "starter"), A("m4", "p-ada", "starter"),
  A("f1", "p-ada", "starter"), A("f2", "p-ada", "starter"), A("f3", "p-ada", "starter"),
  // Ben: 3/4 TML (75% → core), missed m3
  A("m1", "p-ben", "starter"), A("m2", "p-ben", "starter"), A("m4", "p-ben", "starter"),
  A("f1", "p-ben", "starter"), A("f2", "p-ben", "sub"),
  // Chris: 4/4 TML (100% → core), came on as a sub in f1/f3
  A("m1", "p-chr", "starter"), A("m2", "p-chr", "starter"), A("m3", "p-chr", "starter"), A("m4", "p-chr", "starter"),
  A("f1", "p-chr", "sub"), A("f3", "p-chr", "sub"),
  // Dana: 1/4 TML (25%) but 4/7 overall (57% → rotation)
  A("m4", "p-dan", "sub"), A("f1", "p-dan", "starter"), A("f2", "p-dan", "starter"), A("f3", "p-dan", "starter"),
  // Evan: 1/4 TML + 1/7 overall (29% → depth), absent from 5 finals
  A("m1", "p-evn", "sub"), A("f1", "p-evn", "starter"),
];

const G = (id, match_id, scorer_id, assist_id, minute) => ({ id, match_id, scorer_id, assist_id, minute });
const goals = [
  // Chris: 2 TML + 1 FND → the profile's badge check needs both
  G("g2", "m1", "p-chr", "p-ben", 12),
  G("g4", "m4", "p-chr", "p-ben", 63),
  G("g6", "f3", "p-chr", "p-dan", 41),
  // Evan: 1 TML + 1 FND
  G("g1", "m1", "p-evn", "p-chr", 77),
  G("g5", "f1", "p-evn", "p-dan", 9),
  // others
  G("g3", "m2", "p-dan", "p-chr", 55),
  G("g7", "m4", "p-ben", "p-chr", 88),
];

const injuries = [
  { id: "i1", player_id: "p-evn", detail: "Hamstring strain", since_date: "2026-04-20", expected_return: "2026-06-15" },
];

const tables = { players, matches, appearances, goals, injuries };

/* Ground truth the specs assert against (rather than re-deriving in each test). */
const expected = {
  tmlRecord: "2–1–1",          // m1 W · m2 D · m3 L · m4 W
  tmlResults: 4,
  friendlies: 3,
  fixtures: 1,                  // x1
  finals: 7,                    // every final match, for the timeline
  coreChips: ["Ada Sato", "Ben Miller", "Chris Ito"], // TML ≥ 67%
  gridCards: 5,                 // active players only (Fumi is inactive)
  injuryCards: 1,
  tmlKpiTiles: 3,               // wave 21: attendance tile is gone
  heroCompetitionCards: 2,     // wave 26: TML + Friendly summaries
  ageBands: 5,                 // wave 28: all five broad public bands
  chris: { tmlGoals: 2, fndGoals: 1, played: 6, absent: 1 },  // 7 finals − 6 apps (missed f2)
  evan: { played: 2, absent: 5 },                            // the most-absent player
};

module.exports = { tables, players, matches, appearances, goals, injuries, expected };
