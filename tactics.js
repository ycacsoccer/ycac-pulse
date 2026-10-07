/* YC&AC Pulse — tactical formation coverage.
   Pure data module shared by the coach dashboard and unit tests. A player
   covers a slot when the slot accepts either their best position or one of
   their can-play positions. Current injuries stay visible but do not count as
   available coverage. */
(() => {
  const slot = (id, label, x, y, accepts) => ({ id, label, x, y, accepts });
  const BACK_FOUR = [
    slot("lb", "LB", 16, 74, ["LB", "LWB"]),
    slot("lcb", "LCB", 39, 82, ["CB"]),
    slot("rcb", "RCB", 61, 82, ["CB"]),
    slot("rb", "RB", 84, 74, ["RB", "RWB"]),
  ];
  const GK = slot("gk", "GK", 50, 94, ["GK"]);
  const STRIKER_CODES = ["ST", "CF", "FW"];
  const CENTRE_CODES = ["CM", "MC", "DM", "AM", "AMC", "AMF"];

  const FORMATIONS = {
    "4-2-3-1": {
      name: "4-2-3-1",
      slots: [GK, ...BACK_FOUR,
        slot("ldm", "LDM", 39, 61, ["DM", "CM", "MC"]),
        slot("rdm", "RDM", 61, 61, ["DM", "CM", "MC"]),
        slot("lam", "LAM", 20, 37, ["LW", "AM", "AMC", "AMF"]),
        slot("cam", "CAM", 50, 42, ["AM", "AMC", "AMF", "CM", "MC"]),
        slot("ram", "RAM", 80, 37, ["RW", "AM", "AMC", "AMF"]),
        slot("st", "ST", 50, 14, STRIKER_CODES),
      ],
    },
    "4-4-2": {
      name: "4-4-2",
      slots: [GK, ...BACK_FOUR,
        slot("lm", "LM", 18, 49, ["LW", "LWB", "CM", "MC"]),
        slot("lcm", "LCM", 40, 55, CENTRE_CODES),
        slot("rcm", "RCM", 60, 55, CENTRE_CODES),
        slot("rm", "RM", 82, 49, ["RW", "RWB", "CM", "MC"]),
        slot("lst", "LST", 39, 19, STRIKER_CODES),
        slot("rst", "RST", 61, 19, STRIKER_CODES),
      ],
    },
    "4-3-3": {
      name: "4-3-3",
      slots: [GK, ...BACK_FOUR,
        slot("dm", "DM", 50, 63, ["DM", "CM", "MC"]),
        slot("lcm", "LCM", 35, 47, CENTRE_CODES),
        slot("rcm", "RCM", 65, 47, CENTRE_CODES),
        slot("lw", "LW", 20, 20, ["LW", "FW", "CF"]),
        slot("st", "ST", 50, 13, STRIKER_CODES),
        slot("rw", "RW", 80, 20, ["RW", "FW", "CF"]),
      ],
    },
    "3-5-2": {
      name: "3-5-2",
      slots: [GK,
        slot("lcb", "LCB", 28, 79, ["CB"]),
        slot("cb", "CB", 50, 84, ["CB"]),
        slot("rcb", "RCB", 72, 79, ["CB"]),
        slot("lwb", "LWB", 13, 57, ["LWB", "LB", "LW"]),
        slot("lcm", "LCM", 36, 55, CENTRE_CODES),
        slot("cam", "CAM", 50, 36, ["AM", "AMC", "AMF", "CM", "MC"]),
        slot("rcm", "RCM", 64, 55, CENTRE_CODES),
        slot("rwb", "RWB", 87, 57, ["RWB", "RB", "RW"]),
        slot("lst", "LST", 39, 17, STRIKER_CODES),
        slot("rst", "RST", 61, 17, STRIKER_CODES),
      ],
    },
  };

  const codes = (player) => ({
    best: String(player.primary_position || "").toUpperCase(),
    capable: (player.secondary_positions || []).map((code) => String(code).toUpperCase()),
  });

  function coverage(players, formationId, unavailableIds = []) {
    const formation = FORMATIONS[formationId] || FORMATIONS["4-2-3-1"];
    const unavailable = unavailableIds instanceof Set ? unavailableIds : new Set(unavailableIds);
    return formation.slots.map((formationSlot) => {
      const candidates = (players || []).filter((player) => {
        const positions = codes(player);
        return formationSlot.accepts.includes(positions.best)
          || positions.capable.some((code) => formationSlot.accepts.includes(code));
      }).map((player) => {
        const positions = codes(player);
        return { ...player, fit: formationSlot.accepts.includes(positions.best) ? "best" : "capable", unavailable: unavailable.has(player.id) };
      }).sort((a, b) => (a.unavailable - b.unavailable)
        || (Number(a.fit !== "best") - Number(b.fit !== "best"))
        || a.display_name.localeCompare(b.display_name));
      const available = candidates.filter((player) => !player.unavailable);
      return { ...formationSlot, candidates, available, count: available.length, unavailableCount: candidates.length - available.length };
    });
  }

  function heat(count) {
    if (count <= 0) return "empty";
    if (count === 1) return "thin";
    if (count === 2) return "fair";
    return "strong";
  }

  const api = { FORMATIONS, coverage, heat };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.YCACTactics = api;
})();
