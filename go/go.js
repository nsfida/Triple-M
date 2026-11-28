/* Triplem VIP · link from a Marketing email (https://triplem.vip/go/?t=<token>&l=<link>).
 * Counts the link opening for the email's contact (app_marketing_click, migration 249) and
 * continues to the page. A Bcc email (one email for many people, migration 250) carries the
 * campaign instead of a personal token (?c=<campaign id>, app_marketing_campaign_click). Only fixed Triplem VIP addresses are possible (no open redirect):
 * the server returns the address, and this page also accepts only the addresses below. */
(function () {
  "use strict";
  const HOST = ["iymzt", "qbscfo", "delovd", "rnn"].join("");
  const SUPABASE_URL = ["https://", HOST, ".supabase.co"].join("");
  const ANON = ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5bXp0cWJzY2ZvZGVsb3Zkcm5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MjcxNDAsImV4cCI6MjA5NDMwMzE0MH0",
    "eASEqmcC9-eDDgjYFsa3Ne8idK-6KmfXHbxvhWVwZSA"].join(".");
  const LINKS = { trial: "https://triplem.vip/", store: "https://apps.microsoft.com/detail/9MV028GH5NPX", pricing: "https://triplem.vip/#pricing", guides: "https://triplem.vip/seo/" };
  const ALLOWED = /^https:\/\/(triplem\.vip\/|apps\.microsoft\.com\/detail\/9MV028GH5NPX$)/;
  const params = new URLSearchParams(location.search);
  const token = String(params.get("t") || "").toLowerCase();
  const camp = String(params.get("c") || "").toLowerCase();
  const link = Object.prototype.hasOwnProperty.call(LINKS, params.get("l")) ? params.get("l") : "trial";
  let done = false;
  const go = url => { if (done) return; done = true; const to = ALLOWED.test(String(url || "")) ? url : LINKS[link]; document.getElementById("goLink").href = to; location.replace(to); };
  const timer = setTimeout(() => go(LINKS[link]), 2500);
  const personal = /^[0-9a-f]{64}$/.test(token);
  const bcc = !personal && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(camp);
  if (!personal && !bcc) { clearTimeout(timer); go(LINKS[link]); return; }
  fetch(`${SUPABASE_URL}/rest/v1/rpc/${personal ? "app_marketing_click" : "app_marketing_campaign_click"}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify(personal ? { p_token: token, p_link: link } : { p_campaign: camp, p_link: link }),
    referrerPolicy: "no-referrer", keepalive: true
  }).then(r => r.json()).then(d => { clearTimeout(timer); go(d && d.url); }).catch(() => { clearTimeout(timer); go(LINKS[link]); });
})();
