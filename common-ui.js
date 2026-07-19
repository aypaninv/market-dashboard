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

const M_SL_LOOKBACK_MONTHS = 6;

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

function buildChartTitle(symbol, tf, candles) {
  return symbol + "  \u2014  " + (OHLC_LABELS[tf] || tf) + "  (" + candles.length + ")";
}

window.openCandleChart = function(symbol, tf) {
  Promise.all([loadOHLC(tf), loadOHLC("M")])
    .then(([data, monthlyData]) => {
      const rows = data[symbol];
      if (!rows || !rows.length) { alert("No " + (OHLC_LABELS[tf] || tf) + " data for " + symbol); return; }

      const monthlyRows = monthlyData[symbol] || [];
      const last12Monthly = monthlyRows.slice(-12);
      let high52w = null;
      let slPrice = null;
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
          if (Number.isFinite(low) && low !== 0) slPrice = low;
        }
      }

      const candleCount = CHART_CANDLE_COUNTS[tf] || 30;
      const visibleRows = rows.slice(-candleCount);
      window.showChart(symbol, tf, visibleRows, rows, high52w, slPrice);
    })
    .catch(() => alert("Failed to load chart data"));
};

window.showChart = function(symbol, tf, candles, allRows, high52w, slPrice) {
  const canvas = document.getElementById("chartCanvas");
  const info = document.getElementById("chartInfo");
  canvas.width  = Math.min(760, window.innerWidth - 40);
  canvas.height = Math.round(canvas.width * 0.75);
  document.getElementById("chartTitle").textContent = buildChartTitle(symbol, tf, candles);
  document.getElementById("chartTitle").style.marginBottom = "10px";
  if (info) info.textContent = "";
  window.drawCandles(canvas, candles, allRows, tf, high52w, slPrice);
  document.getElementById("chartOverlay").style.display = "flex";
};

window.closeChart = function() {
  document.getElementById("chartOverlay").style.display = "none";
  window.__chartRedraw = null;
};

window.drawCandles = function(canvas, candles, allRows, tf, high52w, slPrice) {
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

  if (Number.isFinite(slPrice)) {
    maxP = Math.max(maxP, slPrice);
    minP = Math.min(minP, slPrice);
  }

  if (!isFinite(minP)) return;

  const pad = (maxP - minP) * 0.05 || 1;
  const lo = minP - pad, hi = maxP + pad, rng = hi - lo;
  const py = p => P.t + cH * (1 - (p - lo) / rng);

  const n = candles.length;
  const slotW = cW / n;
  const bW = Math.max(2, Math.floor(slotW * 0.62));

  const infoEl = document.getElementById("chartInfo");
  const latest = candles[candles.length - 1] || null;
  const latestClose = latest ? +latest.Close : NaN;
  const pctFrom52w = (
    Number.isFinite(high52w) && high52w !== 0 && Number.isFinite(latestClose)
      ? ((latestClose - high52w) / high52w) * 100
      : null
  );

  function fmt(v, d) {
    return Number.isFinite(+v) ? (+v).toFixed(d) : "NA";
  }

  function setInfo(row, hoverMode) {
    if (!infoEl || !row) return;
    const d = getRowDateLabel(row);
    const o = fmt(row.Open, 2);
    const h = fmt(row.High, 2);
    const l = fmt(row.Low, 2);
    const c = fmt(row.Close, 2);
    const highText = Number.isFinite(high52w) ? high52w.toFixed(2) : "NA";
    const pctText = pctFrom52w === null ? "NA" : pctFrom52w.toFixed(2) + "%";
    infoEl.textContent =
      "Date: " + d +
      "   O: " + o +
      "   H: " + h +
      "   L: " + l +
      "   C: " + c +
      "   52W High: " + highText +
      "   From 52W: " + pctText +
      (hoverMode ? "" : "   (latest)");
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
    if (Number.isFinite(slPrice)) {
      const ySl = py(slPrice);
      ctx.strokeStyle = "#dc2626";
      ctx.lineWidth = 1.3;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(P.l, ySl);
      ctx.lineTo(W - P.r, ySl);
      ctx.stroke();
      ctx.setLineDash([]);

      const tag = "SL " + slPrice.toFixed(2);
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

      const pointerMode = (document.getElementById("chartPointerMode")?.value || "close").toLowerCase();
      if (pointerMode === "ohlc") {
        drawPricePointerLine(py(o), "#1976d2", "O " + fmt(o, 2));
        drawPricePointerLine(py(h), "#2e7d32", "H " + fmt(h, 2));
        drawPricePointerLine(py(l), "#d32f2f", "L " + fmt(l, 2));
        drawPricePointerLine(py(cl), "#f59e0b", "C " + fmt(cl, 2));
      }

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
    overlay.onclick = window.closeChart;
    overlay.style.cssText = "display:none;position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:1000;align-items:center;justify-content:center;";
    
    const popup = document.createElement("div");
    popup.id = "chartPopup";
    popup.style.cssText = "background:var(--panel);border-radius:12px;padding:16px 18px;box-shadow:0 10px 40px rgba(0,0,0,0.52);border:1px solid var(--grid);";
    
    const title = document.createElement("div");
    title.id = "chartTitle";
    title.style.cssText = "font-size:12px;font-weight:700;letter-spacing:0.45px;color:var(--text);margin-bottom:10px;";

    const info = document.createElement("div");
    info.id = "chartInfo";
    info.style.cssText = "font-size:11px;color:var(--text);margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:760px;";

    const controls = document.createElement("div");
    controls.style.cssText = "display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-bottom:8px;";

    const pointerLabel = document.createElement("label");
    pointerLabel.setAttribute("for", "chartPointerMode");
    pointerLabel.textContent = "Pointer:";
    pointerLabel.style.cssText = "font-size:11px;color:var(--text);";

    const pointerSelect = document.createElement("select");
    pointerSelect.id = "chartPointerMode";
    pointerSelect.style.cssText = "font-size:11px;padding:2px 6px;border:1px solid var(--grid);border-radius:6px;background:var(--panel);color:var(--text);";
    pointerSelect.innerHTML = '<option value="close">Close</option><option value="ohlc">OHLC</option>';
    pointerSelect.value = "ohlc";
    pointerSelect.onchange = () => {
      if (typeof window.__chartRedraw === "function") window.__chartRedraw();
    };

    controls.appendChild(pointerLabel);
    controls.appendChild(pointerSelect);
    
    const canvas = document.createElement("canvas");
    canvas.id = "chartCanvas";
    
    popup.appendChild(title);
    popup.appendChild(controls);
    popup.appendChild(info);
    popup.appendChild(canvas);
    overlay.appendChild(popup);
    document.body.appendChild(overlay);
  }
});
