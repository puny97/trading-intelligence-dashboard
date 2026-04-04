import { NextResponse } from "next/server";

/**
 * KEY OPTIMISATION: All types are served from a single route call.
 * Dashboard calls /api/nse?type=all  →  1 NSE fetch, returns everything.
 * This replaces 4 separate calls (gainers/losers/active/indices) with 1+1.
 *
 * NSE fetches needed:
 *   1. /api/equity-stockIndices?index=NIFTY%20500  → all 500 stocks (sort for gainers/losers/active)
 *   2. /api/allIndices                             → index strip data
 * Total: 2 NSE HTTP requests per refresh cycle instead of 4.
 */

const BASE = "https://www.nseindia.com";

const H: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Referer: "https://www.nseindia.com/",
  "X-Requested-With": "XMLHttpRequest",
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
};

// ── Session ────────────────────────────────────────────────────────────────
let _cookies = "";
let _expiry = 0;
let _building = false; // prevent concurrent session builds

async function getSession(): Promise<string> {
  if (_cookies && Date.now() < _expiry) return _cookies;

  // If another request is already building the session, wait for it
  if (_building) {
    await new Promise((r) => setTimeout(r, 3000));
    return _cookies || "";
  }

  _building = true;
  console.log("[NSE] Building session…");
  try {
    const r = await fetch(BASE, {
      headers: {
        "User-Agent": H["User-Agent"],
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const parts: string[] =
      typeof (r.headers as any).getSetCookie === "function"
        ? (r.headers as any).getSetCookie()
        : (r.headers.get("set-cookie") || "").split(/,(?=[^ ;,]+=)/);

    _cookies = parts
      .map((c: string) => c.split(";")[0].trim())
      .filter(Boolean)
      .join("; ");
    console.log("[NSE] Cookies OK:", _cookies.slice(0, 80));

    // Warm up — required before API calls
    await fetch(`${BASE}/market-data/live-equity-market`, {
      headers: { ...H, Cookie: _cookies },
    }).catch(() => {});

    _expiry = Date.now() + 10 * 60 * 1000; // 10 min (was 5)
  } finally {
    _building = false;
  }
  return _cookies;
}

async function nseGet(path: string): Promise<any> {
  const cookies = await getSession();
  const r = await fetch(`${BASE}${path}`, {
    headers: { ...H, Cookie: cookies },
  });
  if (!r.ok) {
    _cookies = "";
    _expiry = 0;
    throw new Error(`NSE ${r.status} on ${path}`);
  }
  return r.json();
}

// ── Normalise ──────────────────────────────────────────────────────────────
function norm(s: any) {
  return {
    symbol: s.symbol || "",
    name: s.companyName || s.symbol || "",
    ltp: +(s.ltp || s.lastPrice || s.ltP || 0),
    open: +(s.openPrice || s.open || 0),
    high: +(s.highPrice || s.high || 0),
    low: +(s.lowPrice || s.low || 0),
    prevClose: +(s.previousPrice || s.previousClose || 0),
    change: +(s.net_price || s.netPrice || s.change || 0),
    pChange: +(s.pChange || s.perChange || 0),
    volume: +(s.totalTradedVolume || s.tradedQuantity || s.volume || 0),
    turnover: +(s.turnoverInLakhs || s.totalTradedValue || 0),
    exchange: "NSE",
  };
}

// ── Route ──────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "all";

  try {
    // ── type=all: single call returns everything ─────────────────────────
    if (type === "all") {
      // Fire both NSE fetches in parallel (only 2 total instead of 4)
      const [equityRes, indicesRes] = await Promise.allSettled([
        nseGet("/api/equity-stockIndices?index=NIFTY%20500"),
        nseGet("/api/allIndices"),
      ]);

      // ── Process stocks ─────────────────────────────────────────────────
      let gainers: any[] = [],
        losers: any[] = [],
        active: any[] = [];

      if (equityRes.status === "fulfilled") {
        const all: any[] = (equityRes.value?.data || []).filter(
          (s: any) => s.symbol && s.symbol !== "NIFTY 500",
        );

        gainers = all
          .filter((s: any) => +(s.pChange || s.perChange || 0) > 0)
          .sort(
            (a: any, b: any) =>
              +(b.pChange || b.perChange || 0) -
              +(a.pChange || a.perChange || 0),
          )
          .slice(0, 20)
          .map(norm);

        losers = all
          .filter((s: any) => +(s.pChange || s.perChange || 0) < 0)
          .sort(
            (a: any, b: any) =>
              +(a.pChange || a.perChange || 0) -
              +(b.pChange || b.perChange || 0),
          )
          .slice(0, 20)
          .map(norm);

        active = [...all]
          .sort(
            (a: any, b: any) =>
              +(b.totalTradedVolume || b.tradedQuantity || 0) -
              +(a.totalTradedVolume || a.tradedQuantity || 0),
          )
          .slice(0, 20)
          .map(norm);
      }

      // ── Process indices ────────────────────────────────────────────────
      const WANT = [
        { key: "NIFTY 50", label: "NIFTY 50" },
        { key: "NIFTY BANK", label: "BANK NIFTY" },
        { key: "NIFTY IT", label: "NIFTY IT" },
        { key: "NIFTY MIDCAP 50", label: "NIFTY MID 50" },
        { key: "INDIA VIX", label: "INDIA VIX" },
      ];

      let indices: any[] = [];
      if (indicesRes.status === "fulfilled") {
        const all: any[] = indicesRes.value?.data || [];
        indices = WANT.map((w) => {
          const f = all.find(
            (i: any) => i.index === w.key || i.indexSymbol === w.key,
          );
          if (!f)
            return {
              label: w.label,
              value: 0,
              change: 0,
              pChange: 0,
              isUp: true,
            };
          const pChange = +(f.percentChange || f.pChange || 0);
          return {
            label: w.label,
            value: +(f.last || f.lastPrice || 0),
            change: +(f.variation || f.change || 0),
            pChange,
            isUp: pChange >= 0,
          };
        });
      }

      const equityErr =
        equityRes.status === "rejected" ? equityRes.reason?.message : undefined;

      return NextResponse.json(
        {
          source: "NSE",
          gainers,
          losers,
          active,
          indices,
          error: equityErr,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    // ── Legacy single-type calls (kept for backward compat / debug) ──────
    if (type === "debug") {
      const path =
        searchParams.get("path") ||
        "/api/equity-stockIndices?index=NIFTY%20500";
      const raw = await nseGet(path);
      const keys = Object.keys(raw || {});
      return NextResponse.json({ keys, firstItem: raw?.data?.[0] || null });
    }

    return NextResponse.json({ error: "Use type=all" }, { status: 400 });
  } catch (err: any) {
    console.error("[NSE Error]", err?.message);
    _cookies = "";
    _expiry = 0;
    return NextResponse.json(
      {
        error: err?.message || "NSE fetch failed",
        source: "NSE",
        gainers: [],
        losers: [],
        active: [],
        indices: [],
      },
      { status: 500 },
    );
  }
}
