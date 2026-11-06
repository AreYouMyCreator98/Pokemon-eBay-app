// Shared, low-motion collector UI theme. Defaults to clean light mode.
(function () {
  const KEY = "tcg-theme-preference";
  const doc = document.documentElement;
  const meta = document.querySelector('meta[name="theme-color"]');
  const read = () => { try { return localStorage.getItem(KEY); } catch (_) { return null; } };
  const save = value => { try { localStorage.setItem(KEY, value); } catch (_) {} };
  function apply(value) {
    const theme = value === "dark" ? "dark" : "light";
    doc.dataset.theme = theme;
    doc.style.colorScheme = theme;
    if (meta) meta.setAttribute("content", theme === "dark" ? "#111720" : "#f7f9fc");
    document.querySelectorAll("[data-theme-toggle]").forEach(button => {
      const dark = theme === "dark";
      button.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      button.setAttribute("title", dark ? "Switch to light mode" : "Switch to dark mode");
      button.setAttribute("aria-pressed", dark ? "true" : "false");
      const use = button.querySelector("use");
      if (use) use.setAttribute("href", "/assets/ui/icons.svg#" + (dark ? "sun" : "moon"));
    });
  }
  apply(read() || "light");
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-theme-toggle]");
    if (button) { const next = doc.dataset.theme === "dark" ? "light" : "dark"; save(next); apply(next); }
    const quick = event.target.closest("[data-open-filters]");
    if (quick) document.getElementById("filterToggle")?.click();
  });
  window.addEventListener("storage", event => { if (event.key === KEY) apply(event.newValue); });
  document.addEventListener("DOMContentLoaded", () => apply(read() || "light"), { once: true });
})();
