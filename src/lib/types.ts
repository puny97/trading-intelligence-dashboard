// ─── Shared Types ──────────────────────────────────────────────────────────────

export interface StockRow {
  symbol: string
  name: string
  ltp: number
  open: number
  high: number
  low: number
  prevClose: number
  change: number
  pChange: number
  volume: number
  turnover: number
  exchange: 'NSE' | 'BSE'
  // computed on client
  volRatio?: number
  speed?: number
}

export interface IndexData {
  label: string
  value: number
  change: number
  pChange: number
  isUp: boolean
}

export interface Alert {
  type: 'cyan' | 'green' | 'red' | 'yellow'
  time: string
  sym: string
  msg: string
  exchange: string
}

export type FetchStatus = 'idle' | 'loading' | 'ok' | 'error'

// ─── IST Helpers ───────────────────────────────────────────────────────────────

export function getIST(): Date {
  const now = new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000
  return new Date(utc + 3_600_000 * 5.5)
}

export function istTimeStr(ist: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(ist.getHours())}:${pad(ist.getMinutes())}:${pad(ist.getSeconds())}`
}

export function isMarketOpen(ist: Date): boolean {
  const day = ist.getDay()
  const total = ist.getHours() * 60 + ist.getMinutes()
  return day >= 1 && day <= 5 && total >= 9 * 60 + 15 && total <= 15 * 60 + 30
}

// ─── Formatting ────────────────────────────────────────────────────────────────

export function fmtVol(v: number): string {
  if (v >= 10_000_000) return (v / 10_000_000).toFixed(1) + ' Cr'
  if (v >= 100_000) return (v / 100_000).toFixed(1) + ' L'
  if (v >= 1_000) return (v / 1_000).toFixed(0) + ' K'
  return String(v)
}

export function fmtPrice(v: number): string {
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ─── Alert Builder ─────────────────────────────────────────────────────────────

export function buildAlerts(stocks: StockRow[], timeStr: string): Alert[] {
  const alerts: Alert[] = []

  for (const s of stocks) {
    const ratio = s.volRatio ?? 0
    const chg = s.pChange ?? 0
    const speed = s.speed ?? 0

    if (ratio > 5) {
      alerts.push({
        type: 'cyan',
        time: timeStr,
        sym: s.symbol,
        exchange: s.exchange,
        msg: `🔊 MEGA VOLUME SPURT — ${ratio.toFixed(1)}× avg volume! Watch for breakout.`,
      })
    } else if (ratio > 3 && Math.abs(chg) > 2) {
      alerts.push({
        type: chg > 0 ? 'green' : 'red',
        time: timeStr,
        sym: s.symbol,
        exchange: s.exchange,
        msg: `⚡ ${chg > 0 ? 'Bullish' : 'Bearish'} Volume Buzzer — ${ratio.toFixed(1)}× vol, ${Math.abs(chg).toFixed(1)}% move`,
      })
    }
    if (Math.abs(chg) > 3) {
      alerts.push({
        type: 'yellow',
        time: timeStr,
        sym: s.symbol,
        exchange: s.exchange,
        msg: `🚀 RAPID MOVER — ${chg > 0 ? '+' : ''}${chg.toFixed(2)}% on ${s.exchange}`,
      })
    }
  }

  return alerts.sort(() => 0.5 - Math.random()).slice(0, 4)
}
