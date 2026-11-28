/* Triplem VIP · email unsubscribe page (https://triplem.vip/unsubscribe/?t=<token>).
 * The token in the link is 64 hexadecimal characters; the server keeps only its hash
 * (migration 248, app_marketing_unsubscribe). The recipient confirms with a button, so mail
 * scanners that open links do not unsubscribe anyone by accident. */
(function () {
  "use strict";
  // Public (anon) project settings - the same values the Triplem VIP app embeds.
  const HOST = ["iymzt", "qbscfo", "delovd", "rnn"].join("");
  const SUPABASE_URL = ["https://", HOST, ".supabase.co"].join("");
  const ANON = ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5bXp0cWJzY2ZvZGVsb3Zkcm5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MjcxNDAsImV4cCI6MjA5NDMwMzE0MH0",
    "eASEqmcC9-eDDgjYFsa3Ne8idK-6KmfXHbxvhWVwZSA"].join(".");

  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const token = String(params.get("t") || hash.get("t") || "").trim().toLowerCase();

  function show(which, text) {
    $("unAsk").hidden = which !== "ask";
    $("unDone").hidden = which !== "done";
    $("unError").hidden = which !== "error";
    if (which === "done" && text) $("unDoneText").textContent = text;
    if (which === "error" && text) $("unErrorText").textContent = text;
  }

  if (!/^[0-9a-f]{64}$/.test(token)) { show("error"); return; }

  $("unBtn").addEventListener("click", async () => {
    const btn = $("unBtn");
    btn.disabled = true; btn.textContent = "Please wait…";
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/app_marketing_unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({ p_token: token }),
        referrerPolicy: "no-referrer"
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data || data.ok !== true) throw new Error(String(data?.message || "invalid"));
      const who = data.email ? ` (${data.email})` : "";
      show("done", data.already
        ? `This address${who} was already unsubscribed. We will not send marketing emails to it.`
        : `This address${who} will not receive marketing emails from Triplem VIP again.`);
      try { history.replaceState(null, "", location.pathname); } catch (_) {}
    } catch (e) {
      const msg = /not valid/i.test(String(e?.message || "")) ? "The unsubscribe link is not valid or is incomplete." : "We could not reach the server. Please try again in a moment.";
      if (/not valid/i.test(msg)) show("error", msg);
      else { btn.disabled = false; btn.textContent = "Try again"; $("unAsk").querySelector("p").textContent = msg; }
    }
  });
})();
