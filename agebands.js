/* YC&AC Pulse — shared age-band presentation and distribution helpers.
   The database stores broad ranges only; exact dates of birth are never used. */
(() => {
  const ORDER = ["17-20", "20s", "30s", "40s", "50s"];
  const label = (value) => value === "17-20" ? "17–20" : String(value || "");
  const className = (value) => ORDER.includes(value) ? `age-${value}` : "age-unset";

  function distribution(players) {
    const active = (players || []).filter((player) => player.active !== false);
    const total = active.length;
    return ORDER.map((band) => {
      const count = active.filter((player) => player.age_band === band).length;
      return { band, label: label(band), count, percent: total ? Math.round((count / total) * 100) : 0 };
    });
  }

  const api = { ORDER, label, className, distribution };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.YCACAgeBands = api;
})();
