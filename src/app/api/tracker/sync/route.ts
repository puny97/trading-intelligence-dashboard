import { NextResponse } from 'next/server'
import { turso, ensureDB } from '@/lib/turso'

/**
 * POST /api/tracker/sync
 * Fetches today's bulk+block deals DIRECTLY from NSE (no internal fetch),
 * filters for auto-tracked symbols, saves new deals to tracked_deals.
 *
 * Fix: replaced internal fetch('/api/deals') with direct NSE call —
 * server-side routes cannot reliably call other Next.js routes via HTTP.
 */

const BASE = 'https://www.nseindia.com'
const H: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.nseindia.com/market-data/large-deals',
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
    await fetch(`${BASE}/market-data/large-deals`, {
      headers: {
        ...H,
        Cookie: _cookies,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    }).catch(() => {})
    _expiry = Date.now() + 10 * 60 * 1000
  } finally {
    _building = false
  }
  return _cookies
}

async function fetchDealsFromNSE(): Promise<{
  bulk: any[]
  block: any[]
  asOnDate: string
}> {
  const cookies = await getSession()
  const r = await fetch(`${BASE}/api/snapshot-capital-market-largedeal?type=bulk_deals`, {
    headers: { ...H, Cookie: cookies },
  })
  const raw = await r.text()
  if (!r.ok || raw.trimStart().startsWith('<')) {
    _cookies = ''
    _expiry = 0
    throw new Error(`NSE ${r.status} — session expired or blocked`)
  }
  const json = JSON.parse(raw)

  function norm(d: any, kind: 'bulk' | 'block') {
    const bs = (d.buySell || '').toString().toUpperCase().trim()
    const qty = +(d.qty || 0)
    const price = +(d.watp || 0)
    return {
      symbol: (d.symbol || '').trim(),
      name: (d.name || '').trim(),
      clientName: (d.clientName || '—').trim(),
      dealType: bs === 'BUY' ? 'BUY' : 'SELL',
      quantity: qty,
      tradePrice: price,
      value: +((qty * price) / 1e7).toFixed(2),
      date: (d.date || '').trim(),
      dealKind: kind,
    }
  }

  const bulk = (json?.BULK_DEALS_DATA || []).map((d: any) => norm(d, 'bulk'))
  const block = (json?.BLOCK_DEALS_DATA || []).map((d: any) => norm(d, 'block'))
  return { bulk, block, asOnDate: json?.as_on_date || '' }
}

export async function POST() {
  await ensureDB()
  try {
    // 1. Get all auto-tracked symbols
    const symResult = await turso.execute({
      sql: `SELECT symbol FROM tracked_symbols`,
      args: [],
    })
    const trackedSet = new Set(symResult.rows.map((r: any) => r.symbol as string))

    if (trackedSet.size === 0)
      return NextResponse.json({
        message: 'No symbols being tracked. Add symbols in Auto-Track tab first.',
        saved: 0,
        skipped: 0,
      })

    // 2. Fetch deals directly from NSE
    const { bulk, block, asOnDate } = await fetchDealsFromNSE()
    const allDeals = [...bulk, ...block]

    if (allDeals.length === 0)
      return NextResponse.json({
        message: 'No deals found from NSE today. Try after market close (3:30 PM IST).',
        saved: 0,
        skipped: 0,
        asOnDate,
      })

    // 3. Filter only tracked symbols
    const relevant = allDeals.filter((d: any) => trackedSet.has(d.symbol))

    if (relevant.length === 0)
      return NextResponse.json({
        message: `NSE has ${allDeals.length} deals today but none match your ${trackedSet.size} tracked symbol(s).`,
        saved: 0,
        skipped: 0,
        asOnDate,
        trackedSymbols: [...trackedSet],
        todaySymbols: [...new Set(allDeals.map((d: any) => d.symbol))].slice(0, 20),
      })

    // 4. Insert — skip exact duplicates
    let saved = 0
    let skipped = 0
    for (const d of relevant) {
      const existing = await turso.execute({
        sql: `SELECT id FROM tracked_deals WHERE symbol=? AND client_name=? AND deal_type=? AND deal_date=? AND quantity=? LIMIT 1`,
        args: [d.symbol, d.clientName, d.dealType, d.date, d.quantity],
      })
      if (existing.rows.length > 0) {
        skipped++
        continue
      }

      await turso.execute({
        sql: `INSERT INTO tracked_deals (symbol,name,client_name,deal_type,deal_kind,quantity,trade_price,value_cr,deal_date,saved_at)
              VALUES (?,?,?,?,?,?,?,?,?,?)`,
        args: [
          d.symbol,
          d.name,
          d.clientName,
          d.dealType,
          d.dealKind,
          d.quantity,
          d.tradePrice,
          d.value,
          d.date,
          new Date().toISOString(),
        ],
      })
      saved++
    }

    // 5. Update last_synced timestamp
    await turso.execute({
      sql: `UPDATE tracked_symbols SET last_synced = ?`,
      args: [new Date().toISOString()],
    })

    return NextResponse.json({
      success: true,
      saved,
      skipped,
      total: relevant.length,
      asOnDate,
      message: `Saved ${saved} new deals, skipped ${skipped} duplicates (${asOnDate})`,
    })
  } catch (e: any) {
    console.error('[sync error]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
