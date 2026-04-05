import { NextResponse } from 'next/server'
import { turso, ensureDB } from '@/lib/turso'

/**
 * GET /api/tracker/clients              → all clients ranked by activity
 * GET /api/tracker/clients?client=NAME  → all deals for a specific client
 */
export async function GET(request: Request) {
  await ensureDB()
  const { searchParams } = new URL(request.url)
  const client = searchParams.get('client')

  try {
    if (client) {
      // All deals for a specific client across all symbols
      const result = await turso.execute({
        sql: `SELECT * FROM tracked_deals WHERE client_name = ? ORDER BY deal_date ASC, saved_at ASC`,
        args: [client],
      })
      return NextResponse.json({
        deals: result.rows,
        count: result.rows.length,
      })
    }

    // Client profile summary — ranked by total value + deal count
    const result = await turso.execute({
      sql: `SELECT
              client_name,
              COUNT(DISTINCT symbol)                                          as symbol_count,
              COUNT(*)                                                        as total_deals,
              SUM(CASE WHEN deal_type='BUY'  THEN quantity ELSE 0 END)       as total_buy_qty,
              SUM(CASE WHEN deal_type='SELL' THEN quantity ELSE 0 END)       as total_sell_qty,
              SUM(CASE WHEN deal_type='BUY'  THEN value_cr ELSE 0 END)       as total_buy_cr,
              SUM(CASE WHEN deal_type='SELL' THEN value_cr ELSE 0 END)       as total_sell_cr,
              GROUP_CONCAT(DISTINCT symbol)                                   as symbols,
              MIN(deal_date)                                                  as first_seen,
              MAX(deal_date)                                                  as last_seen
            FROM tracked_deals
            WHERE client_name != '—'
            GROUP BY client_name
            ORDER BY total_deals DESC, (total_buy_cr + total_sell_cr) DESC
            LIMIT 100`,
      args: [],
    })
    return NextResponse.json({ clients: result.rows })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
