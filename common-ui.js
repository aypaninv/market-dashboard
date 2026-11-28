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

  const rows = [...table.rows];
  if (!rows.length) return;

  // Already processed for this exact row count -> skip (observer fires on every DOM change)
  if (table.dataset.stickyRows === String(rows.length)) return;

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
    let tdIndex = -1;
    for (const c of r.children) {
      if (c.tagName !== "TD") continue;
      tdIndex++;
      if (tdIndex === symbolIndex) {
        c.classList.add("symbol-col");
        break;
      }
    }
  });

  // Sortable headers (onclick) must be keyboard reachable
  headerCells.forEach(th => {
    if (th.onclick && !th.hasAttribute("tabindex")) th.tabIndex = 0;
  });

  table.dataset.stickyRows = String(rows.length);
};

/* ---------- Active table ---------- */
function getActiveFeature() {
  const featureIds = [
    "indicesFeature",
    "portfolioFeature",
    "tfwatchFeature",
    "tfcoreFeature",
    "tfstudyFeature",
    "nseboFeature",
    "nsercFeature",
    "sectorFeature",
  ];

  for (const id of featureIds) {
    const element = document.getElementById(id);
    if (!element) continue;

    const style = window.getComputedStyle(element);
    if (style.display !== "none" && style.visibility !== "hidden") {
      return element;
    }
  }

  return null;
}

function getActiveTable() {
  const active = getActiveFeature();
  return active ? active.querySelector("table") : null;
}

/* ---------- Keyboard navigation ---------- */
document.addEventListener("keydown", e => {
  // Enter / Space on a focused sortable header = click it
  const focusedTh = e.target && e.target.closest ? e.target.closest("th") : null;
  if (focusedTh && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    focusedTh.click();
    return;
  }

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
  // Stamp by row count: the observer fires on every DOM change, skip when this table was already processed
  if (table.dataset.sepRows === String(table.rows.length)) return;

  const rows = [...table.rows].slice(1);
  let last = null;

  rows.forEach(r => {
    r.classList.remove("sector-break");
    const cells = [...r.children];
    const sector = cells.find(td => td.textContent.length > 2 && td.textContent.length < 40);
    if (!sector) return;

    const text = sector.textContent;
    if (last && text !== last) r.classList.add("sector-break");
    last = text;
  });

  table.dataset.sepRows = String(table.rows.length);
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
  if (typeof window.syncThemeButton === "function") window.syncThemeButton();
  // Re-draw an open chart in the new theme
  if (typeof window.__chartRedraw === "function") window.__chartRedraw();
}

/* ---------- Load theme (saved choice, else OS preference) ---------- */
document.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem("theme");
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (saved ? saved === "dark" : prefersDark) {
    document.body.classList.add("dark");
  }
  if (typeof window.syncThemeButton === "function") window.syncThemeButton();
});

/* ---------- Touch scroll optimization ---------- */
document.addEventListener("touchstart", () => {}, { passive: true });
document.addEventListener("touchmove", () => {}, { passive: true });

/* =========================================================
   CANDLESTICK CHART – SHARED ACROSS ALL FEATURES
   ========================================================= */

const OHLC_FILES_BY_SOURCE = {
  symbol: {
    D: "nse_data/nse_daily.csv",
    W: "nse_data/nse_weekly.csv",
    M: "nse_data/nse_monthly.csv",
    Y: "nse_data/nse_yearly.csv",
  },
  sector: {
    D: "nse_data/sector_daily.csv",
    W: "nse_data/sector_weekly.csv",
    M: "nse_data/sector_monthly.csv",
  },
};

const CHART_CANDLE_COUNTS = {
  D: 100,
  W: 30,
  M: 30,
  Y: 15,
};

const W_LOOKBACK_WEEKS = 10;
const M_LOOKBACK_MONTHS = 6;
const TF_LOOKBACK = { D: 14, W: W_LOOKBACK_WEEKS, M: M_LOOKBACK_MONTHS, Y: 10 };

// RSI sub-chart settings (keep in sync with RSI_PERIOD / RSI_MIDDLE_LIMIT in technical_symbol.py)
const CHART_RSI_PERIOD = 14;
const CHART_RSI_MIDDLE = 55;
const CHART_RSI_TFS = ["D", "W", "M"];
const CHART_RSI_GAP = 14;
const CHART_RSI_HEIGHT = 80;

function chartShowsRsi(tf) {
  return CHART_RSI_TFS.includes(tf) && chartState.sourceType === "symbol";
}

// Wilder RSI (same as compute_rsi in technical_sector.py); returns array aligned to rows (null when unavailable)
function computeRsiSeries(rows, period) {
  const out = new Array(rows.length).fill(null);
  const alpha = 1 / period;
  let avgGain = null, avgLoss = null, count = 0;
  let prevClose = null;

  rows.forEach((row, i) => {
    const close = +row.Close;
    if (!Number.isFinite(close)) return;
    if (prevClose === null) { prevClose = close; return; }

    const delta = close - prevClose;
    prevClose = close;
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);

    if (avgGain === null) {
      avgGain = gain;
      avgLoss = loss;
    } else {
      avgGain = (1 - alpha) * avgGain + alpha * gain;
      avgLoss = (1 - alpha) * avgLoss + alpha * loss;
    }
    count++;
    if (count < period) return;

    if (avgGain === 0 && avgLoss === 0) out[i] = 50;
    else if (avgLoss === 0) out[i] = 100;
    else out[i] = 100 - 100 / (1 + avgGain / avgLoss);
  });

  return out;
}

const OHLC_LABELS = { D: "Daily", W: "Weekly", M: "Monthly", Y: "Yearly" };
const ohlcCache = {};
const chartState = {
  symbol: null,
  tf: null,
  symbols: [],
  index: -1,
  sourceTable: null,
  sourceType: "symbol",
  chartMode: "STD",
};

// HA stoploss value (SLV): within the last `lookback` HA candles (current included), take the GREEN HA candle
// (HA close >= HA open) with the highest HA high (latest wins a tie); its HA low is the stoploss. Null when no
// green HA candle exists in the window. Mirrors prepare_heikin_ashi_stoploss_map_df in technical_symbol.py
// (W_LOOKBACK_CANDLE / M_LOOKBACK_CANDLE must stay in sync with W_LOOKBACK_WEEKS / M_LOOKBACK_MONTHS).
function computeHaStopLoss(rows, lookback) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const valid = rows.filter(r =>
    [r.Open, r.High, r.Low, r.Close].every(v => v !== "" && v != null && Number.isFinite(Number(v)))
  );
  if (!valid.length) return null;

  const ha = toHeikinAshiSeries(valid);
  const recent = ha.slice(-Math.max(lookback, 1));
  let best = null;
  recent.forEach(c => {
    if (c.Close < c.Open) return;
    if (best === null || c.High >= best.High) best = c;
  });
  return best && Number.isFinite(best.Low) ? best.Low : null;
}

function toHeikinAshiSeries(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];

  const ha = rows.map((row, idx) => ({
    Date: row.Date || row.Datetime || "",
    Symbol: row.Symbol || "",
    Open: Number(row.Open),
    High: Number(row.High),
    Low: Number(row.Low),
    Close: Number(row.Close),
  }));

  if (!ha.length) return [];

  let prevOpen = null;
  let prevClose = null;

  return ha.map((row, idx) => {
    const open = Number.isFinite(row.Open) ? row.Open : 0;
    const high = Number.isFinite(row.High) ? row.High : 0;
    const low = Number.isFinite(row.Low) ? row.Low : 0;
    const close = Number.isFinite(row.Close) ? row.Close : 0;

    const haClose = (open + high + low + close) / 4;
    const haOpen = idx === 0
      ? (open + close) / 2
      : (prevOpen + prevClose) / 2;
    const haHigh = Math.max(high, haOpen, haClose);
    const haLow = Math.min(low, haOpen, haClose);

    prevOpen = haOpen;
    prevClose = haClose;

    return {
      ...row,
      Open: haOpen,
      High: haHigh,
      Low: haLow,
      Close: haClose,
    };
  });
}

function getTableSymbols(table) {
  if (!table) return [];

  const symbols = [];
  const seen = new Set();
  const rows = [...table.querySelectorAll("tr")].slice(1);

  rows.forEach(row => {
    const symbolCell = row.querySelector("td.symbol-col a") || row.querySelector("td a");
    const symbol = (symbolCell?.textContent || "").trim();
    if (!symbol || seen.has(symbol)) return;
    seen.add(symbol);
    symbols.push(symbol);
  });

  return symbols;
}

function getActiveTableSymbols() {
  if (chartState.sourceTable) {
    return getTableSymbols(chartState.sourceTable);
  }

  const activeTable = getActiveTable();
  return getTableSymbols(activeTable);
}

function updateChartNavButtons() {
  const upBtn = document.getElementById("chartNavUpBtn");
  const downBtn = document.getElementById("chartNavDownBtn");
  const hasList = Array.isArray(chartState.symbols) && chartState.symbols.length > 0;
  const hasPrev = hasList && chartState.index > 0;
  const hasNext = hasList && chartState.index >= 0 && chartState.index < chartState.symbols.length - 1;

  [
    [upBtn, hasPrev],
    [downBtn, hasNext],
  ].forEach(([btn, enabled]) => {
    if (!btn) return;
    btn.disabled = !enabled;
    btn.style.opacity = enabled ? "1" : "0.45";
    btn.style.cursor = enabled ? "pointer" : "not-allowed";
  });
}

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

function loadOHLC(tf, sourceType = "symbol") {
  const files = OHLC_FILES_BY_SOURCE[sourceType] || OHLC_FILES_BY_SOURCE.symbol;
  const key = sourceType + ":" + tf;
  if (ohlcCache[key]) return Promise.resolve(ohlcCache[key]);
  return fetch(files[tf])
    .then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(t => { ohlcCache[key] = parseOHLC(t); return ohlcCache[key]; });
}

function getRowDateLabel(row) {
  return (row?.Date || row?.Datetime || "").slice(0, 10);
}

function getSectorForSymbolFromTable(symbol, table) {
  if (!symbol || !table) return "";

  const headerCells = [...table.querySelectorAll("tr:first-child th")];
  if (!headerCells.length) return "";

  const colNames = headerCells.map(th => String(th.textContent || "").trim().toUpperCase());
  const symbolIdx = colNames.indexOf("SYMBOL");
  const sectorIdx = colNames.indexOf("SECTOR");
  if (symbolIdx < 0 || sectorIdx < 0) return "";

  const rows = [...table.querySelectorAll("tr")].slice(1);
  for (const row of rows) {
    const cells = [...row.querySelectorAll("td")];
    if (!cells[symbolIdx] || !cells[sectorIdx]) continue;
    const rowSymbol = String(cells[symbolIdx].textContent || "").trim();
    if (rowSymbol !== symbol) continue;
    return String(cells[sectorIdx].textContent || "").trim();
  }

  return "";
}

function getChartRowMetaFromTable(symbol, table) {
  if (!symbol || !table) return {};

  const headerCells = [...table.querySelectorAll("tr:first-child th")];
  if (!headerCells.length) return {};

  const headerNames = headerCells.map(th => String(th.textContent || "").trim().toUpperCase());
  const symbolIdx = headerNames.indexOf("SYMBOL");
  if (symbolIdx < 0) return {};

  const metaFields = ["BO_P", "SL_P", "BO_TH", "SL_TH", "F_BO", "D_BO", "W_BO", "M_BO"];
  const rows = [...table.querySelectorAll("tr")].slice(1);
  for (const row of rows) {
    const cells = [...row.querySelectorAll("td")];
    if (!cells[symbolIdx]) continue;
    const rowSymbol = String(cells[symbolIdx].textContent || "").trim();
    if (rowSymbol !== symbol) continue;

    const meta = {};
    metaFields.forEach(field => {
      const idx = headerNames.indexOf(field.toUpperCase());
      if (idx >= 0 && cells[idx]) {
        meta[field] = cells[idx].textContent.trim();
      }
    });
    return meta;
  }

  return {};
}

function buildChartTitle(symbol, tf, candles) {
  if (chartState.sourceType === "symbol") {
    const sectorName = getSectorForSymbolFromTable(symbol, chartState.sourceTable || getActiveTable());
    if (sectorName) return symbol + " - (" + sectorName + ")";
  }
  return symbol;
}

function setActiveChartTfButton(tf) {
  ["D", "W", "M", "Y"].forEach(key => {
    const btn = document.getElementById("chartTfBtn_" + key);
    if (!btn) return;
    const active = key === tf;
    btn.style.background = active ? "var(--accent, #2563eb)" : "transparent";
    btn.style.color = active ? "#fff" : "var(--text)";
    btn.style.borderColor = active ? "var(--accent, #2563eb)" : "var(--grid)";
  });
}

// Single HA toggle button: off = standard candles (default), on = Heikin-Ashi candles
function setActiveChartModeButton(mode) {
  const btn = document.getElementById("chartModeBtn_HA");
  if (!btn) return;
  const active = mode === "HA";
  btn.style.background = active ? "var(--accent, #2563eb)" : "transparent";
  btn.style.color = active ? "#fff" : "var(--text)";
  btn.style.borderColor = active ? "var(--accent, #2563eb)" : "var(--grid)";
  btn.setAttribute("aria-pressed", active ? "true" : "false");
  btn.title = active ? "Heikin-Ashi candles (click for standard)" : "Standard candles (click for Heikin-Ashi)";
}

window.setChartMode = function(mode) {
  const nextMode = mode === "HA" ? "HA" : "STD";
  chartState.chartMode = nextMode;
  setActiveChartModeButton(nextMode);
  if (chartState.symbol && chartState.tf) {
    window.renderCandleChart(chartState.symbol, chartState.tf, chartState.sourceType || "symbol");
  }
};

window.renderCandleChart = function(symbol, tf, sourceType = "symbol") {
  const eventTarget = window.event?.target;
  const sourceTable = eventTarget?.closest?.("table") || chartState.sourceTable || getActiveTable();
  chartState.sourceTable = sourceTable || null;
  chartState.symbol = symbol;
  chartState.tf = tf;
  chartState.sourceType = sourceType;
  chartState.symbols = getActiveTableSymbols();
  chartState.index = chartState.symbols.indexOf(symbol);

  Promise.all([loadOHLC(tf, sourceType), loadOHLC("W", sourceType), loadOHLC("M", sourceType)])
    .then(([data, weeklyData, monthlyData]) => {
      const rows = data[symbol];
      if (!rows || !rows.length) { alert("No " + (OHLC_LABELS[tf] || tf) + " data for " + symbol); return; }

      const rowMeta = getChartRowMetaFromTable(symbol, chartState.sourceTable || getActiveTable());
      const weeklyRows = weeklyData[symbol] || [];
      const monthlyRows = monthlyData[symbol] || [];

      // Reference candle for current TF: newest highest-close standard candle in the recent lookback window
      let refDate = null;
      const tfLookback = TF_LOOKBACK[tf] || 10;
      const recentTf = rows.slice(-tfLookback);
      if (recentTf.length) {
        const highestClose = Math.max(...recentTf.map(r => +r.Close).filter(v => Number.isFinite(v)));
        const refRow = recentTf.filter(r => +r.Close === highestClose).slice(-1)[0];
        if (refRow) refDate = getRowDateLabel(refRow);
      }

      const candleCount = CHART_CANDLE_COUNTS[tf] || 30;
      const displayRows = rows.slice(-candleCount);
      const chartMeta = {
        boP: rowMeta.BO_P ? parseFloat(rowMeta.BO_P) : null,
        slP: rowMeta.SL_P ? parseFloat(rowMeta.SL_P) : null,
        wSlv: sourceType === "symbol" ? computeHaStopLoss(weeklyRows, W_LOOKBACK_WEEKS) : null,
        mSlv: sourceType === "symbol" ? computeHaStopLoss(monthlyRows, M_LOOKBACK_MONTHS) : null,
      };
      window.showChart(symbol, tf, displayRows, rows, refDate, chartMeta);
      setActiveChartTfButton(tf);
      setActiveChartModeButton(chartState.chartMode || "STD");
      updateChartNavButtons();
    })
    .catch(() => alert("Failed to load chart data"));
};

window.openCandleChart = function(symbol, tf) {
  window.renderCandleChart(symbol, tf, "symbol");
};

const CHART_MAX_WIDTH = 1000;
const CHART_ASPECT = 0.62;

window.showChart = function(symbol, tf, candles, allRows, refDate, chartMeta = {}) {
  const canvas = document.getElementById("chartCanvas");
  const info = document.getElementById("chartInfo");
  const rsiBlock = chartShowsRsi(tf) ? CHART_RSI_GAP + CHART_RSI_HEIGHT : 0;
  canvas.width  = Math.min(CHART_MAX_WIDTH, window.innerWidth - 56);
  // Wider chart, but keep the whole popup (header + info + canvas) inside the viewport height
  const maxPriceH = Math.max(260, window.innerHeight - 170 - rsiBlock);
  canvas.height = Math.min(Math.round(canvas.width * CHART_ASPECT), maxPriceH) + rsiBlock;
  if (info) info.style.maxWidth = canvas.width + "px";
  canvas.style.display = "block";
  document.getElementById("chartTitle").textContent = buildChartTitle(symbol, tf, candles);
  document.getElementById("chartTitle").style.marginBottom = "10px";
  if (info) info.textContent = "";
  window.drawCandles(canvas, candles, allRows, tf, refDate, chartMeta);
  document.getElementById("chartOverlay").style.display = "flex";
};

window.closeChart = function() {
  document.getElementById("chartOverlay").style.display = "none";
  window.__chartRedraw = null;
  chartState.symbol = null;
  chartState.tf = null;
  chartState.symbols = [];
  chartState.index = -1;
  chartState.sourceTable = null;
  chartState.sourceType = "symbol";
};

window.navigateChartSymbol = function(direction) {
  if (!Array.isArray(chartState.symbols) || !chartState.symbols.length) return;
  if (!chartState.symbol || !chartState.tf) return;

  const nextIndex = chartState.index + direction;
  if (nextIndex < 0 || nextIndex >= chartState.symbols.length) return;

  const nextSymbol = chartState.symbols[nextIndex];
  if (!nextSymbol) return;

  window.renderCandleChart(nextSymbol, chartState.tf, chartState.sourceType || "symbol");
};

window.drawCandles = function(canvas, candles, allRows, tf, refDate, chartMeta = {}) {
  const ctx = canvas.getContext("2d");
  const mode = chartState.chartMode || "STD";
  const visibleCandles = mode === "HA" ? toHeikinAshiSeries(candles) : candles;
  const W = canvas.width, H = canvas.height;
  const P = { t: 22, r: 16, b: 28, l: 62 };
  const showRsi = chartShowsRsi(tf);
  const rsiBlock = showRsi ? CHART_RSI_GAP + CHART_RSI_HEIGHT : 0;
  const cW = W - P.l - P.r, cH = H - P.t - P.b - rsiBlock;
  const priceBottom = P.t + cH;
  const rsiTop = priceBottom + CHART_RSI_GAP;
  const rsiBottom = rsiTop + CHART_RSI_HEIGHT;
  const dark = document.body.classList.contains("dark");
  const bgC    = dark ? "#161b22" : "#ffffff";
  const gridC  = dark ? "#2b313a" : "#e5e5e5";
  const labelC = dark ? "#8b949e" : "#666666";

  ctx.fillStyle = bgC;
  ctx.fillRect(0, 0, W, H);

  let minP = Infinity, maxP = -Infinity;
  visibleCandles.forEach(c => {
    const h = +c.High, l = +c.Low;
    if (isFinite(h)) maxP = Math.max(maxP, h);
    if (isFinite(l))  minP = Math.min(minP, l);
  });

  if (!isFinite(minP)) return;

  const pad = (maxP - minP) * 0.05 || 1;
  const lo = minP - pad, hi = maxP + pad, rng = hi - lo;
  const py = p => P.t + cH * (1 - (p - lo) / rng);

  const n = visibleCandles.length;
  const slotW = cW / n;
  const bW = Math.max(2, Math.floor(slotW * 0.62));

  const infoEl = document.getElementById("chartInfo");
  const latest = candles[candles.length - 1] || null;

  // RSI aligned to the visible candles (computed on full history for warm-up)
  let rsiVisible = [];
  if (showRsi) {
    const rsiAll = computeRsiSeries(allRows || candles, CHART_RSI_PERIOD);
    rsiVisible = rsiAll.slice(Math.max(0, rsiAll.length - n));
  }

  function drawRsiPanel(hoverIndex) {
    const rsiY = v => rsiTop + CHART_RSI_HEIGHT * (1 - v / 100);
    const midY = rsiY(CHART_RSI_MIDDLE);

    // Middle limit (dotted)
    ctx.strokeStyle = labelC;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(P.l, midY);
    ctx.lineTo(W - P.r, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = labelC;
    ctx.font = "10px Courier New";
    ctx.textAlign = "right";
    ctx.fillText(String(CHART_RSI_MIDDLE), P.l - 5, midY + 3);

    // RSI thin line
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 1;
    ctx.beginPath();
    let started = false;
    rsiVisible.forEach((v, i) => {
      if (!Number.isFinite(v)) return;
      const x = P.l + (i + 0.5) * slotW;
      if (!started) { ctx.moveTo(x, rsiY(v)); started = true; }
      else ctx.lineTo(x, rsiY(v));
    });
    ctx.stroke();

    const idx = Number.isInteger(hoverIndex) && hoverIndex >= 0 && hoverIndex < n ? hoverIndex : n - 1;
    const cur = rsiVisible[idx];
    ctx.fillStyle = "#ef4444";
    ctx.textAlign = "left";
    ctx.fillText("RSI(" + CHART_RSI_PERIOD + ") " + (Number.isFinite(cur) ? cur.toFixed(1) : "NA"), P.l + 4, rsiTop + 10);
  }

  function fmt(v, d) {
    return Number.isFinite(+v) ? (+v).toFixed(d) : "NA";
  }

  function fmtCompact(v) {
    return Number.isFinite(+v) ? String(Math.trunc(+v)) : "NA";
  }

  function setInfo(row, hoverMode) {
    if (!infoEl || !row) return;
    const d = getRowDateLabel(row);
    const o = fmtCompact(row.Open);
    const h = fmtCompact(row.High);
    const l = fmtCompact(row.Low);
    const c = fmtCompact(row.Close);
    infoEl.innerHTML =
      '<div>Date:' + d +
      ' <span style="color:#1976d2;">O:' + o + '</span>' +
      ' <span style="color:#2e7d32;">H:' + h + '</span>' +
      ' <span style="color:#d32f2f;">L:' + l + '</span>' +
      ' <span style="color:#f59e0b;">C:' + c + '</span></div>';
  }

  function drawPricePointerLine(y, color, label) {
    if (!Number.isFinite(y)) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(P.l, y);
    ctx.lineTo(W - P.r, y);
    ctx.stroke();
    ctx.setLineDash([]);

    const tag = label;
    ctx.font = "10px Courier New";
    const tw = ctx.measureText(tag).width + 8;
    const tx = P.l + 6;
    const ty = Math.max(P.t + 10, Math.min(priceBottom - 2, y + 3));
    ctx.fillStyle = dark ? "rgba(22,27,34,0.88)" : "rgba(255,255,255,0.9)";
    ctx.fillRect(tx, ty - 10, tw, 13);
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.fillText(tag, tx + 4, ty);
  }

  // Thin dotted horizontal line with its label/value on top of the line (left aligned).
  function drawStopLossLine(value, color, name) {
    if (!Number.isFinite(value)) return;
    const y = Math.min(Math.max(py(value), P.t + 12), priceBottom - 10);
    const tag = name + " " + value.toFixed(1);

    ctx.font = "10px Courier New";
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.fillText(tag, P.l + 6, y - 3);

    ctx.strokeStyle = color;
    ctx.lineWidth = 0.8;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(P.l, y);
    ctx.lineTo(W - P.r, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Horizontal grid + price labels
  function drawChart(hoverIndex) {
    ctx.fillStyle = bgC;
    ctx.fillRect(0, 0, W, H);

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

    visibleCandles.forEach((c, i) => {
      const o = +c.Open, h = +c.High, l = +c.Low, cl = +c.Close;
      if (![o, h, l, cl].every(isFinite)) return;
      const isRef = refDate && getRowDateLabel(c) === refDate;
      const isBull = cl >= o;
      const refCol = isBull ? "#0f766e" : "#b91c1c";
      const col = isRef ? refCol : (isBull ? "#26a69a" : "#ef5350");
      const cx  = P.l + (i + 0.5) * slotW;

      ctx.strokeStyle = col;
      ctx.lineWidth = isRef ? 1.6 : 1.2;
      ctx.beginPath(); ctx.moveTo(cx, py(h)); ctx.lineTo(cx, py(l)); ctx.stroke();

      const yTop = py(Math.max(o, cl));
      const bH   = Math.max(1.5, py(Math.min(o, cl)) - yTop);
      ctx.fillStyle = col;
      ctx.fillRect(cx - bW / 2, yTop, bW, bH);

      if (isRef) {
        const mY = py(h) - 10;
        ctx.fillStyle = refCol;
        ctx.beginPath();
        ctx.moveTo(cx, mY + 7);
        ctx.lineTo(cx - 4, mY);
        ctx.lineTo(cx + 4, mY);
        ctx.closePath();
        ctx.fill();
      }
    });

    if (tf === "D" || tf === "W" || tf === "M") {
      drawStopLossLine(chartMeta.wSlv, "#f97316", "W_SLV");
      drawStopLossLine(chartMeta.mSlv, "#0ea5e9", "M_SLV");
    }

    if (tf === "D") {
      if (Number.isFinite(chartMeta.boP)) {
        const yBo = Math.min(Math.max(py(chartMeta.boP), P.t + 10), priceBottom - 10);
        drawPricePointerLine(yBo, "#22c55e", "BO_P " + chartMeta.boP.toFixed(1));
      }

      if (Number.isFinite(chartMeta.slP)) {
        const ySl = Math.min(Math.max(py(chartMeta.slP), P.t + 10), priceBottom - 10);
        drawPricePointerLine(ySl, "#ef4444", "SL_P " + chartMeta.slP.toFixed(1));
      }
    }

    if (showRsi) drawRsiPanel(hoverIndex);

    // X-axis date labels (every ~4 candles)
    ctx.fillStyle = labelC;
    ctx.font = "10px Courier New";
    ctx.textAlign = "center";
    const step = Math.max(1, Math.floor(n / 5));
    visibleCandles.forEach((c, i) => {
      if (i % step !== 0) return;
      const d = (c.Date || c.Datetime || "").slice(0, 10).slice(5);
      ctx.fillText(d, P.l + (i + 0.5) * slotW, H - 8);
    });

    // Crosshair + hover candle highlight
    if (Number.isInteger(hoverIndex) && hoverIndex >= 0 && hoverIndex < n) {
      const row = candles[hoverIndex];
      const cx = P.l + (hoverIndex + 0.5) * slotW;
      const o = +row.Open;
      const h = +row.High;
      const l = +row.Low;
      const cl = +row.Close;
      const yClose = py(cl);

      ctx.strokeStyle = dark ? "rgba(139,148,158,0.7)" : "rgba(80,90,100,0.6)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(cx, P.t);
      ctx.lineTo(cx, H - P.b);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(P.l, yClose);
      ctx.lineTo(W - P.r, yClose);
      ctx.stroke();
      ctx.setLineDash([]);

      drawPricePointerLine(py(o), "#1976d2", "O " + fmt(o, 2));
      drawPricePointerLine(py(h), "#2e7d32", "H " + fmt(h, 2));
      drawPricePointerLine(py(l), "#d32f2f", "L " + fmt(l, 2));
      drawPricePointerLine(py(cl), "#f59e0b", "C " + fmt(cl, 2));

      setInfo(row, true);
    }
  }

  setInfo(latest, false);
  drawChart(null);
  window.__chartRedraw = function() {
    drawChart(null);
    setInfo(latest, false);
  };

  canvas.onmousemove = function(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (rect.width ? canvas.width / rect.width : 1);
    if (x < P.l || x > W - P.r) {
      drawChart(null);
      setInfo(latest, false);
      return;
    }
    const idx = Math.floor((x - P.l) / slotW);
    if (idx >= 0 && idx < n) {
      drawChart(idx);
    }
  };

  canvas.onmouseleave = function() {
    drawChart(null);
    setInfo(latest, false);
  };
};

// Inject chart overlay on DOMContentLoaded
document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("chartOverlay")) {
    const overlay = document.createElement("div");
    overlay.id = "chartOverlay";
    overlay.onclick = (e) => {
      if (e.target === overlay) window.closeChart();
    };
    overlay.style.cssText = "display:none;position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:1000;align-items:center;justify-content:center;";
    
    const popup = document.createElement("div");
    popup.id = "chartPopup";
    popup.style.cssText = "background:var(--panel);border-radius:12px;padding:16px 18px;box-shadow:0 10px 40px rgba(0,0,0,0.52);border:1px solid var(--grid);box-sizing:border-box;max-width:calc(100vw - 8px);max-height:calc(100dvh - 8px);overflow:auto;";
    popup.onclick = (e) => e.stopPropagation();

    const headerRow = document.createElement("div");
    headerRow.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px;";

    const rightControls = document.createElement("div");
    rightControls.style.cssText = "display:flex;justify-content:flex-end;align-items:center;gap:8px;flex-shrink:0;";

    const navControls = document.createElement("div");
    navControls.style.cssText = "display:flex;justify-content:flex-end;align-items:center;gap:8px;flex-shrink:0;";

    const tfControls = document.createElement("div");
    tfControls.style.cssText = "display:flex;justify-content:flex-end;align-items:center;gap:8px;flex-shrink:0;";

    const modeControls = document.createElement("div");
    modeControls.style.cssText = "display:flex;justify-content:flex-end;align-items:center;gap:8px;flex-shrink:0;";

    const makeHeaderButton = (id, text, onClick) => {
      const btn = document.createElement("button");
      btn.id = id;
      btn.type = "button";
      btn.textContent = text;
      btn.style.cssText = "min-width:30px;height:24px;padding:0 8px;border:1px solid var(--grid);border-radius:6px;background:transparent;color:var(--text);font-size:11px;font-weight:700;cursor:pointer;";
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      };
      return btn;
    };

    navControls.appendChild(makeHeaderButton("chartNavUpBtn", "▲", () => window.navigateChartSymbol(-1)));
    navControls.appendChild(makeHeaderButton("chartNavDownBtn", "▼", () => window.navigateChartSymbol(1)));

    modeControls.appendChild(makeHeaderButton("chartModeBtn_HA", "HA", () => {
      window.setChartMode(chartState.chartMode === "HA" ? "STD" : "HA");
    }));

    ["D", "W", "M", "Y"].forEach(tfKey => {
      const btn = makeHeaderButton("chartTfBtn_" + tfKey, tfKey, () => {
        if (!chartState.symbol) return;
        window.renderCandleChart(chartState.symbol, tfKey, chartState.sourceType || "symbol");
      });
      tfControls.appendChild(btn);
    });

    const title = document.createElement("div");
    title.id = "chartTitle";
    title.style.cssText = "font-size:12px;font-weight:700;letter-spacing:0.45px;color:var(--text);min-width:0;";

    const info = document.createElement("div");
    info.id = "chartInfo";
    info.style.cssText = "font-size:11px;color:var(--text);margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:1000px;";
    
    const canvas = document.createElement("canvas");
    canvas.id = "chartCanvas";
    
    rightControls.appendChild(modeControls);
    rightControls.appendChild(tfControls);
    rightControls.appendChild(navControls);
    headerRow.appendChild(title);
    headerRow.appendChild(rightControls);
    popup.appendChild(headerRow);
    popup.appendChild(info);
    popup.appendChild(canvas);
    overlay.appendChild(popup);
    document.body.appendChild(overlay);
  }
});
