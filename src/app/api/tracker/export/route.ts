import { turso, ensureDB } from "@/lib/turso";

/** GET /api/tracker/export?symbol=RELIANCE → download CSV */
export async function GET(request: Request) {
  await ensureDB();
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol")?.toUpperCase();

  try {
    const sql = symbol
      ? "SELECT * FROM tracked_deals WHERE symbol = ? ORDER BY deal_date DESC, saved_at DESC"
      : "SELECT * FROM tracked_deals ORDER BY deal_date DESC, saved_at DESC";
    const result = await turso.execute({ sql, args: symbol ? [symbol] : [] });

    const headers = [
      "id",
      "symbol",
      "name",
      "client_name",
      "deal_type",
      "deal_kind",
      "quantity",
      "trade_price",
      "value_cr",
      "deal_date",
      "saved_at",
    ];
    const rows = result.rows.map((r) =>
      headers
        .map((h) => {
          const v = (r as any)[h] ?? "";
          return typeof v === "string" && v.includes(",") ? `"${v}"` : v;
        })
        .join(","),
    );

    const csv = [headers.join(","), ...rows].join("\n");
    const filename = symbol ? `deals-${symbol}.csv` : "deals-all.csv";

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e: any) {
    return new Response(`error,${e.message}`, {
      status: 500,
      headers: { "Content-Type": "text/csv" },
    });
  }
}
