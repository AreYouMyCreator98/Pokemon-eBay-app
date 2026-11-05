import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { deletionChallenge, callbackUrl, callbackPath } from "../ebay-deletion.js";

function mockResponse() {
  return {
    status: null, body: "",
    writeHead(status) { this.status = status; },
    end(body = "") { this.body = body; }
  };
}
test("non-callback paths pass through", async () => {
  const res = mockResponse();
  assert.equal(await deletionChallenge({method:"GET"}, res, new URL("https://example.org/other")), false);
});
test("challenge requires verification token", async () => {
  const prior = process.env.EBAY_DELETION_VERIFICATION_TOKEN;
  delete process.env.EBAY_DELETION_VERIFICATION_TOKEN;
  try {
    const res = mockResponse();
    assert.equal(await deletionChallenge({method:"GET"}, res, new URL("https://example.org" + callbackPath + "?challenge_code=abc")), true);
    assert.equal(res.status, 503);
  } finally {
    if (prior !== undefined) process.env.EBAY_DELETION_VERIFICATION_TOKEN = prior;
  }
});
test("challenge uses exact registered URL and token", async () => {
  const prior = process.env.EBAY_DELETION_VERIFICATION_TOKEN;
  const token = "abcdefghijklmnopqrstuvwxyzABCDEF123456";
  process.env.EBAY_DELETION_VERIFICATION_TOKEN = token;
  try {
    const res = mockResponse();
    const code = "test-challenge";
    await deletionChallenge({method:"GET"}, res, new URL("https://example.org" + callbackPath + "?challenge_code=" + code));
    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(res.body), {
      challengeResponse: createHash("sha256").update(code + token + callbackUrl).digest("hex")
    });
  } finally {
    if (prior === undefined) delete process.env.EBAY_DELETION_VERIFICATION_TOKEN;
    else process.env.EBAY_DELETION_VERIFICATION_TOKEN = prior;
  }
});
test("POST never falsely acknowledges a deletion", async () => {
  const res = mockResponse();
  await deletionChallenge({method:"POST",headers:{}}, res, new URL("https://example.org" + callbackPath));
  assert.equal(res.status, 503);
});
