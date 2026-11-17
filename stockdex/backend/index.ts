import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import webpush from "npm:web-push@3.6.7";

const ORIGINS = new Set(["https://stockdex-au.onrender.com", "http://localhost:8080", "http://127.0.0.1:8080"]);
const RETAILERS = {
  jb: ["jbhifi.com.au", "www.jbhifi.com.au"],
  target: ["target.com.au", "www.target.com.au"],
  bigw: ["bigw.com.au", "www.bigw.com.au"],
  woolworths: ["woolworths.com.au", "www.woolworths.com.au"],
  eb: ["ebgames.com.au", "www.ebgames.com.au"]
};
const ALLOWED = Object.keys(RETAILERS);
const url = Deno.env.get("SUPABASE_URL");
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || secretKeys.default;
if (!url || !serviceKey) throw new Error("Supabase service configuration missing");
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const CONFIG = await (async () => {
  const { data, error } = await db.from("stockdex_config").select("name,value");
  if (error) throw new Error("StockDex config unavailable: " + error.message);
  return Object.fromEntries((data || []).map((x) => [x.name, x.value]));
})();
if (CONFIG.vapid_public && CONFIG.vapid_private) {
  webpush.setVapidDetails("mailto:stockdex-alerts@example.invalid", CONFIG.vapid_public, CONFIG.vapid_private);
}
function cors(req) {
  const origin = req.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": origin && ORIGINS.has(origin) ? origin : "https://stockdex-au.onrender.com",
    "Access-Control-Allow-Headers": "authorization, content-type, x-stockdex-feed-secret",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store"
  };
}
function reply(req, data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors(req), "Content-Type": "application/json; charset=utf-8" } });
}
function bad(req, message, status = 400) { return reply(req, { ok: false, error: message }, status); }
function idValid(value) { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
async function hash(value) {
  const v = new TextEncoder().encode(value);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", v))].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function checkSub(s) {
  if (!s || typeof s !== "object" || typeof s.endpoint !== "string" || s.endpoint.length > 1800 || !s.keys || typeof s.keys.auth !== "string" || typeof s.keys.p256dh !== "string") return false;
  try { const u = new URL(s.endpoint); return u.protocol === "https:" && [ "fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com", "wns2-par02p.notify.windows.com" ].some((host) => u.hostname === host || u.hostname.endsWith("." + host)); } catch { return false; }
}
function cleanWatches(watches) {
  if (!Array.isArray(watches)) return [];
  return watches.slice(0, 60).map((x) => ({
    name: String(x.name || "").trim().slice(0, 110),
    stores: Array.isArray(x.stores) ? x.stores.filter((s) => ALLOWED.includes(s)).slice(0, 5) : [],
    max: Number.isFinite(Number(x.max)) && Number(x.max) >= 0 ? Math.min(100000, Number(x.max)) : 0,
    enabled: x.enabled !== false
  })).filter((x) => x.name.length >= 2 && x.stores.length);
}
function canonical(value) {
  return String(value || "").toLowerCase()
    .replace(/pok[eé]mon|trading card game|\btcg\b|\bmega evolution\b/g, " ")
    .replace(/elite trainer box|\be\.?t\.?b\.?\b/g, " etb ")
    .replace(/30th (?:celebration|anniversary)|30th|thirtieth/g, " thirty ")
    .replace(/booster bundles?/g, " bundle ")
    .replace(/mini tins?/g, " tin ")
    .replace(/\bpre-?order\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
function matches(watch, event) {
  if (!watch.enabled || !watch.stores.includes(event.retailer)) return false;
  if (watch.max > 0 && (event.price_aud == null || Number(event.price_aud) > watch.max)) return false;
  const a = canonical(watch.name).split(" ").filter((x) => x.length > 2 && !["new", "set", "box", "pack", "card", "edition"].includes(x));
  const name = canonical(event.product_name);
  return a.length > 0 && a.every((part) => name.split(" ").includes(part));
}
async function authorized(req, body) {
  const id = body?.deviceId;
  const token = typeof body?.token === "string" ? body.token : "";
  if (!idValid(id) || token.length < 32 || token.length > 128) return null;
  const { data } = await db.from("stockdex_devices").select("*").eq("device_id", id).maybeSingle();
  if (!data || data.secret_hash !== await hash(token)) return null;
  return data;
}
async function send(sub, title, body, deepLink, tag) {
  if (!CONFIG.vapid_public || !CONFIG.vapid_private) throw new Error("Push keys missing");
  const safeUrl = (typeof deepLink === "string" && /^https:\/\//.test(deepLink)) ? deepLink : "https://stockdex-au.onrender.com";
  return await webpush.sendNotification(sub, JSON.stringify({ title, body, url: safeUrl, tag }), { TTL: 300, urgency: "high" });
}
async function register(req, body) {
  const id = body?.deviceId, token = typeof body?.token === "string" ? body.token : "";
  if (!idValid(id) || token.length < 32 || token.length > 128) return bad(req, "Invalid device credentials");
  if (!checkSub(body?.subscription)) return bad(req, "Invalid browser push subscription");
  const watches = cleanWatches(body.watches);
  const opts = {
    notifications: body?.opts?.notifications !== false,
    sound: body?.opts?.sound !== false,
    vibration: body?.opts?.vibration !== false,
    quiet: body?.opts?.quiet === true
  };
  const keyHash = await hash(token);
  const { data: existing, error: readError } = await db.from("stockdex_devices").select("secret_hash").eq("device_id", id).maybeSingle();
  if (readError) return bad(req, "Unable to read device registration", 503);
  if (existing && existing.secret_hash !== keyHash) return bad(req, "Device credential mismatch", 403);
  if (existing) {
    const { error } = await db.from("stockdex_devices").update({
      push_subscription: body.subscription, watches, preferences: opts, updated_at: new Date().toISOString()
    }).eq("device_id", id).eq("secret_hash", keyHash);
    if (error) return bad(req, "Unable to update device", 503);
  } else {
    const { error } = await db.from("stockdex_devices").insert({ device_id: id, secret_hash: keyHash, push_subscription: body.subscription, watches, preferences: opts });
    if (error) return bad(req, "Unable to register device", 503);
  }
  return reply(req, { ok: true, registered: true, watchCount: watches.length });
}
async function test(req, body) {
  const device = await authorized(req, body);
  if (!device) return bad(req, "Not registered", 401);
  if (device.test_sent_at && Date.now() - new Date(device.test_sent_at).getTime() < 60000) return bad(req, "Please wait one minute before another test", 429);
  if (!checkSub(device.push_subscription)) return bad(req, "No valid push subscription");
  await db.from("stockdex_devices").update({ test_sent_at: new Date().toISOString() }).eq("device_id", device.device_id);
  try {
    await send(device.push_subscription, "StockDex · TEST ONLY", "This proves remote push can reach your device. No retailer stock was detected.", "https://stockdex-au.onrender.com", "stockdex-server-test");
    return reply(req, { ok: true, sent: true });
  } catch (e) {
    if ([404, 410].includes(Number(e.statusCode))) await db.from("stockdex_devices").update({ push_subscription: null }).eq("device_id", device.device_id);
    return bad(req, "Remote push failed. Please re-enable alerts and retry.", 502);
  }
}
function productUrl(raw, retailer) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || !RETAILERS[retailer].includes(u.hostname) || u.username || u.password) return null;
    return u.href.slice(0, 1500);
  } catch { return null; }
}
async function provider(req, body) {
  const supplied = req.headers.get("x-stockdex-feed-secret") || "";
  if (!CONFIG.webhook_secret || supplied.length !== CONFIG.webhook_secret.length || supplied !== CONFIG.webhook_secret) return bad(req, "Unauthorized feed", 401);
  // A feed contract is still required from the licensed provider. Never invent stock signals.
  const retailer = String(body?.retailer || "").toLowerCase();
  const product = String(body?.product || body?.product_name || "").trim().slice(0, 180);
  const state = String(body?.status || "").toLowerCase();
  if (!ALLOWED.includes(retailer) || product.length < 5 || !["in_stock", "preorder", "low_stock"].includes(state)) return bad(req, "Invalid retailer, product or stock state");
  const link = productUrl(body?.url, retailer);
  if (!link) return bad(req, "Verified retailer product URL required");
  const price = body.price == null ? null : Number(body.price);
  if (price !== null && (!Number.isFinite(price) || price < 0 || price > 100000)) return bad(req, "Invalid price");
  const claimedTime = body.observedAt ? new Date(body.observedAt) : new Date();
  if (Number.isNaN(claimedTime.getTime()) || Math.abs(Date.now() - claimedTime.getTime()) > 10 * 60 * 1000) return bad(req, "Stale or future event");
  const external = String(body.id || "").trim().slice(0, 150) || await hash(link + "|" + state + "|" + Math.floor(claimedTime.getTime() / 3600000));
  const row = {
    source: "licensed_feed", external_id: external, retailer, product_name: product,
    stock_state: state, price_aud: price, product_url: link, observed_at: claimedTime.toISOString()
  };
  const { data: created, error } = await db.from("stockdex_events").upsert(row, { onConflict: "source,external_id", ignoreDuplicates: true }).select().maybeSingle();
  if (error) return bad(req, "Event storage failed", 503);
  if (!created) return reply(req, { ok: true, duplicate: true, sent: 0 });
  const { data: devices, error: deviceError } = await db.from("stockdex_devices")
    .select("device_id,push_subscription,watches,preferences").not("push_subscription", "is", null).limit(250);
  if (deviceError) return bad(req, "Event stored but device lookup failed", 503);
  let sent = 0, failed = 0;
  for (const device of (devices || [])) {
    if (!device.preferences?.notifications || !checkSub(device.push_subscription)) continue;
    if (!(Array.isArray(device.watches) && device.watches.some((w) => matches(w, created)))) continue;
    if (device.preferences?.quiet) {
      // Quiet hours are interpreted in Australia/Adelaide for the preview; production requires a device timezone.
      const parts = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Adelaide", hour: "numeric", hour12: false }).formatToParts(new Date());
      const hour = Number(parts.find((p) => p.type === "hour")?.value);
      if (hour >= 22 || hour < 7) continue;
    }
    const label = state === "preorder" ? "pre-orders opened" : state === "low_stock" ? "low stock" : "restocked";
    try {
      const name = { jb: "JB Hi-Fi", target: "Target", bigw: "Big W", woolworths: "Woolworths", eb: "EB Games" }[retailer];
      await send(device.push_subscription, name + " " + label + "!", product + (price == null ? "" : " · A$" + price.toFixed(2)), link, "stockdex-" + created.id);
      await db.from("stockdex_deliveries").insert({ event_id: created.id, device_id: device.device_id, status: "sent" });
      sent++;
    } catch (err) {
      failed++;
      if ([404, 410].includes(Number(err.statusCode))) await db.from("stockdex_devices").update({ push_subscription: null }).eq("device_id", device.device_id);
    }
  }
  return reply(req, { ok: true, eventId: created.id, sent, failed });
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  try {
    const path = new URL(req.url).searchParams.get("action") || "status";
    if (req.method === "GET" && path === "status") {
      const { data } = await db.from("stockdex_events").select("received_at").order("received_at", { ascending: false }).limit(1);
      return reply(req, { ok: true, service: "stockdex-api", pushConfigured: !!(CONFIG.vapid_public && CONFIG.vapid_private), vapidPublicKey: CONFIG.vapid_public || null, feedMode: "awaiting_licensed_provider", latestVerifiedAt: data?.[0]?.received_at || null });
    }
    if (req.method === "GET" && path === "events") {
      const { data, error } = await db.from("stockdex_events").select("id,retailer,product_name,stock_state,price_aud,product_url,observed_at,received_at").order("received_at", { ascending: false }).limit(60);
      if (error) return bad(req, "Events unavailable", 503);
      return reply(req, { ok: true, events: data || [], providerConnected: false });
    }
    if (req.method !== "POST") return bad(req, "Method not allowed", 405);
    if (Number(req.headers.get("content-length") || 0) > 30000) return bad(req, "Request too large", 413);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return bad(req, "Invalid JSON");
    if (path === "register") return await register(req, body);
    if (path === "test") return await test(req, body);
    if (path === "provider") return await provider(req, body);
    return bad(req, "Unknown endpoint", 404);
  } catch (err) {
    console.error("StockDex edge error", err?.message);
    return bad(req, "Backend unavailable", 503);
  }
});
