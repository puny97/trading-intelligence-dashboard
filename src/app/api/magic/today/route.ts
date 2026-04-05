import { NextResponse } from 'next/server'
import { getToken, isTokenValid } from '@/lib/tokenStore'
import { turso, ensureDB } from '@/lib/turso'
import { groupCandlesByDay, fillDerivedFields, todayIST, type RawCandle } from '@/lib/niftyHistory'

/**
 * POST /api/magic/today
 * Fetches today's 4hr candles from Fyers, computes day row,
 * upserts into nifty_history. Call this after 3:30 PM daily.
 *
 * Also used to get live intraday data (partial day).
 */
export async function POST() {
  if (!isTokenValid())
    return NextResponse.json({ error: 'Not authenticated', authenticated: false }, { status: 401 })

  await ensureDB()
  const token = getToken()!

  try {
    const today = todayIST()
    const now = Math.floor(Date.now() / 1000)
    const from = now - 2 * 24 * 3600 // 2 days back to get prev_close context

    const authHeader = `${token.clientId}:${token.accessToken}`
    const url =
      `https://api-t1.fyers.in/data/history?` +
      `symbol=${encodeURIComponent('NSE:NIFTY50-INDEX')}` +
      `&resolution=240&date_format=0` +
      `&range_from=${from}&range_to=${now}&cont_flag=1`

    const res = await fetch(url, { headers: { Authorization: authHeader } })
    const json = await res.json()
    if (json.s !== 'ok') throw new Error(json.message || 'Fyers error')

    const candles: RawCandle[] = (json.candles || []).map(([t, o, h, l, c, v]: number[]) => ({
      time: t,
      open: o,
      high: h,
      low: l,
      close: c,
      volume: v,
    }))

    const dayMap = groupCandlesByDay(candles)
    const rows = fillDerivedFields([...dayMap.values()])

    // Get today's row (may be partial if market still open)
    const todayRow = rows.find(r => r.date === today)
    if (!todayRow) return NextResponse.json({ error: 'No data for today yet', today })

    // Upsert today's row
    await turso.execute({
      sql: `INSERT OR REPLACE INTO nifty_history
              (date,open,high,low,close_330,prev_close,points_moved,pct_moved,
               day_range,open_gap,open_gap_pct,market_type,range_type,theory_ok)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        todayRow.date,
        todayRow.open,
        todayRow.high,
        todayRow.low,
        todayRow.close_330,
        todayRow.prev_close,
        todayRow.points_moved,
        todayRow.pct_moved,
        todayRow.day_range,
        todayRow.open_gap,
        todayRow.open_gap_pct,
        todayRow.market_type,
        todayRow.range_type,
        todayRow.theory_ok,
      ],
    })

    return NextResponse.json({ success: true, row: todayRow })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
