/* =========================================================
   COMMON UI LOGIC
   - Keyboard navigation
   - Sector separators
   - Dark theme toggle
   - Mobile optimizations
   ========================================================= */

let kbIndex = -1;

/* ---------- Sticky table setup ---------- */
window.applyStickyTableBehavior = function (table) {
  if (!table) return;

  const rows = [...table.querySelectorAll("tr")];
  if (!rows.length) return;

  const headerRow = rows.find(r => r.querySelector("th"));
  if (!headerRow) return;

  const headerCells = [...headerRow.children].filter(c => c.tagName === "TH");
  if (!headerCells.length) return;

  let symbolIndex = headerCells.findIndex(
    th => (th.textContent || "").trim().toUpperCase() === "SYMBOL"
  );

  if (symbolIndex < 0) {
    symbolIndex = 0;
  }

  headerCells[symbolIndex]?.classList.add("symbol-col");

  rows.forEach(r => {
    const dataCells = [...r.children].filter(c => c.tagName === "TD");
    if (dataCells[symbolIndex]) {
      dataCells[symbolIndex].classList.add("symbol-col");
    }
  });
};

/* ---------- Active table ---------- */
function getActiveTable() {
  const active = document.querySelector(
    "#portfolioFeature:not([style*='display: none'])," +
    "#tfwatchFeature:not([style*='display: none'])," +
    "#tfcoreFeature:not([style*='display: none'])," +
    "#tfstudyFeature:not([style*='display: none'])," +
    "#tfstage2Feature:not([style*='display: none'])," +
    "#trendFeature:not([style*='display: none'])"
  );
  return active ? active.querySelector("table") : null;
}

/* ---------- Keyboard navigation ---------- */
document.addEventListener("keydown", e => {
  if (!["ArrowUp", "ArrowDown", "Enter"].includes(e.key)) return;

  const table = getActiveTable();
  if (!table) return;

  const rows = [...table.querySelectorAll("tr")].slice(1);
  if (!rows.length) return;

  rows.forEach(r => r.classList.remove("kb-selected"));

  if (e.key === "ArrowDown") kbIndex = Math.min(kbIndex + 1, rows.length - 1);
  if (e.key === "ArrowUp") kbIndex = Math.max(kbIndex - 1, 0);

  const row = rows[kbIndex];
  if (!row) return;

  row.classList.add("kb-selected");
  row.scrollIntoView({ block: "nearest", behavior: "smooth" });

  if (e.key === "Enter") {
    const link = row.querySelector("a");
    if (link) link.click();
  }

  e.preventDefault();
}, { passive: false });

/* ---------- Sector separators ---------- */
function applySectorSeparators(table) {
  const rows = [...table.querySelectorAll("tr")].slice(1);
  let last = null;

  rows.forEach(r => {
    r.classList.remove("sector-break");
    const cells = [...r.children];
    const sector = cells.find(td => td.innerText.length > 2 && td.innerText.length < 40);
    if (!sector) return;

    if (last && sector.innerText !== last) r.classList.add("sector-break");
    last = sector.innerText;
  });
}

/* ---------- Auto apply (debounced for performance) ---------- */
let sectorTimeout;
new MutationObserver(() => {
  clearTimeout(sectorTimeout);
  sectorTimeout = setTimeout(() => {
    const tables = document.querySelectorAll("#app table");
    tables.forEach(window.applyStickyTableBehavior);

    const table = getActiveTable();
    if (table) applySectorSeparators(table);
  }, 50);
}).observe(document.body, { childList: true, subtree: true });

/* ---------- Dark theme toggle ---------- */
function toggleTheme() {
  document.body.classList.toggle("dark");
  localStorage.setItem(
    "theme",
    document.body.classList.contains("dark") ? "dark" : "light"
  );
}

/* ---------- Load theme ---------- */
document.addEventListener("DOMContentLoaded", () => {
  if (localStorage.getItem("theme") === "dark") {
    document.body.classList.add("dark");
  }
});

/* ---------- Touch scroll optimization ---------- */
document.addEventListener("touchstart", () => {}, { passive: true });
document.addEventListener("touchmove", () => {}, { passive: true });
