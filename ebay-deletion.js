import { createHash, createVerify } from "node:crypto";

export const callbackPath = "/api/ebay/account-deletion";
export const callbackUrl = "https://pokemarket-w369.onrender.com" + callbackPath;
const reply = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(body));
};
const keyCache = new Map();

async function verifiedNotification(req) {
  const header = req.headers["x-ebay-signature"];
  if (typeof header !== "string" || header.length > 8192) throw new Error("Missing signature");
  let meta;
  try { meta = JSON.parse(Buffer.from(header, "base64").toString("utf8")); }
  catch { throw new Error("Invalid signature header"); }
  if (!meta || String(meta.alg).toLowerCase() !== "ecdsa" || String(meta.digest).toUpperCase() !== "SHA1" || !/^[A-Za-z0-9_-]{1,128}$/.test(meta.kid || "") ||
      typeof meta.signature !== "string") throw new Error("Unsupported signature");
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) throw new Error("Payload too large");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks);
  const cached = keyCache.get(meta.kid);
  let publicKey = cached && cached.expires > Date.now() ? cached.key : null;
  if (!publicKey) {
    const credentials = Buffer.from(process.env.EBAY_CLIENT_ID + ":" + process.env.EBAY_CLIENT_SECRET).toString("base64");
    const tokenResponse = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST", headers: { Authorization: "Basic " + credentials, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }),
      signal: AbortSignal.timeout(10000)
    });
    if (!tokenResponse.ok) throw new Error("eBay authentication failed");
    const token = await tokenResponse.json();
    const response = await fetch("https://api.ebay.com/commerce/notification/v1/public_key/" + meta.kid, {
      headers: { Authorization: "Bearer " + token.access_token }, signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error("eBay signing key unavailable");
    const keyData = await response.json();
    publicKey = keyData.key;
    if (typeof publicKey !== "string" || !publicKey.includes("BEGIN PUBLIC KEY")) throw new Error("Invalid public key");
    keyCache.set(meta.kid, { key: publicKey, expires: Date.now() + 3600000 });
    if (keyCache.size > 20) keyCache.delete(keyCache.keys().next().value);
  }
  const verifier = createVerify("SHA1");
  verifier.update(raw);
  verifier.end();
  if (!verifier.verify(publicKey, Buffer.from(meta.signature, "base64"))) throw new Error("Signature mismatch");
  return JSON.parse(raw.toString("utf8"));
}

export async function deletionChallenge(req, res, url) {
  if (url.pathname !== callbackPath) return false;
  if (req.method === "GET") {
    const token = process.env.EBAY_DELETION_VERIFICATION_TOKEN;
    const challenge = url.searchParams.get("challenge_code");
    if (!token || !/^[A-Za-z0-9_-]{32,80}$/.test(token) || !challenge || challenge.length > 2048) {
      reply(res, 503, { error: "Verification not configured" });
      return true;
    }
    const challengeResponse = createHash("sha256").update(challenge + token + callbackUrl).digest("hex");
    reply(res, 200, { challengeResponse });
    return true;
  }
  if (req.method === "POST") {
    try {
      if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET) throw new Error("eBay credentials missing");
      const event = await verifiedNotification(req);
      // Verified requests must be durably processed against all stored eBay-user
      // data before returning 2xx. This integration is not yet connected to
      // a deletion worker, so intentionally request retry instead.
      console.warn("Verified eBay deletion event received; deletion worker unavailable", {
        notificationId: event?.notification?.notificationId || null
      });
      reply(res, 503, { error: "Deletion processing temporarily unavailable" });
    } catch (error) {
      console.error("eBay notification rejected:", error.message);
      reply(res, 503, { error: "Notification could not be processed" });
    }
    return true;
  }
  reply(res, 405, { error: "Method not allowed" });
  return true;
}
