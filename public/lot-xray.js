const form = document.querySelector("#photo-search");
const field = document.querySelector("#card");
const status = document.querySelector("#search-status");
const results = document.querySelector("#results");
let pending;

function addText(parent, tag, value, className) {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  parent.append(element);
  return element;
}

function timeRemaining(endTime) {
  const minutes = Math.ceil((Date.parse(endTime) - Date.now()) / 60000);
  if (minutes <= 0) return "Ended";
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m left`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h left`;
}

function renderMatch(item) {
  const row = document.createElement("li");
  const content = document.createElement(item.url ? "a" : "article");
  content.className = "result";
  if (item.url) {
    content.href = item.url;
    content.target = "_blank";
    content.rel = "noopener noreferrer";
  }

  const [best] = item.matches;
  const crop = document.createElement("img");
  crop.src = `data:image/jpeg;base64,${best.cropJpeg}`;
  crop.alt = `${best.card.name}, from listing photo ${best.photoNumber}`;
  crop.loading = "lazy";
  content.append(crop);

  const details = document.createElement("div");
  const identified = item.matches.map(hit => `${hit.card.name} ${hit.card.number}`).join(" · ");
  addText(details, "p", identified, "card-id");
  addText(details, "h2", item.title);
  const auction = [`Photo ${best.photoNumber}`];
  if (item.bid !== null && item.endTime) {
    const bid = new Intl.NumberFormat("en-AU", { style: "currency", currency: item.currency }).format(item.bid);
    auction.push(`${bid} at scan`);
  }
  if (item.endTime) auction.push(timeRemaining(item.endTime));
  addText(details, "p", auction.join(" · "), "auction-details");
  content.append(details);
  row.append(content);
  return row;
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const query = field.value.trim();
  if (!query) return field.focus();
  pending?.abort();
  const controller = new AbortController();
  pending = controller;
  results.replaceChildren();
  status.textContent = "Searching scanned auction photos…";
  try {
    const url = `/api/lot-xray?${new URLSearchParams({ q: query })}`;
    const response = await fetch(url, { signal: controller.signal });
    const data = await response.json();
    if (pending !== controller) return;
    if (!response.ok) return status.textContent = data.error;
    const count = data.results.length;
    const summary = count ? `${count} matching ${count === 1 ? "lot" : "lots"}` : "No matches in the scanned photos.";
    status.textContent = data.demo ? `Sample photos · ${summary}` : summary;
    results.replaceChildren(...data.results.map(renderMatch));
  } catch (error) {
    if (error.name !== "AbortError" && pending === controller) status.textContent = "Search is unavailable. Try again.";
  }
});
