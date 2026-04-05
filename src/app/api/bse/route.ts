import { NextResponse } from "next/server";

const { BSE } = require("nse-bse-api");

let bseInstance: any = null;

function getBSE() {
  if (!bseInstance) bseInstance = new BSE();
  return bseInstance;
}

/**
 * Actual BSE field names confirmed from terminal logs:
 *   scrip_cd, scripname, LONG_NAME,
 *   openrate, highrate, lowrate, ltradert (last traded = LTP),
 *   prevdayclose, change_val, change_percent,
 *   trd_val (turnover), NO_OF_SHRS or noofshares (volume)
 */
function normalise(s: any) {
  return {
    symbol: String(s.scrip_cd || s.SecurityCode || ""),
    name: s.LONG_NAME || s.scripname || s.SecurityName || "",
    ltp: +(s.ltradert || s.CurrRate || s.ltp || 0),
    open: +(s.openrate || s.OpenRate || 0),
    high: +(s.highrate || s.HighRate || 0),
    low: +(s.lowrate || s.LowRate || 0),
    prevClose: +(s.prevdayclose || s.PrevRate || s.prevClose || 0),
    change: +(s.change_val || s.Change || 0),
    pChange: +(s.change_percent || s.PercentChange || 0),
    volume: +(s.NO_OF_SHRS || s.noofshares || s.NoOfShares || s.volume || 0),
    turnover: +(s.trd_val || s.TurnOver || 0),
    exchange: "BSE",
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "gainers";

  try {
    const bse = getBSE();

    // debug=1 — shows raw first item so you can verify field names
    if (searchParams.get("debug") === "1") {
      const raw = await bse.gainers();
      return NextResponse.json({ raw: (raw || []).slice(0, 2) });
    }

    if (type === "gainers") {
      const result = await bse.gainers();
      return NextResponse.json(
        {
          source: "BSE",
          type: "gainers",
          stocks: (result || []).slice(0, 20).map(normalise),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (type === "losers") {
      const result = await bse.losers();
      return NextResponse.json(
        {
          source: "BSE",
          type: "losers",
          stocks: (result || []).slice(0, 20).map(normalise),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (type === "active") {
      // BSE package has no mostActive — combine gainers+losers sorted by volume
      const [g, l] = await Promise.allSettled([bse.gainers(), bse.losers()]);
      const gainers = g.status === "fulfilled" ? g.value || [] : [];
      const losers = l.status === "fulfilled" ? l.value || [] : [];

      const combined = [...gainers, ...losers]
        .map(normalise)
        .sort((a, b) => b.volume - a.volume)
        .filter(
          (s, i, arr) => arr.findIndex((x) => x.symbol === s.symbol) === i,
        )
        .slice(0, 20);

      return NextResponse.json(
        {
          source: "BSE",
          type: "active",
          stocks: combined,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (err: any) {
    console.error("[BSE API Error]", err?.message || err);
    bseInstance = null;
    return NextResponse.json(
      { error: err?.message || "BSE fetch failed", source: "BSE", stocks: [] },
      { status: 500 },
    );
  }
}
