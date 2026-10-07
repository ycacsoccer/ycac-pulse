// Unit tests for i18n.js — dictionaries, translation and formatting.
//   node --test tests/unit
// The three languages must stay in lock-step; these tests also guard wave 21's
// key removals so an attendance string can't sneak back in unnoticed.
const test = require("node:test");
const assert = require("node:assert/strict");
const i18n = require("../../i18n.js");

const { dictionaries, LANGUAGES } = i18n;
const languages = Object.keys(LANGUAGES);

const placeholders = (value) => (String(value).match(/\{(\w+)\}/g) || []).sort().join(",");

test("the selector offers exactly EN / 日本語 / 简体中文", () => {
  assert.deepEqual(languages, ["en", "ja", "zh"]);
});

test("every language carries the same keys", () => {
  const enKeys = Object.keys(dictionaries.en).sort();
  for (const lang of languages) {
    if (lang === "en") continue;
    const keys = Object.keys(dictionaries[lang]).sort();
    assert.deepEqual(keys, enKeys, `${lang} key set differs from en`);
  }
  assert.ok(enKeys.length > 300, `dictionary looks thin: ${enKeys.length} keys`);
});

test("{placeholders} match across languages", () => {
  for (const [key, value] of Object.entries(dictionaries.en)) {
    for (const lang of languages) {
      if (lang === "en") continue;
      assert.equal(placeholders(dictionaries[lang][key]), placeholders(value), `${key} (${lang})`);
    }
  }
});

test("t() translates by current language and falls back to English then the key", () => {
  assert.equal(i18n.language, "en");
  assert.equal(i18n.t("results"), "Results");
  i18n.setLanguage("ja");
  try {
    assert.equal(i18n.t("results"), "リザルト");
    i18n.setLanguage("zh");
    assert.equal(i18n.t("results"), "赛果");
  } finally {
    i18n.setLanguage("en");
  }
  assert.equal(i18n.t("noSuchKeyAnywhere"), "noSuchKeyAnywhere", "unknown key renders as itself");
});

test("t() interpolates variables in every language", () => {
  assert.equal(i18n.t("playersCount", { count: 3, total: 5 }), "3 of 5 players");
  i18n.setLanguage("ja");
  try {
    assert.equal(i18n.t("playersCount", { count: 3, total: 5 }), "5人中3人");
  } finally {
    i18n.setLanguage("en");
  }
});

test("core page strings exist in all three languages", () => {
  for (const key of ["results", "fixtures", "record", "position", "statApps", "statGoals", "playersNoMatch", "kpiGoalsPerGame", "tierCore", "filterTierNote"]) {
    for (const lang of languages) {
      assert.ok(dictionaries[lang][key], `missing ${lang}.${key}`);
    }
  }
});

test("wave 21: attendance keys stay deleted from every language", () => {
  const removed = [
    "attendance", "attendanceRate", "attendanceTml", "attendanceFriendlyFold",
    "availability", "summary", "swipeHint", "kpiAttendancePerGame",
  ];
  for (const key of removed) {
    for (const lang of languages) {
      assert.equal(dictionaries[lang][key], undefined, `${lang}.${key} came back`);
    }
  }
});

test("selection-group bands are frequency words, not ability rankings", () => {
  assert.equal(dictionaries.en.tierCore, "Plays often");
  assert.equal(dictionaries.en.tierRotation, "Plays sometimes");
  assert.equal(dictionaries.en.tierDepth, "Plays occasionally");
  assert.equal(dictionaries.en.tierInactive, "Not yet played");
  for (const lang of languages) {
    for (const key of ["tierCore", "tierRotation", "tierDepth", "tierInactive"]) {
      assert.ok(!/first.?choice|star|best|ace/i.test(dictionaries[lang][key]), `${lang}.${key} reads as ability`);
    }
  }
});

test("formatDate renders a date for the current language", () => {
  assert.equal(i18n.formatDate("2026-03-07"), "7 Mar 2026");
  assert.equal(i18n.formatDate(""), "");
  assert.equal(i18n.formatDate(null), "");
});

test("squad-picker ui.* short names resolve in every language", () => {
  for (const lang of languages) {
    for (const name of ["team", "back", "title", "suggest", "sheet"]) {
      assert.ok(i18n.ui[lang][name], `missing ui.${lang}.${name}`);
    }
  }
});
