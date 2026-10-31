/* Short English Instagram captions, independent of the interface language.
   These are editable drafts: nothing is saved or posted automatically. */
(() => {
  const HASHTAGS = "#YCACPulse #YCAC #YCACSoccer #YokohamaFootball #FootballInJapan";
  const scoreOf = (value) => {
    if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value.trim()))) return null;
    const score = Number(value);
    return Number.isSafeInteger(score) && score >= 0 ? score : null;
  };

  function generate(match = {}) {
    const opponent = typeof match.opponent === "string" ? match.opponent.trim().replace(/\s+/g, " ") : "";
    const final = match.ycac_goals != null && match.opponent_goals != null;
    if (!final) {
      const line = opponent ? `Ready to take on ${opponent}! 💪` : "Ready to go, Pulse! 💪";
      return { kind: "lineup", text: `⚽️ MATCH DAY! 🔴⚫️\n\n${line}\n\n${HASHTAGS}` };
    }

    const us = scoreOf(match.ycac_goals), them = scoreOf(match.opponent_goals);
    if (us == null || them == null) return null; // Never publish an invalid or invented score.
    const line = us > them ? (opponent ? `A win against ${opponent}! 💪` : "A win for Pulse! 💪")
      : us === them ? (opponent ? `All square against ${opponent}.` : "All square at full time.")
        : (opponent ? `Defeat against ${opponent}. We go again. 💪` : "Defeat at full time. We go again. 💪");
    return { kind: "fullTime", text: `FULL TIME | ${us}–${them} ⚽️🔴⚫️\n\n${line}\n\n${HASHTAGS}` };
  }

  const api = { generate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.YCACSocialMedia = api;
})();
