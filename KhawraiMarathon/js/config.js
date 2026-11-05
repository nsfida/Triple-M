// Public configuration. The anon key is designed to be public: all protection is enforced by Row Level Security (see sql/schema.sql).
window.KMR = {
  SUPABASE_URL: "https://kozngwlxwfsiqykubkhx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtvem5nd2x4d2ZzaXF5a3Via2h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NjY5OTgsImV4cCI6MjA5NDE0Mjk5OH0.hSzPpT_fqya3VEoy6bfMJ87VCK78BEAlxDuM1UDacbE",
  // Deadline: 05 Nov 2026, 11:59:59 PM Pakistan Standard Time.
  // PKT is UTC+5 (Asia/Karachi) — no daylight saving.
  // 2026-11-05 23:59:59 PKT = 2026-11-05T18:59:59Z
  REGISTRATION_CUTOFF: "2026-11-05T23:59:59+05:00",
  LOGO_URL: "https://triplem.vip/KhawraiUnity/logo.png",
  EMAIL_DOMAIN: "khawrai.app",   // username "nsfida" signs in as nsfida@khawrai.app
  ADMINS: ["waseemfida", "nsfida"],
  SUPER_ADMIN: "nsfida"
};
