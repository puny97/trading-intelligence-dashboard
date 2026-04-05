import { createClient } from "@libsql/client";

declare global {
  var __turso: ReturnType<typeof createClient> | undefined;
}

function getClient() {
  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error("TURSO_DATABASE_URL not set in .env.local");
  if (!token) throw new Error("TURSO_AUTH_TOKEN not set in .env.local");
  return createClient({ url, authToken: token });
}

export const turso = global.__turso ?? (global.__turso = getClient());

export async function initDB() {
  await turso.batch(
    [
      // ── Deals tables (unchanged) ───────────────────────────────────────
      {
        sql: `CREATE TABLE IF NOT EXISTS tracked_deals (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol      TEXT NOT NULL,
        name        TEXT NOT NULL DEFAULT '',
        client_name TEXT NOT NULL DEFAULT '—',
        deal_type   TEXT NOT NULL,
        deal_kind   TEXT NOT NULL,
        quantity    INTEGER NOT NULL DEFAULT 0,
        trade_price REAL NOT NULL DEFAULT 0,
        value_cr    REAL NOT NULL DEFAULT 0,
        deal_date   TEXT NOT NULL,
        saved_at    TEXT NOT NULL
      )`,
        args: [],
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS tracked_symbols (
        symbol      TEXT PRIMARY KEY,
        name        TEXT NOT NULL DEFAULT '',
        added_at    TEXT NOT NULL,
        last_synced TEXT
      )`,
        args: [],
      },
      // ── Nifty history (for Magic Dashboard) ───────────────────────────
      // One row per trading day. 3:30 PM close extracted from 4hr candle.
      {
        sql: `CREATE TABLE IF NOT EXISTS nifty_history (
        date         TEXT PRIMARY KEY,  -- 'YYYY-MM-DD'
        open         REAL NOT NULL,     -- 9:15 AM open
        high         REAL NOT NULL,     -- day high
        low          REAL NOT NULL,     -- day low
        close_330    REAL NOT NULL,     -- 3:30 PM close (last 4hr candle)
        prev_close   REAL,              -- previous trading day close_330
        points_moved REAL,              -- close_330 - prev_close
        pct_moved    REAL,              -- % change from prev_close
        day_range    REAL,              -- high - low
        open_gap     REAL,              -- open - prev_close (gap up/down at open)
        open_gap_pct REAL,              -- open gap as % of prev_close
        market_type  TEXT,              -- FLAT / POSITIVE / NEGATIVE (based on open_gap)
        range_type   TEXT,              -- FLAT_RANGE / NORMAL_RANGE / EXTENDED
        theory_ok    INTEGER DEFAULT 0  -- 1 if range matched theory prediction
      )`,
        args: [],
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_td_symbol   ON tracked_deals(symbol)`,
        args: [],
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_td_date     ON tracked_deals(deal_date)`,
        args: [],
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_td_client   ON tracked_deals(client_name)`,
        args: [],
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_td_kind     ON tracked_deals(deal_kind)`,
        args: [],
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_nh_date     ON nifty_history(date)`,
        args: [],
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_nh_mtype    ON nifty_history(market_type)`,
        args: [],
      },
    ],
    "write",
  );
}

let _initialized = false;
export async function ensureDB() {
  if (_initialized) return;
  await initDB();
  _initialized = true;
}
