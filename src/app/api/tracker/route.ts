import { NextResponse } from "next/server";
import { turso, ensureDB } from "@/lib/turso";

export async function GET(request: Request) {
  await ensureDB();
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol")?.toUpperCase().trim();
  const kind = searchParams.get("kind");
  const limit = Math.min(parseInt(searchParams.get("limit") || "1000"), 2000);

  try {
    let sql = "SELECT * FROM tracked_deals";
    const args: any[] = [];
    const where: string[] = [];
    if (symbol) {
      where.push("symbol = ?");
      args.push(symbol);
    }
    if (kind) {
      where.push("deal_kind = ?");
      args.push(kind);
    }
    if (where.length) sql += " WHERE " + where.join(" AND ");
    // Chronological for timeline — oldest first grouped by date
    sql += " ORDER BY deal_date ASC, saved_at ASC LIMIT ?";
    args.push(limit);

    const result = await turso.execute({ sql, args });
    return NextResponse.json({ deals: result.rows, count: result.rows.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  await ensureDB();
  try {
    const body = await request.json();
    const {
      symbol,
      name,
      clientName,
      dealType,
      dealKind,
      quantity,
      tradePrice,
      valueCr,
      dealDate,
    } = body;

    if (!symbol || !dealType || !dealKind || !dealDate)
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );

    // Deduplicate
    const existing = await turso.execute({
      sql: `SELECT id FROM tracked_deals WHERE symbol=? AND client_name=? AND deal_type=? AND deal_date=? AND quantity=? LIMIT 1`,
      args: [symbol, clientName || "—", dealType, dealDate, quantity || 0],
    });
    if (existing.rows.length > 0)
      return NextResponse.json({
        message: "Already tracked",
        id: existing.rows[0].id,
        duplicate: true,
      });

    const result = await turso.execute({
      sql: `INSERT INTO tracked_deals (symbol,name,client_name,deal_type,deal_kind,quantity,trade_price,value_cr,deal_date,saved_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)`,
      args: [
        symbol.toUpperCase(),
        name || "",
        clientName || "—",
        dealType,
        dealKind,
        quantity || 0,
        tradePrice || 0,
        valueCr || 0,
        dealDate,
        new Date().toISOString(),
      ],
    });
    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * DELETE /api/tracker?symbol=RELIANCE  → delete all deals for a symbol
 * DELETE /api/tracker?all=true         → delete everything
 * DELETE /api/tracker?before=13-Mar-2026 → delete deals older than date
 */
export async function DELETE(request: Request) {
  await ensureDB();
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol")?.toUpperCase();
  const all = searchParams.get("all") === "true";
  const before = searchParams.get("before"); // deal_date string e.g. "13-Mar-2026"

  try {
    let sql = "";
    const args: any[] = [];

    if (all) {
      // Delete everything including tracked_symbols
      await turso.batch(
        [
          { sql: "DELETE FROM tracked_deals", args: [] },
          { sql: "DELETE FROM tracked_symbols", args: [] },
        ],
        "write",
      );
      return NextResponse.json({ success: true, message: "All data deleted" });
    }

    if (symbol && before) {
      sql = `DELETE FROM tracked_deals WHERE symbol = ? AND deal_date <= ?`;
      args.push(symbol, before);
    } else if (symbol) {
      sql = `DELETE FROM tracked_deals WHERE symbol = ?`;
      args.push(symbol);
      // Also remove from auto-track if no deals remain
      await turso.execute({
        sql: "DELETE FROM tracked_symbols WHERE symbol = ?",
        args: [symbol],
      });
    } else if (before) {
      sql = `DELETE FROM tracked_deals WHERE deal_date <= ?`;
      args.push(before);
    } else {
      return NextResponse.json(
        { error: "Provide symbol, all=true, or before=date" },
        { status: 400 },
      );
    }

    const result = await turso.execute({ sql, args });
    return NextResponse.json({
      success: true,
      rowsDeleted: result.rowsAffected,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
