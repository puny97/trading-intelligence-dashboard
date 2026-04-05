import { NextResponse } from 'next/server'
import { getToken, isTokenValid } from '@/lib/tokenStore'
import { turso, ensureDB } from '@/lib/turso'
import {
  groupCandlesByDay,
  fillDerivedFields,
  dateToUnix,
  addDays,
  todayIST,
  type RawCandle,
} from '@/lib/niftyHistory'

/**
 * POST /api/magic/import
 * One-time bulk import of Nifty 4hr candles from Fyers.
 * Fetches data in 100-day windows from startDate to today.
 * Stores processed daily rows in nifty_history table.
 *
 * Body: { startDate: 'YYYY-MM-DD', resume?: boolean }
 *   startDate: defaults to '2018-01-01'
 *   resume: if true, skip dates already in DB (default true)
 *
 * Returns SSE stream so frontend can show progress in real time.
 */

const SYMBOL = 'NSE:NIFTY50-INDEX'
const RESOLUTION = '240' // 4 hour
const WINDOW = 90 // days per request (safe under 100 limit)

async function fetchFyersWindow(
  token: { clientId: string; accessToken: string },
  from: number,
  to: number
): Promise<RawCandle[]> {
  const authHeader = `${token.clientId}:${token.accessToken}`
  const url =
    `https://api-t1.fyers.in/data/history?` +
    `symbol=${encodeURIComponent(SYMBOL)}` +
    `&resolution=${RESOLUTION}` +
    `&date_format=0` +
    `&range_from=${from}` +
    `&range_to=${to}` +
    `&cont_flag=1`

  const res = await fetch(url, { headers: { Authorization: authHeader } })
  const json = await res.json()

  if (json.s !== 'ok') throw new Error(`Fyers error: ${json.message || JSON.stringify(json)}`)

  return (json.candles || []).map(([t, o, h, l, c, v]: number[]) => ({
    time: t,
    open: o,
    high: h,
    low: l,
    close: c,
    volume: v,
  }))
}

export async function POST(request: Request) {
  if (!isTokenValid())
    return NextResponse.json(
      { error: 'Not authenticated with Fyers', authenticated: false },
      { status: 401 }
    )

  const body = await request.json().catch(() => ({}))
  const startDate = body.startDate || '2018-01-01'
  const resume = body.resume !== false // default true

  await ensureDB()
  const token = getToken()!

  // Get already-imported dates if resuming
  let existingDates = new Set<string>()
  if (resume) {
    const existing = await turso.execute({
      sql: 'SELECT date FROM nifty_history',
      args: [],
    })
    existingDates = new Set(existing.rows.map((r: any) => r.date as string))
  }

  // Build list of 90-day windows from startDate to today
  const today = todayIST()
  const windows: { from: string; to: string }[] = []
  let cursor = startDate
  while (cursor < today) {
    const to = addDays(cursor, WINDOW - 1) > today ? today : addDays(cursor, WINDOW - 1)
    windows.push({ from: cursor, to })
    cursor = addDays(to, 1)
  }

  // Stream progress via SSE
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      send({ type: 'start', total: windows.length, startDate, resume })

      let totalSaved = 0
      let totalSkipped = 0
      let allRows: any[] = []

      try {
        for (let i = 0; i < windows.length; i++) {
          const w = windows[i]
          send({
            type: 'progress',
            window: i + 1,
            total: windows.length,
            from: w.from,
            to: w.to,
          })

          // Fetch candles for this window
          const fromTs = dateToUnix(w.from)
          const toTs = dateToUnix(addDays(w.to, 1)) // end of day

          let candles: RawCandle[] = []
          try {
            candles = await fetchFyersWindow(token, fromTs, toTs)
            // Throttle — avoid hitting rate limits
            await new Promise(r => setTimeout(r, 350))
          } catch (e: any) {
            send({
              type: 'warning',
              message: `Window ${w.from}→${w.to}: ${e.message}`,
            })
            await new Promise(r => setTimeout(r, 2000)) // back off on error
            continue
          }

          if (!candles.length) {
            send({
              type: 'info',
              message: `No candles in window ${w.from}→${w.to}`,
            })
            continue
          }

          // Group into daily rows
          const dayMap = groupCandlesByDay(candles)
          const dayRows = [...dayMap.values()]

          // Collect for cross-window prev_close calculation
          allRows.push(...dayRows)

          const newRows = dayRows.filter(r => !existingDates.has(r.date))
          totalSkipped += dayRows.length - newRows.length

          send({
            type: 'window_done',
            from: w.from,
            to: w.to,
            candles: candles.length,
            days: dayRows.length,
            new: newRows.length,
          })
        }

        // Fill derived fields (prev_close, gap, market_type) across entire dataset
        send({
          type: 'processing',
          message: 'Computing prev_close, open_gap, market_type for all rows…',
        })
        allRows = fillDerivedFields(allRows)

        // Filter only new rows (not already in DB)
        const rowsToInsert = allRows.filter(r => !existingDates.has(r.date))

        // Batch insert into Turso (50 at a time)
        const BATCH = 50
        for (let i = 0; i < rowsToInsert.length; i += BATCH) {
          const chunk = rowsToInsert.slice(i, i + BATCH)
          await turso.batch(
            chunk.map(r => ({
              sql: `INSERT OR REPLACE INTO nifty_history
                      (date, open, high, low, close_330, prev_close, points_moved, pct_moved,
                       day_range, open_gap, open_gap_pct, market_type, range_type, theory_ok)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              args: [
                r.date,
                r.open,
                r.high,
                r.low,
                r.close_330,
                r.prev_close,
                r.points_moved,
                r.pct_moved,
                r.day_range,
                r.open_gap,
                r.open_gap_pct,
                r.market_type,
                r.range_type,
                r.theory_ok,
              ],
            })),
            'write'
          )
          totalSaved += chunk.length
          send({
            type: 'inserting',
            saved: totalSaved,
            total: rowsToInsert.length,
          })
        }

        // Final summary
        const countResult = await turso.execute({
          sql: 'SELECT COUNT(*) as cnt FROM nifty_history',
          args: [],
        })
        const totalInDB = (countResult.rows[0] as any).cnt

        send({
          type: 'done',
          totalSaved,
          totalSkipped,
          totalInDB,
          message: `Import complete! ${totalSaved} new days saved. ${totalInDB} total days in DB.`,
        })
      } catch (e: any) {
        send({ type: 'error', message: e.message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
