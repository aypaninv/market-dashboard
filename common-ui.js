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
function getActiveFeature() {
  const featureIds = [
    "portfolioFeature",
    "tfwatchFeature",
    "tfcoreFeature",
    "tfstudyFeature",
    "tfstage2Feature",
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

const W_SL_LOOKBACK_WEEKS = 10;
const M_SL_LOOKBACK_MONTHS = 6;

const OHLC_LABELS = { D: "Daily", W: "Weekly", M: "Monthly" };
const ohlcCache = {};
const chartState = { symbol: null, tf: null, symbols: [], index: -1, sourceTable: null };

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
  // Returns array of same length as closes; null for warmup/invalid entries.
  const result = new Array(closes.length).fill(null);
  const multiplier = 2 / (period + 1);
  let count = 0, sum = 0, seedEnd = -1;
  for (let i = 0; i < closes.length; i++) {
    const v = +closes[i];
    if (!Number.isFinite(v)) { count = 0; sum = 0; continue; }
    sum += v;
    count++;
    if (count === period) { seedEnd = i; break; }
  }
  if (seedEnd < 0) return result;
  let ema = sum / period;
  result[seedEnd] = ema;
  for (let i = seedEnd + 1; i < closes.length; i++) {
    const v = +closes[i];
    if (!Number.isFinite(v)) continue;
    ema = v * multiplier + ema * (1 - multiplier);
    result[i] = ema;
  }
  return result;
}

function computeActiveFvgZones(rows) {
  if (!Array.isArray(rows) || rows.length < 3) return [];

  const zones = [];

  for (let i = 2; i < rows.length; i++) {
    const c1 = rows[i - 2];
    const c2 = rows[i - 1];
    const c3 = rows[i];

    const h1 = +c1.High;
    const l1 = +c1.Low;
    const o2 = +c2.Open;
    const h2 = +c2.High;
    const l2 = +c2.Low;
    const c2Close = +c2.Close;
    const h3 = +c3.High;
    const l3 = +c3.Low;

    if (![h1, l1, o2, h2, l2, c2Close, h3, l3].every(Number.isFinite)) continue;

    const c2Range = h2 - l2;
    if (!(c2Range > 0)) continue;

    // Filter weak/likely-fake gaps: require displacement body in candle-2.
    const c2BodyRatio = Math.abs(c2Close - o2) / c2Range;
    if (c2BodyRatio < 0.45) continue;

    const minGap = Math.max(0.0001, Math.abs(c2Close) * 0.0015);

    // Bullish FVG: candle-3 low above candle-1 high.
    const bullGap = l3 - h1;
    const isBull = bullGap >= minGap && c2Close > o2 && h2 > h1;

    // Bearish FVG: candle-3 high below candle-1 low.
    const bearGap = l1 - h3;
    const isBear = bearGap >= minGap && c2Close < o2 && l2 < l1;

    if (!isBull && !isBear) continue;

    if (isBull) {
      zones.push({
        type: "bull",
        startIndex: i,
        lower: h1,
        upper: l3,
      });
    }

    if (isBear) {
      zones.push({
        type: "bear",
        startIndex: i,
        lower: h3,
        upper: l1,
      });
    }
  }

  // Keep only undigested (unfilled) zones.
  return zones.filter(zone => {
    for (let j = zone.startIndex + 1; j < rows.length; j++) {
      const rowLow = +rows[j].Low;
      const rowHigh = +rows[j].High;
      if (!Number.isFinite(rowLow) || !Number.isFinite(rowHigh)) continue;

      if (zone.type === "bull" && rowLow <= zone.lower) {
        return false;
      }

      if (zone.type === "bear" && rowHigh >= zone.upper) {
        return false;
      }
    }
    return true;
  });
}

function buildChartTitle(symbol, tf, candles) {
  return symbol + "  \u2014  " + (OHLC_LABELS[tf] || tf) + "  (" + candles.length + ")";
}

function setActiveChartTfButton(tf) {
  ["D", "W", "M"].forEach(key => {
    const btn = document.getElementById("chartTfBtn_" + key);
    if (!btn) return;
    const active = key === tf;
    btn.style.background = active ? "var(--accent, #2563eb)" : "transparent";
    btn.style.color = active ? "#fff" : "var(--text)";
    btn.style.borderColor = active ? "var(--accent, #2563eb)" : "var(--grid)";
  });
}

window.renderCandleChart = function(symbol, tf) {
  const eventTarget = window.event?.target;
  const sourceTable = eventTarget?.closest?.("table") || chartState.sourceTable;
  chartState.sourceTable = sourceTable || null;
  chartState.symbol = symbol;
  chartState.tf = tf;
  chartState.symbols = getActiveTableSymbols();
  chartState.index = chartState.symbols.indexOf(symbol);

  Promise.all([loadOHLC(tf), loadOHLC("W"), loadOHLC("M")])
    .then(([data, weeklyData, monthlyData]) => {
      const rows = data[symbol];
      if (!rows || !rows.length) { alert("No " + (OHLC_LABELS[tf] || tf) + " data for " + symbol); return; }

      const weeklyRows = weeklyData[symbol] || [];
      const monthlyRows = monthlyData[symbol] || [];
      const last12Monthly = monthlyRows.slice(-12);
      let high52w = null;
      let mslPrice = null;
      let wslPrice = null;
      if (last12Monthly.length >= 12) {
        const highs = last12Monthly
          .map(r => +r.High)
          .filter(v => Number.isFinite(v));
        if (highs.length) high52w = Math.max(...highs);
      }

      // Monthly SL: latest highest-close GREEN candle low from latest lookback window.
      const recentMonthly = monthlyRows.slice(-M_SL_LOOKBACK_MONTHS);
      if (recentMonthly.length) {
        const greenMonthly = recentMonthly.filter(r => {
          const o = +r.Open;
          const c = +r.Close;
          return Number.isFinite(o) && Number.isFinite(c) && c > o;
        });

        if (greenMonthly.length) {
          const highestClose = Math.max(...greenMonthly
            .map(r => +r.Close)
            .filter(v => Number.isFinite(v)));

          const highestRows = greenMonthly.filter(r => +r.Close === highestClose);
          const refRow = highestRows[highestRows.length - 1];
          const low = +refRow?.Low;
          if (Number.isFinite(low) && low !== 0) mslPrice = low;
        }
      }

      const recentWeekly = weeklyRows.slice(-W_SL_LOOKBACK_WEEKS);
      if (recentWeekly.length) {
        const greenWeekly = recentWeekly.filter(r => {
          const o = +r.Open;
          const c = +r.Close;
          return Number.isFinite(o) && Number.isFinite(c) && c > o;
        });

        if (greenWeekly.length) {
          const highestClose = Math.max(...greenWeekly
            .map(r => +r.Close)
            .filter(v => Number.isFinite(v)));

          const highestRows = greenWeekly.filter(r => +r.Close === highestClose);
          const refRow = highestRows[highestRows.length - 1];
          const low = +refRow?.Low;
          if (Number.isFinite(low) && low !== 0) wslPrice = low;
        }
      }

      const candleCount = CHART_CANDLE_COUNTS[tf] || 30;
      const visibleRows = rows.slice(-candleCount);
      window.showChart(symbol, tf, visibleRows, rows, high52w, mslPrice, wslPrice);
      setActiveChartTfButton(tf);
      updateChartNavButtons();
    })
    .catch(() => alert("Failed to load chart data"));
};

window.openCandleChart = function(symbol, tf) {
  window.renderCandleChart(symbol, tf);
};

window.showChart = function(symbol, tf, candles, allRows, high52w, mslPrice, wslPrice) {
  const canvas = document.getElementById("chartCanvas");
  const info = document.getElementById("chartInfo");
  canvas.width  = Math.min(760, window.innerWidth - 40);
  canvas.height = Math.round(canvas.width * 0.75);
  document.getElementById("chartTitle").textContent = buildChartTitle(symbol, tf, candles);
  document.getElementById("chartTitle").style.marginBottom = "10px";
  if (info) info.textContent = "";
  window.drawCandles(canvas, candles, allRows, tf, high52w, mslPrice, wslPrice);
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
};

window.navigateChartSymbol = function(direction) {
  if (!Array.isArray(chartState.symbols) || !chartState.symbols.length) return;
  if (!chartState.symbol || !chartState.tf) return;

  const nextIndex = chartState.index + direction;
  if (nextIndex < 0 || nextIndex >= chartState.symbols.length) return;

  const nextSymbol = chartState.symbols[nextIndex];
  if (!nextSymbol) return;

  window.renderCandleChart(nextSymbol, chartState.tf);
};

window.drawCandles = function(canvas, candles, allRows, tf, high52w, mslPrice, wslPrice) {
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

  if (Number.isFinite(high52w)) {
    maxP = Math.max(maxP, high52w);
    minP = Math.min(minP, high52w);
  }

  if (Number.isFinite(mslPrice)) {
    maxP = Math.max(maxP, mslPrice);
    minP = Math.min(minP, mslPrice);
  }

  if (Number.isFinite(wslPrice)) {
    maxP = Math.max(maxP, wslPrice);
    minP = Math.min(minP, wslPrice);
  }

  if (!isFinite(minP)) return;

  const pad = (maxP - minP) * 0.05 || 1;
  const lo = minP - pad, hi = maxP + pad, rng = hi - lo;
  const py = p => P.t + cH * (1 - (p - lo) / rng);

  const n = candles.length;
  const slotW = cW / n;
  const bW = Math.max(2, Math.floor(slotW * 0.62));
  const activeFvgZones = computeActiveFvgZones(allRows);
  const visibleStartIndex = Math.max(0, allRows.length - candles.length);

  const infoEl = document.getElementById("chartInfo");
  const latest = candles[candles.length - 1] || null;

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
    const rowClose = +row.Close;
    const pctFrom52w = (
      Number.isFinite(high52w) && high52w !== 0 && Number.isFinite(rowClose)
        ? ((rowClose - high52w) / high52w) * 100
        : null
    );
    const pctFromMsl = (
      Number.isFinite(mslPrice) && mslPrice !== 0 && Number.isFinite(rowClose)
        ? ((rowClose - mslPrice) / mslPrice) * 100
        : null
    );
    const pctFromWsl = (
      Number.isFinite(wslPrice) && wslPrice !== 0 && Number.isFinite(rowClose)
        ? ((rowClose - wslPrice) / wslPrice) * 100
        : null
    );
    const pct52Text = pctFrom52w === null ? "NA" : Math.trunc(pctFrom52w) + "%";
    const pctMslText = pctFromMsl === null ? "NA" : Math.trunc(pctFromMsl) + "%";
    const pctWslText = pctFromWsl === null ? "NA" : Math.trunc(pctFromWsl) + "%";
    infoEl.innerHTML =
      '<div>Date:' + d +
      ' <span style="color:#1976d2;">O:' + o + '</span>' +
      ' <span style="color:#2e7d32;">H:' + h + '</span>' +
      ' <span style="color:#d32f2f;">L:' + l + '</span>' +
      ' <span style="color:#f59e0b;">C:' + c + '</span></div>' +
      '<div style="margin-top:2px;">' +
        ' <span style="color:#f59e0b;font-weight:700;">52W:' + pct52Text + '</span>' +
        ' <span style="color:#dc2626;font-weight:700;">MSL:' + pctMslText + '</span>' +
        ' <span style="color:#0f766e;font-weight:700;">WSL:' + pctWslText + '</span>' +
      '</div>';
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
    const ty = Math.max(P.t + 10, Math.min(H - P.b - 2, y + 3));
    ctx.fillStyle = dark ? "rgba(22,27,34,0.88)" : "rgba(255,255,255,0.9)";
    ctx.fillRect(tx, ty - 10, tw, 13);
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.fillText(tag, tx + 4, ty);
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

    // Draw active, undigested FVG zones (1-3 gap) behind candles.
    activeFvgZones.forEach(zone => {
      if (zone.startIndex >= allRows.length) return;
      if (zone.startIndex > allRows.length - 1) return;
      if (zone.startIndex > visibleStartIndex + n - 1) return;

      const fromVisibleIndex = Math.max(0, zone.startIndex - visibleStartIndex);
      const x1 = P.l + fromVisibleIndex * slotW;
      const x2 = W - P.r;

      const yTop = py(zone.upper);
      const yBottom = py(zone.lower);
      const rectY = Math.min(yTop, yBottom);
      const rectH = Math.max(1, Math.abs(yBottom - yTop));

      const isBull = zone.type === "bull";
      const fill = isBull ? "rgba(46, 204, 113, 0.14)" : "rgba(231, 76, 60, 0.14)";
      const stroke = isBull ? "rgba(46, 204, 113, 0.55)" : "rgba(231, 76, 60, 0.55)";

      ctx.fillStyle = fill;
      ctx.fillRect(x1, rectY, Math.max(1, x2 - x1), rectH);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(x1, rectY, Math.max(1, x2 - x1), rectH);

      const label = isBull ? "FVG+" : "FVG-";
      ctx.font = "10px Courier New";
      ctx.fillStyle = stroke;
      ctx.textAlign = "left";
      ctx.fillText(label, x1 + 4, Math.max(P.t + 10, rectY + 10));
    });

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

    // Draw EMA lines — aligned by row index so lines always match candles
    const allCloses = allRows.map(r => r.Close);
    const emaFastAll = calcEMA(allCloses, 6);
    const emaSlowAll = calcEMA(allCloses, 12);
    const visEmaFast = emaFastAll.slice(-candles.length);
    const visEmaSlow = emaSlowAll.slice(-candles.length);

    function drawEmaLine(emaValues, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      emaValues.forEach((v, i) => {
        if (v === null) { started = false; return; }
        const cx = P.l + (i + 0.5) * slotW;
        const y = py(v);
        if (!started) { ctx.moveTo(cx, y); started = true; }
        else ctx.lineTo(cx, y);
      });
      ctx.stroke();
    }

    drawEmaLine(visEmaFast, "#2196F3");
    drawEmaLine(visEmaSlow, "#FF4444");

    // 52-week line from last 12 monthly candles high
    if (Number.isFinite(high52w)) {
      const y52 = py(high52w);
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 1.3;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(P.l, y52);
      ctx.lineTo(W - P.r, y52);
      ctx.stroke();
      ctx.setLineDash([]);

      const tag = "52W " + high52w.toFixed(2);
      ctx.font = "10px Courier New";
      const tw = ctx.measureText(tag).width + 8;
      const tx = P.l + 6;
      const ty = Math.max(P.t + 10, Math.min(H - P.b - 2, y52 - 5));
      ctx.fillStyle = "rgba(245, 158, 11, 0.16)";
      ctx.fillRect(tx, ty - 10, tw, 13);
      ctx.fillStyle = dark ? "#fbbf24" : "#92400e";
      ctx.textAlign = "left";
      ctx.fillText(tag, tx + 4, ty);
    }

    // Stoploss line from monthly rule (latest highest-close green candle low)
    if (Number.isFinite(mslPrice)) {
      const ySl = py(mslPrice);
      ctx.strokeStyle = "#dc2626";
      ctx.lineWidth = 1.3;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(P.l, ySl);
      ctx.lineTo(W - P.r, ySl);
      ctx.stroke();
      ctx.setLineDash([]);

      const tag = "MSL " + mslPrice.toFixed(2);
      ctx.font = "10px Courier New";
      const tw = ctx.measureText(tag).width + 8;
      const tx = P.l + 6;
      const ty = Math.max(P.t + 10, Math.min(H - P.b - 2, ySl - 5));
      ctx.fillStyle = dark ? "rgba(127, 29, 29, 0.2)" : "rgba(220, 38, 38, 0.12)";
      ctx.fillRect(tx, ty - 10, tw, 13);
      ctx.fillStyle = "#dc2626";
      ctx.textAlign = "left";
      ctx.fillText(tag, tx + 4, ty);
    }

    if (Number.isFinite(wslPrice)) {
      const yWsl = py(wslPrice);
      ctx.strokeStyle = "#0f766e";
      ctx.lineWidth = 1.3;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(P.l, yWsl);
      ctx.lineTo(W - P.r, yWsl);
      ctx.stroke();
      ctx.setLineDash([]);

      const tag = "WSL " + wslPrice.toFixed(2);
      ctx.font = "10px Courier New";
      const tw = ctx.measureText(tag).width + 8;
      const tx = P.l + 6;
      const ty = Math.max(P.t + 10, Math.min(H - P.b - 2, yWsl - 5));
      ctx.fillStyle = dark ? "rgba(13, 78, 74, 0.2)" : "rgba(15, 118, 110, 0.12)";
      ctx.fillRect(tx, ty - 10, tw, 13);
      ctx.fillStyle = "#0f766e";
      ctx.textAlign = "left";
      ctx.fillText(tag, tx + 4, ty);
    }

    // X-axis date labels (every ~4 candles)
    ctx.fillStyle = labelC;
    ctx.font = "10px Courier New";
    ctx.textAlign = "center";
    const step = Math.max(1, Math.floor(n / 5));
    candles.forEach((c, i) => {
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
    const x = e.clientX - rect.left;
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
    popup.style.cssText = "background:var(--panel);border-radius:12px;padding:16px 18px;box-shadow:0 10px 40px rgba(0,0,0,0.52);border:1px solid var(--grid);";
    popup.onclick = (e) => e.stopPropagation();

    const headerRow = document.createElement("div");
    headerRow.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px;";

    const rightControls = document.createElement("div");
    rightControls.style.cssText = "display:flex;justify-content:flex-end;align-items:center;gap:8px;flex-shrink:0;";

    const navControls = document.createElement("div");
    navControls.style.cssText = "display:flex;justify-content:flex-end;align-items:center;gap:8px;flex-shrink:0;";

    const tfControls = document.createElement("div");
    tfControls.style.cssText = "display:flex;justify-content:flex-end;align-items:center;gap:8px;flex-shrink:0;";

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

    ["D", "W", "M"].forEach(tfKey => {
      const btn = makeHeaderButton("chartTfBtn_" + tfKey, tfKey, () => {
        if (!chartState.symbol) return;
        window.renderCandleChart(chartState.symbol, tfKey);
      });
      tfControls.appendChild(btn);
    });
    
    const title = document.createElement("div");
    title.id = "chartTitle";
    title.style.cssText = "font-size:12px;font-weight:700;letter-spacing:0.45px;color:var(--text);min-width:0;";

    const info = document.createElement("div");
    info.id = "chartInfo";
    info.style.cssText = "font-size:11px;color:var(--text);margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:760px;";
    
    const canvas = document.createElement("canvas");
    canvas.id = "chartCanvas";
    
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
