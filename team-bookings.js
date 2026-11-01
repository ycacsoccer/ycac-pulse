/* Team-reported yellow cards, independent of the generated league feed.
   Match and player IDs refer to Supabase records; no minute is implied.
   The league may publish the same card later — discipline.js reconciles it
   only when the match and roster identity can both be matched unambiguously. */
(() => {
  const bookings = [
    { id: "m007-murat-yellow-1", match_id: "m007", player_id: "murat" },
  ];
  if (typeof module !== "undefined" && module.exports) module.exports = bookings;
  if (typeof window !== "undefined") window.YCACTeamBookings = bookings;
})();
