import { NextResponse } from "next/server";
import { turso, ensureDB } from "@/lib/turso";

/**
 * GET /api/tracker/symbols → list all tracked symbols with summary stats
 */
export async function GET() {
  await ensureDB();
  try {
    const result = await turso.execute({
      sql: `SELECT
              symbol,
              MAX(name) as name,
              COUNT(*)  as total_deals,
              SUM(CASE WHEN deal_type='BUY'  THEN quantity ELSE 0 END) as total_buy_qty,
              SUM(CASE WHEN deal_type='SELL' THEN quantity ELSE 0 END) as total_sell_qty,
              SUM(CASE WHEN deal_type='BUY'  THEN value_cr ELSE 0 END) as total_buy_cr,
              SUM(CASE WHEN deal_type='SELL' THEN value_cr ELSE 0 END) as total_sell_cr,
              MIN(deal_date) as first_seen,
              MAX(deal_date) as last_seen
            FROM tracked_deals
            GROUP BY symbol
            ORDER BY total_deals DESC`,
      args: [],
    });
    return NextResponse.json({ symbols: result.rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
