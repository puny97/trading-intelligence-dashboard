import { NextResponse } from 'next/server'
import { getToken, isTokenValid, clearToken } from '@/lib/tokenStore'

export async function GET(request: Request) {
  if (!isTokenValid()) {
    return NextResponse.json(
      {
        error: 'Not authenticated. Visit /api/auth/login',
        authenticated: false,
      },
      { status: 401 }
    )
  }

  const token = getToken()!
  const { searchParams } = new URL(request.url)
  const symbolsParam = searchParams.get('symbols') || ''
  const symbols = symbolsParam
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  if (!symbols.length) {
    return NextResponse.json({ error: 'No symbols provided' }, { status: 400 })
  }

  const BATCH = 50
  const batches: string[][] = []
  for (let i = 0; i < symbols.length; i += BATCH) {
    batches.push(symbols.slice(i, i + BATCH))
  }

  // Safe JSON parser — returns null instead of throwing if response is HTML/non-JSON
  async function safeJson(res: Response): Promise<any> {
    const text = await res.text()
    if (text.trimStart().startsWith('<')) {
      // Fyers returned HTML — token is invalid/expired
      console.error('[Fyers quotes] Got HTML response — token likely expired. Status:', res.status)
      clearToken()
      return null
    }
    try {
      return JSON.parse(text)
    } catch (e) {
      console.error('[Fyers quotes] JSON parse error:', text.slice(0, 100))
      return null
    }
  }

  try {
    const authHeader = `${token.clientId}:${token.accessToken}`

    const results = await Promise.all(
      batches.map(batch =>
        fetch(
          `https://api-t1.fyers.in/data/quotes?symbols=${encodeURIComponent(batch.join(','))}`,
          {
            headers: {
              Authorization: authHeader,
              'Content-Type': 'application/json',
            },
          }
        ).then(safeJson)
      )
    )

    // If any batch returned null (HTML/auth error) — signal re-login
    if (results.some(r => r === null)) {
      return NextResponse.json(
        {
          error: 'Fyers token expired or invalid. Please re-login.',
          authenticated: false,
        },
        { status: 401 }
      )
    }

    // Check Fyers-level auth error in response body
    const firstResult = results[0]
    if (firstResult?.s === 'error' || firstResult?.code === 'TOKEN_EXPIRED') {
      clearToken()
      return NextResponse.json(
        {
          error: firstResult?.message || 'Fyers token expired. Please re-login.',
          authenticated: false,
        },
        { status: 401 }
      )
    }

    const allQuotes: any[] = results.flatMap(r => r?.d || [])

    const stocks = allQuotes
      .filter(q => q?.s === 'ok' && q?.v)
      .map(q => {
        const v = q.v
        return {
          symbol: q.n,
          name: v.description || v.short_name || q.n,
          ltp: +(v.lp || 0),
          open: +(v.open_price || 0),
          high: +(v.high_price || 0),
          low: +(v.low_price || 0),
          prevClose: +(v.prev_close_price || 0),
          change: +(v.ch || 0),
          pChange: +(v.chp || 0),
          volume: +(v.volume || 0),
          exchange: v.exchange || 'NSE',
        }
      })

    return NextResponse.json({ stocks }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
