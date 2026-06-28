import { sma, rsi, atr, volumeRatio } from "./indicators.js";

export function analyzeStock({ sym, name, bars, capital, hasEarnings, earningsDate }) {
  if (!bars || bars.length < 50) return null;

  const closes = bars.map(b => b.c);
  const price = closes[closes.length - 1];

  const sma20  = sma(closes, 20);
  const sma50  = sma(closes, 50);
  const sma200 = bars.length >= 200 ? sma(closes, 200) : null;
  const rsiVal = rsi(closes, 14);
  const atrVal = atr(bars, 14);
  const volRatio = volumeRatio(bars, 20);

  const aboveSma20  = sma20  != null && price > sma20;
  const aboveSma50  = sma50  != null && price > sma50;
  const aboveSma200 = sma200 != null && price > sma200;

  // Position sizing — 1% risk rule
  const stopDist   = atrVal ?? price * 0.03;
  const stopPrice  = price - stopDist;
  const targetPrice = price + stopDist * 2;
  const riskAmount = capital * 0.01;
  const shares     = Math.max(1, Math.floor(riskAmount / stopDist));
  const posValue   = shares * price;
  const canAfford  = posValue <= capital * 0.30;
  const rr         = (targetPrice - price) / stopDist; // always 2.0 by construction

  let score = 0;

  // Trend (30 pts)
  if (aboveSma20 && aboveSma50 && aboveSma200) score += 30;
  else if (aboveSma50 && aboveSma200) score += 20;
  else if (aboveSma200) score += 10;
  else if (aboveSma20 && aboveSma50) score += 8;

  // RSI momentum (25 pts) — 45-65 is ideal
  if (rsiVal != null) {
    if (rsiVal >= 45 && rsiVal <= 65) score += 25;
    else if ((rsiVal >= 35 && rsiVal < 45) || (rsiVal > 65 && rsiVal <= 70)) score += 15;
    else if (rsiVal > 70 && rsiVal <= 78) score += 8;
    else if (rsiVal < 35) score += 5;
  }

  // Volume confirmation (15 pts)
  if (volRatio != null) {
    if (volRatio >= 1.5) score += 15;
    else if (volRatio >= 1.2) score += 10;
    else if (volRatio >= 0.8) score += 5;
  }

  // Risk/reward always 2:1 by construction — award 20 pts
  score += 20;

  // Earnings penalty
  if (hasEarnings === true) score = 0;

  // Affordability guard
  if (!canAfford) score = Math.min(score, 20);

  score = Math.min(100, Math.round(score));

  return {
    sym, name, price,
    sma20, sma50, sma200, rsiVal, atrVal, volRatio,
    aboveSma20, aboveSma50, aboveSma200,
    stopPrice, targetPrice, stopDist, rr,
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

export function stockChecks({ price, sma50, sma200, rsiVal, volRatio, canAfford, hasEarnings, earningsDate, aboveSma20, aboveSma50, aboveSma200 }) {
  return [
    {
      key: "trend",
      label: "Stock is in an uptrend",
      detail: "Price is above its 50-day and 200-day averages — it has been rising consistently, not just this week. Buying stocks in uptrends is buying with the tide, not against it.",
      pass: aboveSma50 && aboveSma200,
      warn: aboveSma50 && !aboveSma200,
      warnLabel: "Above short-term average but below long-term — the trend is improving but not confirmed.",
      fail: "Stock is in a downtrend. Don't buy falling stocks.",
    },
    {
      key: "momentum",
      label: "Momentum is healthy — not too hot, not too cold",
      detail: "We measure how fast the stock has been moving on a 0-100 scale. Too slow (below 40) means no energy. Too fast (above 75) means everyone already bought it. The sweet spot is 45-65.",
      pass: rsiVal != null && rsiVal >= 45 && rsiVal <= 65,
      warn: rsiVal != null && ((rsiVal >= 35 && rsiVal < 45) || (rsiVal > 65 && rsiVal <= 75)),
      warnLabel: rsiVal != null && rsiVal > 65
        ? `Momentum is elevated (${Math.round(rsiVal)}/100) — risk of a pullback soon.`
        : `Momentum is weak (${rsiVal != null ? Math.round(rsiVal) : "??"}/100) — the stock hasn't woken up yet.`,
      fail: rsiVal != null && rsiVal > 75
        ? `Overbought (${Math.round(rsiVal)}/100) — too late to buy safely.`
        : `Very weak momentum — wait for buyers to return.`,
    },
    {
      key: "volume",
      label: "Buyers are showing up in force",
      detail: "When more people than usual are trading the stock, the move is real. When volume is thin, the price can reverse easily. We compare today's volume to the 20-day average.",
      pass: volRatio != null && volRatio >= 1.3,
      warn: volRatio != null && volRatio >= 0.8 && volRatio < 1.3,
      warnLabel: "Average volume — the move isn't confirmed by heavy buying yet.",
      fail: "Low volume — no conviction behind this move.",
    },
    {
      key: "affordable",
      label: "Position fits your account",
      detail: "Based on 1% risk per trade, the number of shares you'd buy stays under 30% of your account. You never want one stock to dominate your money.",
      pass: canAfford,
      fail: "Position would use too much of your account at 1% risk. The stock price may be too high for your current size.",
    },
    hasEarnings === null
      ? {
          key: "earnings",
          label: "No earnings in the next 30 days",
          detail: "Earnings announcements cause overnight gap moves — the stock can open 10-20% away from where it closed. We're checking this automatically.",
          manual: true,
        }
      : hasEarnings
      ? {
          key: "earnings",
          label: earningsDate ? `Earnings on ${earningsDate}` : "Earnings coming up",
          detail: "If you hold through earnings, the stock could gap sharply against you before you can react. Your stop-loss won't protect you from overnight gaps.",
          pass: false,
          fail: earningsDate
            ? `Earnings on ${earningsDate} — sell before then or skip this trade.`
            : "Earnings in your window — high gap risk.",
        }
      : {
          key: "earnings",
          label: "No earnings in your holding window",
          detail: "No earnings in the next 30 days. You can hold without surprise gap risk.",
          pass: true,
        },
  ];
}

export function marketCondition(spyBars) {
  if (!spyBars?.length) return null;
  const closes = spyBars.map(b => b.c);
  const price  = closes[closes.length - 1];
  const s50    = sma(closes, 50);
  const s200   = sma(closes, 200);

  if (s200 && price > s200) {
    return {
      label: "Bull market — conditions favor buyers",
      summary: "The broad market is above its long-term average. Most stocks drift higher over time in this environment. This is the right time to be looking for setups.",
      color: "#16a34a", bg: "#f0fdf4", emoji: "🟢",
    };
  }
  if (s50 && price > s50) {
    return {
      label: "Mixed market — be selective",
      summary: "The market is in a choppy zone — not clearly up or down. Only take the highest-score setups. Keep position sizes smaller than usual.",
      color: "#d97706", bg: "#fffbeb", emoji: "🟡",
    };
  }
  return {
    label: "Bear market — stay in cash",
    summary: "The market is below its major averages. Buying in a downtrend is fighting the tide. Cash is a position. Wait for conditions to improve before risking money.",
    color: "#e14c4c", bg: "#fff5f5", emoji: "🔴",
  };
}
