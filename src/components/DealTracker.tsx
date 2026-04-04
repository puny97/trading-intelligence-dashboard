"use client";
import { useState, useEffect, useCallback } from "react";
import StockChart from "./StockChart";

// ── Types ─────────────────────────────────────────────────────────────────
interface TrackedDeal {
  id: number;
  symbol: string;
  name: string;
  client_name: string;
  deal_type: "BUY" | "SELL";
  deal_kind: "bulk" | "block";
  quantity: number;
  trade_price: number;
  value_cr: number;
  deal_date: string;
  saved_at: string;
}
interface SymbolSummary {
  symbol: string;
  name: string;
  total_deals: number;
  total_buy_qty: number;
  total_sell_qty: number;
  total_buy_cr: number;
  total_sell_cr: number;
  first_seen: string;
  last_seen: string;
}
interface AutoSymbol {
  symbol: string;
  name: string;
  added_at: string;
  last_synced: string | null;
  deal_count: number;
  last_deal_date: string | null;
}
interface ClientProfile {
  client_name: string;
  symbol_count: number;
  total_deals: number;
  total_buy_qty: number;
  total_sell_qty: number;
  total_buy_cr: number;
  total_sell_cr: number;
  symbols: string;
  first_seen: string;
  last_seen: string;
}

// ── Client position analysis ──────────────────────────────────────────────
interface ClientAnalysis {
  client: string;
  buyQty: number;
  sellQty: number;
  netQty: number;
  buyCr: number;
  sellCr: number;
  netCr: number;
  dates: string[];
  lastAction: "BUY" | "SELL";
  status:
    | "DAY_TRADER"
    | "ACCUMULATING"
    | "DISTRIBUTING"
    | "OVERNIGHT_LONG"
    | "OVERNIGHT_SHORT";
  isNew: boolean; // first ever appearance in this stock
  appearances: number; // how many days seen
}

function analyzeClients(deals: TrackedDeal[]): ClientAnalysis[] {
  const map = new Map<
    string,
    {
      byDate: Map<
        string,
        { buyQty: number; sellQty: number; buyCr: number; sellCr: number }
      >;
      allDates: Set<string>;
      lastAction: "BUY" | "SELL";
      lastDate: string;
      totalBuyQty: number;
      totalSellQty: number;
      totalBuyCr: number;
      totalSellCr: number;
    }
  >();

  // Build per-client per-date aggregates
  for (const d of deals) {
    if (d.client_name === "—") continue;
    if (!map.has(d.client_name)) {
      map.set(d.client_name, {
        byDate: new Map(),
        allDates: new Set(),
        lastAction: d.deal_type,
        lastDate: d.deal_date,
        totalBuyQty: 0,
        totalSellQty: 0,
        totalBuyCr: 0,
        totalSellCr: 0,
      });
    }
    const c = map.get(d.client_name)!;
    c.allDates.add(d.deal_date);
    if (d.deal_date > c.lastDate) {
      c.lastDate = d.deal_date;
      c.lastAction = d.deal_type;
    } else if (d.deal_date === c.lastDate && d.deal_type === "SELL")
      c.lastAction = "SELL";

    if (!c.byDate.has(d.deal_date))
      c.byDate.set(d.deal_date, { buyQty: 0, sellQty: 0, buyCr: 0, sellCr: 0 });
    const dd = c.byDate.get(d.deal_date)!;
    if (d.deal_type === "BUY") {
      dd.buyQty += Number(d.quantity);
      dd.buyCr += Number(d.value_cr);
      c.totalBuyQty += Number(d.quantity);
      c.totalBuyCr += Number(d.value_cr);
    } else {
      dd.sellQty += Number(d.quantity);
      dd.sellCr += Number(d.value_cr);
      c.totalSellQty += Number(d.quantity);
      c.totalSellCr += Number(d.value_cr);
    }
  }

  const allDealDates = [...new Set(deals.map((d) => d.deal_date))].sort();
  const firstEverDate = allDealDates[0];

  const result: ClientAnalysis[] = [];
  for (const [client, c] of map.entries()) {
    const netQty = c.totalBuyQty - c.totalSellQty;
    const netCr = c.totalBuyCr - c.totalSellCr;
    const dates = [...c.allDates].sort();
    const appearances = c.allDates.size;

    // Day trader check: on every day they appear, did they buy ≈ sell?
    let isDayTrader = true;
    for (const [, dd] of c.byDate.entries()) {
      const dayNet = dd.buyQty - dd.sellQty;
      const tolerance = Math.max(dd.buyQty, dd.sellQty) * 0.05; // 5% tolerance
      if (Math.abs(dayNet) > tolerance && (dd.buyQty > 0 || dd.sellQty > 0)) {
        isDayTrader = false;
        break;
      }
    }
    // If only sell side, not a day trader
    if (c.totalBuyQty === 0 || c.totalSellQty === 0) isDayTrader = false;

    let status: ClientAnalysis["status"];
    if (isDayTrader) {
      status = "DAY_TRADER";
    } else if (netQty > 0 && c.lastAction === "BUY") {
      status = "OVERNIGHT_LONG"; // net buyer, last action was buy = holding
    } else if (netQty > 0 && c.lastAction === "SELL") {
      status = "DISTRIBUTING"; // was accumulating, now selling
    } else if (netQty < 0 && c.lastAction === "SELL") {
      status = "OVERNIGHT_SHORT"; // net seller
    } else if (netQty < 0 && c.lastAction === "BUY") {
      status = "ACCUMULATING"; // was short, now covering/buying
    } else {
      status = netCr >= 0 ? "ACCUMULATING" : "DISTRIBUTING";
    }

    // "New" = only appears on the most recent date across all deals
    const isNew =
      dates.length === 1 && dates[0] === allDealDates[allDealDates.length - 1];

    result.push({
      client,
      buyQty: c.totalBuyQty,
      sellQty: c.totalSellQty,
      netQty,
      buyCr: c.totalBuyCr,
      sellCr: c.totalSellCr,
      netCr,
      dates,
      lastAction: c.lastAction,
      status,
      isNew,
      appearances,
    });
  }

  // Sort: new entries first, then by abs value
  return result.sort((a, b) => {
    if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
    return Math.abs(b.netCr) - Math.abs(a.netCr);
  });
}

// ── Formatters ────────────────────────────────────────────────────────────
function fmtQty(n: number) {
  const num = Number(n);
  if (num >= 1e7) return (num / 1e7).toFixed(2) + "Cr";
  if (num >= 1e5) return (num / 1e5).toFixed(2) + "L";
  if (num >= 1e3) return (num / 1e3).toFixed(1) + "K";
  return num.toLocaleString("en-IN");
}
function fmtCr(n: number) {
  const num = Number(n);
  if (Math.abs(num) >= 1000) return "₹" + (num / 1000).toFixed(1) + "K Cr";
  if (Math.abs(num) >= 1) return "₹" + num.toFixed(2) + " Cr";
  return "₹" + (num * 100).toFixed(1) + " L";
}
function fmtPrice(n: number) {
  return Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const STATUS_CONFIG = {
  DAY_TRADER: {
    icon: "🔄",
    label: "Day Trader",
    color: "var(--muted)",
    desc: "Buys & sells same day. Broker/arbitrageur. No overnight position.",
  },
  ACCUMULATING: {
    icon: "📈",
    label: "Accumulating",
    color: "var(--green)",
    desc: "Net buyer over tracked period. Building a position.",
  },
  DISTRIBUTING: {
    icon: "📉",
    label: "Distributing",
    color: "var(--red)",
    desc: "Net seller. Reducing or exiting position.",
  },
  OVERNIGHT_LONG: {
    icon: "🌙",
    label: "Overnight Long",
    color: "#ffc800",
    desc: "Last action was BUY with net positive qty. Holding overnight.",
  },
  OVERNIGHT_SHORT: {
    icon: "⚡",
    label: "Overnight Short",
    color: "var(--red)",
    desc: "Net seller. Carried short position.",
  },
};

type MainTab = "intelligence" | "clients" | "autotrack";

export default function DealTracker() {
  const [mainTab, setMainTab] = useState<MainTab>("intelligence");
  const [symbols, setSymbols] = useState<SymbolSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [deals, setDeals] = useState<TrackedDeal[]>([]);
  const [autoSymbols, setAutoSymbols] = useState<AutoSymbol[]>([]);
  const [clientProfiles, setClientProfiles] = useState<ClientProfile[]>([]);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [clientDeals, setClientDeals] = useState<TrackedDeal[]>([]);
  const [loading, setLoading] = useState(false);
  const [symLoading, setSymLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chartSymbol, setChartSymbol] = useState<string | null>(null);
  const [chartRes, setChartRes] = useState("D");
  const [symSearch, setSymSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<
    | "all"
    | "DAY_TRADER"
    | "ACCUMULATING"
    | "DISTRIBUTING"
    | "OVERNIGHT_LONG"
    | "OVERNIGHT_SHORT"
  >("all");
  const [deleteModal, setDeleteModal] = useState<{
    type: "symbol" | "all" | "before";
    symbol?: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);

  // ── Loaders ───────────────────────────────────────────────────────────
  const loadSymbols = useCallback(async () => {
    setSymLoading(true);
    try {
      const j = await fetch("/api/tracker/symbols").then((r) => r.json());
      if (!j.error) setSymbols(j.symbols || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSymLoading(false);
    }
  }, []);

  const loadDeals = useCallback(async (symbol: string) => {
    setLoading(true);
    setDeals([]);
    try {
      const j = await fetch(
        `/api/tracker?symbol=${encodeURIComponent(symbol)}`,
      ).then((r) => r.json());
      if (!j.error) setDeals(j.deals || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAutoSymbols = useCallback(async () => {
    try {
      const j = await fetch("/api/tracker/auto").then((r) => r.json());
      if (!j.error) setAutoSymbols(j.symbols || []);
    } catch {}
  }, []);

  const loadClientProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch("/api/tracker/clients").then((r) => r.json());
      if (!j.error) setClientProfiles(j.clients || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadClientDeals = useCallback(async (client: string) => {
    try {
      const j = await fetch(
        `/api/tracker/clients?client=${encodeURIComponent(client)}`,
      ).then((r) => r.json());
      if (!j.error) setClientDeals(j.deals || []);
    } catch {}
  }, []);

  useEffect(() => {
    loadSymbols();
    loadAutoSymbols();
  }, []);
  useEffect(() => {
    if (mainTab === "clients") loadClientProfiles();
  }, [mainTab]);
  useEffect(() => {
    if (selected) loadDeals(selected);
  }, [selected]);
  useEffect(() => {
    if (selectedClient) loadClientDeals(selectedClient);
  }, [selectedClient]);

  // ── Actions ───────────────────────────────────────────────────────────
  async function removeTracked(id: number) {
    await fetch(`/api/tracker/${id}`, { method: "DELETE" });
    setDeals((prev) => prev.filter((d) => d.id !== id));
    loadSymbols();
  }

  async function addAutoTrack(symbol: string, name: string) {
    await fetch("/api/tracker/auto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, name }),
    });
    loadAutoSymbols();
  }

  async function removeAutoTrack(symbol: string) {
    await fetch(`/api/tracker/auto?symbol=${symbol}`, { method: "DELETE" });
    loadAutoSymbols();
  }

  async function deleteBulk(
    type: "symbol" | "all" | "before",
    symbol?: string,
  ) {
    setDeleting(true);
    try {
      const url =
        type === "all"
          ? "/api/tracker?all=true"
          : `/api/tracker?symbol=${encodeURIComponent(symbol || "")}`;
      const j = await fetch(url, { method: "DELETE" }).then((r) => r.json());
      if (j.error) {
        setDeleteMsg("Error: " + j.error);
        return;
      }
      setDeleteMsg(
        type === "all"
          ? "All data deleted."
          : `${symbol} deleted (${j.rowsDeleted} records).`,
      );
      setDeleteModal(null);
      setSelected(null);
      loadSymbols();
      loadAutoSymbols();
    } catch (e: any) {
      setDeleteMsg("Error: " + e.message);
    } finally {
      setDeleting(false);
    }
  }

  async function syncNow() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const j = await fetch("/api/tracker/sync", { method: "POST" }).then((r) =>
        r.json(),
      );
      if (j.error) {
        setSyncResult(`Error: ${j.error}`);
        return;
      }
      setSyncResult(
        `✓ Saved ${j.saved} new deals, skipped ${j.skipped} duplicates (${j.asOnDate})`,
      );
      loadSymbols();
      loadAutoSymbols();
    } catch (e: any) {
      setSyncResult(`Error: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────
  const selectedSym = symbols.find((s) => s.symbol === selected);
  const clientAnalysis = analyzeClients(deals);
  const filteredAnalysis =
    filterStatus === "all"
      ? clientAnalysis
      : clientAnalysis.filter((c) => c.status === filterStatus);

  const filteredSymbols = symbols.filter(
    (s) =>
      !symSearch ||
      s.symbol.toLowerCase().includes(symSearch.toLowerCase()) ||
      s.name.toLowerCase().includes(symSearch.toLowerCase()),
  );
  const filteredClients = clientProfiles.filter(
    (c) =>
      !clientSearch ||
      c.client_name.toLowerCase().includes(clientSearch.toLowerCase()),
  );

  const autoSet = new Set(autoSymbols.map((s) => s.symbol));
  const netQtyAll = deals.reduce(
    (s, d) =>
      d.deal_type === "BUY" ? s + Number(d.quantity) : s - Number(d.quantity),
    0,
  );
  const netCrAll = deals.reduce(
    (s, d) =>
      d.deal_type === "BUY" ? s + Number(d.value_cr) : s - Number(d.value_cr),
    0,
  );

  return (
    <div className="tracker-wrap">
      {/* ── Header ── */}
      <div className="deals-header">
        <div>
          <div className="deals-title">🧠 INSTITUTIONAL INTELLIGENCE</div>
          <div className="deals-sub">
            Smart money flow · Client position analysis · Cross-symbol profiling
          </div>
        </div>
        <div className="deals-controls">
          {error && <span className="fyers-error">⚠ {error.slice(0, 50)}</span>}
          <button
            className="refresh-btn"
            onClick={() => {
              loadSymbols();
              loadAutoSymbols();
            }}
          >
            ⟳ REFRESH
          </button>
          {selected && (
            <a
              href={`/api/tracker/export?symbol=${selected}`}
              className="refresh-btn"
              style={{
                textDecoration: "none",
                background: "rgba(0,255,231,0.08)",
                borderColor: "var(--accent)",
                color: "var(--accent)",
              }}
            >
              ⬇ EXPORT {selected}
            </a>
          )}
          <a
            href="/api/tracker/export"
            className="refresh-btn"
            style={{ textDecoration: "none" }}
          >
            ⬇ EXPORT ALL
          </a>
          <button
            className="refresh-btn"
            style={{ borderColor: "var(--red)", color: "var(--red)" }}
            onClick={() => setDeleteModal({ type: "all" })}
          >
            🗑 DELETE ALL
          </button>
        </div>
      </div>

      {/* ── Main tabs ── */}
      <div
        className="deals-tabs"
        style={{ borderBottom: "2px solid var(--border)" }}
      >
        {(
          [
            ["intelligence", "🔍 SYMBOL INTELLIGENCE"],
            ["clients", "👤 CLIENT PROFILES"],
            ["autotrack", "⚙ AUTO-TRACK"],
          ] as [MainTab, string][]
        ).map(([t, l]) => (
          <button
            key={t}
            className={`deals-tab ${mainTab === t ? "active" : ""}`}
            onClick={() => setMainTab(t)}
          >
            {l}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════
          TAB 1: SYMBOL INTELLIGENCE
      ════════════════════════════════════════════════════════════════ */}
      {mainTab === "intelligence" && (
        <div className="tracker-body">
          {/* Left sidebar */}
          <div className="tracker-sidebar">
            <div className="tracker-sidebar-header">
              <input
                className="deals-search"
                style={{ width: "100%" }}
                placeholder="Search symbol…"
                value={symSearch}
                onChange={(e) => setSymSearch(e.target.value)}
              />
            </div>
            <div className="tracker-sym-count">
              {filteredSymbols.length} tracked symbol
              {filteredSymbols.length !== 1 ? "s" : ""}
            </div>
            {symLoading && (
              <div className="no-data">
                <div className="spinner" />
              </div>
            )}
            {!symLoading && filteredSymbols.length === 0 && (
              <div className="tracker-empty">
                <div style={{ fontSize: 28 }}>📌</div>
                <div>No symbols tracked yet</div>
                <div
                  style={{ fontSize: 10, marginTop: 4, color: "var(--muted)" }}
                >
                  Pin deals from Bulk/Block section or use Auto-Track tab
                </div>
              </div>
            )}
            {filteredSymbols.map((s) => {
              const net = Number(s.total_buy_cr) - Number(s.total_sell_cr);
              const isAuto = autoSet.has(s.symbol);
              return (
                <div
                  key={s.symbol}
                  className={`tracker-sym-row ${selected === s.symbol ? "active" : ""}`}
                  onClick={() => setSelected(s.symbol)}
                >
                  <div className="tracker-sym-top">
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 5 }}
                    >
                      <span className="col-symbol">{s.symbol}</span>
                      {isAuto && (
                        <span
                          style={{
                            fontSize: 8,
                            padding: "1px 4px",
                            background: "rgba(0,255,231,0.1)",
                            color: "var(--accent)",
                            borderRadius: 2,
                            border: "1px solid rgba(0,255,231,0.2)",
                          }}
                        >
                          AUTO
                        </span>
                      )}
                    </div>
                    <span
                      className={`tracker-net ${net >= 0 ? "green" : "red"}`}
                    >
                      {net >= 0 ? "+" : ""}
                      {fmtCr(net)}
                    </span>
                  </div>
                  <div className="tracker-sym-meta">
                    <span>{Number(s.total_deals)} deals</span>
                    <span style={{ color: "var(--green)" }}>
                      B:{fmtQty(Number(s.total_buy_qty))}
                    </span>
                    <span style={{ color: "var(--red)" }}>
                      S:{fmtQty(Number(s.total_sell_qty))}
                    </span>
                  </div>
                  <div className="tracker-sym-dates">
                    {s.first_seen} → {s.last_seen}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: intelligence panel */}
          <div className="tracker-main">
            {!selected ? (
              <div className="tracker-placeholder">
                <div style={{ fontSize: 48 }}>🧠</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 12 }}>
                  Select a symbol to analyse
                </div>
                <div
                  style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}
                >
                  See who's accumulating, distributing, or just day-trading
                </div>
              </div>
            ) : (
              <>
                {/* Symbol header */}
                <div className="tracker-sym-header">
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 12 }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 700,
                          letterSpacing: 2,
                        }}
                      >
                        {selected}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--muted)" }}>
                        {selectedSym?.name}
                      </div>
                    </div>
                    {!autoSet.has(selected) ? (
                      <button
                        className="refresh-btn"
                        style={{
                          fontSize: 9,
                          padding: "4px 10px",
                          background: "rgba(0,255,231,0.06)",
                          borderColor: "var(--accent)",
                          color: "var(--accent)",
                        }}
                        onClick={() =>
                          addAutoTrack(selected, selectedSym?.name || "")
                        }
                      >
                        ⚙ AUTO-TRACK
                      </button>
                    ) : (
                      <span
                        style={{
                          fontSize: 9,
                          padding: "4px 8px",
                          background: "rgba(0,255,231,0.1)",
                          color: "var(--accent)",
                          borderRadius: 3,
                          border: "1px solid rgba(0,255,231,0.2)",
                        }}
                      >
                        ✓ AUTO-TRACKING
                      </span>
                    )}
                  </div>
                  <div className="tracker-stats-row">
                    <div className="tracker-stat">
                      <div className="dc-label">Total Deals</div>
                      <div className="dc-val">{deals.length}</div>
                    </div>
                    <div className="tracker-stat">
                      <div className="dc-label">Clients</div>
                      <div className="dc-val">{clientAnalysis.length}</div>
                    </div>
                    <div className="tracker-stat">
                      <div className="dc-label">Net Qty</div>
                      <div
                        className={`dc-val ${netQtyAll >= 0 ? "green" : "red"}`}
                      >
                        {netQtyAll >= 0 ? "+" : ""}
                        {fmtQty(netQtyAll)}
                      </div>
                    </div>
                    <div className="tracker-stat">
                      <div className="dc-label">Net Flow</div>
                      <div
                        className={`dc-val ${netCrAll >= 0 ? "green" : "red"}`}
                      >
                        {netCrAll >= 0 ? "+" : ""}
                        {fmtCr(netCrAll)}
                      </div>
                    </div>
                    <div className="tracker-stat">
                      <div className="dc-label">Period</div>
                      <div className="dc-val" style={{ fontSize: 11 }}>
                        {selectedSym?.first_seen} → {selectedSym?.last_seen}
                      </div>
                    </div>
                    <button
                      className="refresh-btn"
                      style={{ marginLeft: 8 }}
                      onClick={() => {
                        setChartSymbol(`NSE:${selected}-EQ`);
                        setChartRes("D");
                      }}
                    >
                      📈 CHART
                    </button>
                    <button
                      className="refresh-btn"
                      style={{ borderColor: "var(--red)", color: "var(--red)" }}
                      onClick={() =>
                        setDeleteModal({
                          type: "symbol",
                          symbol: selected || "",
                        })
                      }
                    >
                      🗑 DELETE
                    </button>
                  </div>
                </div>

                {/* Status filter */}
                <div
                  className="gap-filter-row"
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      color: "var(--muted)",
                      letterSpacing: 1,
                      textTransform: "uppercase",
                    }}
                  >
                    Filter:
                  </span>
                  {(
                    [
                      "all",
                      "OVERNIGHT_LONG",
                      "ACCUMULATING",
                      "DISTRIBUTING",
                      "DAY_TRADER",
                      "OVERNIGHT_SHORT",
                    ] as const
                  ).map((f) => (
                    <button
                      key={f}
                      className={`gap-filter-btn ${filterStatus === f ? "active" : ""}`}
                      onClick={() => setFilterStatus(f)}
                    >
                      {f === "all"
                        ? "All"
                        : STATUS_CONFIG[f as keyof typeof STATUS_CONFIG]?.icon +
                          " " +
                          STATUS_CONFIG[f as keyof typeof STATUS_CONFIG]?.label}
                    </button>
                  ))}
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 10,
                      color: "var(--muted)",
                    }}
                  >
                    {filteredAnalysis.length} clients
                  </span>
                </div>

                {/* Client analysis cards */}
                <div className="tracker-timeline">
                  {loading && (
                    <div className="no-data">
                      <div className="spinner" /> Loading…
                    </div>
                  )}
                  {!loading && filteredAnalysis.length === 0 && (
                    <div className="no-data">No clients match filter.</div>
                  )}

                  {filteredAnalysis.map((c) => {
                    const cfg = STATUS_CONFIG[c.status];
                    const isBigPlayer = Math.abs(c.netCr) > 10; // >10Cr = significant
                    return (
                      <div
                        key={c.client}
                        className={`client-analysis-card ${c.isNew ? "new-entry" : ""}`}
                        onClick={() => {
                          setSelectedClient(c.client);
                          setMainTab("clients");
                        }}
                      >
                        {/* Card header */}
                        <div className="ca-header">
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                flexWrap: "wrap",
                              }}
                            >
                              {c.isNew && (
                                <span className="new-badge">🆕 NEW ENTRY</span>
                              )}
                              {isBigPlayer && (
                                <span className="big-badge">🐳 BIG PLAYER</span>
                              )}
                              <span className="ca-client" title={c.client}>
                                {c.client}
                              </span>
                            </div>
                            <div
                              style={{
                                fontSize: 9,
                                color: "var(--muted)",
                                marginTop: 2,
                              }}
                            >
                              Seen {c.appearances} day
                              {c.appearances !== 1 ? "s" : ""}:{" "}
                              {c.dates.join(" · ")}
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: cfg.color,
                              }}
                            >
                              {cfg.icon} {cfg.label}
                            </div>
                            <div
                              style={{
                                fontSize: 9,
                                color: "var(--muted)",
                                marginTop: 2,
                                maxWidth: 160,
                                textAlign: "right",
                              }}
                            >
                              {cfg.desc}
                            </div>
                          </div>
                        </div>

                        {/* Flow bar */}
                        <div className="ca-flow">
                          <div className="ca-flow-item">
                            <span style={{ color: "var(--green)" }}>▲ BUY</span>
                            <span className="deal-num green">
                              {fmtQty(c.buyQty)}
                            </span>
                            <span
                              style={{ fontSize: 10, color: "var(--muted)" }}
                            >
                              {c.buyCr > 0 ? fmtCr(c.buyCr) : ""}
                            </span>
                          </div>
                          <div className="ca-flow-sep">vs</div>
                          <div className="ca-flow-item">
                            <span style={{ color: "var(--red)" }}>▼ SELL</span>
                            <span className="deal-num red">
                              {fmtQty(c.sellQty)}
                            </span>
                            <span
                              style={{ fontSize: 10, color: "var(--muted)" }}
                            >
                              {c.sellCr > 0 ? fmtCr(c.sellCr) : ""}
                            </span>
                          </div>
                          <div className="ca-flow-sep">=</div>
                          <div className="ca-flow-item">
                            <span style={{ color: "var(--muted)" }}>NET</span>
                            <span
                              className={`deal-num ${c.netQty >= 0 ? "green" : "red"}`}
                              style={{ fontWeight: 700 }}
                            >
                              {c.netQty >= 0 ? "+" : ""}
                              {fmtQty(c.netQty)}
                            </span>
                            <span
                              style={{
                                fontSize: 10,
                                color:
                                  c.netCr >= 0 ? "var(--green)" : "var(--red)",
                                fontWeight: 600,
                              }}
                            >
                              {c.netCr >= 0 ? "+" : ""}
                              {fmtCr(c.netCr)}
                            </span>
                          </div>
                        </div>

                        {/* Visual net bar */}
                        {c.buyQty + c.sellQty > 0 && (
                          <div className="ca-bar-wrap">
                            <div
                              className="ca-bar-buy"
                              style={{
                                width: `${(c.buyQty / (c.buyQty + c.sellQty)) * 100}%`,
                              }}
                            />
                            <div
                              className="ca-bar-sell"
                              style={{
                                width: `${(c.sellQty / (c.buyQty + c.sellQty)) * 100}%`,
                              }}
                            />
                          </div>
                        )}

                        <div
                          style={{
                            fontSize: 9,
                            color: "var(--muted)",
                            marginTop: 4,
                            display: "flex",
                            justifyContent: "space-between",
                          }}
                        >
                          <span>
                            Last action:{" "}
                            <b
                              style={{
                                color:
                                  c.lastAction === "BUY"
                                    ? "var(--green)"
                                    : "var(--red)",
                              }}
                            >
                              {c.lastAction}
                            </b>
                          </span>
                          <span style={{ color: "var(--accent)", fontSize: 9 }}>
                            Click to view full profile →
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Raw timeline toggle */}
                <details className="raw-timeline-toggle">
                  <summary>
                    📋 Raw Deal Timeline ({deals.length} records)
                  </summary>
                  <div>
                    {deals.map((d, i) => {
                      const isBuy = d.deal_type === "BUY";
                      const prev = i > 0 ? deals[i - 1].deal_date : null;
                      return (
                        <div key={d.id}>
                          {d.deal_date !== prev && (
                            <div className="tracker-date-sep">
                              <span>{d.deal_date}</span>
                            </div>
                          )}
                          <div
                            className={`tracker-deal-row ${isBuy ? "deal-buy" : "deal-sell"}`}
                          >
                            <div
                              className={`tracker-dot ${isBuy ? "buy" : "sell"}`}
                            />
                            <div className="tracker-deal-body">
                              <div className="tracker-deal-top">
                                <span
                                  className={`deal-type-badge ${isBuy ? "buy" : "sell"}`}
                                  style={{ fontSize: 9 }}
                                >
                                  {isBuy ? "▲ BUY" : "▼ SELL"}
                                </span>
                                <span className="tracker-kind-badge">
                                  {d.deal_kind.toUpperCase()}
                                </span>
                                <span
                                  className="deal-client"
                                  style={{ flex: 1 }}
                                  title={d.client_name}
                                >
                                  {d.client_name}
                                </span>
                                <span
                                  className={`deal-num ${isBuy ? "green" : "red"}`}
                                  style={{ fontSize: 12 }}
                                >
                                  {Number(d.value_cr) > 0
                                    ? fmtCr(Number(d.value_cr))
                                    : fmtQty(Number(d.quantity)) + " shares"}
                                </span>
                              </div>
                              <div className="tracker-deal-bottom">
                                <span
                                  style={{
                                    fontSize: 10,
                                    color: "var(--muted)",
                                  }}
                                >
                                  Qty: {fmtQty(Number(d.quantity))}
                                  {Number(d.trade_price) > 0
                                    ? ` · ₹${fmtPrice(Number(d.trade_price))}`
                                    : ""}
                                </span>
                                <button
                                  className="tracker-delete"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeTracked(d.id);
                                  }}
                                  title="Remove"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              </>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          TAB 2: CLIENT PROFILES
      ════════════════════════════════════════════════════════════════ */}
      {mainTab === "clients" && (
        <div className="tracker-body">
          <div className="tracker-sidebar">
            <div className="tracker-sidebar-header">
              <input
                className="deals-search"
                style={{ width: "100%" }}
                placeholder="Search client…"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
              />
            </div>
            <div className="tracker-sym-count">
              {filteredClients.length} clients tracked
            </div>
            {loading && (
              <div className="no-data">
                <div className="spinner" />
              </div>
            )}
            {!loading && filteredClients.length === 0 && (
              <div className="tracker-empty">
                <div style={{ fontSize: 28 }}>👤</div>
                <div>No client data yet</div>
                <div
                  style={{ fontSize: 10, marginTop: 4, color: "var(--muted)" }}
                >
                  Pin deals first to build client profiles
                </div>
              </div>
            )}
            {filteredClients.map((c) => {
              const net = Number(c.total_buy_cr) - Number(c.total_sell_cr);
              const syms = c.symbols?.split(",").filter(Boolean) || [];
              return (
                <div
                  key={c.client_name}
                  className={`tracker-sym-row ${selectedClient === c.client_name ? "active" : ""}`}
                  onClick={() => setSelectedClient(c.client_name)}
                >
                  <div className="tracker-sym-top">
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: 160,
                      }}
                      title={c.client_name}
                    >
                      {c.client_name}
                    </span>
                    <span
                      className={`tracker-net ${net >= 0 ? "green" : "red"}`}
                    >
                      {net >= 0 ? "+" : ""}
                      {fmtCr(net)}
                    </span>
                  </div>
                  <div className="tracker-sym-meta">
                    <span>{Number(c.total_deals)} deals</span>
                    <span style={{ color: "var(--accent)" }}>
                      {Number(c.symbol_count)} stocks
                    </span>
                  </div>
                  <div
                    className="tracker-sym-dates"
                    style={{
                      display: "flex",
                      gap: 4,
                      flexWrap: "wrap",
                      marginTop: 3,
                    }}
                  >
                    {syms.slice(0, 4).map((s) => (
                      <span
                        key={s}
                        style={{
                          fontSize: 8,
                          padding: "1px 4px",
                          background: "rgba(255,255,255,0.05)",
                          borderRadius: 2,
                          border: "1px solid var(--border)",
                        }}
                      >
                        {s}
                      </span>
                    ))}
                    {syms.length > 4 && (
                      <span style={{ fontSize: 8, color: "var(--muted)" }}>
                        +{syms.length - 4}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Client detail */}
          <div className="tracker-main">
            {!selectedClient ? (
              <div className="tracker-placeholder">
                <div style={{ fontSize: 48 }}>👤</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 12 }}>
                  Select a client to view their profile
                </div>
                <div
                  style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}
                >
                  See which stocks they trade and their pattern across your
                  tracked universe
                </div>
              </div>
            ) : (
              (() => {
                const profile = clientProfiles.find(
                  (c) => c.client_name === selectedClient,
                );
                const syms = profile?.symbols?.split(",").filter(Boolean) || [];
                const net =
                  Number(profile?.total_buy_cr || 0) -
                  Number(profile?.total_sell_cr || 0);
                const clientDealsBySymbol = new Map<string, TrackedDeal[]>();
                clientDeals.forEach((d) => {
                  if (!clientDealsBySymbol.has(d.symbol))
                    clientDealsBySymbol.set(d.symbol, []);
                  clientDealsBySymbol.get(d.symbol)!.push(d);
                });
                return (
                  <>
                    <div className="tracker-sym-header">
                      <div>
                        <div
                          style={{
                            fontSize: 15,
                            fontWeight: 700,
                            letterSpacing: 1,
                          }}
                        >
                          {selectedClient}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: "var(--muted)",
                            marginTop: 2,
                          }}
                        >
                          Active in {syms.length} stock
                          {syms.length !== 1 ? "s" : ""} · {profile?.first_seen}{" "}
                          → {profile?.last_seen}
                        </div>
                      </div>
                      <div className="tracker-stats-row">
                        <div className="tracker-stat">
                          <div className="dc-label">Stocks</div>
                          <div className="dc-val accent">
                            {Number(profile?.symbol_count || 0)}
                          </div>
                        </div>
                        <div className="tracker-stat">
                          <div className="dc-label">Deals</div>
                          <div className="dc-val">
                            {Number(profile?.total_deals || 0)}
                          </div>
                        </div>
                        <div className="tracker-stat">
                          <div className="dc-label">Buy Value</div>
                          <div className="dc-val green">
                            {fmtCr(Number(profile?.total_buy_cr || 0))}
                          </div>
                        </div>
                        <div className="tracker-stat">
                          <div className="dc-label">Sell Value</div>
                          <div className="dc-val red">
                            {fmtCr(Number(profile?.total_sell_cr || 0))}
                          </div>
                        </div>
                        <div className="tracker-stat">
                          <div className="dc-label">Net Flow</div>
                          <div
                            className={`dc-val ${net >= 0 ? "green" : "red"}`}
                          >
                            {net >= 0 ? "+" : ""}
                            {fmtCr(net)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Stocks this client trades */}
                    <div
                      className="tracker-clients"
                      style={{
                        flexDirection: "column",
                        alignItems: "flex-start",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 9,
                          letterSpacing: 1.5,
                          color: "var(--muted)",
                          textTransform: "uppercase",
                          marginBottom: 6,
                        }}
                      >
                        Active stocks:
                      </div>
                      <div
                        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                      >
                        {syms.map((s) => {
                          const sDeals = clientDealsBySymbol.get(s) || [];
                          const sNet = sDeals.reduce(
                            (acc, d) =>
                              d.deal_type === "BUY"
                                ? acc + Number(d.value_cr)
                                : acc - Number(d.value_cr),
                            0,
                          );
                          return (
                            <div
                              key={s}
                              className="client-stock-chip"
                              onClick={() => {
                                setSelected(s);
                                setMainTab("intelligence");
                              }}
                            >
                              <span
                                className="col-symbol"
                                style={{ fontSize: 11 }}
                              >
                                {s}
                              </span>
                              <span
                                className={sNet >= 0 ? "green" : "red"}
                                style={{ fontSize: 10 }}
                              >
                                {sNet >= 0 ? "+" : ""}
                                {fmtCr(sNet)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Deal history */}
                    <div className="tracker-timeline">
                      {clientDeals.length === 0 && (
                        <div className="no-data">
                          <div className="spinner" /> Loading…
                        </div>
                      )}
                      {clientDeals.map((d, i) => {
                        const isBuy = d.deal_type === "BUY";
                        const prev =
                          i > 0 ? clientDeals[i - 1].deal_date : null;
                        return (
                          <div key={d.id}>
                            {d.deal_date !== prev && (
                              <div className="tracker-date-sep">
                                <span>{d.deal_date}</span>
                              </div>
                            )}
                            <div
                              className={`tracker-deal-row ${isBuy ? "deal-buy" : "deal-sell"}`}
                            >
                              <div
                                className={`tracker-dot ${isBuy ? "buy" : "sell"}`}
                              />
                              <div className="tracker-deal-body">
                                <div className="tracker-deal-top">
                                  <span
                                    className={`deal-type-badge ${isBuy ? "buy" : "sell"}`}
                                    style={{ fontSize: 9 }}
                                  >
                                    {isBuy ? "▲ BUY" : "▼ SELL"}
                                  </span>
                                  <span className="tracker-kind-badge">
                                    {d.deal_kind.toUpperCase()}
                                  </span>
                                  <span
                                    className="col-symbol"
                                    style={{
                                      fontSize: 11,
                                      cursor: "pointer",
                                      color: "var(--accent)",
                                    }}
                                    onClick={() => {
                                      setSelected(d.symbol);
                                      setMainTab("intelligence");
                                    }}
                                  >
                                    {d.symbol}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 10,
                                      color: "var(--muted)",
                                      flex: 1,
                                    }}
                                  >
                                    {d.name.substring(0, 20)}
                                  </span>
                                  <span
                                    className={`deal-num ${isBuy ? "green" : "red"}`}
                                    style={{ fontSize: 12 }}
                                  >
                                    {Number(d.value_cr) > 0
                                      ? fmtCr(Number(d.value_cr))
                                      : fmtQty(Number(d.quantity)) + " shares"}
                                  </span>
                                </div>
                                <div className="tracker-deal-bottom">
                                  <span
                                    style={{
                                      fontSize: 10,
                                      color: "var(--muted)",
                                    }}
                                  >
                                    Qty: {fmtQty(Number(d.quantity))}
                                    {Number(d.trade_price) > 0
                                      ? ` · ₹${fmtPrice(Number(d.trade_price))}`
                                      : ""}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          TAB 3: AUTO-TRACK
      ════════════════════════════════════════════════════════════════ */}
      {mainTab === "autotrack" && (
        <div style={{ padding: 20 }}>
          <div
            style={{
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                }}
              >
                ⚙ Auto-Track Settings
              </div>
              <div
                style={{ fontSize: 10, color: "var(--muted)", marginTop: 3 }}
              >
                Click <b style={{ color: "var(--text)" }}>SYNC NOW</b> once a
                day after market close to auto-save all deals for tracked
                symbols.
                <br />
                Alternatively, each symbol gets auto-tracked when you click
                "AUTO-TRACK" button in Symbol Intelligence tab.
              </div>
            </div>
            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 6,
              }}
            >
              <button
                className="refresh-btn"
                style={{
                  background: "rgba(0,255,231,0.1)",
                  borderColor: "var(--accent)",
                  color: "var(--accent)",
                  padding: "8px 20px",
                  fontSize: 11,
                }}
                onClick={syncNow}
                disabled={syncing}
              >
                {syncing ? "⟳ SYNCING..." : "⚡ SYNC NOW"}
              </button>
              {syncResult && (
                <div
                  style={{
                    fontSize: 10,
                    color: syncResult.startsWith("Error")
                      ? "var(--red)"
                      : "var(--green)",
                  }}
                >
                  {syncResult}
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              background: "rgba(0,255,231,0.04)",
              border: "1px solid rgba(0,255,231,0.15)",
              borderRadius: 6,
              padding: 12,
              marginBottom: 16,
              fontSize: 10,
              color: "var(--muted)",
              lineHeight: 1.8,
            }}
          >
            <b style={{ color: "var(--accent)" }}>How Auto-Track works:</b>
            <br />
            1. Add symbols below (or click AUTO-TRACK button on any symbol in
            the Intelligence tab)
            <br />
            2. Every day after{" "}
            <b style={{ color: "var(--text)" }}>market close (~3:45 PM IST)</b>,
            click SYNC NOW once
            <br />
            3. All bulk + block deals for your tracked symbols get saved
            automatically to Turso
            <br />
            4. No manual pinning needed — full history builds up over time
          </div>

          {/* Tracked symbols grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))",
              gap: 10,
            }}
          >
            {autoSymbols.map((s) => (
              <div key={s.symbol} className="auto-sym-card">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div className="col-symbol">{s.symbol}</div>
                    <div className="col-name">{s.name.substring(0, 24)}</div>
                  </div>
                  <button
                    className="tracker-delete"
                    style={{ fontSize: 13 }}
                    onClick={() => removeAutoTrack(s.symbol)}
                    title="Stop tracking"
                  >
                    ✕
                  </button>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    marginTop: 6,
                    fontSize: 10,
                    color: "var(--muted)",
                  }}
                >
                  <span>📊 {Number(s.deal_count)} deals saved</span>
                  {s.last_deal_date && <span>📅 Last: {s.last_deal_date}</span>}
                  {s.last_synced && (
                    <span>
                      🔄 Synced:{" "}
                      {new Date(s.last_synced).toLocaleDateString("en-IN")}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {autoSymbols.length === 0 && (
              <div
                style={{
                  gridColumn: "1/-1",
                  padding: 40,
                  textAlign: "center",
                  color: "var(--muted)",
                  fontSize: 11,
                }}
              >
                No symbols auto-tracked yet.
                <br />
                <span style={{ fontSize: 10 }}>
                  Go to Symbol Intelligence tab and click AUTO-TRACK on any
                  symbol.
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal ── */}
      {deleteModal && (
        <div
          className="chart-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setDeleteModal(null);
              setDeleteMsg(null);
            }
          }}
        >
          <div
            style={{
              background: "var(--panel)",
              border: "1px solid var(--red)",
              borderRadius: 8,
              padding: 28,
              minWidth: 360,
              maxWidth: 480,
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "var(--red)",
                marginBottom: 10,
              }}
            >
              {deleteModal.type === "all"
                ? "🗑 Delete ALL Tracked Data?"
                : `🗑 Delete ${deleteModal.symbol}?`}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--muted)",
                lineHeight: 1.7,
                marginBottom: 18,
              }}
            >
              {deleteModal.type === "all"
                ? "This will permanently delete ALL tracked deals and auto-tracked symbols from Turso. This cannot be undone."
                : `This will permanently delete all tracked deals for ${deleteModal.symbol} and remove it from auto-track. This cannot be undone.`}
            </div>
            {deleteMsg && (
              <div
                style={{
                  fontSize: 11,
                  color: deleteMsg.startsWith("Error")
                    ? "var(--red)"
                    : "var(--green)",
                  marginBottom: 12,
                }}
              >
                {deleteMsg}
              </div>
            )}
            <div
              style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}
            >
              <button
                className="refresh-btn"
                onClick={() => {
                  setDeleteModal(null);
                  setDeleteMsg(null);
                }}
              >
                Cancel
              </button>
              <button
                className="refresh-btn"
                style={{
                  background: "rgba(255,23,68,0.15)",
                  borderColor: "var(--red)",
                  color: "var(--red)",
                }}
                onClick={() => deleteBulk(deleteModal.type, deleteModal.symbol)}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

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
                {["5", "15", "30", "60", "D"].map((r) => (
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
    </div>
  );
}
