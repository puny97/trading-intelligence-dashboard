'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  StockRow,
  IndexData,
  Alert,
  FetchStatus,
  getIST,
  istTimeStr,
  isMarketOpen,
  buildAlerts,
} from '@/lib/types'
import StockPanel from '@/components/StockPanel'

type Exchange = 'NSE' | 'BSE'

interface DataState {
  gainers: StockRow[]
  losers: StockRow[]
  active: StockRow[]
  indices: IndexData[]
  status: FetchStatus
  error?: string
  hint?: string
}

const EMPTY: DataState = {
  gainers: [],
  losers: [],
  active: [],
  indices: [],
  status: 'idle',
}

async function callAPI(exchange: string, type: string): Promise<any> {
  const res = await fetch(`/api/${exchange.toLowerCase()}?type=${type}`, {
    cache: 'no-store',
  })
  const json = await res.json()
  if (!res.ok)
    throw Object.assign(new Error(json.error || `HTTP ${res.status}`), {
      hint: json.hint,
    })
  return json
}

function enrichWithRatio(stocks: StockRow[]): StockRow[] {
  if (!stocks.length) return stocks
  const avgVol = stocks.reduce((s, r) => s + r.volume, 0) / stocks.length
  return stocks.map(s => ({
    ...s,
    volRatio: avgVol > 0 ? parseFloat((s.volume / avgVol).toFixed(2)) : 0,
  }))
}

// Build a lookup map from symbol → StockRow for flash comparison
function toMap(stocks: StockRow[]): Map<string, StockRow> {
  const m = new Map<string, StockRow>()
  stocks.forEach(s => m.set(s.symbol, s))
  return m
}

export default function Dashboard() {
  const [exchange, setExchange] = useState<Exchange>('NSE')
  const [nseData, setNseData] = useState<DataState>(EMPTY)
  const [bseData, setBseData] = useState<DataState>(EMPTY)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [spinning, setSpinning] = useState(false)
  const [clock, setClock] = useState('')
  const [marketOpen, setMarketOpen] = useState(false)
  const [lastScan, setLastScan] = useState('--:--:--')
  const [countdown, setCountdown] = useState(15)

  // Previous snapshot maps for flash detection
  const prevNse = useRef<{
    gainers: Map<string, StockRow>
    losers: Map<string, StockRow>
    active: Map<string, StockRow>
  }>({
    gainers: new Map(),
    losers: new Map(),
    active: new Map(),
  })
  const prevBse = useRef<{
    gainers: Map<string, StockRow>
    losers: Map<string, StockRow>
    active: Map<string, StockRow>
  }>({
    gainers: new Map(),
    losers: new Map(),
    active: new Map(),
  })

  const alertsRef = useRef<Alert[]>([])
  const current = exchange === 'NSE' ? nseData : bseData
  const prevMaps = exchange === 'NSE' ? prevNse.current : prevBse.current

  // ── Clock ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const ist = getIST()
      setClock(`${istTimeStr(ist)} IST`)
      setMarketOpen(isMarketOpen(ist))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // ── Load NSE — single call, returns everything ──────────────────────────
  const loadNSE = useCallback(async () => {
    setNseData(d => ({
      ...d,
      status: 'loading',
      error: undefined,
      hint: undefined,
    }))
    try {
      // ONE fetch to /api/nse?type=all — does 2 NSE requests server-side
      // instead of browser firing 4 separate /api/nse?type=X calls
      const res = await fetch('/api/nse?type=all', { cache: 'no-store' })
      const json = await res.json()

      const gainers = enrichWithRatio(json.gainers || [])
      const losers = enrichWithRatio(json.losers || [])
      const active = enrichWithRatio(json.active || [])
      const indices = json.indices || []

      prevNse.current = {
        gainers: toMap(gainers),
        losers: toMap(losers),
        active: toMap(active),
      }

      setNseData({
        gainers,
        losers,
        active,
        indices,
        status:
          gainers.length || losers.length || active.length ? 'ok' : json.error ? 'error' : 'ok',
        error: json.error,
      })

      if (gainers.length || active.length) {
        const ist = getIST()
        const timeStr = istTimeStr(ist)
        const newA = buildAlerts([...gainers, ...active].slice(0, 30), timeStr)
        alertsRef.current = [...newA, ...alertsRef.current].slice(0, 20)
        setAlerts([...alertsRef.current])
        setLastScan(timeStr)
      }
    } catch (e: any) {
      setNseData(d => ({ ...d, status: 'error', error: e.message }))
    }
  }, [])

  // ── Load BSE ──────────────────────────────────────────────────────────────
  const loadBSE = useCallback(async () => {
    setBseData(d => ({ ...d, status: 'loading', error: undefined }))
    try {
      const [gainersRes, losersRes, activeRes] = await Promise.allSettled([
        callAPI('bse', 'gainers'),
        callAPI('bse', 'losers'),
        callAPI('bse', 'active'),
      ])

      const gainers =
        gainersRes.status === 'fulfilled' ? enrichWithRatio(gainersRes.value.stocks || []) : []
      const losers =
        losersRes.status === 'fulfilled' ? enrichWithRatio(losersRes.value.stocks || []) : []
      const active =
        activeRes.status === 'fulfilled' ? enrichWithRatio(activeRes.value.stocks || []) : []

      prevBse.current = {
        gainers: toMap(gainers),
        losers: toMap(losers),
        active: toMap(active),
      }
      setBseData({ gainers, losers, active, indices: [], status: 'ok' })
    } catch (e: any) {
      setBseData(d => ({ ...d, status: 'error', error: e.message }))
    }
  }, [])

  // ── Refresh all — guarded, sequential (BSE fast → NSE slow) ─────────────
  const INTERVAL = 15
  const inFlight = useRef(false)
  const countRef = useRef(INTERVAL)

  const refreshAll = useCallback(
    async (animate = true) => {
      if (inFlight.current) {
        console.log('[Dashboard] Skipping refresh — previous fetch still in flight')
        return
      }
      inFlight.current = true
      if (animate) setSpinning(true)
      // BSE resolves in ~100ms, load it first so panels populate fast
      // NSE can take 2-5s, load sequentially so requests don't pile up
      await loadBSE()
      await loadNSE()
      if (animate) setSpinning(false)
      inFlight.current = false
    },
    [loadNSE, loadBSE]
  )

  // ── Countdown + auto-refresh (single interval, no duplicate timers) ───────
  useEffect(() => {
    refreshAll(false)
    countRef.current = INTERVAL
    setCountdown(INTERVAL)

    const id = setInterval(() => {
      countRef.current -= 1
      if (countRef.current <= 0) {
        countRef.current = INTERVAL
        refreshAll(false)
      }
      setCountdown(countRef.current)
    }, 1000)

    return () => clearInterval(id)
  }, [refreshAll])

  const buzzers = [...current.active]
    .sort((a, b) => (b.volRatio ?? 0) - (a.volRatio ?? 0))
    .slice(0, 12)

  const fmtIdx = (n: number, label: string) =>
    label === 'INDIA VIX' ? n.toFixed(2) : n.toLocaleString('en-IN', { maximumFractionDigits: 0 })

  return (
    <>
      <div className="grid-bg" />
      <div className="container">
        {/* ── Header ── */}
        <header className="header">
          <div className="logo-area">
            <h1>⚡ NSE · BSE VOLUME BUZZER</h1>
            <p>Real-time Volume Spurt &amp; Rapid Mover Scanner</p>
          </div>
          <div className="header-right">
            <div className="market-status">
              <div className={`status-dot ${marketOpen ? '' : 'closed'}`} />
              <span style={{ color: marketOpen ? 'var(--green)' : 'var(--muted)' }}>
                {marketOpen ? 'MARKET OPEN' : 'MARKET CLOSED'}
              </span>
            </div>
            <div className="time-display">{clock}</div>

            {/* Live refresh indicator */}
            <div className="refresh-indicator">
              <svg viewBox="0 0 32 32" className="countdown-ring">
                <circle cx="16" cy="16" r="13" className="ring-track" />
                <circle
                  cx="16"
                  cy="16"
                  r="13"
                  className="ring-fill"
                  style={{
                    strokeDasharray: `${2 * Math.PI * 13}`,
                    strokeDashoffset: `${2 * Math.PI * 13 * (1 - countdown / INTERVAL)}`,
                  }}
                />
              </svg>
              <span className="countdown-num">{countdown}</span>
            </div>

            <button
              className={`refresh-btn${spinning ? ' spinning' : ''}`}
              onClick={() => {
                countRef.current = INTERVAL
                setCountdown(INTERVAL)
                refreshAll(true)
              }}
              disabled={spinning}
            >
              {spinning ? '⟳ FETCHING...' : '⟳ REFRESH'}
            </button>
          </div>
        </header>

        {/* ── Exchange Tabs ── */}
        <div className="exchange-tabs">
          <button
            className={`ex-tab ${exchange === 'NSE' ? 'active' : ''}`}
            onClick={() => setExchange('NSE')}
          >
            📊 NSE — National Stock Exchange
          </button>
          <button
            className={`ex-tab ${exchange === 'BSE' ? 'bse-active' : ''}`}
            onClick={() => setExchange('BSE')}
          >
            📈 BSE — Bombay Stock Exchange
          </button>
        </div>

        {/* ── NSE error banner ── */}
        {exchange === 'NSE' && nseData.status === 'error' && (
          <div className="error-banner">
            <div>
              <strong>⚠ NSE fetch failed:</strong> {nseData.error}
              {nseData.hint && (
                <div style={{ marginTop: 4, fontSize: '10px', opacity: 0.8 }}>{nseData.hint}</div>
              )}
            </div>
            <button className="retry-btn" onClick={() => loadNSE()}>
              ↺ Retry NSE
            </button>
          </div>
        )}

        {/* ── NSE Index Strip ── */}
        {exchange === 'NSE' && nseData.indices.length > 0 && (
          <div className="index-strip">
            {nseData.indices.map((idx, i) => (
              <div key={i} className={`index-card ${idx.isUp ? 'up' : 'down'}`}>
                <div className="index-name">{idx.label}</div>
                <div className="index-value">{fmtIdx(idx.value, idx.label)}</div>
                <div className={`index-change ${idx.isUp ? 'up-text' : 'down-text'}`}>
                  {idx.pChange >= 0 ? '+' : ''}
                  {idx.pChange.toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Stats Bar ── */}
        <div className="stats-bar">
          <div className="stat-item">
            <div className="stat-label">Gainers</div>
            <div className="stat-value green">{current.gainers.length || '--'}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Losers</div>
            <div className="stat-value red">{current.losers.length || '--'}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Vol Buzzers</div>
            <div className="stat-value yellow">{buzzers.length || '--'}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Most Active</div>
            <div className="stat-value yellow">{current.active.length || '--'}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Source</div>
            <div style={{ marginTop: '4px' }}>
              <span className={`source-badge ${exchange === 'NSE' ? 'source-nse' : 'source-bse'}`}>
                {exchange === 'NSE' ? '● NSE LIVE' : '● BSE LIVE'}
              </span>
            </div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Last Scan</div>
            <div className="stat-value small">{lastScan}</div>
          </div>
        </div>

        {/* ── Alert Feed ── */}
        <div className="alert-feed">
          <div className="panel-header">
            <div className="panel-title">
              <span>🔔</span> LIVE ALERTS
            </div>
            <div className="live-badge">● LIVE</div>
          </div>
          <div className="alert-scroll">
            {alerts.length === 0 ? (
              <div className="no-data">
                {current.status === 'loading'
                  ? 'Fetching data from exchange…'
                  : 'No alerts yet. Alerts appear when volume spikes or rapid moves are detected.'}
              </div>
            ) : (
              alerts.slice(0, 8).map((a, i) => (
                <div
                  key={i}
                  className={`alert-item${a.type === 'red' ? ' red-alert' : a.type === 'yellow' ? ' yellow-alert' : ''}`}
                >
                  <span className="alert-time">{a.time}</span>
                  <span className="alert-sym">{a.sym}</span>
                  <span
                    className={`alert-ex source-badge ${a.exchange === 'NSE' ? 'source-nse' : 'source-bse'}`}
                  >
                    {a.exchange}
                  </span>
                  <span className="alert-msg">{a.msg}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Four Panels ── */}
        <div className="main-grid">
          <StockPanel
            title="VOLUME BUZZERS"
            icon="🔊"
            stocks={buzzers}
            status={current.status}
            error={current.error}
            mode="vol-buzzer"
            exchange={exchange}
            prevStocks={prevMaps.active}
          />
          <StockPanel
            title="MOST ACTIVE"
            icon="⚡"
            stocks={current.active.slice(0, 12)}
            status={current.status}
            error={current.error}
            mode="active"
            exchange={exchange}
            prevStocks={prevMaps.active}
          />
          <StockPanel
            title="TOP GAINERS"
            icon="📈"
            stocks={current.gainers.slice(0, 12)}
            status={current.status}
            error={current.error}
            mode="gainers"
            exchange={exchange}
            prevStocks={prevMaps.gainers}
          />
          <StockPanel
            title="TOP LOSERS"
            icon="📉"
            stocks={current.losers.slice(0, 12)}
            status={current.status}
            error={current.error}
            mode="losers"
            exchange={exchange}
            prevStocks={prevMaps.losers}
          />
        </div>

        {/* ── Disclaimer ── */}
        <div className="disclaimer">
          <span>📡 DATA SOURCE:</span> Live data fetched directly from <span>NSE India</span> and{' '}
          <span>BSE India</span>. Refreshes every <span>15 seconds</span>.{' '}
          <span>NOT financial advice. Do your own research.</span>
        </div>
      </div>
    </>
  )
}
