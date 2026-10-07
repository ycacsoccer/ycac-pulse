// Site configuration — the only file that differs between local and published setups.
// Fill these in once the Supabase project exists (see README → "Data backend").
// The anon key is safe to publish: row-level security allows public reads of the
// four public tables only — team tables need a session, writes need is_coach().
window.YCAC_CONFIG = {
  supabaseUrl: "https://dnqmnwnijfzzhcjquxoj.supabase.co", // e.g. "https://abcdefghij.supabase.co"  →  Project Settings > API > Project URL
  supabaseAnonKey: "sb_publishable__vr04Cgo6Fe5l1cbuz8usQ_PNRG1Ee6", //                                        →  Project Settings > API > anon public
  teamEmail: "ycacsoccer@gmail.com", // legacy read-only team account (no login UI since wave 26),
  coachEmail: "likaiyeung@gmail.com", // coach account the coach card signs in — password only,
  //                 the address is built into the page so nobody types an email
};
