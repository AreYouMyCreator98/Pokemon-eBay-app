import { createHash } from "node:crypto";

export const callbackPath = "/api/ebay/account-deletion";
export const callbackUrl = "https://pokemarket-w369.onrender.com" + callbackPath;

export function deletionChallenge(req, res, url) {
  if (url.pathname !== callbackPath) return false;
  if (req.method !== "GET") {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Deletion notification processing is not enabled" }));
    return true;
  }
  const token = process.env.EBAY_DELETION_VERIFICATION_TOKEN;
  const challenge = url.searchParams.get("challenge_code");
  if (!token || !challenge) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Verification not configured" }));
    return true;
  }
  const challengeResponse = createHash("sha256")
    .update(challenge + token + callbackUrl)
    .digest("hex");
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ challengeResponse }));
  return true;
}
