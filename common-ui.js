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
    "#tfstage2Feature:not([style*='display: none'])"
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

/* =========================================================
   CANDLESTICK CHART – SHARED ACROSS ALL FEATURES
   ========================================================= */

const OHLC_FILES = {
  D: "nse_data/nse_daily.csv",
  W: "nse_data/nse_weekly.csv",
  M: "nse_data/nse_monthly.csv",
};

const CHART_CANDLE_COUNTS = {
  D: 45,
  W: 30,
  M: 30,
};

const OHLC_LABELS = { D: "Daily", W: "Weekly", M: "Monthly" };
const ohlcCache = {};

function parseOHLC(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map(h => h.trim());
  const bySymbol = {};
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(",");
    const obj = {};
    headers.forEach((h, j) => { obj[h] = (vals[j] || "").trim(); });
    const sym = obj.Symbol;
    if (!sym) continue;
    if (!bySymbol[sym]) bySymbol[sym] = [];
    bySymbol[sym].push(obj);
  }
  return bySymbol;
}

function loadOHLC(tf) {
  if (ohlcCache[tf]) return Promise.resolve(ohlcCache[tf]);
  return fetch(OHLC_FILES[tf])
    .then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(t => { ohlcCache[tf] = parseOHLC(t); return ohlcCache[tf]; });
}

function getRowDateLabel(row) {
  return (row?.Date || row?.Datetime || "").slice(0, 10);
}

function calcEMA(closes, period) {
  if (!closes || closes.length < period) return [];
  const emas = [];
  const multiplier = 2 / (period + 1);
  let sma = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  emas.push(sma);
  for (let i = period; i < closes.length; i++) {
    sma = closes[i] * multiplier + sma * (1 - multiplier);
    emas.push(sma);
  }
  return emas;
}

function buildChartTitle(symbol, tf, candles) {
  return symbol + "  \u2014  " + (OHLC_LABELS[tf] || tf) + "  (" + candles.length + ")";
}

window.openCandleChart = function(symbol, tf) {
  loadOHLC(tf)
    .then(data => {
      const rows = data[symbol];
      if (!rows || !rows.length) { alert("No " + (OHLC_LABELS[tf] || tf) + " data for " + symbol); return; }
      const candleCount = CHART_CANDLE_COUNTS[tf] || 30;
      const visibleRows = rows.slice(-candleCount);
      window.showChart(symbol, tf, visibleRows, rows);
    })
    .catch(() => alert("Failed to load chart data"));
};

window.showChart = function(symbol, tf, candles, allRows) {
  const canvas = document.getElementById("chartCanvas");
  canvas.width  = Math.min(760, window.innerWidth - 40);
  canvas.height = Math.round(canvas.width * 0.75);
  document.getElementById("chartTitle").textContent = buildChartTitle(symbol, tf, candles);
  document.getElementById("chartTitle").style.marginBottom = "10px";
  window.drawCandles(canvas, candles, allRows, tf);
  document.getElementById("chartOverlay").style.display = "flex";
};

window.closeChart = function() {
  document.getElementById("chartOverlay").style.display = "none";
};

window.drawCandles = function(canvas, candles, allRows, tf) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const P = { t: 22, r: 16, b: 28, l: 62 };
  const cW = W - P.l - P.r, cH = H - P.t - P.b;
  const dark = document.body.classList.contains("dark");
  const bgC    = dark ? "#161b22" : "#ffffff";
  const gridC  = dark ? "#2b313a" : "#e5e5e5";
  const labelC = dark ? "#8b949e" : "#666666";

  ctx.fillStyle = bgC;
  ctx.fillRect(0, 0, W, H);

  let minP = Infinity, maxP = -Infinity;
  candles.forEach(c => {
    const h = +c.High, l = +c.Low;
    if (isFinite(h)) maxP = Math.max(maxP, h);
    if (isFinite(l))  minP = Math.min(minP, l);
  });

  if (!isFinite(minP)) return;

  const pad = (maxP - minP) * 0.05 || 1;
  const lo = minP - pad, hi = maxP + pad, rng = hi - lo;
  const py = p => P.t + cH * (1 - (p - lo) / rng);

  const n = candles.length;
  const slotW = cW / n;
  const bW = Math.max(2, Math.floor(slotW * 0.62));

  // Horizontal grid + price labels
  ctx.strokeStyle = gridC;
  ctx.lineWidth = 0.7;
  ctx.fillStyle = labelC;
  ctx.font = "11px Courier New";
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const pv = lo + rng * i / 4;
    const y  = py(pv);
    ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(W - P.r, y); ctx.stroke();
    ctx.fillText(pv.toFixed(1), P.l - 5, y + 3);
  }

  // Candles
  candles.forEach((c, i) => {
    const o = +c.Open, h = +c.High, l = +c.Low, cl = +c.Close;
    if (![o, h, l, cl].every(isFinite)) return;
    const col = cl >= o ? "#26a69a" : "#ef5350";
    const cx  = P.l + (i + 0.5) * slotW;

    ctx.strokeStyle = col;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(cx, py(h)); ctx.lineTo(cx, py(l)); ctx.stroke();

    const yTop = py(Math.max(o, cl));
    const bH   = Math.max(1.5, py(Math.min(o, cl)) - yTop);
    ctx.fillStyle = col;
    ctx.fillRect(cx - bW / 2, yTop, bW, bH);
  });

  // Draw EMA lines
  const allCloses = allRows.map(r => +r.Close).filter(Number.isFinite);
  const ema10 = calcEMA(allCloses, 10);
  const ema20 = calcEMA(allCloses, 20);
  
  const startIdx10 = Math.max(0, ema10.length - candles.length);
  const startIdx20 = Math.max(0, ema20.length - candles.length);
  
  // Draw EMA 10 in blue
  if (ema10.length > startIdx10) {
    ctx.strokeStyle = "#2196F3";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = startIdx10; i < ema10.length; i++) {
      const candleIdx = i - startIdx10;
      const cx = P.l + (candleIdx + 0.5) * slotW;
      const y = py(ema10[i]);
      if (i === startIdx10) ctx.moveTo(cx, y);
      else ctx.lineTo(cx, y);
    }
    ctx.stroke();
  }

  // Draw EMA 20 in red
  if (ema20.length > startIdx20) {
    ctx.strokeStyle = "#FF4444";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = startIdx20; i < ema20.length; i++) {
      const candleIdx = i - startIdx20;
      const cx = P.l + (candleIdx + 0.5) * slotW;
      const y = py(ema20[i]);
      if (i === startIdx20) ctx.moveTo(cx, y);
      else ctx.lineTo(cx, y);
    }
    ctx.stroke();
  }

  // X-axis date labels (every ~4 candles)
  ctx.fillStyle = labelC;
  ctx.font = "10px Courier New";
  ctx.textAlign = "center";
  const step = Math.max(1, Math.floor(n / 5));
  candles.forEach((c, i) => {
    if (i % step !== 0) return;
    const d = (c.Date || c.Datetime || "").slice(0, 10).slice(5); // MM-DD
    ctx.fillText(d, P.l + (i + 0.5) * slotW, H - 8);
  });
};

// Inject chart overlay on DOMContentLoaded
document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("chartOverlay")) {
    const overlay = document.createElement("div");
    overlay.id = "chartOverlay";
    overlay.onclick = window.closeChart;
    overlay.style.cssText = "display:none;position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:1000;align-items:center;justify-content:center;";
    
    const popup = document.createElement("div");
    popup.id = "chartPopup";
    popup.style.cssText = "background:var(--panel);border-radius:12px;padding:16px 18px;box-shadow:0 10px 40px rgba(0,0,0,0.52);border:1px solid var(--grid);";
    
    const title = document.createElement("div");
    title.id = "chartTitle";
    title.style.cssText = "font-size:12px;font-weight:700;letter-spacing:0.45px;color:var(--text);margin-bottom:10px;";
    
    const canvas = document.createElement("canvas");
    canvas.id = "chartCanvas";
    
    popup.appendChild(title);
    popup.appendChild(canvas);
    overlay.appendChild(popup);
    document.body.appendChild(overlay);
  }
});
