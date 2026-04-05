/**
 * Shared logic for processing Fyers 4hr candles into daily Nifty rows.
 *
 * Why 4hr candles?
 *   NSE trades 9:15 AM – 3:30 PM (6h 15min).
 *   4hr candles: candle1 = 9:15–1:15, candle2 = 1:15–3:30 (close = exact 3:30 PM)
 *   Daily candles close at 3:45 PM (auction average) — NOT what we want.
 *
 * Theory (from Magic Course):
 *   Market direction based on open_gap (today open – prev close):
 *     FLAT:     -40 to +40 pts gap       → expected range 72–84 pts
 *     POSITIVE: gap > +40 pts             → expected range 135–150 pts
 *     NEGATIVE: gap < -40 pts             → expected range 135–150 pts
 *
 *   Range classification from actual H-L:
 *     FLAT_RANGE:   ≤ 84 pts
 *     NORMAL_RANGE: 85–210 pts
 *     EXTENDED:     > 210 pts
 */

export interface DayRow {
  date: string; // YYYY-MM-DD
  open: number; // 9:15 AM open
  high: number; // day high
  low: number; // day low
  close_330: number; // 3:30 PM close
  prev_close: number | null;
  points_moved: number | null;
  pct_moved: number | null;
  day_range: number;
  open_gap: number | null; // open - prev_close
  open_gap_pct: number | null;
  market_type: "FLAT" | "POSITIVE" | "NEGATIVE" | null;
  range_type: "FLAT_RANGE" | "NORMAL_RANGE" | "EXTENDED";
  theory_ok: number; // 1 = theory range matched actual range
}

export interface RawCandle {
  time: number; // unix timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Convert unix timestamp → IST date string YYYY-MM-DD */
export function toISTDate(ts: number): string {
  // IST = UTC + 5:30
  const ist = new Date((ts + 5.5 * 3600) * 1000);
  return ist.toISOString().slice(0, 10);
}

/** Convert unix timestamp → IST hour (0-23) */
export function toISTHour(ts: number): number {
  return new Date((ts + 5.5 * 3600) * 1000).getUTCHours();
}

/** Convert unix timestamp → IST minute */
export function toISTMinute(ts: number): number {
  return new Date((ts + 5.5 * 3600) * 1000).getUTCMinutes();
}

/**
 * Group 4hr candles by trading day and extract:
 *   open  = first candle's open (≈ 9:15 AM)
 *   high  = max high across all candles that day
 *   low   = min low across all candles that day
 *   close = last candle's close (≈ 3:30 PM)
 */
export function groupCandlesByDay(candles: RawCandle[]): Map<string, DayRow> {
  // Group candles by IST date
  const byDate = new Map<string, RawCandle[]>();
  for (const c of candles) {
    const date = toISTDate(c.time);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(c);
  }

  const days = new Map<string, DayRow>();
  for (const [date, dc] of byDate.entries()) {
    // Sort by timestamp
    dc.sort((a, b) => a.time - b.time);

    const open = dc[0].open;
    const high = Math.max(...dc.map((c) => c.high));
    const low = Math.min(...dc.map((c) => c.low));
    const close_330 = dc[dc.length - 1].close; // last candle = 3:30 PM close
    const day_range = +(high - low).toFixed(2);

    // Range classification
    let range_type: DayRow["range_type"];
    if (day_range <= 84) range_type = "FLAT_RANGE";
    else if (day_range <= 210) range_type = "NORMAL_RANGE";
    else range_type = "EXTENDED";

    days.set(date, {
      date,
      open,
      high,
      low,
      close_330,
      prev_close: null,
      points_moved: null,
      pct_moved: null,
      day_range,
      open_gap: null,
      open_gap_pct: null,
      market_type: null,
      range_type,
      theory_ok: 0,
    });
  }

  return days;
}

/**
 * Fill prev_close, points_moved, open_gap, market_type, theory_ok
 * for an array of DayRows sorted by date ascending.
 */
export function fillDerivedFields(rows: DayRow[]): DayRow[] {
  // Sort ascending
  rows.sort((a, b) => a.date.localeCompare(b.date));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const prev = i > 0 ? rows[i - 1] : null;

    if (prev) {
      row.prev_close = prev.close_330;
      row.points_moved = +(row.close_330 - prev.close_330).toFixed(2);
      row.pct_moved = +((row.points_moved / prev.close_330) * 100).toFixed(3);
      row.open_gap = +(row.open - prev.close_330).toFixed(2);
      row.open_gap_pct = +((row.open_gap / prev.close_330) * 100).toFixed(3);

      // Market type based on open gap (theory: ±40 pts = flat)
      if (row.open_gap > 40) row.market_type = "POSITIVE";
      else if (row.open_gap < -40) row.market_type = "NEGATIVE";
      else row.market_type = "FLAT";

      // Theory validation:
      // FLAT → expected range 72-84 pts, theory_ok if range ≤ 100 pts
      // POSITIVE/NEGATIVE → expected range 135-150 pts, theory_ok if range 100-210 pts
      if (row.market_type === "FLAT") {
        row.theory_ok = row.day_range <= 100 ? 1 : 0;
      } else {
        row.theory_ok = row.day_range >= 100 && row.day_range <= 210 ? 1 : 0;
      }
    }
  }

  return rows;
}

/** Date string YYYY-MM-DD → Unix timestamp at IST midnight (00:00 IST = 18:30 UTC prev day) */
export function dateToUnix(dateStr: string): number {
  // Parse as UTC midnight, then subtract 5.5 hours to get IST midnight
  return (
    Math.floor(new Date(dateStr + "T00:00:00Z").getTime() / 1000) - 5.5 * 3600
  );
}

/** Add N days to a YYYY-MM-DD string */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Today's date in YYYY-MM-DD (IST) */
export function todayIST(): string {
  return toISTDate(Math.floor(Date.now() / 1000));
}
