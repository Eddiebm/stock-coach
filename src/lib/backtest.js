// Pure simulation engine — no API calls, no side effects.
// All functions take pre-fetched bar arrays and return plain objects.

const WARMUP = 200; // bars needed before first signal (SMA200)

// ─── Rolling signal computation ───────────────────────────────────────────────

function buildSignals(bars) {
  const n = bars.length;
  const out = new Array(n);
  let s20 = 0, s50 = 0, s200 = 0, sv20 = 0;

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    s20  += b.c; if (i >= 20)  s20  -= bars[i - 20].c;
    s50  += b.c; if (i >= 50)  s50  -= bars[i - 50].c;
    s200 += b.c; if (i >= 200) s200 -= bars[i - 200].c;
    sv20 += b.v; if (i >= 20)  sv20 -= bars[i - 20].v;

    // 10-day return for relative strength calc
    const return10 = i >= 10 ? (b.c - bars[i - 10].c) / bars[i - 10].c : null;

    out[i] = {
      sma20:    i >= 19  ? s20  / 20  : null,
      sma50:    i >= 49  ? s50  / 50  : null,
      sma200:   i >= 199 ? s200 / 200 : null,
      volRatio: i >= 19  ? b.v / (sv20 / 20) : null,
      rsi:      i >= 15  ? rsi14(bars, i) : null,
      atr:      i >= 15  ? atr14(bars, i) : null,
      return10,
    };
  }
  return out;
}

function rsi14(bars, end) {
  let gains = 0, losses = 0;
  for (let i = end - 13; i <= end; i++) {
    const d = bars[i].c - bars[i - 1].c;
    if (d > 0) gains += d; else losses -= d;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function atr14(bars, end) {
  let sum = 0;
  for (let i = end - 13; i <= end; i++) {
    const h = bars[i].h, l = bars[i].l, pc = bars[i - 1].c;
    sum += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  return sum / 14;
}

// New scoring — must stay in sync with src/lib/score.js
// 1. Long-term trend     20 pts  (SMA50 + SMA200)
// 2. Pullback to SMA20   25 pts  (distance from dynamic support = entry quality)
// 3. Relative strength   20 pts  (10-day return vs SPY)
// 4. RSI momentum        20 pts  (tightened to 45-60)
// 5. Volume              10 pts
// 6. Affordability        5 pts
function scoreAt(sig, price, capital, spySig) {
  if (!sig.sma50 || !sig.sma200 || !sig.rsi || !sig.atr) return 0;

  let s = 0;

  // 1. Long-term trend (20 pts)
  if (price > sig.sma200) s += 10;
  if (price > sig.sma50)  s += 10;

  // 2. Pullback quality — how close to SMA20 (25 pts)
  if (sig.sma20 && price > sig.sma20) {
    const ext = (price - sig.sma20) / sig.sma20;
    if      (ext <= 0.03) s += 25;
    else if (ext <= 0.07) s += 15;
    else if (ext <= 0.12) s += 5;
    // > 12% above SMA20: 0 pts — chasing
  }

  // 3. Relative strength vs SPY (20 pts)
  if (sig.return10 != null && spySig?.return10 != null) {
    const rs = sig.return10 - spySig.return10;
    if      (rs >= 0.02) s += 20;
    else if (rs >= 0)    s += 12;
  }

  // 4. RSI momentum (20 pts)
  if (sig.rsi != null) {
    const r = sig.rsi;
    if      (r >= 45 && r <= 60)  s += 20;
    else if (r >= 40 && r <  45)  s += 10;
    else if (r >  60 && r <= 70)  s += 10;
  }

  // 5. Volume (10 pts)
  if (sig.volRatio != null) {
    if      (sig.volRatio >= 1.5) s += 10;
    else if (sig.volRatio >= 1.1) s += 5;
  }

  // 6. Affordability (5 pts)
  const riskAmt  = capital * 0.01;
  const shares   = Math.floor(riskAmt / sig.atr);
  const posValue = shares * price;
  if (shares >= 1 && posValue <= capital * 0.30) s += 5;

  return Math.min(100, s);
}

// ─── Main simulation ──────────────────────────────────────────────────────────

export function runBacktest({ bars, capital = 100000, threshold = 60, useGates = true, maxPositions = 1 }) {
  const spyBars  = bars["SPY"] ?? [];
  const symbols  = Object.keys(bars).filter(s => s !== "SPY");

  // Precompute signals for every symbol
  const signals = {};
  signals["SPY"] = buildSignals(spyBars);
  for (const sym of symbols) signals[sym] = buildSignals(bars[sym] ?? []);

  // Build unified date list from SPY
  const dates = spyBars.map(b => b.t);

  // Index each symbol's bars by date for O(1) lookup
  const idx = {};
  for (const sym of [...symbols, "SPY"]) {
    idx[sym] = {};
    for (let i = 0; i < (bars[sym] ?? []).length; i++) {
      idx[sym][(bars[sym])[i].t] = i;
    }
  }

  const trades     = [];
  const equity     = [];
  const openPos    = {}; // sym → { entry, stop, target, shares, entryDate, entryDi, score }
  let   cash       = capital;
  let   peak       = capital;
  let   maxDD      = 0;

  for (let di = WARMUP; di < dates.length; di++) {
    const date    = dates[di];
    const spyI    = idx["SPY"][date];
    const spySig  = signals["SPY"][spyI];

    // ── 1. Close positions that hit stop / target / time limit ───────────────
    for (const sym of Object.keys(openPos)) {
      const pos   = openPos[sym];
      const symI  = idx[sym]?.[date];
      if (symI == null) continue;
      const bar   = bars[sym][symI];
      const held  = di - pos.entryDi;
      let closed  = null;

      if (bar.l <= pos.stop) {
        closed = { outcome: "loss",    exitPrice: pos.stop,   pnl: (pos.stop   - pos.entry) * pos.shares };
      } else if (bar.h >= pos.target) {
        closed = { outcome: "win",     exitPrice: pos.target, pnl: (pos.target - pos.entry) * pos.shares };
      } else if (held >= 30) {
        closed = { outcome: "timeout", exitPrice: bar.c,      pnl: (bar.c      - pos.entry) * pos.shares };
      }

      if (closed) {
        cash += closed.pnl;
        trades.push({
          sym, entryDate: pos.entryDate, exitDate: date,
          score: pos.score, shares: pos.shares,
          entry: pos.entry, stop: pos.stop, target: pos.target,
          ...closed,
        });
        delete openPos[sym];
      }
    }

    // ── 2. Morning gate: skip deep bear days ─────────────────────────────────
    if (useGates && spySig?.sma200 && spyBars[spyI].c < spySig.sma200 * 0.97) {
      equity.push({ date, value: cash });
      peak  = Math.max(peak, cash);
      maxDD = Math.max(maxDD, (peak - cash) / peak);
      continue;
    }

    // ── 3. Scan for new entries ───────────────────────────────────────────────
    const slotsOpen = maxPositions - Object.keys(openPos).length;
    if (slotsOpen > 0) {
      const candidates = [];

      for (const sym of symbols) {
        if (openPos[sym]) continue;
        const symI = idx[sym]?.[date];
        if (symI == null || symI < WARMUP) continue;

        const bar = bars[sym][symI];
        const sig = signals[sym][symI];
        const sc  = scoreAt(sig, bar.c, cash, spySig);
        if (sc < threshold) continue;

        const shares = Math.floor((cash * 0.01) / sig.atr);
        if (shares < 1) continue;
        if (shares * bar.c > cash) continue;

        candidates.push({ sym, score: sc, bar, symI, sig, shares });
      }

      candidates.sort((a, b) => b.score - a.score);

      for (const pick of candidates.slice(0, slotsOpen)) {
        const entry  = pick.bar.c;
        const stop   = entry - pick.sig.atr;
        const target = entry + 2 * pick.sig.atr;
        openPos[pick.sym] = { entry, stop, target, shares: pick.shares, entryDate: date, entryDi: di, score: pick.score };
      }
    }

    equity.push({ date, value: cash });
    peak  = Math.max(peak, cash);
    maxDD = Math.max(maxDD, (peak - cash) / peak);
  }

  return { trades, equity, finalCapital: cash, maxDrawdown: maxDD };
}

// ─── Statistics ───────────────────────────────────────────────────────────────

export function computeStats(trades, equity, initialCapital) {
  if (!trades.length) return null;

  const wins     = trades.filter(t => t.outcome === "win");
  const losses   = trades.filter(t => t.outcome === "loss");
  const timeouts = trades.filter(t => t.outcome === "timeout");

  const winRate  = wins.length / trades.length;
  const avgWin   = wins.length   ? wins.reduce((s, t) => s + t.pnl, 0)   / wins.length   : 0;
  const avgLoss  = losses.length ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const ev       = winRate * avgWin + (1 - winRate) * avgLoss;

  // Score bands
  const BANDS = [[50,59],[60,69],[70,79],[80,100]];
  const byBand = BANDS.map(([lo, hi]) => {
    const bt = trades.filter(t => t.score >= lo && t.score <= hi);
    const bw = bt.filter(t => t.outcome === "win");
    return {
      label:    hi === 100 ? "80+" : `${lo}–${hi}`,
      trades:   bt.length,
      wins:     bw.length,
      winRate:  bt.length ? bw.length / bt.length : 0,
      pnl:      bt.reduce((s, t) => s + t.pnl, 0),
    };
  });

  // By year
  const years = [...new Set(trades.map(t => t.entryDate.slice(0, 4)))].sort();
  const byYear = years.map(yr => {
    const yt  = trades.filter(t => t.entryDate.startsWith(yr));
    const yw  = yt.filter(t => t.outcome === "win");
    return {
      year:    yr,
      trades:  yt.length,
      wins:    yw.length,
      winRate: yt.length ? yw.length / yt.length : 0,
      pnl:     yt.reduce((s, t) => s + t.pnl, 0),
    };
  });

  // Annual return estimate
  const firstDate  = new Date(equity[0]?.date ?? trades[0].entryDate);
  const lastDate   = new Date(equity[equity.length - 1]?.date ?? trades[trades.length - 1].exitDate);
  const years_held = (lastDate - firstDate) / (365.25 * 86400000);
  const annualReturn = years_held > 0
    ? Math.pow((initialCapital + totalPnl) / initialCapital, 1 / years_held) - 1
    : 0;

  return {
    total: trades.length, wins: wins.length, losses: losses.length, timeouts: timeouts.length,
    winRate, avgWin, avgLoss, totalPnl, ev, byBand, byYear, annualReturn,
  };
}

// ─── Stress test periods ──────────────────────────────────────────────────────

export const STRESS_PERIODS = [
  { label: "COVID Crash",       start: "2020-02-19", end: "2020-03-23", desc: "S&P fell 34% in 33 days"       },
  { label: "2022 Bear Market",  start: "2022-01-03", end: "2022-10-13", desc: "S&P fell 25% over 9 months"    },
  { label: "SVB Collapse",      start: "2023-03-08", end: "2023-03-24", desc: "Regional bank crisis"           },
  { label: "Japan Carry Unwind",start: "2024-07-31", end: "2024-08-09", desc: "VIX hit 65 in a single day"    },
  { label: "Election 2024",     start: "2024-11-04", end: "2024-11-08", desc: "Overnight gap both directions"  },
];

export function stressStats(trades, period) {
  const t = trades.filter(t => t.entryDate >= period.start && t.entryDate <= period.end);
  const w = t.filter(tr => tr.outcome === "win");
  return {
    ...period,
    trades:  t.length,
    wins:    w.length,
    winRate: t.length ? w.length / t.length : null,
    pnl:     t.reduce((s, tr) => s + tr.pnl, 0),
  };
}
