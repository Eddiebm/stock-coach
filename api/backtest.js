export const config = { runtime: "edge" };

// ── Expanded universe: 75 symbols ─────────────────────────────────────────────
// Broad ETFs, all 11 sector ETFs, international ETFs, and 40+ individual stocks
// covering tech, finance, healthcare, energy, industrials, consumer.

const SYMBOLS = [
  // Broad market
  "SPY", "QQQ", "IWM", "GLD", "EEM", "EFA", "EWJ",

  // All 11 SPDR sector ETFs
  "XLK", "XLF", "XLE", "XLV", "XLI", "XLY", "XLP", "XLB", "XLU", "XLRE", "XLC",

  // Tech
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "NFLX", "CRM",
  "TSLA", "AMD", "PLTR", "COIN", "INTC", "QCOM", "AVGO",

  // Consumer
  "UBER", "PYPL", "SNAP", "DIS", "KO", "MCD", "WMT", "HD",
  "NKE", "TGT", "LOW", "SBUX", "DG", "COST", "PG",

  // Finance
  "JPM", "BAC", "GS", "WFC", "V", "MA", "USB",

  // Healthcare
  "JNJ", "UNH", "PFE", "MRNA", "LLY", "ABBV", "MRK", "TMO",

  // Energy & materials
  "XOM", "CVX", "SLB", "FCX",

  // Industrials
  "GE", "CAT", "DE", "BA", "RTX",

  // Other
  "F", "SOFI", "T",
];

// Batch size: 10 symbols per Alpaca multi-bar request keeps total bars per
// page at ~7,500 (10 × 750 trading days) — fits in one page with limit=10000.
const BATCH = 10;

export default async function handler(req) {
  const id     = process.env.ALPACA_KEY_ID;
  const secret = process.env.ALPACA_SECRET_KEY;
  if (!id || !secret) throw new Error("ALPACA keys not set");

  const start = new Date(Date.now() - 4 * 365 * 86400000).toISOString().slice(0, 10);
  const bars  = {};

  // Fan out in batches of 10 — keeps Cloudflare subrequest count ~8-10
  const batches = [];
  for (let i = 0; i < SYMBOLS.length; i += BATCH) {
    batches.push(SYMBOLS.slice(i, i + BATCH));
  }

  await Promise.all(batches.map(batch => fetchBatch(batch, id, secret, start, bars)));

  // Sort every symbol's bars by date ascending
  for (const sym of Object.keys(bars)) {
    bars[sym].sort((a, b) => a.t.localeCompare(b.t));
  }

  return new Response(JSON.stringify({ bars, symbols: Object.keys(bars) }), {
    headers: {
      "content-type":  "application/json",
      "cache-control": "s-maxage=3600, stale-while-revalidate=7200",
    },
  });
}

async function fetchBatch(batch, id, secret, start, bars) {
  let token = null;

  do {
    const url = new URL("https://data.alpaca.markets/v2/stocks/bars");
    url.searchParams.set("symbols",    batch.join(","));
    url.searchParams.set("timeframe",  "1Day");
    url.searchParams.set("start",      start);
    url.searchParams.set("adjustment", "split");
    url.searchParams.set("feed",       "iex");
    url.searchParams.set("limit",      "10000");
    if (token) url.searchParams.set("page_token", token);

    try {
      const r = await fetch(url.toString(), {
        headers: { "APCA-API-KEY-ID": id, "APCA-API-SECRET-KEY": secret },
      });
      if (!r.ok) break;
      const d = await r.json();

      for (const [sym, symBars] of Object.entries(d.bars ?? {})) {
        if (!bars[sym]) bars[sym] = [];
        for (const b of symBars) {
          bars[sym].push({ t: b.t.slice(0, 10), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v });
        }
      }

      token = d.next_page_token ?? null;
    } catch {
      break;
    }
  } while (token);
}
