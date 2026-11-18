import { readFile, stat } from "node:fs/promises";

function words(value) {
  return value.normalize("NFKD").toLowerCase().replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(Boolean);
}

function numberPart(value) {
  return value.toLowerCase().replace(/\s/g, "").split("/")
    .map(part => part.replace(/^0+(?=\d)/, "")).join("/");
}

function matchesCard(query, card) {
  const searchable = new Set(words(`${card.name} ${card.set}`));
  const number = query.match(/\b[a-z]*\d{1,4}[a-z]*\s*\/\s*[a-z]*\d{1,4}[a-z]*\b/i)?.[0]
    ?? query.match(/\b(?:gg|tg|sv|swsh|svp|smp|h)?\d{1,4}\b/i)?.[0];
  if (number) {
    const printing = numberPart(card.number);
    const requested = numberPart(number);
    if (requested !== (requested.includes("/") ? printing : printing.split("/")[0])) {
      if (requested.includes("/")) return false;
      return words(query).every(word => searchable.has(word));
    }
  }
  return words(number ? query.replace(number, " ") : query).every(word => searchable.has(word));
}

function ebayLink(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && ["www.ebay.com.au", "ebay.com.au", "www.ebay.com", "ebay.com"].includes(url.hostname)
      && !url.username && !url.password && url.pathname.startsWith("/itm/")) return url.href;
  } catch {}
  return null;
}

export function searchPhotoIndex(index, query, now = Date.now()) {
  const demo = index.mode === "demo";
  const results = [];
  for (const { listing, matches } of index.entries) {
    const end = Date.parse(listing.endTime);
    const url = ebayLink(listing.url);
    if (!demo && (!Number.isFinite(end) || end <= now || !url)) continue;
    const hits = matches.filter(hit => matchesCard(query, hit.card));
    if (!hits.length) continue;
    results.push({
      id: listing.id, title: listing.title, url: demo ? null : url, bid: listing.bid,
      currency: listing.currency, endTime: demo ? null : listing.endTime,
      matches: hits.sort((first, second) => second.score - first.score),
    });
  }
  return demo ? results : results.sort((first, second) => Date.parse(first.endTime) - Date.parse(second.endTime));
}

export function createPhotoSearch(indexPath) {
  let cached;
  return async rawQuery => {
    const query = String(rawQuery ?? "").trim().slice(0, 100);
    if (!words(query).length) return { status: 400, body: { error: "Enter a card name or collector number." } };
    if (!indexPath) return { status: 503, body: { error: "Auction photo search is not connected yet." } };

    try {
      const { ino, size, mtimeMs } = await stat(indexPath);
      const version = `${ino}:${size}:${mtimeMs}`;
      if (cached?.version !== version) {
        const index = JSON.parse(await readFile(indexPath, "utf8"));
        if (!["demo", "pilot"].includes(index.mode) || !Array.isArray(index.entries)) throw new Error("Invalid photo index");
        cached = { version, index };
      }
      const { index } = cached;
      return { status: 200, body: { demo: index.mode === "demo", indexedAt: index.indexedAt, results: searchPhotoIndex(index, query) } };
    } catch (error) {
      if (error.code !== "ENOENT") console.warn("Lot X-Ray index unavailable", error.name);
      return { status: 503, body: { error: "The photo index is temporarily unavailable." } };
    }
  };
}
