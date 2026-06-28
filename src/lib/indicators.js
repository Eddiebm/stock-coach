export function sma(values, period) {
  if (!values || values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function rsi(closes, period = 14) {
  if (!closes || closes.length < period + 1) return null;
  const recent = closes.slice(-(period + 1));
  let gains = 0, losses = 0;
  for (let i = 1; i < recent.length; i++) {
    const change = recent[i] - recent[i - 1];
    if (change > 0) gains += change;
    else losses += -change;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

export function atr(bars, period = 14) {
  if (!bars || bars.length < period + 1) return null;
  const recent = bars.slice(-(period + 1));
  const trs = [];
  for (let i = 1; i < recent.length; i++) {
    const cur = recent[i];
    const prev = recent[i - 1];
    trs.push(Math.max(cur.h - cur.l, Math.abs(cur.h - prev.c), Math.abs(cur.l - prev.c)));
  }
  return trs.reduce((a, b) => a + b, 0) / period;
}

export function volumeRatio(bars, period = 20) {
  if (!bars || bars.length < period + 1) return null;
  const vols = bars.map(b => b.v);
  const avg = sma(vols.slice(0, -1), period);
  const today = vols[vols.length - 1];
  return avg ? today / avg : null;
}
