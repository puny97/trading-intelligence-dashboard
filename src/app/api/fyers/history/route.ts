import { NextResponse } from 'next/server'
import { getToken, isTokenValid } from '@/lib/tokenStore'

/**
 * GET /api/fyers/history?symbol=NSE:SBIN-EQ&resolution=5&days=1
 *
 * resolution: 1=1min, 2=2min, 3=3min, 5=5min, 10, 15, 20, 30, 60, 120, 240, D, W, M
 * days: how many calendar days back to fetch (default 1)
 *
 * Fyers history response:
 * {
 *   s: "ok",
 *   candles: [[timestamp, open, high, low, close, volume], ...]
 * }
 */

export async function GET(request: Request) {
  if (!isTokenValid()) {
    return NextResponse.json({ error: 'Not authenticated', authenticated: false }, { status: 401 })
  }

  const token = getToken()!
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get('symbol') || 'NSE:NIFTY50-INDEX'
  const resolution = searchParams.get('resolution') || '5'
  const days = parseInt(searchParams.get('days') || '1')

  const now = Math.floor(Date.now() / 1000)
  const from = now - days * 24 * 60 * 60

  try {
    const authHeader = `${token.clientId}:${token.accessToken}`
    const url =
      `https://api-t1.fyers.in/data/history?` +
      `symbol=${encodeURIComponent(symbol)}` +
      `&resolution=${resolution}` +
      `&date_format=0` +
      `&range_from=${from}` +
      `&range_to=${now}` +
      `&cont_flag=1`

    const res = await fetch(url, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
    })
    const json = await res.json()

    if (json.s !== 'ok') {
      return NextResponse.json(
        { error: json.message || 'History fetch failed', raw: json },
        { status: 500 }
      )
    }

    // Convert to OHLCV objects for charting
    const seen = new Set<number>()
    const candles = (json.candles || [])
      .map(([t, o, h, l, c, v]: number[]) => ({
        time: t, // Unix timestamp
        open: o,
        high: h,
        low: l,
        close: c,
        volume: v,
      }))
      .sort((a: any, b: any) => a.time - b.time)
      .filter((c: any) => {
        if (seen.has(c.time)) return false
        seen.add(c.time)
        return true
      })

    return NextResponse.json(
      { symbol, resolution, candles },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    )
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
