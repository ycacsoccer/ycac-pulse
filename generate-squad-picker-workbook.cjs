const XLSX = require("C:\\Users\\rick\\AppData\\Local\\Temp\\opencode\\ycac-xlsx-tools\\node_modules\\xlsx");

const signups = [
  ["m003", "takeru", "confirmed"], ["m003", "ron", "confirmed"], ["m003", "hubert", "confirmed"],
  ["m003", "bangjie", "confirmed"], ["m003", "chevy", "confirmed"], ["m003", "hitoshi", "confirmed"],
  ["m003", "rick", "confirmed"], ["m003", "kosei", "confirmed"], ["m003", "kouhei", "confirmed"],
  ["m003", "souta", "confirmed"], ["m003", "kaede", "confirmed"], ["m003", "urabe", "confirmed"],
  ["m003", "ryoga", "confirmed"], ["m003", "ryu", "confirmed"], ["m003", "umit", "confirmed"], ["m003", "murat", "confirmed"],
];

function addSheet(workbook, name, headers, rows, widths) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}${rows.length + 1}` };
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}

const workbook = XLSX.utils.book_new();
addSheet(workbook, "EventSignups", ["match_id", "player_id", "status"], signups, [14, 16, 16]);
addSheet(workbook, "SavedSquads", ["saved_squad_id", "match_id", "formation", "player_id", "selection_type", "slot_order", "saved_at", "saved_by", "active"], [], [22, 14, 14, 16, 18, 12, 22, 18, 10]);
addSheet(workbook, "Instructions", ["Item", "Details"], [
  ["EventSignups", "One row per event response. Use confirmed, waitlist, declined, out, or unavailable."],
  ["SavedSquads", "One row per selected player. selection_type is starter or substitute; slot_order starts at 1."],
  ["Source IDs", "Use match_id and player_id values from the main YC&AC Pulse statistics workbook."],
], [20, 100]);
XLSX.writeFile(workbook, "YCAC_Pulse_Squad_Picker.xlsx");
