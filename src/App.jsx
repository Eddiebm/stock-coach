import { useState, useEffect, useRef, useCallback } from "react";
import { analyzeStock, scoreGrade, stockChecks, marketCondition as computeMarketCondition } from "./lib/score.js";
import { runBacktest, computeStats, stressStats, STRESS_PERIODS } from "./lib/backtest.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

const money  = n => n == null ? "—" : `$${Math.round(n).toLocaleString()}`;
const money2 = n => n == null ? "—" : `$${Number(n).toFixed(2)}`;
const pct    = n => n == null ? "—" : `${(n * 100).toFixed(1)}%`;
const today  = () => new Date().toISOString().slice(0, 10);
const uid    = () => Math.random().toString(36).slice(2, 9);

function nDaysOut(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ─── stock universe ───────────────────────────────────────────────────────────

const STOCKS = [
  { sym: "SPY",   name: "S&P 500 ETF" },
  { sym: "QQQ",   name: "Nasdaq 100 ETF" },
  { sym: "IWM",   name: "Russell 2000 ETF" },
  { sym: "GLD",   name: "Gold ETF" },
  { sym: "XLE",   name: "Energy ETF" },
  { sym: "XLF",   name: "Financials ETF" },
  { sym: "AAPL",  name: "Apple" },
  { sym: "MSFT",  name: "Microsoft" },
  { sym: "NVDA",  name: "NVIDIA" },
  { sym: "AMZN",  name: "Amazon" },
  { sym: "GOOGL", name: "Alphabet" },
  { sym: "META",  name: "Meta" },
  { sym: "NFLX",  name: "Netflix" },
  { sym: "CRM",   name: "Salesforce" },
  { sym: "TSLA",  name: "Tesla" },
  { sym: "AMD",   name: "AMD" },
  { sym: "PLTR",  name: "Palantir" },
  { sym: "COIN",  name: "Coinbase" },
  { sym: "UBER",  name: "Uber" },
  { sym: "PYPL",  name: "PayPal" },
  { sym: "JPM",   name: "JPMorgan Chase" },
  { sym: "BAC",   name: "Bank of America" },
  { sym: "GS",    name: "Goldman Sachs" },
  { sym: "KO",    name: "Coca-Cola" },
  { sym: "MCD",   name: "McDonald's" },
  { sym: "WMT",   name: "Walmart" },
  { sym: "HD",    name: "Home Depot" },
  { sym: "NKE",   name: "Nike" },
  { sym: "XOM",   name: "ExxonMobil" },
  { sym: "CVX",   name: "Chevron" },
  { sym: "JNJ",   name: "Johnson & Johnson" },
  { sym: "UNH",   name: "UnitedHealth" },
  { sym: "PFE",   name: "Pfizer" },
  { sym: "MRNA",  name: "Moderna" },
  { sym: "F",     name: "Ford" },
  { sym: "SOFI",  name: "SoFi" },
  { sym: "INTC",  name: "Intel" },
  { sym: "SNAP",  name: "Snap" },
  { sym: "DIS",   name: "Disney" },
  { sym: "V",     name: "Visa" },
  { sym: "MA",    name: "Mastercard" },
];

// ─── styles ───────────────────────────────────────────────────────────────────

const S = {
  app: { maxWidth: 840, margin: "0 auto", padding: "0 16px 120px" },
  header: { background: "#fff", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 50 },
  headerInner: { maxWidth: 840, margin: "0 auto", padding: "0 16px" },
  titleRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 0 0" },
  title: { fontSize: 18, fontWeight: 800, color: "#0f172a" },
  subtitle: { fontSize: 11, color: "#94a3b8", marginTop: 1 },
  capitalWrap: { display: "flex", alignItems: "center", gap: 6, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 10px" },
  capitalLabel: { fontSize: 11, color: "#64748b" },
  capitalInput: { width: 90, border: "none", background: "transparent", fontSize: 14, fontWeight: 700, color: "#0f172a", outline: "none", textAlign: "right" },
  tabs: { display: "flex", gap: 0, borderTop: "1px solid #f1f5f9", marginTop: 10 },
  tab: (active) => ({
    padding: "10px 16px", fontSize: 13, fontWeight: active ? 700 : 500,
    color: active ? "#0f172a" : "#94a3b8",
    background: "none", border: "none", borderBottom: active ? "2px solid #0f172a" : "2px solid transparent",
    cursor: "pointer", whiteSpace: "nowrap",
  }),
  section: { paddingTop: 24 },
  banner: (color, bg) => ({
    background: bg, border: `1px solid ${color}30`, borderRadius: 12,
    padding: "14px 18px", marginBottom: 20,
    display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
  }),
  scanBtn: {
    background: "#0f172a", color: "#fff", border: "none", borderRadius: 10,
    padding: "13px 0", width: "100%", fontSize: 15, fontWeight: 700,
    cursor: "pointer", marginBottom: 20,
  },
  scanBtnDisabled: {
    background: "#94a3b8", color: "#fff", border: "none", borderRadius: 10,
    padding: "13px 0", width: "100%", fontSize: 15, fontWeight: 700,
    cursor: "not-allowed", marginBottom: 20,
  },
  card: (borderColor) => ({
    border: `1.5px solid ${borderColor}30`, borderRadius: 14, background: "#fff",
    padding: 20, display: "flex", flexDirection: "column", gap: 14,
  }),
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 20px", background: "#f8fafc", borderRadius: 10, padding: "14px 16px", fontSize: 13 },
  label: { color: "#64748b" },
  val: { fontWeight: 700, color: "#0f172a" },
  checkItem: { display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13 },
  checkIcon: (pass, warn) => ({
    width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginTop: 1,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 10, fontWeight: 700,
    background: pass ? "#dcfce7" : warn ? "#fef3c7" : "#fee2e2",
    color: pass ? "#16a34a" : warn ? "#d97706" : "#e14c4c",
  }),
  explainBtn: { fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 },
  input: { border: "none", outline: "none", background: "transparent", fontSize: 14, fontWeight: 600, color: "#0f172a", width: "100%" },
  inputWrap: { display: "flex", alignItems: "center", gap: 6, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px" },
  primaryBtn: { background: "#0f172a", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  journalRow: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" },
  pill: (color, bg) => ({ fontSize: 11, fontWeight: 700, color, background: bg, borderRadius: 20, padding: "3px 9px", display: "inline-block" }),
  deleteBtn: { background: "none", border: "1px solid #fecaca", color: "#e14c4c", borderRadius: 6, padding: "4px 8px", fontSize: 12, cursor: "pointer" },
  closeBtn: { background: "#0f172a", color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" },
};

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab]         = useState("today");
  const [capital, setCapital] = useState(10000);
  const [picks, setPicks]     = useState([]);
  const [condition, setCondition] = useState(null);
  const [scanning, setScanning]   = useState(false);
  const [scanMeta, setScanMeta]   = useState(null);
  const [aiCtx, setAiCtx]     = useState({ picks: [], marketCondition: null, capital: 10000 });
  const [journal, setJournal] = useState(() => {
    try { return JSON.parse(localStorage.getItem("sc_journal") || "[]"); } catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem("sc_journal", JSON.stringify(journal)); } catch {}
  }, [journal]);

  function addTrade(t) {
    setJournal(j => [{ id: uid(), ...t, openedAt: today(), status: "open" }, ...j]);
  }
  function closeTrade(id, exitPrice) {
    setJournal(j => j.map(t => {
      if (t.id !== id) return t;
      const px = parseFloat(exitPrice);
      const pnl = (px - t.entryPrice) * t.shares;
      return { ...t, status: "closed", exitPrice: px, closedAt: today(), realizedPnl: pnl };
    }));
  }
  function deleteTrade(id) {
    setJournal(j => j.filter(t => t.id !== id));
  }

  async function runScan() {
    setScanning(true);
    setPicks([]);
    const scanStart = Date.now();

    // SPY for market condition
    const spyData = await fetch("/api/bars?symbol=SPY&limit=250").then(r => r.json()).catch(() => null);
    const cond = computeMarketCondition(spyData?.bars ?? []);
    setCondition(cond);

    // Bulk earnings — 30 days out
    const exp = nDaysOut(30);
    const earningsData = await fetch(`/api/earnings?expiration=${exp}`).then(r => r.json()).catch(() => null);
    const earningsMap  = earningsData?.earningsMap ?? null;

    // Scan all stocks (skip SPY — already used for condition)
    const scanTargets = STOCKS.filter(s => s.sym !== "SPY");
    const results = await Promise.all(scanTargets.map(async ({ sym, name }) => {
      const data = await fetch(`/api/bars?symbol=${sym}&limit=250`).then(r => r.json()).catch(() => null);
      if (!data?.bars?.length) return null;
      const earningsEntry = earningsMap ? (earningsMap[sym] ?? { hasEarnings: false }) : null;
      return analyzeStock({
        sym, name, bars: data.bars, capital,
        hasEarnings: earningsEntry?.hasEarnings ?? null,
        earningsDate: earningsEntry?.date ?? null,
      });
    }));

    const qualified = results
      .filter(Boolean)
      .filter(r => r.score >= 50)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    setPicks(qualified);
    setScanMeta({ total: scanTargets.length, qualified: qualified.length, ms: Date.now() - scanStart });
    setAiCtx({ picks: qualified, marketCondition: cond, capital });
    setScanning(false);
  }

  const openTrades  = journal.filter(t => t.status === "open");
  const closedTrades = journal.filter(t => t.status === "closed");
  const totalPnl    = closedTrades.reduce((s, t) => s + (t.realizedPnl ?? 0), 0);
  const wins        = closedTrades.filter(t => (t.realizedPnl ?? 0) > 0).length;
  const losses      = closedTrades.filter(t => (t.realizedPnl ?? 0) <= 0).length;

  return (
    <>
      <header style={S.header}>
        <div style={S.headerInner}>
          <div style={S.titleRow}>
            <div>
              <div style={S.title}>Stock Coach</div>
              <div style={S.subtitle}>Should I buy this stock today?</div>
            </div>
            <div style={S.capitalWrap}>
              <span style={S.capitalLabel}>Account $</span>
              <input
                type="number"
                value={capital}
                onChange={e => setCapital(Math.max(100, parseInt(e.target.value) || 0))}
                style={S.capitalInput}
              />
            </div>
          </div>
          <nav style={S.tabs}>
            {[["today","Today's Picks"], ["calculator","Calculator"], ["journal","Journal" + (openTrades.length ? ` (${openTrades.length})` : "")], ["review","Review"], ["backtest","📊 Backtest"]].map(([id, label]) => (
              <button key={id} style={S.tab(tab === id)} onClick={() => setTab(id)}>{label}</button>
            ))}
          </nav>
        </div>
      </header>

      <main style={S.app}>
        {tab === "today" && (
          <TodayView
            capital={capital}
            picks={picks}
            condition={condition}
            scanning={scanning}
            scanMeta={scanMeta}
            onScan={runScan}
            onLoad={(pick) => {
              addTrade({
                sym: pick.sym,
                name: pick.name,
                entryPrice: pick.price,
                stopPrice: pick.stopPrice,
                targetPrice: pick.targetPrice,
                shares: pick.shares,
                riskAmount: pick.riskAmount,
              });
              setTab("journal");
            }}
          />
        )}
        {tab === "calculator" && (
          <CalculatorView capital={capital} onLog={addTrade} />
        )}
        {tab === "journal" && (
          <JournalView
            open={openTrades}
            closed={closedTrades}
            onClose={closeTrade}
            onDelete={deleteTrade}
          />
        )}
        {tab === "review" && (
          <ReviewView
            open={openTrades}
            closed={closedTrades}
            totalPnl={totalPnl}
            wins={wins}
            losses={losses}
            capital={capital}
          />
        )}
        {tab === "backtest" && <BacktestView capital={capital} />}
      </main>

      <AiAssistant context={aiCtx} />
    </>
  );
}

// ─── TodayView ────────────────────────────────────────────────────────────────

function TodayView({ capital, picks, condition, scanning, scanMeta, onScan, onLoad }) {
  const noTrades = !scanning && scanMeta && picks.length === 0;

  return (
    <div style={S.section}>
      {condition && (
        <div style={S.banner(condition.color, condition.bg)}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: condition.color, marginBottom: 4 }}>
              {condition.emoji} {condition.label}
            </div>
            <div style={{ fontSize: 13, color: "#0f172a", lineHeight: 1.5 }}>{condition.summary}</div>
          </div>
          <button
            onClick={onScan}
            style={{ fontSize: 11, color: "#64748b", background: "none", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 12px", cursor: "pointer", flexShrink: 0 }}
          >
            Refresh ↺
          </button>
        </div>
      )}

      {!scanning && !scanMeta && (
        <div style={{ textAlign: "center", padding: "48px 24px", background: "#fff", borderRadius: 16, border: "1.5px solid #e2e8f0", marginBottom: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📈</div>
          <div style={{ fontWeight: 700, fontSize: 20, color: "#0f172a", marginBottom: 8 }}>Ready to scan the market</div>
          <div style={{ fontSize: 14, color: "#64748b", marginBottom: 24, maxWidth: 340, margin: "0 auto 24px" }}>
            We'll check {STOCKS.length - 1} stocks, score each one, and surface the best setups — all in plain English.
          </div>
          <button onClick={onScan} style={{ ...S.scanBtn, width: "auto", padding: "13px 32px" }}>
            Scan the market →
          </button>
        </div>
      )}

      {scanning && (
        <div style={{ textAlign: "center", padding: "48px 24px" }}>
          <div style={{ fontSize: 32, marginBottom: 12, animation: "spin 1s linear infinite" }}>⟳</div>
          <div style={{ fontWeight: 700, fontSize: 18, color: "#0f172a", marginBottom: 6 }}>Scanning {STOCKS.length - 1} stocks…</div>
          <div style={{ fontSize: 13, color: "#64748b" }}>Checking trends, momentum, and earnings risk</div>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {noTrades && (
        <div style={{ textAlign: "center", padding: "48px 24px", background: "#f8fafc", borderRadius: 16, border: "1.5px solid #e2e8f0" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🧘</div>
          <div style={{ fontWeight: 700, fontSize: 20, color: "#0f172a", marginBottom: 8 }}>No setups today.</div>
          <div style={{ fontSize: 15, color: "#475569", marginBottom: 6 }}>Cash is a position too.</div>
          <div style={{ fontSize: 13, color: "#94a3b8", maxWidth: 340, margin: "0 auto" }}>
            None of the {scanMeta?.total} stocks scanned hit the score threshold. Waiting for better conditions is a skill most people only learn after losing money.
          </div>
        </div>
      )}

      {picks.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a", marginBottom: 16 }}>
            Today's best {picks.length === 1 ? "setup" : `${picks.length} setups`}
            <span style={{ fontSize: 12, fontWeight: 400, color: "#94a3b8", marginLeft: 8 }}>
              out of {scanMeta?.total ?? "?"} scanned
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {picks.map(p => (
              <StockCard key={p.sym} pick={p} capital={capital} onLoad={onLoad} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── StockCard ────────────────────────────────────────────────────────────────

function StockCard({ pick, capital, onLoad }) {
  const [showChecks, setShowChecks] = useState(false);
  const { sym, name, price, stopPrice, targetPrice, shares, posValue, riskAmount,
    score, grade, hasEarnings, earningsDate,
    aboveSma20, aboveSma50, aboveSma200, rsiVal, volRatio, canAfford } = pick;

  const checks   = stockChecks({ price, aboveSma20, aboveSma50, aboveSma200, rsiVal, volRatio, canAfford, hasEarnings, earningsDate });
  const passing  = checks.filter(c => !c.manual && c.pass);
  const cautions = checks.filter(c => !c.manual && (c.warn || (!c.pass && !c.warn && c.warnLabel)));
  const failed   = checks.filter(c => !c.manual && !c.pass && !c.warn && !c.warnLabel && !c.manual);

  const stopPct   = price ? ((price - stopPrice) / price * 100).toFixed(1) : null;
  const targetPct = price ? ((targetPrice - price) / price * 100).toFixed(1) : null;
  const maxGain   = riskAmount * 2;

  return (
    <div style={S.card(grade.color)}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 22, color: "#0f172a", lineHeight: 1 }}>{sym}</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>{name}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: grade.color, lineHeight: 1 }}>{score}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: grade.color, letterSpacing: "0.05em", textTransform: "uppercase" }}>{grade.label}</div>
        </div>
      </div>

      {/* Why I like this */}
      {passing.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#16a34a", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
            Why I like this
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {passing.slice(0, 3).map(c => (
              <ExplainCheck key={c.key} check={c} icon="✓" accent="#16a34a" text={c.label} />
            ))}
          </div>
        </div>
      )}

      {/* Cautions */}
      {cautions.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#d97706", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
            Worth knowing
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {cautions.map(c => (
              <ExplainCheck key={c.key} check={c} icon="•" accent="#d97706" text={c.warnLabel || c.fail} />
            ))}
          </div>
        </div>
      )}

      {/* Numbers */}
      <div style={S.grid2}>
        <div style={S.label}>Buy at</div>
        <div style={S.val}>{money2(price)}</div>
        <div style={S.label}>Stop-loss</div>
        <div style={{ fontWeight: 700, color: "#e14c4c" }}>{money2(stopPrice)} <span style={{ fontWeight: 400, fontSize: 11, color: "#94a3b8" }}>({stopPct}% down)</span></div>
        <div style={S.label}>Target</div>
        <div style={{ fontWeight: 700, color: "#16a34a" }}>{money2(targetPrice)} <span style={{ fontWeight: 400, fontSize: 11, color: "#94a3b8" }}>({targetPct}% up)</span></div>
        <div style={S.label}>Shares to buy</div>
        <div style={S.val}>{shares} shares = {money(posValue)}</div>
        <div style={S.label}>You risk</div>
        <div style={{ fontWeight: 700, color: "#f97316" }}>{money(riskAmount)} <span style={{ fontWeight: 400, fontSize: 11, color: "#94a3b8" }}>(1% of account)</span></div>
        <div style={S.label}>If it works</div>
        <div style={{ fontWeight: 700, color: "#16a34a" }}>+{money(maxGain)}</div>
        <div style={S.label}>Stop-loss rule</div>
        <div style={{ fontWeight: 700, color: "#e14c4c" }}>sell if it hits {money2(stopPrice)}, no exceptions</div>
      </div>

      {/* Earnings warning */}
      {hasEarnings === true && (
        <div style={{ fontSize: 12, color: "#991b1b", background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontWeight: 600 }}>
          ❌ Earnings {earningsDate ? `on ${earningsDate}` : "coming up"} — don't hold through this. Sell before or skip the trade.
        </div>
      )}
      {hasEarnings === null && (
        <div style={{ fontSize: 12, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 12px" }}>
          ⚠ Earnings check unavailable — verify manually before entering.
        </div>
      )}

      {/* Full checklist toggle */}
      <button
        onClick={() => setShowChecks(s => !s)}
        style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", fontSize: 12, color: "#64748b", cursor: "pointer", textAlign: "left" }}
      >
        {showChecks ? "Hide" : "Show"} full checklist ({checks.filter(c => !c.manual && c.pass).length}/{checks.filter(c => !c.manual).length} passing)
      </button>

      {showChecks && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {checks.map(c => (
            c.manual
              ? <div key={c.key} style={{ ...S.checkItem, color: "#64748b" }}>
                  <div style={{ ...S.checkIcon(false, true), background: "#f1f5f9", color: "#94a3b8" }}>?</div>
                  <div><div style={{ fontSize: 13 }}>{c.label}</div><div style={{ fontSize: 11, color: "#94a3b8" }}>{c.detail}</div></div>
                </div>
              : <ExplainCheck
                  key={c.key}
                  check={c}
                  icon={c.pass ? "✓" : c.warn ? "!" : "✗"}
                  accent={c.pass ? "#16a34a" : c.warn ? "#d97706" : "#e14c4c"}
                  text={c.pass ? c.label : (c.warnLabel || c.fail || c.label)}
                />
          ))}
        </div>
      )}

      {/* Load trade button */}
      <button
        onClick={() => onLoad(pick)}
        style={{
          width: "100%", padding: "13px 0", background: "#0f172a", color: "#fff",
          border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer",
        }}
      >
        Log this trade in Journal →
      </button>
    </div>
  );
}

// ─── ExplainCheck ─────────────────────────────────────────────────────────────

function ExplainCheck({ check, icon, accent, text }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div style={S.checkItem}>
        <div style={S.checkIcon(icon === "✓", icon === "!")}>{icon}</div>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 13, color: "#0f172a" }}>{text ?? check.label}</span>
          {check.detail && (
            <button onClick={() => setOpen(o => !o)} style={{ ...S.explainBtn, marginLeft: 8 }}>
              {open ? "less" : "explain"}
            </button>
          )}
        </div>
      </div>
      {open && check.detail && (
        <div style={{ marginLeft: 26, marginTop: 4, fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
          {check.detail}
        </div>
      )}
    </div>
  );
}

// ─── CalculatorView ───────────────────────────────────────────────────────────

function CalculatorView({ capital, onLog }) {
  const [sym, setSym]     = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]     = useState(null);

  async function analyze() {
    const s = sym.trim().toUpperCase();
    if (!s) return;
    setLoading(true);
    setErr(null);
    setResult(null);

    const [barsData, earningsData] = await Promise.all([
      fetch(`/api/bars?symbol=${s}&limit=250`).then(r => r.json()).catch(() => null),
      fetch(`/api/earnings?symbol=${s}&expiration=${nDaysOut(30)}`).then(r => r.json()).catch(() => null),
    ]);

    if (!barsData?.bars?.length) {
      setErr(`No data found for ${s}. Check the ticker symbol.`);
      setLoading(false);
      return;
    }

    const res = analyzeStock({
      sym: s, name: s, bars: barsData.bars, capital,
      hasEarnings: earningsData?.hasEarnings ?? null,
      earningsDate: earningsData?.date ?? null,
    });

    if (!res) { setErr("Not enough history to analyze this stock."); setLoading(false); return; }
    setResult(res);
    setLoading(false);
  }

  return (
    <div style={S.section}>
      <div style={{ fontWeight: 700, fontSize: 17, color: "#0f172a", marginBottom: 6 }}>Analyze any stock</div>
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>Enter a ticker to get entry, stop-loss, target, and position size.</div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <div style={{ ...S.inputWrap, flex: 1 }}>
          <input
            style={{ ...S.input, textTransform: "uppercase" }}
            placeholder="e.g. AAPL"
            value={sym}
            onChange={e => setSym(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && analyze()}
          />
        </div>
        <button onClick={analyze} style={S.primaryBtn} disabled={loading}>
          {loading ? "…" : "Analyze"}
        </button>
      </div>

      {err && <div style={{ color: "#e14c4c", fontSize: 13, marginBottom: 16 }}>{err}</div>}

      {result && <StockCard pick={result} capital={capital} onLoad={onLog} />}
    </div>
  );
}

// ─── JournalView ──────────────────────────────────────────────────────────────

function JournalView({ open, closed, onClose, onDelete }) {
  return (
    <div style={S.section}>
      <div style={{ fontWeight: 700, fontSize: 17, color: "#0f172a", marginBottom: 16 }}>Open positions ({open.length})</div>
      {open.length === 0 && (
        <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 24 }}>No open trades. Log one from Today's Picks.</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
        {open.map(t => <JournalRow key={t.id} trade={t} onClose={onClose} onDelete={onDelete} />)}
      </div>

      {closed.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 17, color: "#0f172a", marginBottom: 16 }}>Closed trades</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {closed.map(t => <JournalRow key={t.id} trade={t} onClose={onClose} onDelete={onDelete} />)}
          </div>
        </>
      )}
    </div>
  );
}

function JournalRow({ trade: t, onClose, onDelete }) {
  const [exitPx, setExitPx] = useState("");
  const [currentPrice, setCurrentPrice] = useState(null);
  const open = t.status === "open";

  useEffect(() => {
    if (!open) return;
    fetch(`/api/bars?symbol=${t.sym}&limit=5`)
      .then(r => r.json())
      .then(d => {
        const bars = d?.bars ?? [];
        if (bars.length) setCurrentPrice(bars[bars.length - 1].c);
      })
      .catch(() => {});
  }, [t.sym, open]);

  const unrealizedPnl = currentPrice != null ? (currentPrice - t.entryPrice) * t.shares : null;
  const stopLossHit   = currentPrice != null && currentPrice <= t.stopPrice;
  const atTarget      = currentPrice != null && currentPrice >= t.targetPrice;

  function statusPill() {
    if (stopLossHit) return { text: "🚨 Stop-loss hit — close now", color: "#fff", bg: "#e14c4c" };
    if (atTarget)    return { text: "🎯 Target reached!", color: "#fff", bg: "#16a34a" };
    if (unrealizedPnl != null && unrealizedPnl > 0) return { text: "In profit", color: "#16a34a", bg: "#dcfce7" };
    if (unrealizedPnl != null && unrealizedPnl < 0) return { text: "Against you", color: "#f97316", bg: "#fff7ed" };
    return null;
  }

  const pill = open ? statusPill() : null;

  return (
    <div style={S.journalRow}>
      <div style={{ flex: "1 1 200px", minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>
          {t.sym} <span style={{ fontWeight: 400, fontSize: 12, color: "#94a3b8" }}>×{t.shares} shares</span>
        </div>
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>
          Bought {money2(t.entryPrice)} · Stop {money2(t.stopPrice)} · Target {money2(t.targetPrice)} · {t.openedAt}
          {t.status === "closed" && ` · Sold ${money2(t.exitPrice)} on ${t.closedAt}`}
        </div>

        {open && (
          <div style={{ marginTop: 8 }}>
            {pill && (
              <span style={{ ...S.pill(pill.color, pill.bg), marginRight: 8 }}>{pill.text}</span>
            )}
            {currentPrice != null && (
              <span style={{ fontSize: 12, color: "#64748b" }}>
                Current: {money2(currentPrice)}
                {unrealizedPnl != null && (
                  <span style={{ marginLeft: 6, fontWeight: 600, color: unrealizedPnl >= 0 ? "#16a34a" : "#f97316" }}>
                    ({unrealizedPnl >= 0 ? "+" : ""}{money(unrealizedPnl)})
                  </span>
                )}
              </span>
            )}
          </div>
        )}

        {t.status === "closed" && t.realizedPnl != null && (
          <div style={{ marginTop: 6, fontWeight: 700, fontSize: 14, color: t.realizedPnl >= 0 ? "#16a34a" : "#e14c4c" }}>
            {t.realizedPnl >= 0 ? "+" : ""}{money(t.realizedPnl)}
          </div>
        )}
      </div>

      {open ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ ...S.inputWrap, width: 120 }}>
            <input
              type="number"
              placeholder="exit $"
              value={exitPx}
              onChange={e => setExitPx(e.target.value)}
              style={{ ...S.input, width: 80 }}
            />
          </div>
          <button onClick={() => exitPx && onClose(t.id, exitPx)} style={S.closeBtn}>Close</button>
          <button onClick={() => onDelete(t.id)} style={S.deleteBtn}>✕</button>
        </div>
      ) : (
        <button onClick={() => onDelete(t.id)} style={{ ...S.deleteBtn, flexShrink: 0 }}>✕</button>
      )}
    </div>
  );
}

// ─── ReviewView ───────────────────────────────────────────────────────────────

function ReviewView({ open, closed, totalPnl, wins, losses, capital }) {
  const total    = wins + losses;
  const winRate  = total > 0 ? wins / total : null;
  const avgWin   = wins > 0
    ? closed.filter(t => (t.realizedPnl ?? 0) > 0).reduce((s, t) => s + t.realizedPnl, 0) / wins
    : null;
  const avgLoss  = losses > 0
    ? closed.filter(t => (t.realizedPnl ?? 0) <= 0).reduce((s, t) => s + t.realizedPnl, 0) / losses
    : null;
  const rr       = avgWin != null && avgLoss != null && avgLoss !== 0 ? avgWin / Math.abs(avgLoss) : null;

  const disciplineScore = (() => {
    if (total === 0) return null;
    let score = 50;
    if (winRate != null && winRate >= 0.5) score += 20;
    if (rr != null && rr >= 2.0) score += 20;
    if (totalPnl > 0) score += 10;
    return Math.min(100, score);
  })();

  return (
    <div style={S.section}>
      <div style={{ fontWeight: 700, fontSize: 17, color: "#0f172a", marginBottom: 20 }}>Your record</div>

      {total === 0 && (
        <div style={{ color: "#94a3b8", fontSize: 13 }}>No closed trades yet. Your stats will appear here.</div>
      )}

      {total > 0 && (
        <>
          {disciplineScore != null && (
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
                Discipline score
              </div>
              <div style={{ fontSize: 42, fontWeight: 800, color: disciplineScore >= 70 ? "#16a34a" : disciplineScore >= 50 ? "#d97706" : "#e14c4c", lineHeight: 1 }}>
                {disciplineScore}<span style={{ fontSize: 16, fontWeight: 400, color: "#94a3b8" }}>/100</span>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            {[
              ["Total P&L", money(totalPnl), totalPnl >= 0 ? "#16a34a" : "#e14c4c"],
              ["Win rate", winRate != null ? `${Math.round(winRate * 100)}%` : "—", winRate != null && winRate >= 0.5 ? "#16a34a" : "#f97316"],
              ["Wins", wins, "#16a34a"],
              ["Losses", losses, "#e14c4c"],
              ["Avg winner", avgWin != null ? money(avgWin) : "—", "#16a34a"],
              ["Avg loser", avgLoss != null ? money(avgLoss) : "—", "#e14c4c"],
              ["Risk/reward", rr != null ? `${rr.toFixed(1)}:1` : "—", rr != null && rr >= 2 ? "#16a34a" : "#f97316"],
              ["Open trades", open.length, "#0f172a"],
            ].map(([label, val, color]) => (
              <div key={label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>{label}</div>
                <div style={{ fontWeight: 700, fontSize: 18, color }}>{val}</div>
              </div>
            ))}
          </div>

          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px", fontSize: 13, color: "#475569", lineHeight: 1.6 }}>
            <b style={{ color: "#0f172a" }}>The math you need:</b> at 2:1 risk/reward, you only need to win 35% of the time to break even. At 45% wins you're profitable. Focus on not moving your stop-loss.
          </div>
        </>
      )}
    </div>
  );
}

// ─── AiAssistant ─────────────────────────────────────────────────────────────

function AiAssistant({ context }) {
  const [open, setOpen]       = useState(false);
  const [msgs, setMsgs]       = useState([]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const [available, setAvail] = useState(true);
  const bottomRef             = useRef(null);

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...msgs, { role: "user", content: text }];
    setMsgs(next);
    setInput("");
    setLoading(true);

    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: next, context }),
    }).then(r => r.json()).catch(() => ({ error: "network" }));

    if (r.available === false) { setAvail(false); setLoading(false); return; }
    setMsgs(m => [...m, { role: "assistant", content: r.reply ?? "Sorry, I couldn't process that." }]);
    setLoading(false);
  }

  if (!available) return null;

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed", bottom: 24, right: 24, width: 52, height: 52,
          borderRadius: "50%", background: "#0f172a", color: "#fff",
          border: "none", fontSize: 22, cursor: "pointer", zIndex: 100,
          boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
        }}
        aria-label="AI Coach"
      >
        💬
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 88, right: 24, width: 340, maxHeight: 480,
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16,
          boxShadow: "0 8px 32px rgba(0,0,0,0.14)", display: "flex", flexDirection: "column",
          zIndex: 100, overflow: "hidden",
        }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #f1f5f9", fontWeight: 700, fontSize: 14 }}>
            AI Coach
            <span style={{ fontSize: 11, fontWeight: 400, color: "#94a3b8", marginLeft: 8 }}>plain English only</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            {msgs.length === 0 && (
              <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.5 }}>
                Ask me anything about today's setups. I'll explain everything in plain English.
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                background: m.role === "user" ? "#0f172a" : "#f8fafc",
                color: m.role === "user" ? "#fff" : "#0f172a",
                borderRadius: 12, padding: "8px 12px", fontSize: 13, maxWidth: "85%", lineHeight: 1.5,
              }}>
                {m.content}
              </div>
            ))}
            {loading && <div style={{ fontSize: 13, color: "#94a3b8" }}>Thinking…</div>}
            <div ref={bottomRef} />
          </div>
          <div style={{ padding: "10px 12px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 8 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && send()}
              placeholder="Ask anything…"
              style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none" }}
            />
            <button onClick={send} style={{ ...S.primaryBtn, padding: "8px 14px", fontSize: 13 }}>→</button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── BacktestView ─────────────────────────────────────────────────────────────

function BacktestView({ capital }) {
  const [status,    setStatus]    = useState("idle"); // idle | loading | running | done | error
  const [progress,  setProgress]  = useState("");
  const [bars,      setBars]      = useState(null);
  const [threshold, setThreshold] = useState(60);
  const [useGates,  setUseGates]  = useState(true);
  const [result,    setResult]    = useState(null);   // { trades, equity, stats, stressResults }
  const [withoutG,  setWithoutG]  = useState(null);   // gates-off run for comparison

  async function load() {
    setStatus("loading");
    setProgress("Fetching 4 years of market data…");
    setResult(null);
    try {
      const r = await fetch("/api/backtest");
      if (!r.ok) throw new Error("API error");
      const d = await r.json();
      setBars(d.bars);
      setStatus("ready");
      setProgress("");
    } catch (e) {
      setStatus("error");
      setProgress("Could not load data. Check ALPACA_KEY_ID / ALPACA_SECRET_KEY.");
    }
  }

  function simulate(barsData) {
    setStatus("running");
    setProgress("Simulating trades…");
    setTimeout(() => {
      try {
        const r1 = runBacktest({ bars: barsData, capital, threshold, useGates: true,  maxPositions: 1 });
        const r2 = runBacktest({ bars: barsData, capital, threshold, useGates: false, maxPositions: 1 });
        const s1 = computeStats(r1.trades, r1.equity, capital);
        const s2 = computeStats(r2.trades, r2.equity, capital);
        const stressResults = STRESS_PERIODS.map(p => stressStats(r1.trades, p));
        setResult({ ...r1, stats: s1, stressResults });
        setWithoutG({ ...r2, stats: s2 });
        setStatus("done");
        setProgress("");
      } catch (e) {
        setStatus("error");
        setProgress("Simulation error: " + e.message);
      }
    }, 50); // yield to browser so loading state renders first
  }

  const $ = (n, d = 0) => n == null ? "—" : (n >= 0 ? "+" : "") + n.toLocaleString("en-US", { maximumFractionDigits: d });
  const pct = n => n == null ? "—" : (n * 100).toFixed(1) + "%";

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", padding: "24px 16px 60px" }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>Strategy Backtest</div>
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>
        4 years of real market data. Every signal the app uses, tested against what actually happened.
      </div>

      {/* Controls */}
      <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>SCORE THRESHOLD</div>
            <div style={{ display: "flex", gap: 6 }}>
              {[50, 60, 70, 80].map(t => (
                <button key={t} type="button" onClick={() => setThreshold(t)} style={{
                  padding: "6px 14px", borderRadius: 6, border: "1px solid #e2e8f0",
                  background: threshold === t ? "#0f172a" : "#fff",
                  color: threshold === t ? "#fff" : "#334155",
                  fontWeight: 700, fontSize: 13, cursor: "pointer",
                }}>{t}+</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>MORNING GATES</div>
            <button type="button" onClick={() => setUseGates(g => !g)} style={{
              padding: "6px 14px", borderRadius: 6, border: "1px solid #e2e8f0",
              background: useGates ? "#0f172a" : "#fff",
              color: useGates ? "#fff" : "#334155",
              fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}>{useGates ? "✅ ON" : "⬜ OFF"}</button>
          </div>
          <div style={{ marginLeft: "auto" }}>
            {status === "idle" && (
              <button type="button" onClick={load} style={btnPrimary}>Load Data</button>
            )}
            {status === "ready" && (
              <button type="button" onClick={() => simulate(bars)} style={btnPrimary}>▶ Run Backtest</button>
            )}
            {(status === "loading" || status === "running") && (
              <button type="button" disabled style={{ ...btnPrimary, opacity: 0.5 }}>…</button>
            )}
            {status === "done" && (
              <button type="button" onClick={() => simulate(bars)} style={{ ...btnPrimary, background: "#334155" }}>↻ Re-run</button>
            )}
          </div>
        </div>
        {progress && (
          <div style={{ marginTop: 12, fontSize: 13, color: "#64748b" }}>{progress}</div>
        )}
        {status === "error" && (
          <div style={{ marginTop: 12, fontSize: 13, color: "#dc2626" }}>{progress}</div>
        )}
      </div>

      {result && result.stats && (
        <>
          {/* Summary stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
            {[
              { label: "Total Trades",   value: result.stats.total,                             note: null },
              { label: "Win Rate",       value: pct(result.stats.winRate),                      note: `Without gates: ${pct(withoutG?.stats?.winRate)}` },
              { label: "Avg Win",        value: "$" + result.stats.avgWin.toFixed(0),            note: null },
              { label: "Avg Loss",       value: "$" + result.stats.avgLoss.toFixed(0),           note: null },
              { label: "EV / Trade",     value: $(result.stats.ev, 0),                           note: result.stats.ev > 0 ? "Positive edge ✅" : "Negative edge ❌" },
              { label: "Annual Return",  value: pct(result.stats.annualReturn),                  note: `Total P&L: ${$(result.stats.totalPnl, 0)}` },
              { label: "Max Drawdown",   value: pct(result.maxDrawdown),                         note: "Worst losing streak" },
              { label: "Final Capital",  value: "$" + result.finalCapital.toLocaleString("en-US", { maximumFractionDigits: 0 }), note: `Started at $${capital.toLocaleString()}` },
              { label: "Gates Saved",    value: pct((withoutG?.stats?.winRate ?? 0) - result.stats.winRate), note: "Negative = gates help ✅" },
            ].map(({ label, value, note }) => (
              <div key={label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: 1 }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginTop: 2 }}>{value}</div>
                {note && <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{note}</div>}
              </div>
            ))}
          </div>

          {/* Equity curve */}
          <EquityCurve equity={result.equity} initial={capital} stressPeriods={STRESS_PERIODS} />

          {/* Score band breakdown */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: 1, marginBottom: 10 }}>SCORE BANDS — does a higher score actually win more?</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                  {["Score", "Trades", "Wins", "Win Rate", "Total P&L", "Verdict"].map(h => (
                    <th key={h} style={{ padding: "6px 12px", textAlign: h === "Score" ? "left" : "right", color: "#64748b", fontWeight: 700, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.stats.byBand.map(b => (
                  <tr key={b.label} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 700 }}>{b.label}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: "#64748b" }}>{b.trades}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: "#64748b" }}>{b.wins}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700,
                      color: b.winRate >= 0.60 ? "#16a34a" : b.winRate >= 0.50 ? "#d97706" : "#dc2626" }}>
                      {b.trades ? pct(b.winRate) : "—"}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right",
                      color: b.pnl >= 0 ? "#16a34a" : "#dc2626" }}>
                      {b.trades ? $(b.pnl, 0) : "—"}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>
                      {!b.trades ? "—"
                        : b.winRate >= 0.60 ? "✅ Take it"
                        : b.winRate >= 0.50 ? "⚠️ Marginal"
                        : "❌ Skip"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Year by year */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: 1, marginBottom: 10 }}>YEAR BY YEAR — how did each year perform?</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                  {["Year", "Trades", "Win Rate", "P&L", ""].map(h => (
                    <th key={h} style={{ padding: "6px 12px", textAlign: h === "Year" ? "left" : "right", color: "#64748b", fontWeight: 700, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.stats.byYear.map(y => (
                  <tr key={y.year} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 700 }}>{y.year}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: "#64748b" }}>{y.trades}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700,
                      color: y.winRate >= 0.55 ? "#16a34a" : y.winRate >= 0.45 ? "#d97706" : "#dc2626" }}>
                      {pct(y.winRate)}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700,
                      color: y.pnl >= 0 ? "#16a34a" : "#dc2626" }}>
                      {$(y.pnl, 0)}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>
                      {y.pnl >= 0 ? "✅" : "❌"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Stress tests */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: 1, marginBottom: 10 }}>STRESS TESTS — what happened during the worst market periods?</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {result.stressResults.map(s => (
                <div key={s.label} style={{
                  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10,
                  padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>{s.label}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>{s.desc}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {s.trades === 0 ? (
                      <div style={{ fontSize: 13, color: "#16a34a", fontWeight: 700 }}>Gates kept you out ✅</div>
                    ) : (
                      <>
                        <div style={{ fontSize: 16, fontWeight: 800, color: s.pnl >= 0 ? "#16a34a" : "#dc2626" }}>{$(s.pnl, 0)}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{s.trades} trades · {pct(s.winRate)} win rate</div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Last 20 trades */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: 1, marginBottom: 10 }}>LAST 20 TRADES</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                  {["Symbol","Entry","Exit","Score","Shares","P&L","Outcome"].map(h => (
                    <th key={h} style={{ padding: "6px 8px", textAlign: "left", color: "#64748b", fontWeight: 700, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...result.trades].slice(-20).reverse().map((t, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px", fontWeight: 700 }}>{t.sym}</td>
                    <td style={{ padding: "8px", color: "#64748b" }}>{t.entryDate}</td>
                    <td style={{ padding: "8px", color: "#64748b" }}>{t.exitDate}</td>
                    <td style={{ padding: "8px" }}>{t.score}</td>
                    <td style={{ padding: "8px", color: "#64748b" }}>{t.shares}</td>
                    <td style={{ padding: "8px", fontWeight: 700, color: t.pnl >= 0 ? "#16a34a" : "#dc2626" }}>
                      {$(t.pnl, 0)}
                    </td>
                    <td style={{ padding: "8px" }}>
                      {t.outcome === "win" ? "✅ Win" : t.outcome === "loss" ? "❌ Loss" : "⏱ Timeout"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const btnPrimary = {
  background: "#0f172a", color: "#fff", border: "none", borderRadius: 8,
  padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer",
};

// ─── Equity Curve SVG ─────────────────────────────────────────────────────────

function EquityCurve({ equity, initial, stressPeriods }) {
  if (!equity?.length) return null;

  const W = 740, H = 200, PAD = { t: 16, r: 16, b: 32, l: 64 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;

  const values = equity.map(e => e.value);
  const minV   = Math.min(...values);
  const maxV   = Math.max(...values);
  const range  = maxV - minV || 1;

  const xScale = i  => PAD.l + (i / (equity.length - 1)) * plotW;
  const yScale = v  => PAD.t + plotH - ((v - minV) / range) * plotH;

  const points = equity.map((e, i) => `${xScale(i)},${yScale(e.value)}`).join(" ");

  const finalValue = values[values.length - 1];
  const lineColor  = finalValue >= initial ? "#16a34a" : "#dc2626";

  // Map stress period dates to x positions
  const firstDate = equity[0].date;
  const lastDate  = equity[equity.length - 1].date;
  const dateToX   = (d) => {
    const t  = (new Date(d) - new Date(firstDate)) / (new Date(lastDate) - new Date(firstDate));
    return PAD.l + t * plotW;
  };

  // Y axis labels
  const yLabels = [minV, (minV + maxV) / 2, maxV].map(v => ({
    y: yScale(v),
    label: "$" + (v / 1000).toFixed(0) + "k",
  }));

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: 1, marginBottom: 10 }}>
        EQUITY CURVE — account value over time (red shading = stress periods)
      </div>
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
          {/* Stress period shading */}
          {stressPeriods.map(p => {
            const x1 = Math.max(PAD.l, dateToX(p.start));
            const x2 = Math.min(PAD.l + plotW, dateToX(p.end));
            if (x2 <= x1) return null;
            return (
              <rect key={p.label} x={x1} y={PAD.t} width={x2 - x1} height={plotH}
                fill="#fef2f2" opacity={0.7} />
            );
          })}

          {/* Grid lines */}
          {yLabels.map(({ y, label }) => (
            <g key={label}>
              <line x1={PAD.l} y1={y} x2={PAD.l + plotW} y2={y} stroke="#f1f5f9" strokeWidth={1} />
              <text x={PAD.l - 6} y={y + 4} textAnchor="end" fontSize={10} fill="#94a3b8">{label}</text>
            </g>
          ))}

          {/* Initial capital line */}
          <line x1={PAD.l} y1={yScale(initial)} x2={PAD.l + plotW} y2={yScale(initial)}
            stroke="#cbd5e1" strokeWidth={1} strokeDasharray="4,4" />

          {/* Equity line */}
          <polyline points={points} fill="none" stroke={lineColor} strokeWidth={2} />

          {/* Final value dot */}
          <circle cx={xScale(equity.length - 1)} cy={yScale(finalValue)} r={4} fill={lineColor} />
        </svg>
      </div>
    </div>
  );
}
