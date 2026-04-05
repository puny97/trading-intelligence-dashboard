import { NextResponse } from 'next/server'

/**
 * Confirmed NSE field names from live debug (24-Mar-2026):
 *
 * allIndices (Nifty 50 row):
 *   last, open, high, low, previousClose, variation, percentChange
 *
 * equity-stockIndices (stock rows):
 *   lastPrice, open, dayHigh, dayLow, previousClose, change, pChange
 */

const BASE = 'https://www.nseindia.com'
const H: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.nseindia.com/',
  'X-Requested-With': 'XMLHttpRequest',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
}

let _cookies = ''
let _expiry = 0
let _building = false

async function getSession(): Promise<string> {
  if (_cookies && Date.now() < _expiry) return _cookies
  if (_building) {
    await new Promise(r => setTimeout(r, 3000))
    return _cookies || ''
  }
  _building = true
  try {
    const r = await fetch(BASE, {
      headers: {
        'User-Agent': H['User-Agent'],
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })
    const parts: string[] =
      typeof (r.headers as any).getSetCookie === 'function'
        ? (r.headers as any).getSetCookie()
        : (r.headers.get('set-cookie') || '').split(/,(?=[^ ;,]+=)/)
    _cookies = parts
      .map((c: string) => c.split(';')[0].trim())
      .filter(Boolean)
      .join('; ')
    await fetch(`${BASE}/market-data/live-equity-market`, {
      headers: { ...H, Cookie: _cookies },
    }).catch(() => {})
    _expiry = Date.now() + 10 * 60 * 1000
  } finally {
    _building = false
  }
  return _cookies
}

async function nseGet(path: string): Promise<any> {
  const cookies = await getSession()
  const r = await fetch(`${BASE}${path}`, {
    headers: { ...H, Cookie: cookies },
  })
  const text = await r.text()
  if (!r.ok || text.trimStart().startsWith('<')) {
    _cookies = ''
    _expiry = 0
    throw new Error(`NSE ${r.status} — session blocked`)
  }
  return JSON.parse(text)
}

const KEY_STOCKS = [
  'RELIANCE',
  'HDFCBANK',
  'TCS',
  'INFY',
  'ITC',
  'ICICIBANK',
  'SBIN',
  'KOTAKBANK',
  'HINDUNILVR',
]

export async function GET() {
  try {
    const [indicesRes, equityRes] = await Promise.allSettled([
      nseGet('/api/allIndices'),
      nseGet('/api/equity-stockIndices?index=NIFTY%2050'),
    ])

    const indices: any[] = indicesRes.status === 'fulfilled' ? indicesRes.value?.data || [] : []

    // ── Find indices using confirmed field names ────────────────────────
    const nifty50 = indices.find((i: any) => i.index === 'NIFTY 50')
    const bankNifty = indices.find((i: any) => i.index === 'NIFTY BANK')
    const indiaVix = indices.find((i: any) => i.index === 'INDIA VIX')
    const giftNifty = indices.find(
      (i: any) =>
        (i.index || '').toLowerCase().includes('gift') ||
        (i.index || '').toLowerCase().includes('sgx')
    )

    // ── Nifty 50 OHLC (confirmed fields) ──────────────────────────────
    // previousClose = yesterday's 3:30 PM close ✅
    // open          = today's open ✅
    // high/low      = today's high/low ✅
    // last          = LTP ✅
    // variation     = points moved from prev close ✅
    // percentChange = % moved ✅
    const prevClose = +(nifty50?.previousClose || 0)
    const todayOpen = +(nifty50?.open || 0)
    const todayHigh = +(nifty50?.high || 0)
    const todayLow = +(nifty50?.low || 0)
    const ltp = +(nifty50?.last || 0)
    const pointsMoved = +(nifty50?.variation || 0)
    const pointsMovedPct = +(nifty50?.percentChange || 0)
    const openGap = +(todayOpen - prevClose).toFixed(2)
    const highFromPrev = +(todayHigh - prevClose).toFixed(2)
    const lowFromPrev = +(todayLow - prevClose).toFixed(2)
    const dayRange = +(todayHigh - todayLow).toFixed(2)

    // ── Market type — based on open gap (theory: ±40 pts) ─────────────
    let marketType: 'FLAT' | 'POSITIVE' | 'NEGATIVE' = 'FLAT'
    if (openGap > 40) marketType = 'POSITIVE'
    if (openGap < -40) marketType = 'NEGATIVE'

    const rangeType: 'FLAT_RANGE' | 'NORMAL_RANGE' | 'EXTENDED' =
      dayRange <= 84 ? 'FLAT_RANGE' : dayRange <= 210 ? 'NORMAL_RANGE' : 'EXTENDED'

    // ── S&R Levels (Baseline = prev close ± 45) ───────────────────────
    const levels = {
      r3: +(prevClose + 135).toFixed(2),
      r2: +(prevClose + 90).toFixed(2),
      r1: +(prevClose + 45).toFixed(2),
      baseline: +prevClose.toFixed(2),
      s1: +(prevClose - 45).toFixed(2),
      s2: +(prevClose - 90).toFixed(2),
      s3: +(prevClose - 135).toFixed(2),
    }

    // ── Gift Nifty ─────────────────────────────────────────────────────
    const giftPrice = +(giftNifty?.last || 0)
    const giftGap = giftPrice > 0 ? +(giftPrice - prevClose).toFixed(2) : 0
    const giftDir: 'FLAT' | 'POSITIVE' | 'NEGATIVE' =
      giftGap > 40 ? 'POSITIVE' : giftGap < -40 ? 'NEGATIVE' : 'FLAT'

    // ── Bank Nifty ─────────────────────────────────────────────────────
    const bankNiftyData = {
      ltp: +(bankNifty?.last || 0),
      pChange: +(bankNifty?.percentChange || 0),
      high: +(bankNifty?.high || 0),
      low: +(bankNifty?.low || 0),
      prevClose: +(bankNifty?.previousClose || 0),
      variation: +(bankNifty?.variation || 0),
    }

    // ── India VIX ──────────────────────────────────────────────────────
    const vixData = {
      value: +(indiaVix?.last || 0),
      pChange: +(indiaVix?.percentChange || 0),
    }

    // ── Key stocks (confirmed fields: lastPrice, dayHigh, dayLow etc) ──
    const allStocks: any[] = equityRes.status === 'fulfilled' ? equityRes.value?.data || [] : []

    const keyStocks = KEY_STOCKS.map(sym => {
      const s = allStocks.find((x: any) => x.symbol === sym)
      if (!s)
        return {
          symbol: sym,
          ltp: 0,
          open: 0,
          high: 0,
          low: 0,
          prevClose: 0,
          pChange: 0,
          change: 0,
          name: sym,
        }
      return {
        symbol: s.symbol,
        name: s.meta?.companyName || sym,
        ltp: +(s.lastPrice || 0),
        open: +(s.open || 0),
        high: +(s.dayHigh || 0),
        low: +(s.dayLow || 0),
        prevClose: +(s.previousClose || 0),
        pChange: +(s.pChange || 0),
        change: +(s.change || 0),
        volume: +(s.totalTradedVolume || 0),
      }
    })

    // ── USDINR — not in allIndices, skip for now ───────────────────────
    // NSE allIndices doesn't include currency indices
    // Will add a separate fetch if needed
    const usdinrData = { price: 0, pChange: 0, marketImpact: 0 }

    return NextResponse.json(
      {
        nifty: {
          prevClose,
          todayOpen,
          todayHigh,
          todayLow,
          ltp,
          openGap,
          pointsMoved,
          pointsMovedPct,
          highFromPrev,
          lowFromPrev,
          dayRange,
          marketType,
          rangeType,
        },
        giftNifty: {
          price: giftPrice,
          gap: giftGap,
          gapPct: prevClose > 0 ? +((giftGap / prevClose) * 100).toFixed(3) : 0,
          direction: giftDir,
        },
        bankNifty: bankNiftyData,
        indiaVix: vixData,
        usdinr: usdinrData,
        levels,
        keyStocks,
        timestamp: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (e: any) {
    console.error('[magic error]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
