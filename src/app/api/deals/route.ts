import { NextResponse } from 'next/server'

const BASE = 'https://www.nseindia.com'
const H: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  Referer: 'https://www.nseindia.com/market-data/large-deals',
  'X-Requested-With': 'XMLHttpRequest',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  Connection: 'keep-alive',
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
    const r1 = await fetch(BASE, {
      headers: {
        'User-Agent': H['User-Agent'],
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    const parts: string[] =
      typeof (r1.headers as any).getSetCookie === 'function'
        ? (r1.headers as any).getSetCookie()
        : (r1.headers.get('set-cookie') || '').split(/,(?=[^ ;,]+=)/)
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

async function nseGet(path: string): Promise<any> {
  const cookies = await getSession()
  const r = await fetch(`${BASE}${path}`, {
    headers: { ...H, Cookie: cookies },
  })
  const raw = await r.text()
  if (!r.ok || raw.trimStart().startsWith('<')) {
    _cookies = ''
    _expiry = 0
    throw new Error(`NSE ${r.status} — session expired`)
  }
  return JSON.parse(raw)
}

/**
 * Confirmed from live debug response — SINGLE endpoint returns ALL deal types:
 *   json.BULK_DEALS_DATA   → bulk deals   (fields: date,symbol,name,clientName,buySell,qty,watp,remarks)
 *   json.BLOCK_DEALS_DATA  → block deals
 *   json.SHORT_DEALS_DATA  → short selling
 * Both ?type=bulk_deals and ?type=block_deals return the same full response.
 * So we only need ONE fetch and extract all keys from it.
 */
function norm(d: any) {
  const bs = (d.buySell || '').toString().toUpperCase().trim()
  const qty = +(d.qty || 0)
  const price = +(d.watp || 0) // watp = weighted average trade price
  return {
    symbol: (d.symbol || '').trim(),
    name: (d.name || '').trim(),
    clientName: (d.clientName || '—').trim(),
    dealType: bs === 'BUY' ? 'BUY' : 'SELL',
    quantity: qty,
    tradePrice: price,
    value: +((qty * price) / 1e7).toFixed(2), // Crores
    date: (d.date || '').trim(),
    remarks: d.remarks && d.remarks !== '-' ? d.remarks.trim() : '',
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') || 'both'

  try {
    // ONE fetch gives us all deal types
    const json = await nseGet('/api/snapshot-capital-market-largedeal?type=bulk_deals')

    const bulk = (json?.BULK_DEALS_DATA || []).map(norm)
    const block = (json?.BLOCK_DEALS_DATA || []).map(norm)
    const short = (json?.SHORT_DEALS_DATA || []).map(norm)
    const asOnDate = json?.as_on_date || ''

    if (type === 'bulk')
      return NextResponse.json(
        { data: bulk, count: bulk.length, asOnDate },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    if (type === 'block')
      return NextResponse.json(
        { data: block, count: block.length, asOnDate },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    if (type === 'short')
      return NextResponse.json(
        { data: short, count: short.length, asOnDate },
        { headers: { 'Cache-Control': 'no-store' } }
      )

    return NextResponse.json(
      {
        bulk,
        block,
        short,
        bulkCount: bulk.length,
        blockCount: block.length,
        shortCount: short.length,
        asOnDate,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (e: any) {
    console.error('[deals error]', e.message)
    return NextResponse.json(
      { error: e.message, bulk: [], block: [], short: [], data: [] },
      { status: 500 }
    )
  }
}
