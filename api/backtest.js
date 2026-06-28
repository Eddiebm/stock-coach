export const config = { runtime: "edge" };

const SYMBOLS = [
  "SPY",
  "GLD","XLE","XLF",
  "AAPL","MSFT","NVDA","AMZN","GOOGL","META","NFLX","CRM",
  "TSLA","AMD","PLTR","COIN","UBER","PYPL",
  "JPM","BAC","GS","KO","MCD","WMT","HD","NKE",
  "XOM","CVX","JNJ","UNH","PFE","MRNA","F","SOFI","INTC",
  "SNAP","DIS","V","MA",
];

export default async function handler(req) {
  const id     = process.env.ALPACA_KEY_ID;
  const secret = process.env.ALPACA_SECRET_KEY;
  if (!id || !secret) throw new Error("ALPACA keys not set");

  const start = new Date(Date.now() - 4 * 365 * 86400000).toISOString().slice(0, 10);

  // Fetch all symbols in parallel — one request each to get per-symbol limit=1000
  const results = await Promise.all(
    SYMBOLS.map(sym => fetchBars(sym, id, secret, start))
  );

  const bars = {};
  SYMBOLS.forEach((sym, i) => { bars[sym] = results[i]; });

  return new Response(JSON.stringify({ bars }), {
    headers: {
      "content-type":  "application/json",
      "cache-control": "s-maxage=3600, stale-while-revalidate=7200",
    },
  });
}

async function fetchBars(sym, id, secret, start) {
  const all = [];
  let token = null;

  do {
    const url = new URL(`https://data.alpaca.markets/v2/stocks/${sym}/bars`);
    url.searchParams.set("timeframe",  "1Day");
    url.searchParams.set("start",      start);
    url.searchParams.set("adjustment", "split");
    url.searchParams.set("feed",       "iex");
    url.searchParams.set("limit",      "1000");
    if (token) url.searchParams.set("page_token", token);

    try {
      const r = await fetch(url.toString(), {
        headers: { "APCA-API-KEY-ID": id, "APCA-API-SECRET-KEY": secret },
      });
      if (!r.ok) break;
      const d = await r.json();
      for (const b of d.bars ?? []) {
        all.push({ t: b.t.slice(0, 10), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v });
      }
      token = d.next_page_token ?? null;
    } catch {
      break;
    }
  } while (token);

  return all.sort((a, b) => a.t.localeCompare(b.t));
}
