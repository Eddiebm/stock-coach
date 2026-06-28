import { sma, rsi, atr, volumeRatio } from "./indicators.js";

// ─── New scoring system (100 pts) ────────────────────────────────────────────
//
// OLD: just "above all three MAs + RSI ok" → everything scored 80+ → 35% win rate
// NEW: rewards PULLBACKS to support + RELATIVE STRENGTH vs SPY
//      Goal: find stocks that are temporarily weak within a strong uptrend,
//      AND are stronger than the market — best combination of safety + edge
//
// 1. Long-term trend     (20 pts) — SMA50 + SMA200
// 2. Pullback quality    (25 pts) — how close is price to SMA20 (dynamic support)
// 3. Relative strength   (20 pts) — 10-day return vs SPY
// 4. RSI momentum        (20 pts) — tightened to 45-60 sweet spot
// 5. Volume              (10 pts) — confirms buyers are showing up
// 6. Affordability       ( 5 pts) — 1% risk fits account

export function analyzeStock({ sym, name, bars, capital, hasEarnings, earningsDate, spyBars }) {
  if (!bars || bars.length < 50) return null;

  const closes = bars.map(b => b.c);
  const price  = closes[closes.length - 1];

  const sma20  = sma(closes, 20);
  const sma50  = sma(closes, 50);
  const sma200 = bars.length >= 200 ? sma(closes, 200) : null;
  const rsiVal = rsi(closes, 14);
  const atrVal = atr(bars, 14);
  const volRat = volumeRatio(bars, 20);

  // 10-day relative strength vs SPY
  const return10    = bars.length >= 11
    ? (price - closes[closes.length - 11]) / closes[closes.length - 11]
    : null;
  const spyCloses   = spyBars?.map(b => b.c) ?? [];
  const spyReturn10 = spyCloses.length >= 11
    ? (spyCloses[spyCloses.length - 1] - spyCloses[spyCloses.length - 11]) / spyCloses[spyCloses.length - 11]
    : null;
  const relStrength = (return10 != null && spyReturn10 != null) ? return10 - spyReturn10 : null;

  // Pullback quality — how extended is price above SMA20
  const pullbackPct = (sma20 && price > sma20) ? (price - sma20) / sma20 : null;

  const aboveSma20  = sma20  != null && price > sma20;
  const aboveSma50  = sma50  != null && price > sma50;
  const aboveSma200 = sma200 != null && price > sma200;

  // Position sizing — 1% risk rule
  const stopDist    = atrVal ?? price * 0.03;
  const stopPrice   = price - stopDist;
  const targetPrice = price + stopDist * 2;
  const riskAmount  = capital * 0.01;
  const shares      = Math.max(1, Math.floor(riskAmount / stopDist));
  const posValue    = shares * price;
  const canAfford   = posValue <= capital * 0.30;

  let score = 0;

  // 1. Long-term trend (20 pts)
  if (price > (sma200 ?? 0)) score += 10;
  if (price > (sma50  ?? 0)) score += 10;

  // 2. Pullback quality (25 pts) — tighter window = closer to stop = better R/R
  if (pullbackPct !== null) {
    if      (pullbackPct <= 0.02) score += 25; // ≤2% above SMA20 — tight to support
    else if (pullbackPct <= 0.05) score += 15; // 2–5% — reasonable
    else if (pullbackPct <= 0.10) score += 5;  // 5–10% — extended
    // >10%: 0 pts — chasing
  }

  // 3. Relative strength vs SPY (20 pts) — must clearly lead the market
  if (relStrength !== null) {
    if      (relStrength >= 0.02) score += 20; // outperforming by 2%+
    else if (relStrength >= 0.01) score += 10; // outperforming by 1–2%
    else if (relStrength >= 0)    score += 5;  // barely keeping pace — marginal
    // underperforming: 0 pts
  }

  // 4. RSI momentum (20 pts) — tighter sweet spot
  if (rsiVal != null) {
    if      (rsiVal >= 47 && rsiVal <= 58)   score += 20; // ideal: healthy, not extended
    else if (rsiVal >= 43 && rsiVal <  47)   score += 10;
    else if (rsiVal >  58 && rsiVal <= 65)   score += 10;
  }

  // 5. Volume (10 pts) — raise floor to 1.2x
  if (volRat != null) {
    if      (volRat >= 1.5) score += 10;
    else if (volRat >= 1.2) score += 5;
  }

  // 6. Affordability (5 pts)
  if (canAfford && shares >= 1) score += 5;

  // Hard rules
  if (hasEarnings === true) score = 0;

  score = Math.min(100, Math.round(score));

  return {
    sym, name, price,
    sma20, sma50, sma200, rsiVal, atrVal, volRatio: volRat,
    aboveSma20, aboveSma50, aboveSma200,
    pullbackPct, relStrength, return10, spyReturn10,
    stopPrice, targetPrice, stopDist, rr: 2,
    shares, posValue, riskAmount, canAfford,
    hasEarnings, earningsDate,
    score, grade: scoreGrade(score),
  };
}

export function scoreGrade(score) {
  if (score >= 80) return { label: "Strong buy", color: "#16a34a", bg: "#f0fdf4" };
  if (score >= 65) return { label: "Buy",        color: "#22c55e", bg: "#f7fdf9" };
  if (score >= 50) return { label: "Watch",      color: "#d97706", bg: "#fffbeb" };
  if (score >= 35) return { label: "Weak",       color: "#f97316", bg: "#fff7ed" };
  return                  { label: "Avoid",      color: "#e14c4c", bg: "#fff5f5" };
}

export function stockChecks({ price, sma20, sma50, sma200, rsiVal, volRatio, canAfford,
  hasEarnings, earningsDate, aboveSma20, aboveSma50, aboveSma200, pullbackPct, relStrength }) {
  return [
    {
      key: "trend",
      label: "Stock is in a long-term uptrend",
      detail: "Price is above its 50-day and 200-day averages. These are the two lines that institutional investors — pension funds, hedge funds — watch most closely. When price is above both, the big money is still bullish.",
      pass: aboveSma50 && aboveSma200,
      warn: aboveSma50 && !aboveSma200,
      warnLabel: "Above 50-day but below 200-day — improving but not fully confirmed.",
      fail: "Below long-term averages. Don't buy stocks in downtrends.",
    },
    {
      key: "pullback",
      label: "Pulled back to support — not chasing a high",
      detail: "The 20-day average acts like a floor the stock bounces off. Buying when the stock is right at that floor (within 3%) gives you the best entry — close to your stop, far from the target. Buying 15% above it means you're late to the party.",
      pass: pullbackPct !== null && pullbackPct <= 0.03,
      warn: pullbackPct !== null && pullbackPct > 0.03 && pullbackPct <= 0.07,
      warnLabel: pullbackPct !== null ? `${(pullbackPct * 100).toFixed(1)}% above 20-day average — a bit extended. Wait for a pullback.` : "Can't compute — need more data.",
      fail: pullbackPct === null || !aboveSma20
        ? "Below 20-day average — trend is weakening."
        : `${(pullbackPct * 100).toFixed(1)}% above 20-day average — too extended. Risk of sharp pullback.`,
    },
    {
      key: "relstrength",
      label: "Outperforming the market over the last 10 days",
      detail: "If the S&P 500 is up 2% this week and your stock is up 4%, money is flowing into it specifically — not just rising with the tide. That relative strength is one of the strongest signals we have. If it's underperforming, the market is telling you something.",
      pass: relStrength !== null && relStrength >= 0.02,
      warn: relStrength !== null && relStrength >= 0 && relStrength < 0.02,
      warnLabel: "Matching the market but not leading it. Acceptable — not ideal.",
      fail: relStrength === null ? "SPY data not available." : `Underperforming SPY by ${(Math.abs(relStrength) * 100).toFixed(1)}% — money is leaving this stock.`,
    },
    {
      key: "momentum",
      label: "Momentum is healthy — not too hot, not too cold",
      detail: "RSI measures buying speed on a 0-100 scale. Below 40 means nobody's interested. Above 70 means everyone already bought and it's vulnerable to a sell-off. The sweet spot is 45-60 — enough energy to keep climbing, not so hot it's about to reverse.",
      pass: rsiVal != null && rsiVal >= 45 && rsiVal <= 60,
      warn: rsiVal != null && ((rsiVal >= 40 && rsiVal < 45) || (rsiVal > 60 && rsiVal <= 70)),
      warnLabel: rsiVal != null && rsiVal > 60
        ? `RSI ${Math.round(rsiVal)} — getting extended. Still ok but watch for weakness.`
        : `RSI ${rsiVal != null ? Math.round(rsiVal) : "??"} — momentum is soft.`,
      fail: rsiVal != null && rsiVal > 70
        ? `RSI ${Math.round(rsiVal)} — overbought. Too late to buy safely.`
        : `RSI very low — no buying pressure yet.`,
    },
    {
      key: "volume",
      label: "Buyers are showing up in above-average numbers",
      detail: "Volume confirms the move. If a stock pulls back to support and volume is low, sellers aren't panicking — they're just pausing. When it bounces and volume jumps, real buyers are stepping in. That's the setup we want.",
      pass: volRatio != null && volRatio >= 1.5,
      warn: volRatio != null && volRatio >= 1.1 && volRatio < 1.5,
      warnLabel: "Above-average but not surging. Acceptable.",
      fail: "Volume is below average. The move isn't confirmed.",
    },
    {
      key: "affordable",
      label: "Position fits your account size",
      detail: "At 1% risk per trade, the shares you'd buy stay under 30% of your account. This keeps one bad trade from doing serious damage.",
      pass: canAfford,
      fail: "Position too large at 1% risk. Stock price may be too high for your account size.",
    },
    hasEarnings === null
      ? { key: "earnings", label: "Checking earnings dates…", manual: true,
          detail: "Earnings announcements cause gap moves — the stock opens far from where it closed. Your stop-loss can't protect you from a gap." }
      : hasEarnings
      ? { key: "earnings", label: earningsDate ? `Earnings on ${earningsDate} — high gap risk` : "Earnings coming up",
          detail: "Sell before earnings or skip this trade. Gaps can jump your stop.",
          pass: false,
          fail: earningsDate ? `Earnings on ${earningsDate}.` : "Earnings in your window." }
      : { key: "earnings", label: "No earnings in your holding window",
          detail: "No earnings in the next 30 days. Safe to hold.", pass: true },
  ];
}

export function marketCondition(spyBars) {
  if (!spyBars?.length) return null;
  const closes = spyBars.map(b => b.c);
  const price  = closes[closes.length - 1];
  const s50    = sma(closes, 50);
  const s200   = sma(closes, 200);
  if (s200 && price > s200) return {
    label: "Bull market — conditions favor buyers",
    summary: "The broad market is above its long-term average. Look for pullbacks to SMA20 in stocks that are outperforming.",
    color: "#16a34a", bg: "#f0fdf4", emoji: "🟢",
  };
  if (s50 && price > s50) return {
    label: "Mixed market — be selective",
    summary: "Choppy zone. Only take scores 75+. Reduce position sizes.",
    color: "#d97706", bg: "#fffbeb", emoji: "🟡",
  };
  return {
    label: "Bear market — stay in cash",
    summary: "Below major averages. Cash is a position. Wait.",
    color: "#e14c4c", bg: "#fff5f5", emoji: "🔴",
  };
}
