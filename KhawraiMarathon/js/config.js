// Public configuration. The anon key is designed to be public: all protection is enforced by Row Level Security (see sql/schema.sql).
window.KMR = {
  SUPABASE_URL: "https://kozngwlxwfsiqykubkhx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtvem5nd2x4d2ZzaXF5a3Via2h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NjY5OTgsImV4cCI6MjA5NDE0Mjk5OH0.hSzPpT_fqya3VEoy6bfMJ87VCK78BEAlxDuM1UDacbE",

  // ---------------------------------------------------------------------------
  // Race schedule (default values shown before the live settings load).
  // The race was postponed on 13 Nov 2026 and rescheduled to Friday 04 Dec 2026,
  // 04:00 PM Pakistan Time, at the same venue. nsfida can change all of this
  // later from Admin > "Site updates" without editing any file; the database
  // values (public.site_settings, migration 20261125_021) take priority.
  // ---------------------------------------------------------------------------
  RACE: {
    START_AT: "2026-12-04T16:00:00+05:00",       // ISO time with the PKT offset
    VENUE: "Khawrai, Tehsil Jehangira, District Nowshera",
    REPORTING_NOTE: "Report at Railway Phatak, Khawrai Road by 03:00 PM, one hour before the start."
  },

  // Public online registration. false = closed for the public (admins can still
  // register runners). The database (public.registration_window) is authoritative;
  // nsfida can reopen or close registration from Admin > "Site updates".
  REGISTRATION_OPEN: false,
  // Optional fixed cutoff while registration is open (ISO time with +05:00), or null.
  REGISTRATION_CUTOFF: null,

  // Earlier official notice, kept as an archived item in Updates & notices.
  ARCHIVED_NOTICE: {
    NOTICE_DATE: "13 November 2026",
    ORIGINAL_DATE: "15 November 2026",
    PDF_FILE: "assets/notice/KMR-S3-Postponement-Notice.pdf"
  },

  LOGO_URL: "https://triplem.vip/KhawraiUnity/logo.png",
  EMAIL_DOMAIN: "khawrai.app",   // username "nsfida" signs in as nsfida@khawrai.app
  ADMINS: ["waseemfida", "nsfida"],
  SUPER_ADMIN: "nsfida"
};
