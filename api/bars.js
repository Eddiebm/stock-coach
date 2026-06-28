export const config = { runtime: "edge" };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").toUpperCase().replace(/[^A-Z.]/g, "");
  const limit  = Math.min(parseInt(searchParams.get("limit") || "250"), 500);

  const id     = process.env.ALPACA_KEY_ID;
  const secret = process.env.ALPACA_SECRET_KEY;
  if (!id || !secret) return json({ error: "no_key" }, 503);
  if (!symbol)        return json({ error: "symbol required" }, 400);

  const url =
    `https://data.alpaca.markets/v2/stocks/${symbol}/bars` +
    `?timeframe=1Day&limit=${limit}&feed=iex&adjustment=split`;

  const r = await fetch(url, {
    headers: { "APCA-API-KEY-ID": id, "APCA-API-SECRET-KEY": secret },
  });

  if (!r.ok) return json({ error: "data unavailable", status: r.status }, 502);
  const data = await r.json();
  return json({ bars: data.bars ?? [] }, 200, {
    "cache-control": "s-maxage=300, stale-while-revalidate=600",
  });
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });
}
