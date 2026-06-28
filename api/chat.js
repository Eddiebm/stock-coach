export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ available: false, reason: "no_key" }, 200);

  const { messages, context } = await req.json();
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: "messages required" }, 400);
  }

  const picksText = (context?.picks ?? [])
    .map((p, i) =>
      `${i + 1}. ${p.sym} (${p.name ?? ""}) — Score ${p.score}/100 (${p.grade?.label}). ` +
      `Entry $${p.price?.toFixed(2)}, stop $${p.stopPrice?.toFixed(2)}, target $${p.targetPrice?.toFixed(2)}. ` +
      `${p.shares} shares = $${p.posValue?.toFixed(0)} position, risking $${p.riskAmount?.toFixed(0)}. ` +
      `Momentum score: ${p.rsiVal != null ? Math.round(p.rsiVal) : "??"}/100. ` +
      `${p.aboveSma200 ? "Above long-term average" : "Below long-term average"}.`
    )
    .join("\n");

  const systemPrompt = `You are a stock trading coach. You help someone with a $${context?.capital ?? 10000} account who is learning to swing trade stocks for income.

TODAY'S MARKET: ${context?.marketCondition?.label ?? "unknown"}
${context?.marketCondition?.summary ?? ""}

TODAY'S TOP SETUPS:
${picksText || "None found yet."}

YOUR RULES — never break these:
- Use zero jargon. Never say: RSI, SMA, EMA, ATR, moving average, technical analysis, indicator, oscillator, support, resistance, sigma, standard deviation.
- Translate everything into plain English. "RSI is 67" → "momentum is healthy but getting warm." "Above SMA200" → "the stock has been going up for most of the past year."
- Keep answers short: 2-4 sentences unless the user asks for more.
- This user has $${context?.capital ?? 10000}. Always think in terms of their account size. Never suggest risking more than 1-2% per trade.
- The stop-loss is always pre-defined before entering. Emphasize that selling at the stop is not optional — it's the rule.
- You do NOT know what a stock will do. Never say "it will go up" — only "the conditions favor buyers."
- If asked about earnings, remind them earnings are the main gap risk to avoid.
- If the question is outside stock trading, say so politely and redirect.
- Be encouraging but honest. Sitting in cash when conditions are bad is the right trade.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system: systemPrompt,
        messages: messages.slice(-12),
      }),
    });

    if (!r.ok) return json({ error: "ai_unavailable" }, 502);
    const data  = await r.json();
    const reply = data?.content?.[0]?.text ?? "I couldn't process that. Please try again.";
    return json({ reply });
  } catch {
    return json({ error: "ai_unavailable" }, 502);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
