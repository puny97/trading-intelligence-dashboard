import { NextResponse } from 'next/server'
import { turso, ensureDB } from '@/lib/turso'

/**
 * GET  /api/tracker/auto          → list all auto-tracked symbols
 * POST /api/tracker/auto          → add a symbol to auto-track list
 * DELETE /api/tracker/auto?symbol=X → remove symbol from auto-track
 *
 * POST /api/tracker/auto/sync     → sync: fetch today's deals from NSE for all tracked symbols
 *                                   and save any new ones to tracked_deals
 */

export async function GET() {
  await ensureDB()
  try {
    const result = await turso.execute({
      sql: `SELECT ts.*, 
              COUNT(td.id) as deal_count,
              MAX(td.deal_date) as last_deal_date
            FROM tracked_symbols ts
            LEFT JOIN tracked_deals td ON td.symbol = ts.symbol
            GROUP BY ts.symbol
            ORDER BY ts.added_at DESC`,
      args: [],
    })
    return NextResponse.json({ symbols: result.rows })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  await ensureDB()
  try {
    const body = await request.json()
    const { symbol, name } = body
    if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

    await turso.execute({
      sql: `INSERT OR IGNORE INTO tracked_symbols (symbol, name, added_at) VALUES (?, ?, ?)`,
      args: [symbol.toUpperCase(), name || '', new Date().toISOString()],
    })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  await ensureDB()
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get('symbol')?.toUpperCase()
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })
  try {
    await turso.execute({
      sql: `DELETE FROM tracked_symbols WHERE symbol = ?`,
      args: [symbol],
    })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
