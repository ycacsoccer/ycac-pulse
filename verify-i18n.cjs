// Verifies i18n coverage: node verify-i18n.cjs
// 1. en/ja/zh dictionaries have identical key sets
// 2. {placeholder} interpolation matches across languages
// 3. every key used by a page (data-i18n* / t("...") / ui.*) exists in ALL languages
// 4. no hardcoded CJK left in app/squad-picker pages (must flow through i18n.js)
const fs = require("fs");
const path = require("path");

const i18n = require("./i18n.js");
const dicts = i18n.dictionaries;
const languages = Object.keys(dicts);
const failures = [];
const note = (ok, label, detail = "") => {
  if (!ok) failures.push(label + (detail ? ` — ${detail}` : ""));
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};

// --- 1. key parity -----------------------------------------------------------
const enKeys = Object.keys(dicts.en).sort();
for (const lang of languages) {
  if (lang === "en") continue;
  const keys = Object.keys(dicts[lang]).sort();
  const missing = enKeys.filter((key) => !keys.includes(key));
  const extra = keys.filter((key) => !enKeys.includes(key));
  note(!missing.length && !extra.length, `key parity en/${lang}`,
    missing.length || extra.length ? `missing: ${missing.join(",")} | extra: ${extra.join(",")}` : `${keys.length} keys`);
}

// --- 2. placeholder parity ---------------------------------------------------
const placeholders = (value) => (String(value).match(/\{(\w+)\}/g) || []).sort().join(",");
let placeholderIssues = 0;
for (const key of enKeys) {
  for (const lang of languages) {
    if (lang === "en") continue;
    if (placeholders(dicts.en[key]) !== placeholders(dicts[lang][key])) {
      placeholderIssues += 1;
      failures.push(`placeholder mismatch: ${key} (en vs ${lang})`);
      console.log(`FAIL placeholder mismatch: ${key} (en vs ${lang})`);
    }
  }
}
note(placeholderIssues === 0, "placeholder parity");

// --- 3. usage coverage -------------------------------------------------------
const read = (file) => fs.readFileSync(path.join(__dirname, file), "utf8");
const usedKeys = new Map(); // key -> where used
const collect = (regex, source, where) => {
  let match;
  while ((match = regex.exec(source))) usedKeys.set(match[1], where);
};

for (const file of ["index.html", "squad-picker.html", "login.html", "coach.html", "players.html", "player.html", "admin.html"]) {
  collect(/data-i18n(?:-title|-html|-placeholder|-aria)?="([^"]+)"/g, read(file), file);
}
for (const file of ["app.js", "squad-picker.js", "login.js", "auth.js", "coach.js", "players.js", "player.js", "admin.js"]) {
  collect(/\bt\("([^"]+)"/g, read(file), file);
  // KEYS tables store key names as values ("tierCore": …) — collect those too
  collect(/"((?:coach|lens|tier|signup|flag|stat|shirt|foot|admin|content|note)[A-Z][A-Za-z0-9]*)"/g, read(file), file);
}

let missingCount = 0;
for (const [key, where] of usedKeys) {
  for (const lang of languages) {
    if (dicts[lang][key] === undefined) {
      missingCount += 1;
      console.log(`FAIL key "${key}" used in ${where} is missing from ${lang}`);
    }
  }
}
note(missingCount === 0, `all ${usedKeys.size} used keys exist in ${languages.join("/")}`);

// ui.* short-name references in squad-picker must exist in the picker view
const pickerSource = read("squad-picker.js");
const uiNames = new Set();
const uiRegex = /(?<!\.)\bui\.([a-zA-Z]+)/g; // not YCACI18n.ui.xx
let uiMatch;
while ((uiMatch = uiRegex.exec(pickerSource))) uiNames.add(uiMatch[1]);
const missingUi = [...uiNames].filter((name) => i18n.ui.en[name] === undefined);
note(missingUi.length === 0, `all ${uiNames.size} ui.* picker names resolve`, missingUi.join(","));

// --- 4. no hardcoded CJK in pages -------------------------------------------
const cjk = /[\u3040-\u30ff\u3400-\u9fff]/;
for (const file of ["app.js", "squad-picker.js", "login.js", "auth.js", "data.js", "coach.js", "players.js", "player.js", "admin.js", "index.html", "squad-picker.html", "login.html", "coach.html", "players.html", "player.html", "admin.html"]) {
  const source = read(file);
  const line = source.split("\n").findIndex((text) => cjk.test(text));
  note(line === -1, `no hardcoded Japanese/Chinese in ${file}`, line === -1 ? "" : `first hit line ${line + 1}`);
}

// --- 5. element ids referenced by the scripts exist in their page ------------
const checkIds = (jsFile, htmlFile) => {
  const source = read(jsFile);
  const page = read(htmlFile);
  const refs = new Set();
  let m;
  const staticRef = /(?:querySelector\("#([a-z0-9-]+)"|\$\("([a-z0-9-]+)")/g;
  while ((m = staticRef.exec(source))) refs.add(m[1] || m[2]);
  const templRef = /querySelector\(`#\$\{prefix\}-([a-z0-9-]+)`\)/g;
  while ((m = templRef.exec(source))) ["tml", "friendly"].forEach((prefix) => refs.add(`${prefix}-${m[1]}`));
  // an id may live in the HTML, a JS-rendered template, or an `el.id = "x"` assignment
  const definesId = (id) => page.includes(`id="${id}"`) || source.includes(`id="${id}"`) || source.includes(`.id = "${id}"`);
  const missing = [...refs].filter((id) => !definesId(id));
  note(missing.length === 0, `all ${refs.size} #ids referenced in ${jsFile} exist`, missing.join(","));
};
checkIds("app.js", "index.html");
checkIds("squad-picker.js", "squad-picker.html");
checkIds("login.js", "login.html");
checkIds("coach.js", "coach.html");
checkIds("players.js", "players.html");
checkIds("player.js", "player.html");
checkIds("admin.js", "admin.html");

// --- summary -----------------------------------------------------------------
console.log("");
if (failures.length) {
  console.log(`${failures.length} FAILURE(S):`);
  failures.forEach((item) => console.log(`  - ${item}`));
  process.exit(1);
}
console.log(`i18n verified: ${enKeys.length} keys × ${languages.length} languages, ${usedKeys.size} in active use.`);
