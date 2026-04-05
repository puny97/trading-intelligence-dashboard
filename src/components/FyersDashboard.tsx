"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { WATCHLIST_200 } from "@/lib/watchList";
import StockChart from "./StockChart";

interface Quote {
  symbol: string;
  name: string;
  ltp: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  change: number;
  pChange: number;
  volume: number;
  exchange: string;
  volRatio?: number;
}

interface Gapper extends Quote {
  gapPct: number; // (open - prevClose) / prevClose * 100
  gapAbs: number; // open - prevClose
  gapType: "strong-up" | "strong-down" | "mild-up" | "mild-down";
}

type Tab = "gainers" | "losers" | "buzzers" | "gappers" | "watchlist";
type GapFilter = "all" | "up" | "down";

const INTERVAL = 15;

// IST helpers
function nowIST(): Date {
  const now = new Date();
  return new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
}
function istHHMM(d: Date): number {
  return d.getUTCHours() * 100 + d.getUTCMinutes();
}
function isPremarket(): boolean {
  const t = istHHMM(nowIST());
  return t >= 900 && t < 915; // 9:00–9:15 AM IST
}
function isMarketOpen(): boolean {
  const t = istHHMM(nowIST());
  return t >= 915 && t <= 1530; // 9:15 AM – 3:30 PM IST
}
function marketStatus(): { label: string; cls: string } {
  const t = istHHMM(nowIST());
  if (t >= 900 && t < 915)
    return { label: "⏳ PRE-MARKET", cls: "premarket-badge" };
  if (t >= 915 && t <= 1530)
    return {
      label: "🟢 MARKET OPEN",
      cls: "premarket-badge market-open-badge",
    };
  return { label: "🔴 MARKET CLOSED", cls: "premarket-badge" };
}

function enrichVolRatio(stocks: Quote[]): Quote[] {
  const avg = stocks.reduce((s, q) => s + q.volume, 0) / (stocks.length || 1);
  return stocks.map((q) => ({ ...q, volRatio: avg > 0 ? q.volume / avg : 0 }));
}

function computeGappers(stocks: Quote[], threshold: number): Gapper[] {
  return stocks
    .filter((q) => q.prevClose > 0 && q.open > 0)
    .map((q) => {
      const gapPct = ((q.open - q.prevClose) / q.prevClose) * 100;
      const gapAbs = q.open - q.prevClose;
      const absGap = Math.abs(gapPct);
      const gapType: Gapper["gapType"] =
        gapPct >= threshold
          ? "strong-up"
          : gapPct <= -threshold
            ? "strong-down"
            : gapPct > 0
              ? "mild-up"
              : "mild-down";
      return { ...q, gapPct, gapAbs, gapType };
    })
    .filter((g) => Math.abs(g.gapPct) >= threshold)
    .sort((a, b) => Math.abs(b.gapPct) - Math.abs(a.gapPct));
}

function fmtPrice(n: number) {
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function fmtVol(n: number) {
  if (n >= 1e7) return (n / 1e7).toFixed(1) + "Cr";
  if (n >= 1e5) return (n / 1e5).toFixed(1) + "L";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toString();
}

export default function FyersDashboard() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [watchlist, setWatchlist] = useState<string[]>(WATCHLIST_200);
  const [activeTab, setActiveTab] = useState<Tab>("gainers");
  const [chartSymbol, setChartSymbol] = useState<string | null>(null);
  const [chartRes, setChartRes] = useState("5");
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState("--:--:--");
  const [countdown, setCountdown] = useState(INTERVAL);
  const [addInput, setAddInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [gapThreshold, setGapThreshold] = useState(1.0); // % minimum gap
  const [gapFilter, setGapFilter] = useState<GapFilter>("all");

  const inFlight = useRef(false);
  const countRef = useRef(INTERVAL);
  const prevQuotes = useRef<Map<string, Quote>>(new Map());

  // ── Check auth ───────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((j) => setAuthenticated(j.authenticated));
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "ok") window.history.replaceState({}, "", "/");
  }, []);

  // ── Load watchlist ───────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem("fyers_watchlist");
      if (saved) setWatchlist(JSON.parse(saved));
    } catch {}
  }, []);

  const saveWatchlist = (list: string[]) => {
    setWatchlist(list);
    try {
      localStorage.setItem("fyers_watchlist", JSON.stringify(list));
    } catch {}
  };

  // ── Fetch quotes ─────────────────────────────────────────────────────────
  const fetchQuotes = useCallback(async () => {
    if (inFlight.current || !watchlist.length) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/fyers/quotes?symbols=${encodeURIComponent(watchlist.join(","))}`,
      );
      const json = await res.json();
      if (res.status === 401 || json.authenticated === false) {
        setAuthenticated(false);
        return;
      }
      if (json.error) {
        setError(json.error);
        return;
      }
      const enriched = enrichVolRatio(json.stocks || []);
      prevQuotes.current = new Map(quotes.map((q) => [q.symbol, q]));
      setQuotes(enriched);
      const ist = nowIST();
      setLastUpdate(ist.toUTCString().slice(17, 25) + " IST");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [watchlist, quotes]);

  // ── Auto-refresh ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authenticated) return;
    fetchQuotes();
    countRef.current = INTERVAL;
    setCountdown(INTERVAL);
    const id = setInterval(() => {
      countRef.current -= 1;
      if (countRef.current <= 0) {
        countRef.current = INTERVAL;
        fetchQuotes();
      }
      setCountdown(countRef.current);
    }, 1000);
    return () => clearInterval(id);
  }, [authenticated, watchlist]);

  // ── Derived lists ────────────────────────────────────────────────────────
  const gainers = [...quotes]
    .filter((q) => q.pChange > 0)
    .sort((a, b) => b.pChange - a.pChange)
    .slice(0, 20);
  const losers = [...quotes]
    .filter((q) => q.pChange < 0)
    .sort((a, b) => a.pChange - b.pChange)
    .slice(0, 20);
  const buzzers = [...quotes]
    .sort((a, b) => (b.volRatio ?? 0) - (a.volRatio ?? 0))
    .slice(0, 20);

  const allGappers = computeGappers(quotes, gapThreshold);
  const gappers =
    gapFilter === "up"
      ? allGappers.filter((g) => g.gapPct > 0)
      : gapFilter === "down"
        ? allGappers.filter((g) => g.gapPct < 0)
        : allGappers;
  const gapUp = allGappers.filter((g) => g.gapPct > 0);
  const gapDown = allGappers.filter((g) => g.gapPct < 0);
  const avgGapUp = gapUp.length
    ? gapUp.reduce((s, g) => s + g.gapPct, 0) / gapUp.length
    : 0;
  const avgGapDown = gapDown.length
    ? gapDown.reduce((s, g) => s + g.gapPct, 0) / gapDown.length
    : 0;

  // ── Watchlist management ─────────────────────────────────────────────────
  const addSymbol = () => {
    let sym = addInput.trim().toUpperCase();
    if (!sym) return;
    if (!sym.startsWith("NSE:") && !sym.startsWith("BSE:"))
      sym = `NSE:${sym}-EQ`;
    if (!watchlist.includes(sym) && watchlist.length < 200)
      saveWatchlist([...watchlist, sym]);
    setAddInput("");
  };
  const removeSymbol = (sym: string) =>
    saveWatchlist(watchlist.filter((s) => s !== sym));
  const resetWatchlist = () => saveWatchlist(WATCHLIST_200);

  if (authenticated === false) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h2>⚡ Connect Fyers Account</h2>
          <p>
            Login with your Fyers account to get real-time data for your
            200-stock watchlist.
          </p>
          <a href="/api/auth/login" className="auth-btn">
            🔐 Login with Fyers
          </a>
          <div className="auth-note">
            <strong>Setup required:</strong> Create an app at{" "}
            <code>myapi.fyers.in</code> and add these to <code>.env.local</code>
            :
            <pre>{`FYERS_APP_ID=your_app_id\nFYERS_SECRET_KEY=your_secret_key\nFYERS_REDIRECT_URL=http://localhost:3000/api/auth/callback`}</pre>
          </div>
        </div>
      </div>
    );
  }

  if (authenticated === null) {
    return (
      <div className="loading-state" style={{ margin: "40px auto" }}>
        <div className="spinner" /> Checking auth…
      </div>
    );
  }

  const mStatus = marketStatus();

  return (
    <div className="fyers-dashboard">
      {/* ── Header ── */}
      <div className="fyers-header">
        <div className="fyers-title">
          <span className="fyers-logo">📡</span>
          <div>
            <div className="fyers-heading">FYERS LIVE FEED</div>
            <div className="fyers-sub">
              {watchlist.length} symbols · every {INTERVAL}s
            </div>
          </div>
        </div>
        <div className="fyers-controls">
          <span className={mStatus.cls}>{mStatus.label}</span>
          {error && <span className="fyers-error">⚠ {error}</span>}
          <div className="countdown-wrap">
            <svg viewBox="0 0 32 32" className="countdown-ring">
              <circle cx="16" cy="16" r="13" className="ring-track" />
              <circle
                cx="16"
                cy="16"
                r="13"
                className="ring-fill"
                style={{
                  strokeDasharray: `${2 * Math.PI * 13}`,
                  strokeDashoffset: `${2 * Math.PI * 13 * (1 - countdown / INTERVAL)}`,
                }}
              />
            </svg>
            <span className="countdown-num">{countdown}</span>
          </div>
          <span className="fyers-scan">Last: {lastUpdate}</span>
          <button
            className="refresh-btn"
            onClick={() => {
              fetchQuotes();
              countRef.current = INTERVAL;
              setCountdown(INTERVAL);
            }}
            disabled={loading}
          >
            {loading ? "⟳ FETCHING..." : "⟳ REFRESH"}
          </button>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="fyers-stats">
        <div className="fstat">
          <div className="fstat-label">Total</div>
          <div className="fstat-val">{quotes.length}</div>
        </div>
        <div className="fstat">
          <div className="fstat-label">Gainers</div>
          <div className="fstat-val green">{gainers.length}</div>
        </div>
        <div className="fstat">
          <div className="fstat-label">Losers</div>
          <div className="fstat-val red">{losers.length}</div>
        </div>
        <div className="fstat">
          <div className="fstat-label">Buzzers</div>
          <div className="fstat-val yellow">
            {buzzers.filter((b) => (b.volRatio ?? 0) > 1.5).length}
          </div>
        </div>
        <div className="fstat">
          <div className="fstat-label">Gap ↑</div>
          <div className="fstat-val green">{gapUp.length}</div>
        </div>
        <div className="fstat">
          <div className="fstat-label">Gap ↓</div>
          <div className="fstat-val red">{gapDown.length}</div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="fyers-tabs">
        {(
          ["gainers", "losers", "buzzers", "gappers", "watchlist"] as Tab[]
        ).map((t) => (
          <button
            key={t}
            className={`fyers-tab ${activeTab === t ? "active" : ""}`}
            onClick={() => setActiveTab(t)}
          >
            {t === "gainers"
              ? "📈 GAINERS"
              : t === "losers"
                ? "📉 LOSERS"
                : t === "buzzers"
                  ? "🔊 BUZZERS"
                  : t === "gappers"
                    ? "🌅 GAPPERS"
                    : "⭐ WATCHLIST"}
            {t !== "watchlist" && (
              <span className="tab-count">
                {t === "gainers"
                  ? gainers.length
                  : t === "losers"
                    ? losers.length
                    : t === "buzzers"
                      ? buzzers.length
                      : allGappers.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Chart modal ── */}
      {chartSymbol && (
        <div
          className="chart-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setChartSymbol(null);
          }}
        >
          <div className="chart-modal">
            <div className="chart-modal-header">
              <span>{chartSymbol}</span>
              <div className="chart-res-btns">
                {["1", "3", "5", "15", "30", "60", "D"].map((r) => (
                  <button
                    key={r}
                    className={`res-btn ${chartRes === r ? "active" : ""}`}
                    onClick={() => setChartRes(r)}
                  >
                    {r}
                    {r === "D" ? "" : "M"}
                  </button>
                ))}
              </div>
              <button
                className="chart-close"
                onClick={() => setChartSymbol(null)}
              >
                ✕
              </button>
            </div>
            <StockChart symbol={chartSymbol} resolution={chartRes} />
          </div>
        </div>
      )}

      {/* ── GAPPERS TAB ── */}
      {activeTab === "gappers" && (
        <div className="fyers-panel">
          {/* Meta info */}
          <div className="gapper-meta">
            <span>
              📊 Gap = <b>Today Open</b> vs <b>Yesterday Close</b>
            </span>
            <span>
              ↑ Avg gap up:{" "}
              <b style={{ color: "var(--green)" }}>
                {avgGapUp > 0 ? "+" : ""}
                {avgGapUp.toFixed(2)}%
              </b>
            </span>
            <span>
              ↓ Avg gap down:{" "}
              <b style={{ color: "var(--red)" }}>{avgGapDown.toFixed(2)}%</b>
            </span>
            <span className="gapper-time-note">
              Updates every {INTERVAL}s · Best used 9:00–9:30 AM IST
            </span>
          </div>

          {/* Filters */}
          <div className="gap-filter-row">
            <span
              style={{
                fontSize: 9,
                letterSpacing: "1px",
                color: "var(--muted)",
                textTransform: "uppercase",
              }}
            >
              Direction:
            </span>
            {(["all", "up", "down"] as GapFilter[]).map((f) => (
              <button
                key={f}
                className={`gap-filter-btn ${gapFilter === f ? "active" : ""}`}
                onClick={() => setGapFilter(f)}
              >
                {f === "all" ? "All" : f === "up" ? "↑ Gap Up" : "↓ Gap Down"}
              </button>
            ))}
            <div className="gap-threshold">
              <span>Min gap:</span>
              <input
                type="number"
                min="0.1"
                max="20"
                step="0.1"
                value={gapThreshold}
                onChange={(e) =>
                  setGapThreshold(
                    Math.max(0.1, parseFloat(e.target.value) || 1),
                  )
                }
              />
              <span>%</span>
            </div>
          </div>

          {/* Table header */}
          <div className="gapper-header">
            <span>#</span>
            <span>SYMBOL</span>
            <span>OPEN</span>
            <span>PREV CLOSE</span>
            <span>GAP %</span>
            <span>GAP ₹</span>
            <span>TYPE</span>
          </div>

          {/* Rows */}
          {quotes.length === 0 && !loading && (
            <div className="no-gappers">No data yet — refreshing…</div>
          )}
          {quotes.length > 0 && gappers.length === 0 && (
            <div className="no-gappers">
              No stocks gapping ≥{gapThreshold}% today
              <br />
              <span style={{ fontSize: 10 }}>
                Try lowering the minimum gap threshold, or check after 9:00 AM
                IST
              </span>
            </div>
          )}
          {gappers.map((g, i) => {
            const isUp = g.gapPct >= 0;
            return (
              <div
                key={g.symbol}
                className="gapper-row"
                onClick={() => {
                  setChartSymbol(g.symbol);
                  setChartRes("5");
                }}
              >
                <span className="col-rank">{i + 1}</span>
                <div>
                  <div className="col-symbol">
                    {g.symbol.replace("NSE:", "").replace("-EQ", "")}
                  </div>
                  <div className="col-name">{g.name.substring(0, 20)}</div>
                </div>
                <div
                  style={{ fontFamily: "'Space Mono',monospace", fontSize: 13 }}
                >
                  ₹{fmtPrice(g.open)}
                </div>
                <div
                  style={{
                    fontFamily: "'Space Mono',monospace",
                    fontSize: 12,
                    color: "var(--muted)",
                  }}
                >
                  ₹{fmtPrice(g.prevClose)}
                </div>
                <div>
                  <span className={`gap-badge ${isUp ? "up" : "down"}`}>
                    {isUp ? "▲" : "▼"} {isUp ? "+" : ""}
                    {g.gapPct.toFixed(2)}%
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: "'Space Mono',monospace",
                    fontSize: 12,
                    color: isUp ? "var(--green)" : "var(--red)",
                  }}
                >
                  {isUp ? "+" : ""}₹{fmtPrice(g.gapAbs)}
                </div>
                <div>
                  <span
                    className={`gap-tag ${g.gapType === "strong-up" ? "strong-up" : g.gapType === "strong-down" ? "strong-down" : "mild"}`}
                  >
                    {g.gapType === "strong-up"
                      ? "STRONG ↑"
                      : g.gapType === "strong-down"
                        ? "STRONG ↓"
                        : g.gapType === "mild-up"
                          ? "MILD ↑"
                          : "MILD ↓"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── GAINERS / LOSERS / BUZZERS ── */}
      {(activeTab === "gainers" ||
        activeTab === "losers" ||
        activeTab === "buzzers") && (
        <div className="fyers-panel">
          <div className="ftable-header">
            <span>#</span>
            <span>SYMBOL</span>
            <span>PRICE</span>
            <span>CHG%</span>
            <span>VOLUME</span>
            {activeTab === "buzzers" && <span>VOL×</span>}
          </div>
          {quotes.length === 0 && !loading && (
            <div className="no-data">No data yet — refreshing…</div>
          )}
          {(activeTab === "gainers"
            ? gainers
            : activeTab === "losers"
              ? losers
              : buzzers
          ).map((q, i) => {
            const isUp = q.pChange >= 0;
            const prev = prevQuotes.current.get(q.symbol);
            const priceFlash =
              prev && q.ltp !== prev.ltp
                ? q.ltp > prev.ltp
                  ? "flash-up"
                  : "flash-down"
                : "";
            return (
              <div
                key={q.symbol}
                className={`fstock-row ${priceFlash}`}
                onClick={() => setChartSymbol(q.symbol)}
              >
                <span className="col-rank">{i + 1}</span>
                <div>
                  <div className="col-symbol">
                    {q.symbol.replace("NSE:", "").replace("-EQ", "")}
                  </div>
                  <div className="col-name">{q.name.substring(0, 20)}</div>
                </div>
                <div
                  className="col-price"
                  style={{ color: isUp ? "var(--green)" : "var(--red)" }}
                >
                  ₹{fmtPrice(q.ltp)}
                </div>
                <div
                  className="col-change"
                  style={{
                    color: isUp ? "var(--green)" : "var(--red)",
                    background: isUp
                      ? "rgba(0,230,118,0.08)"
                      : "rgba(255,23,68,0.08)",
                  }}
                >
                  {isUp ? "+" : ""}
                  {q.pChange.toFixed(2)}%
                </div>
                <div className="col-vol">{fmtVol(q.volume)}</div>
                {activeTab === "buzzers" && (
                  <div
                    className="col-vol"
                    style={{
                      color:
                        (q.volRatio ?? 0) > 2 ? "var(--accent)" : "inherit",
                    }}
                  >
                    {(q.volRatio ?? 0).toFixed(1)}×
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── WATCHLIST ── */}
      {activeTab === "watchlist" && (
        <div className="watchlist-manager">
          <div className="wl-add-row">
            <input
              className="wl-input"
              placeholder="Add symbol e.g. SBIN or NSE:SBIN-EQ"
              value={addInput}
              onChange={(e) => setAddInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSymbol()}
            />
            <button className="wl-add-btn" onClick={addSymbol}>
              + ADD
            </button>
            <button className="wl-reset-btn" onClick={resetWatchlist}>
              ↺ RESET TO DEFAULT
            </button>
          </div>
          <div className="wl-count">{watchlist.length} / 200 symbols</div>
          <div className="wl-grid">
            {watchlist.map((sym) => {
              const q = quotes.find((x) => x.symbol === sym);
              const isUp = (q?.pChange ?? 0) >= 0;
              return (
                <div key={sym} className="wl-chip">
                  <div
                    onClick={() => setChartSymbol(sym)}
                    style={{ cursor: "pointer" }}
                  >
                    <div className="wl-sym">
                      {sym.replace("NSE:", "").replace("-EQ", "")}
                    </div>
                    {q && (
                      <div
                        className="wl-ltp"
                        style={{ color: isUp ? "var(--green)" : "var(--red)" }}
                      >
                        ₹{fmtPrice(q.ltp)}{" "}
                        <span style={{ fontSize: 9 }}>
                          {isUp ? "+" : ""}
                          {q.pChange.toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    className="wl-remove"
                    onClick={() => removeSymbol(sym)}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
