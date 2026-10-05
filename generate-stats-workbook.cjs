const XLSX = require("C:\\Users\\rick\\AppData\\Local\\Temp\\opencode\\ycac-xlsx-tools\\node_modules\\xlsx");

const players = [
  ["rick", "Rick", 10, "LW", true], ["sun", "Sun", "", "AM", true],
  ["ryu", "Ryu", "", "RW", true], ["ryoga", "Ryoga", 88, "DM", true],
  ["kosei", "Kosei", "", "DM", true], ["souta", "Souta", "", "DM", true],
  ["kouhei", "Kouhei", "", "LB", true], ["urabe", "Urabe", 22, "CB", true],
  ["hitoshi", "Hitoshi", 33, "RW", true], ["hiramatsu", "Hiramatsu", 1, "GK", true],
  ["masashi", "Masashi", "", "ST", true], ["jude", "Jude", "", "RW", true],
  ["chevy", "Chevy", 47, "RW", true], ["kazuki", "Kazuki", 8, "CM", true],
  ["bangjie", "Bangjie", "", "LB", true], ["shinya", "Shinya", 26, "CM", true],
  ["mo", "Mo", 21, "RW", true], ["kaede", "Kaede", "", "RW", true],
  ["take", "Take", "", "RB", true], ["umit", "Umit", 16, "CB", true],
  ["dai", "Dai", 25, "RW", true],
  ["kitahara", "Daisuke", "", "GK", true], ["ron", "Ron", "", "CB", true],
  ["taisei", "Taisei", "", "LB", true], ["takeru", "Takeru", "", "CB", true],
  ["micah", "Micah", 4, "RB", true], ["toshi", "Toshi", "", "RB", true],
  ["teru", "Teru", 6, "LB", true], ["ryuji", "Ryuji", 3, "CM", true],
  ["yohei", "Yohei", "", "AM", true], ["ryota", "Ryota", 13, "LW", true],
  ["yuto", "Yuto", "", "ST", true], ["watabe", "Watabe", "", "GK", true],
  ["hubert", "Hubert", "", "RB", true], ["murat", "Muro", "", "GK", true],
  ["masato", "Masa", "", "LB", true],
];

const matches = [
  ["m001", "2026-08-29", "TML Division 3", "Albion Old Boys FC", "YC&AC", "home", 8, 2, "", "", ""],
  ["m002", "2026-09-05", "TML Division 3", "F. Lions FC", "YC&AC", "home", 4, 0, "", "", ""],
  ["m003", "2026-09-19", "TML Division 3", "Votty SC", "", "", "", "", "18:00", "", ""],
  ["m004", "2026-09-26", "Friendly Match", "Saint Luxun Park FC", "", "", "", "", "18:30", "", ""],
  ["f001", "2026-04-11", "Friendly Match", "Kamakura Inter FC O35", "YC&AC", "home", 1, 3, "16:00", "", ""],
  ["f002", "2026-06-06", "Friendly Match", "Johnson & Johnson O35", "YC&AC", "home", 12, 0, "16:00", "", ""],
  ["f003", "2026-07-05", "Friendly Match", "Inter Tokyo FC", "YC&AC", "home", 2, 4, "11:00", "", ""],
  ["f004", "2026-07-11", "Friendly Match", "GRILO", "YC&AC", "home", 3, 4, "17:00", "", ""],
  ["f005", "2026-07-19", "Friendly Match", "Yokohama Calcio", "YC&AC", "home", 4, 1, "11:00", "", ""],
  ["f006", "2026-08-23", "Friendly Match", "Inter Tokyo FC", "YC&AC", "home", 3, 1, "11:00", "", ""],
];

const appearances = [
  ["m001", "kaede", "starter", "ST", ""], ["m001", "rick", "starter", "LW", ""],
  ["m001", "sun", "starter", "AM", ""], ["m001", "ryu", "starter", "RW", ""],
  ["m001", "ryoga", "starter", "DM", ""], ["m001", "souta", "starter", "DM", ""],
  ["m001", "kouhei", "starter", "LB", ""], ["m001", "urabe", "starter", "CB", ""],
  ["m001", "hitoshi", "starter", "CB", ""], ["m001", "take", "starter", "RB", ""],
  ["m001", "hiramatsu", "starter", "GK", ""], ["m001", "masashi", "substitute", "", ""],
  ["m001", "kosei", "substitute", "", ""], ["m001", "umit", "substitute", "", ""],
  ["m001", "bangjie", "substitute", "", ""], ["m001", "dai", "substitute", "", ""],
  ["m001", "mo", "substitute", "", ""],
  ["m002", "masashi", "starter", "ST", ""], ["m002", "rick", "starter", "LW", ""],
  ["m002", "sun", "starter", "AM", ""], ["m002", "jude", "starter", "RW", ""],
  ["m002", "kosei", "starter", "DM", ""], ["m002", "souta", "starter", "DM", ""],
  ["m002", "kouhei", "starter", "LB", ""], ["m002", "urabe", "starter", "CB", ""],
  ["m002", "ryoga", "starter", "CB", ""], ["m002", "hitoshi", "starter", "RB", ""],
  ["m002", "hiramatsu", "starter", "GK", ""], ["m002", "chevy", "substitute", "", ""],
  ["m002", "kazuki", "substitute", "", ""], ["m002", "bangjie", "substitute", "", ""],
  ["m002", "shinya", "substitute", "", ""], ["m002", "mo", "substitute", "", ""],
  ["m002", "ryu", "substitute", "", ""],
  ["f001", "hiramatsu", "starter", "GK", ""], ["f001", "teru", "starter", "LB", ""],
  ["f001", "ron", "starter", "CB", ""], ["f001", "urabe", "starter", "CB", ""], ["f001", "take", "starter", "RB", ""],
  ["f001", "souta", "starter", "DM", ""], ["f001", "mo", "starter", "AM", ""], ["f001", "hitoshi", "starter", "RW", ""],
  ["f001", "rick", "starter", "LW", ""], ["f001", "yuto", "starter", "ST", ""], ["f001", "takeru", "starter", "CB", ""],
  ["f001", "umit", "substitute", "", ""], ["f001", "kazuki", "substitute", "", ""],
  ["f002", "hiramatsu", "starter", "GK", ""], ["f002", "ron", "starter", "CB", ""], ["f002", "urabe", "starter", "CB", ""], ["f002", "kouhei", "starter", "LB", ""],
  ["f002", "taisei", "starter", "LB", ""], ["f002", "kosei", "starter", "DM", ""], ["f002", "souta", "starter", "DM", ""],
  ["f002", "mo", "starter", "RW", ""], ["f002", "hitoshi", "starter", "RW", ""], ["f002", "rick", "starter", "LW", ""], ["f002", "yuto", "starter", "ST", ""],
  ["f002", "toshi", "substitute", "", ""], ["f002", "takeru", "substitute", "", ""], ["f002", "chevy", "substitute", "", ""],
  ["f003", "hiramatsu", "starter", "GK", ""], ["f003", "taisei", "starter", "LB", ""], ["f003", "teru", "starter", "LB", ""],
  ["f003", "take", "starter", "RB", ""], ["f003", "ron", "starter", "CB", ""], ["f003", "urabe", "starter", "CB", ""],
  ["f003", "sun", "starter", "AM", ""], ["f003", "souta", "starter", "DM", ""], ["f003", "mo", "starter", "RW", ""],
  ["f003", "rick", "starter", "LW", ""], ["f003", "yuto", "starter", "ST", ""],
  ["f003", "umit", "substitute", "", ""], ["f003", "kazuki", "substitute", "", ""], ["f003", "toshi", "substitute", "", ""], ["f003", "hitoshi", "substitute", "", ""],
  ["f004", "watabe", "starter", "GK", ""], ["f004", "urabe", "starter", "CB", ""], ["f004", "take", "starter", "RB", ""],
  ["f004", "takeru", "starter", "CB", ""], ["f004", "ron", "starter", "CB", ""], ["f004", "ryoga", "starter", "DM", ""],
  ["f004", "kosei", "starter", "DM", ""], ["f004", "kouhei", "starter", "LB", ""], ["f004", "souta", "starter", "DM", ""],
  ["f004", "rick", "starter", "LW", ""], ["f004", "yuto", "starter", "ST", ""],
  ["f004", "umit", "substitute", "", ""], ["f004", "dai", "substitute", "", ""], ["f004", "kazuki", "substitute", "", ""], ["f004", "mo", "substitute", "", ""], ["f004", "hitoshi", "substitute", "", ""],
  ["f005", "hiramatsu", "starter", "GK", ""], ["f005", "urabe", "starter", "CB", ""], ["f005", "take", "starter", "RB", ""],
  ["f005", "umit", "starter", "CB", ""], ["f005", "ron", "starter", "CB", ""], ["f005", "kosei", "starter", "DM", ""],
  ["f005", "souta", "starter", "DM", ""], ["f005", "kazuki", "starter", "CM", ""], ["f005", "mo", "starter", "RW", ""],
  ["f005", "rick", "starter", "LW", ""], ["f005", "yuto", "starter", "ST", ""],
  ["f005", "hitoshi", "substitute", "", ""], ["f005", "dai", "substitute", "", ""], ["f005", "ryu", "substitute", "", ""],
  ["f006", "hiramatsu", "starter", "GK", ""], ["f006", "taisei", "starter", "LB", ""], ["f006", "bangjie", "starter", "LB", ""],
  ["f006", "hubert", "starter", "RB", ""], ["f006", "urabe", "starter", "CB", ""], ["f006", "umit", "starter", "CB", ""],
  ["f006", "souta", "starter", "DM", ""], ["f006", "mo", "starter", "RW", ""], ["f006", "hitoshi", "starter", "RW", ""],
  ["f006", "rick", "starter", "LW", ""], ["f006", "yuto", "starter", "ST", ""],
  ["f006", "jude", "substitute", "", ""], ["f006", "chevy", "substitute", "", ""],
];

const goals = [
  ["m001", "sun", "", ""], ["m001", "sun", "", ""], ["m001", "sun", "", ""],
  ["m001", "ryu", "", ""], ["m001", "ryu", "", ""], ["m001", "kosei", "", ""],
  ["m001", "kosei", "", ""], ["m001", "rick", "", ""], ["m002", "masashi", "", ""],
  ["m002", "masashi", "", ""], ["m002", "ryoga", "", ""], ["m002", "jude", "", ""],
  ["f001", "rick", "", ""],
  ["f002", "rick", "", ""], ["f002", "rick", "", ""], ["f002", "rick", "", ""], ["f002", "rick", "", ""],
  ["f002", "yuto", "", ""], ["f002", "yuto", "", ""], ["f002", "yuto", "", ""], ["f002", "urabe", "", ""],
  ["f002", "kosei", "", ""], ["f002", "hitoshi", "", ""], ["f002", "mo", "", ""], ["f002", "sun", "", ""],
  ["f003", "rick", "", ""], ["f003", "hitoshi", "", ""],
  ["f004", "souta", "", ""], ["f004", "yuto", "", ""], ["f004", "ron", "", ""],
  ["f005", "rick", "", ""], ["f005", "rick", "", ""], ["f005", "rick", "", ""], ["f005", "mo", "", ""],
  ["f006", "rick", "", ""], ["f006", "mo", "", ""], ["f006", "urabe", "", ""],
];

// Add one row per event response: confirmed, waitlist, declined, or unavailable.
const signups = [
  ["m003", "takeru", "confirmed"], ["m003", "ron", "confirmed"], ["m003", "hubert", "confirmed"],
  ["m003", "bangjie", "confirmed"], ["m003", "chevy", "confirmed"], ["m003", "hitoshi", "confirmed"],
  ["m003", "rick", "confirmed"], ["m003", "kosei", "confirmed"], ["m003", "kouhei", "confirmed"],
  ["m003", "souta", "confirmed"], ["m003", "kaede", "confirmed"], ["m003", "urabe", "confirmed"],
  ["m003", "ryoga", "confirmed"], ["m003", "ryu", "confirmed"], ["m003", "umit", "confirmed"],
  ["m003", "murat", "confirmed"],
];

function addSheet(workbook, name, headers, rows, widths) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}${rows.length + 1}` };
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}

const workbook = XLSX.utils.book_new();
addSheet(workbook, "Players", ["player_id", "display_name", "shirt_number", "primary_position", "active"], players, [14, 18, 14, 18, 10]);
addSheet(workbook, "Matches", ["match_id", "date", "competition", "opponent", "venue", "home_away", "ycac_goals", "opponent_goals", "kickoff", "standard_signup_url", "priority_signup_url"], matches, [12, 14, 20, 24, 16, 14, 14, 16, 12, 30, 30]);
addSheet(workbook, "Appearances", ["match_id", "player_id", "role", "position", "minutes"], appearances, [12, 14, 14, 14, 12]);
addSheet(workbook, "Goals", ["match_id", "scorer_id", "assist_player_id", "minute"], goals, [12, 14, 18, 12]);
addSheet(workbook, "Signups", ["match_id", "player_id", "status"], signups, [12, 14, 14]);
XLSX.writeFile(workbook, "YCAC_Pulse_Stats.xlsx");
