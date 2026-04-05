import { NextResponse } from "next/server";

const BASE = "https://www.nseindia.com";
const H: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nseindia.com/",
  "X-Requested-With": "XMLHttpRequest",
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
};

let _cookies = "";
let _expiry = 0;

async function getSession() {
  if (_cookies && Date.now() < _expiry) return _cookies;
  const r = await fetch(BASE, {
    headers: {
      "User-Agent": H["User-Agent"],
      Accept: "text/html,application/xhtml+xml",
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
  await fetch(`${BASE}/market-data/live-equity-market`, {
    headers: { ...H, Cookie: _cookies },
  }).catch(() => {});
  _expiry = Date.now() + 10 * 60 * 1000;
  return _cookies;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path") || "/api/allIndices";

  try {
    const cookies = await getSession();
    const r = await fetch(`${BASE}${path}`, {
      headers: { ...H, Cookie: cookies },
    });
    const text = await r.text();

    if (text.trimStart().startsWith("<"))
      return NextResponse.json({
        error: "NSE returned HTML",
        status: r.status,
      });

    const json = JSON.parse(text);

    // If allIndices, find and return just Nifty 50 row with all keys
    if (path.includes("allIndices")) {
      const data: any[] = json?.data || [];
      const nifty = data.find(
        (i: any) =>
          ["NIFTY 50", "NIFTY50"].includes(i.index) ||
          ["NIFTY 50", "NIFTY50"].includes(i.indexSymbol),
      );
      const allKeys = data[0] ? Object.keys(data[0]) : [];
      return NextResponse.json({
        total_indices: data.length,
        all_keys_on_first_item: allKeys,
        nifty50_row: nifty,
        first_3_index_names: data
          .slice(0, 3)
          .map((i: any) => i.index || i.indexSymbol),
      });
    }

    // If equity, return first stock with all keys
    if (path.includes("equity-stock")) {
      const data: any[] = json?.data || [];
      const reliance =
        data.find((s: any) => s.symbol === "RELIANCE") || data[0];
      return NextResponse.json({
        total_stocks: data.length,
        all_keys: reliance ? Object.keys(reliance) : [],
        reliance_row: reliance,
      });
    }

    return NextResponse.json({ raw: json });
  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
