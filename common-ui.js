/* =========================================================
   COMMON UI LOGIC – SAFE SHARED BEHAVIOR
   ========================================================= */

let kbIndex = -1;

/* ---------- Find active visible table ---------- */
function getActiveTable() {
  const activeFeature = document.querySelector(
    "#portfolioFeature:not([style*='display: none'])," +
    "#tfwatchFeature:not([style*='display: none'])," +
    "#trendFeature:not([style*='display: none'])," +
    "#sectorFeature:not([style*='display: none'])"
  );

  if (!activeFeature) return null;
  return activeFeature.querySelector("table");
}

/* ---------- Keyboard navigation ---------- */
document.addEventListener("keydown", e => {
  if (!["ArrowUp", "ArrowDown", "Enter"].includes(e.key)) return;

  const table = getActiveTable();
  if (!table) return;

  const rows = [...table.querySelectorAll("tr")].slice(1);
  if (!rows.length) return;

  rows.forEach(r => r.classList.remove("kb-selected"));

  if (e.key === "ArrowDown") {
    kbIndex = Math.min(kbIndex + 1, rows.length - 1);
    e.preventDefault();
  }

  if (e.key === "ArrowUp") {
    kbIndex = Math.max(kbIndex - 1, 0);
    e.preventDefault();
  }

  const row = rows[kbIndex];
  if (!row) return;

  row.classList.add("kb-selected");
  row.scrollIntoView({ block: "nearest", behavior: "smooth" });

  if (e.key === "Enter") {
    const link = row.querySelector("a");
    if (link) link.click();
  }
});

/* ---------- Sector separators ---------- */
function applySectorSeparators(table) {
  if (!table) return;

  const rows = [...table.querySelectorAll("tr")].slice(1);
  let lastSector = null;

  rows.forEach(row => {
    row.classList.remove("sector-break");

    const cells = [...row.children];
    const sectorCell =
      cells.find(td => td.innerText.length > 2 && td.innerText.length < 40);

    if (!sectorCell) return;

    const sector = sectorCell.innerText.trim();
    if (lastSector !== null && sector !== lastSector) {
      row.classList.add("sector-break");
    }
    lastSector = sector;
  });
}

/* ---------- Auto apply after table updates ---------- */
const observer = new MutationObserver(() => {
  const table = getActiveTable();
  if (table) applySectorSeparators(table);
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});
