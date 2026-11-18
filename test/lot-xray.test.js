import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPhotoSearch, searchPhotoIndex } from "../lot-xray.js";

const target = { card: { id: "sv2-203", name: "Magikarp", number: "203/193", set: "Paldea Evolved" }, photoNumber: 2, score: 0.91 };
const other = { card: { id: "sv2-42", name: "Magikarp", number: "042/193", set: "Paldea Evolved" }, photoNumber: 1, score: 0.80 };

function lot(id, endTime, matches, url = `https://www.ebay.com.au/itm/${id}`) {
  return { listing: { id, endTime, title: "Binder collection", url, bid: 72.50, currency: "AUD" }, matches };
}

test("finds photo-only exact card matches and links to active eBay auctions", () => {
  const active = "2100-11-19T10:00:00Z";
  const index = { mode: "pilot", entries: [
    lot("123", active, [target, other]), lot("234", "2020-01-01T00:00:00Z", [target]),
    lot("345", active, [other]), lot("456", active, [target], "https://example.com/itm/456"),
  ] };
  const results = searchPhotoIndex(index, "Magikarp 203 / 193");
  assert.deepEqual(results.map(result => result.id), ["123"]);
  assert.equal(results[0].url, "https://www.ebay.com.au/itm/123");
  assert.deepEqual(results[0].matches.map(hit => hit.photoNumber), [2]);
  assert.equal(searchPhotoIndex(index, "Magikarp 203/198").length, 0);
  assert.deepEqual(searchPhotoIndex(index, "Magikarp 42").map(entry => entry.id), ["123", "345"]);
});

test("labels demo results, rejects empty queries and reads a refreshed index", async t => {
  const directory = await mkdtemp(join(tmpdir(), "lot-xray-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "index.json");
  const search = createPhotoSearch(path);
  assert.equal((await search("magikarp")).status, 503);
  assert.equal((await search("/  ")).status, 400);
  await writeFile(path, JSON.stringify({ mode: "demo", entries: [lot("example", null, [target])] }));
  const { status, body } = await search("203/193");
  assert.equal(status, 200);
  assert.equal(body.demo, true);
  assert.equal(body.results[0].url, null);
  await writeFile(path, JSON.stringify({ mode: "demo", entries: [] }));
  assert.deepEqual((await search("203/193")).body.results, []);
});
