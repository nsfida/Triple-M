// Public configuration. The anon key is designed to be public: all protection is enforced by Row Level Security (see sql/schema.sql).
window.KMR = {
  SUPABASE_URL: "https://kozngwlxwfsiqykubkhx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtvem5nd2x4d2ZzaXF5a3Via2h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NjY5OTgsImV4cCI6MjA5NDE0Mjk5OH0.hSzPpT_fqya3VEoy6bfMJ87VCK78BEAlxDuM1UDacbE",
  // Public registration window (display only - the database is authoritative).
  // The race scheduled for 15 Nov 2026 was postponed by the District Sports Office
  // Nowshera (notice dated 13 Nov 2026). Registration continues until the
  // rescheduled race date, so there is no fixed cutoff for now:
  //   null  -> registration open until further notice (no countdown shown)
  //   "2026-12-20T23:59:59+05:00" -> countdown + automatic close at that PKT time
  // When a new cutoff is announced, set it here AND in the database:
  //   update public.registration_window set closes_at = '<same timestamp>' where id;
  // (see sql/migrations/20261113_020_reopen_registration_postponement.sql)
  REGISTRATION_CUTOFF: null,
  // Race postponement notice (shown as a page-load overlay, a site-wide strip and
  // a downloadable PDF). Set ENABLED to false once the new date is published.
  POSTPONEMENT: {
    ENABLED: true,
    NOTICE_DATE: "13 November 2026",
    ORIGINAL_DATE: "15 November 2026",
    PDF_FILE: "assets/notice/KMR-S3-Postponement-Notice.pdf"
  },
  LOGO_URL: "https://triplem.vip/KhawraiUnity/logo.png",
  EMAIL_DOMAIN: "khawrai.app",   // username "nsfida" signs in as nsfida@khawrai.app
  ADMINS: ["waseemfida", "nsfida"],
  SUPER_ADMIN: "nsfida"
};
