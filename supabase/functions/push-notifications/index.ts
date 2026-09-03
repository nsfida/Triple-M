import { createClient } from "npm:@supabase/supabase-js@2";
import { buildPushHTTPRequest } from "npm:@pushforge/builder@2.0.5";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const VAPID_PUBLIC_KEY_CONFIGURED = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "https://triplem.vip/";

function readNamedKey(jsonName: string, legacyName: string): string {
  const legacy = Deno.env.get(legacyName) || "";
  if (legacy) return legacy;
  const raw = Deno.env.get(jsonName) || "";
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    return String(parsed?.default || Object.values(parsed || {})[0] || "");
  } catch (_) {
    return "";
  }
}

const PUBLISHABLE_KEY = readNamedKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
const SECRET_KEY = readNamedKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
const adminClient = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const allowedOrigins = new Set(["https://triplem.vip", "https://www.triplem.vip"]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = allowedOrigins.has(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://triplem.vip",
    "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-session-token, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store"
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8" }
  });
}

function assertAllowedOrigin(req: Request) {
  const origin = req.headers.get("origin") || "";
  if (!origin) return;
  if (allowedOrigins.has(origin)) return;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return;
  throw new Error("Origin is not allowed");
}

function decodeBase64Url(value: string): Uint8Array {
  const raw = String(value || "").trim();
  const padded = raw.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - raw.length % 4) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function parsePrivateJWK(): JsonWebKey {
  if (!VAPID_PRIVATE_KEY) throw new Error("VAPID private key is not configured");
  let parsed: JsonWebKey;
  try { parsed = JSON.parse(VAPID_PRIVATE_KEY); }
  catch (_) { throw new Error("VAPID private key is not valid JWK JSON"); }
  if (parsed?.kty !== "EC" || parsed?.crv !== "P-256" || !parsed?.x || !parsed?.y || !parsed?.d) {
    throw new Error("VAPID private key is incomplete or invalid");
  }
  return parsed;
}

function publicVapidKeyFromPrivateJWK(jwk: JsonWebKey): string {
  const x = decodeBase64Url(String(jwk.x || ""));
  const y = decodeBase64Url(String(jwk.y || ""));
  if (x.length !== 32 || y.length !== 32) throw new Error("VAPID public coordinates are invalid");
  const point = new Uint8Array(65);
  point[0] = 4;
  point.set(x, 1);
  point.set(y, 33);
  return encodeBase64Url(point);
}

function effectiveVapidConfig() {
  const privateJWK = parsePrivateJWK();
  const derivedPublicKey = publicVapidKeyFromPrivateJWK(privateJWK);
  const configuredPublicKey = String(VAPID_PUBLIC_KEY_CONFIGURED || "").trim();
  return {
    privateJWK,
    publicKey: derivedPublicKey,
    configuredPublicKey,
    pairMatches: !configuredPublicKey || configuredPublicKey === derivedPublicKey
  };
}

async function callCustomSessionRpc<T>(req: Request, fnName: string, args: Record<string, unknown>): Promise<T> {
  const sessionToken = String(req.headers.get("x-session-token") || "").trim();
  if (!sessionToken) throw new Error("Authentication required");
  if (!SUPABASE_URL || !PUBLISHABLE_KEY) throw new Error("Push service database configuration is unavailable");

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: {
      "apikey": PUBLISHABLE_KEY,
      "Authorization": `Bearer ${PUBLISHABLE_KEY}`,
      "Content-Type": "application/json",
      "X-Session-Token": sessionToken,
      "Prefer": "return=representation"
    },
    body: JSON.stringify(args)
  });
  const text = await response.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!response.ok) throw new Error(String(data?.message || data?.error || text || "Authorization failed"));
  if (Array.isArray(data) && data.length === 1) return data[0] as T;
  return data as T;
}

type PushSubscriptionRow = {
  id: string;
  owner_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

async function subscriptionsForUsers(userIds: string[]): Promise<PushSubscriptionRow[]> {
  const ids = Array.from(new Set((userIds || []).map(String).filter(Boolean))).slice(0, 20000);
  if (!ids.length) return [];
  const { data, error } = await adminClient.rpc("app_push_service_subscriptions_for_users", { p_user_ids: ids });
  if (error) throw error;
  const value: any = Array.isArray(data) && data.length === 1 ? data[0] : data;
  return Array.isArray(value?.items) ? value.items : [];
}

function endpointHost(endpoint: string) {
  try { return new URL(endpoint).host; } catch (_) { return "unknown"; }
}

async function sendOne(row: PushSubscriptionRow, payload: Record<string, unknown>, options: Record<string, unknown>, privateJWK: JsonWebKey) {
  const subscription = {
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth }
  };
  const built = await buildPushHTTPRequest({
    privateJWK,
    subscription,
    message: { payload, adminContact: VAPID_SUBJECT, options }
  });
  const response = await fetch(built.endpoint, { method: "POST", headers: built.headers, body: built.body });
  let errorText = "";
  if (!response.ok && response.status !== 201) {
    try { errorText = (await response.text()).slice(0, 240); } catch (_) {}
  }
  return { id: row.id, status: response.status, ok: response.ok || response.status === 201, host: endpointHost(row.endpoint), errorText };
}

async function fanOut(userIds: string[], payload: Record<string, unknown>, options: Record<string, unknown>) {
  const vapid = effectiveVapidConfig();
  const rows = await subscriptionsForUsers(userIds);
  const invalidIds: string[] = [];
  let sent = 0;
  let failed = 0;
  const failures: Array<{ status: number; host: string; detail?: string }> = [];
  const concurrency = 40;

  for (let offset = 0; offset < rows.length; offset += concurrency) {
    const batch = rows.slice(offset, offset + concurrency);
    const results = await Promise.allSettled(batch.map(row => sendOne(row, payload, options, vapid.privateJWK)));
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        const status = result.value.status;
        if (result.value.ok) sent += 1;
        else {
          failed += 1;
          failures.push({ status, host: result.value.host, detail: result.value.errorText || undefined });
          if (status === 404 || status === 410) invalidIds.push(batch[index].id);
        }
      } else {
        failed += 1;
        failures.push({ status: 0, host: endpointHost(batch[index]?.endpoint || ""), detail: String(result.reason?.message || result.reason || "Push build/send failed").slice(0, 240) });
      }
    });
  }

  if (invalidIds.length) {
    try { await adminClient.from("app_push_subscriptions").delete().in("id", invalidIds); } catch (_) {}
  }
  if (failures.length) console.error("Web Push delivery failures", failures.slice(0, 20));
  const summary = { subscriptions: rows.length, sent, failed, removed: invalidIds.length, failures: failures.slice(0, 10) };
  console.log("Web Push delivery summary", { subscriptions: summary.subscriptions, sent, failed, removed: invalidIds.length });
  return summary;
}

function runBackground(task: Promise<unknown>) {
  const edgeRuntime = (globalThis as any).EdgeRuntime;
  if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(task.catch(err => console.error("Web Push background task failed", err)));
  else task.catch(err => console.error("Web Push task failed", err));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    assertAllowedOrigin(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim().toLowerCase();

    if (action === "config") {
      const vapid = effectiveVapidConfig();
      return json(req, {
        ok: true,
        enabled: Boolean(vapid.publicKey && VAPID_PRIVATE_KEY),
        vapid_public_key: vapid.publicKey,
        configured_public_key_matches_private: vapid.pairMatches
      });
    }

    if (!SUPABASE_URL || !SECRET_KEY) throw new Error("Push service is not configured");

    if (action === "admin_send") {
      const title = String(body?.title || "").trim();
      const text = String(body?.body || "").trim();
      const sendAll = body?.all === true;
      const userIds = Array.isArray(body?.user_ids) ? body.user_ids.map(String).filter(Boolean) : [];
      const prepared: any = await callCustomSessionRpc(req, "app_push_admin_prepare_custom_notification", {
        p_title: title, p_body: text, p_all: sendAll, p_user_ids: userIds
      });
      const recipients = Array.isArray(prepared?.recipient_ids) ? prepared.recipient_ids.map(String).filter(Boolean) : [];
      const batchId = String(prepared?.batch_id || crypto.randomUUID());
      const payload = {
        title,
        body: text,
        icon: "/Assets/logo/logo.png",
        badge: "/Assets/logo/logo.png",
        tag: `triplem-admin-${batchId}`,
        renotify: true,
        data: { url: "/", type: "admin_broadcast", batch_id: batchId },
        suppressWhenOpen: false
      };
      const task = fanOut(recipients, payload, { urgency: "normal", ttl: 86400, topic: `a${batchId.replace(/-/g, "").slice(0, 24)}` });
      if (!sendAll && recipients.length <= 25) {
        const delivery = await task;
        return json(req, { ok: true, queued: false, batch_id: batchId, recipient_count: Number(prepared?.recipient_count) || recipients.length, delivery });
      }
      runBackground(task);
      return json(req, { ok: true, queued: true, batch_id: batchId, recipient_count: Number(prepared?.recipient_count) || recipients.length });
    }

    if (action === "live_chat_agent_request") {
      const inquiryId = String(body?.inquiry_id || "").trim();
      const guestToken = String(body?.guest_token || "").trim();
      if (!inquiryId || !guestToken) throw new Error("Live Chat handoff is unavailable");
      const { data, error } = await adminClient.rpc("app_push_service_live_chat_recipients", { p_inquiry_id: inquiryId, p_guest_token: guestToken });
      if (error) throw error;
      const authorized: any = Array.isArray(data) && data.length === 1 ? data[0] : data;
      if (authorized?.should_send === false) return json(req, { ok: true, queued: false, duplicate: true, recipient_count: 0 });
      const recipients = Array.isArray(authorized?.recipient_ids) ? authorized.recipient_ids.map(String).filter(Boolean) : [];
      const payload = {
        title: "Triplem VIP Live Support",
        body: "A visitor is waiting for an Agent. Open Triplem VIP to review the Live Chat request.",
        icon: "/Assets/logo/logo.png",
        badge: "/Assets/logo/logo.png",
        tag: `triplem-live-chat-${inquiryId}`,
        renotify: true,
        requireInteraction: true,
        data: { url: "/?push=live-chat", type: "live_chat_agent_request", inquiry_id: inquiryId },
        suppressWhenOpen: true
      };
      runBackground(fanOut(recipients, payload, { urgency: "high", ttl: 900, topic: `l${inquiryId.replace(/-/g, "").slice(0, 24)}` }));
      return json(req, { ok: true, queued: true, recipient_count: recipients.length });
    }

    if (action === "message_notify") {
      const inquiryId = String(body?.inquiry_id || "").trim();
      if (!inquiryId) throw new Error("Message notification is unavailable");
      const prepared: any = await callCustomSessionRpc(req, "app_push_prepare_message_dispatch", { p_inquiry_id: inquiryId });
      if (prepared?.should_send === false) return json(req, { ok: true, queued: false, duplicate: true, recipient_count: 0 });
      const recipients = Array.isArray(prepared?.recipient_ids) ? prepared.recipient_ids.map(String).filter(Boolean) : [];
      const messageId = String(prepared?.message_id || crypto.randomUUID());
      const senderRole = String(prepared?.sender_role || "").toLowerCase();
      const payload = {
        title: senderRole === "admin" ? "Triplem VIP Support" : "New Triplem VIP Message",
        body: senderRole === "admin" ? "You received a new private message from Triplem VIP Support." : "A registered user sent a new private message.",
        icon: "/Assets/logo/logo.png",
        badge: "/Assets/logo/logo.png",
        tag: `triplem-message-${inquiryId}`,
        renotify: true,
        data: { url: `/?push=messages&inquiry=${encodeURIComponent(inquiryId)}`, type: "private_message", inquiry_id: inquiryId },
        suppressWhenOpen: true
      };
      runBackground(fanOut(recipients, payload, { urgency: "normal", ttl: 3600, topic: `m${messageId.replace(/-/g, "").slice(0, 24)}` }));
      return json(req, { ok: true, queued: true, recipient_count: recipients.length });
    }

    return json(req, { error: "Unknown push action" }, 400);
  } catch (error) {
    const message = String((error as any)?.message || error || "Push notification request failed");
    const status = /authentication|required|administrator|admin security|origin|cannot notify/i.test(message) ? 403 : 400;
    console.error("Push request failed", { message, status });
    return json(req, { ok: false, error: message }, status);
  }
});
