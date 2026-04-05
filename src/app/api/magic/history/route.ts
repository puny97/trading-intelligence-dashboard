import { NextResponse } from 'next/server'
import { turso, ensureDB } from '@/lib/turso'

/**
 * GET /api/magic/history
 *   ?from=YYYY-MM-DD  (default: 90 days ago)
 *   ?to=YYYY-MM-DD    (default: today)
 *   ?limit=N          (default: 500, max 2000)
 *   ?type=FLAT|POSITIVE|NEGATIVE  (filter by market type)
 *
 * Returns rows + backtest stats
 */
export async function GET(request: Request) {
  await ensureDB()
  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '500'), 2000)
  const from = searchParams.get('from') || ''
  const to = searchParams.get('to') || ''
  const mtype = searchParams.get('type') || ''

  try {
    // Build query
    const where: string[] = []
    const args: any[] = []
    if (from) {
      where.push('date >= ?')
      args.push(from)
    }
    if (to) {
      where.push('date <= ?')
      args.push(to)
    }
    if (mtype) {
      where.push('market_type = ?')
      args.push(mtype)
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : ''
    const rowsResult = await turso.execute({
      sql: `SELECT * FROM nifty_history ${whereClause} ORDER BY date DESC LIMIT ?`,
      args: [...args, limit],
    })

    // Backtest stats — always over entire DB
    const statsResult = await turso.execute({
      sql: `SELECT
              market_type,
              COUNT(*)                                    AS total,
              SUM(theory_ok)                              AS theory_correct,
              ROUND(AVG(day_range), 1)                    AS avg_range,
              ROUND(MIN(day_range), 1)                    AS min_range,
              ROUND(MAX(day_range), 1)                    AS max_range,
              ROUND(AVG(ABS(open_gap)), 1)                AS avg_gap,
              ROUND(AVG(ABS(points_moved)), 1)            AS avg_pts_moved
            FROM nifty_history
            WHERE market_type IS NOT NULL
            GROUP BY market_type`,
      args: [],
    })

    // Overall stats
    const overallResult = await turso.execute({
      sql: `SELECT
              COUNT(*)                  AS total_days,
              MIN(date)                 AS earliest,
              MAX(date)                 AS latest,
              SUM(theory_ok)            AS total_correct,
              ROUND(AVG(day_range), 1)  AS avg_range
            FROM nifty_history
            WHERE market_type IS NOT NULL`,
      args: [],
    })

    return NextResponse.json({
      rows: rowsResult.rows,
      count: rowsResult.rows.length,
      stats: statsResult.rows,
      overall: overallResult.rows[0],
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
