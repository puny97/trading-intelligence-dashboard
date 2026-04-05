'use client'
import { useState, useEffect, useRef } from 'react'

interface Deal {
  symbol: string
  name: string
  clientName: string
  dealType: 'BUY' | 'SELL'
  quantity: number
  tradePrice: number
  value: number
  date: string
  remarks: string
}

type DealTab = 'bulk' | 'block' | 'short'
type SortField = 'value' | 'quantity' | 'tradePrice' | 'symbol'
type FilterDir = 'all' | 'BUY' | 'SELL'

function fmtQty(n: number) {
  if (n >= 1e7) return (n / 1e7).toFixed(2) + 'Cr'
  if (n >= 1e5) return (n / 1e5).toFixed(2) + 'L'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return n.toLocaleString('en-IN')
}
function fmtCr(n: number) {
  if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'K Cr'
  if (n >= 1) return '₹' + n.toFixed(2) + ' Cr'
  return '₹' + (n * 100).toFixed(1) + ' L'
}
function fmtPrice(n: number) {
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
function nowIST(): string {
  const d = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  return d.toUTCString().slice(17, 25) + ' IST'
}

export default function DealsPanel() {
  const [activeTab, setActiveTab] = useState<DealTab>('bulk')
  const [bulk, setBulk] = useState<Deal[]>([])
  const [block, setBlock] = useState<Deal[]>([])
  const [short, setShort] = useState<Deal[]>([])
  const [asOnDate, setAsOnDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState('—')
  const [sortBy, setSortBy] = useState<SortField>('value')
  const [filterDir, setFilterDir] = useState<FilterDir>('all')
  const [search, setSearch] = useState('')
  const [countdown, setCountdown] = useState(60)
  const [pinned, setPinned] = useState<Set<string>>(new Set())
  const [pinning, setPinning] = useState<string | null>(null)
  const countRef = useRef(60)
  const INTERVAL = 60

  async function fetchDeals() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/deals?type=both')
      const json = await res.json()
      if (json.error) {
        setError(json.error)
        return
      }
      setBulk(json.bulk || [])
      setBlock(json.block || [])
      setShort(json.short || [])
      setAsOnDate(json.asOnDate || '')
      setLastUpdate(nowIST())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function pinDeal(d: Deal, kind: DealTab) {
    if (kind === 'short') return // short deals have no price/client
    const key = `${d.symbol}-${d.clientName}-${d.dealType}-${d.date}-${d.quantity}`
    if (pinned.has(key)) return
    setPinning(key)
    try {
      await fetch('/api/tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: d.symbol,
          name: d.name,
          clientName: d.clientName,
          dealType: d.dealType,
          dealKind: kind,
          quantity: d.quantity,
          tradePrice: d.tradePrice,
          valueCr: d.value,
          dealDate: d.date,
        }),
      })
      setPinned(prev => new Set([...prev, key]))
    } finally {
      setPinning(null)
    }
  }

  useEffect(() => {
    fetchDeals()
    const id = setInterval(() => {
      countRef.current -= 1
      if (countRef.current <= 0) {
        countRef.current = INTERVAL
        fetchDeals()
      }
      setCountdown(countRef.current)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // Short tab: sort only by quantity or symbol (no price/value)
  const shortSortBy: 'quantity' | 'symbol' =
    sortBy === 'quantity' || sortBy === 'symbol' ? sortBy : 'quantity'

  function sorted(deals: Deal[]): Deal[] {
    let d = [...deals]
    if (activeTab !== 'short' && filterDir !== 'all') d = d.filter(x => x.dealType === filterDir)
    if (search) {
      const q = search.toLowerCase()
      d = d.filter(
        x =>
          x.symbol.toLowerCase().includes(q) ||
          x.clientName.toLowerCase().includes(q) ||
          x.name.toLowerCase().includes(q)
      )
    }
    if (activeTab === 'short') {
      d.sort((a, b) =>
        shortSortBy === 'symbol' ? a.symbol.localeCompare(b.symbol) : b.quantity - a.quantity
      )
    } else {
      d.sort((a, b) =>
        sortBy === 'symbol'
          ? a.symbol.localeCompare(b.symbol)
          : (b[sortBy] as number) - (a[sortBy] as number)
      )
    }
    return d
  }

  const deals = activeTab === 'bulk' ? bulk : activeTab === 'block' ? block : short
  const display = sorted(deals)
  const totalBuy = display.filter(d => d.dealType === 'BUY').reduce((s, d) => s + d.value, 0)
  const totalSell = display.filter(d => d.dealType === 'SELL').reduce((s, d) => s + d.value, 0)
  const netFlow = totalBuy - totalSell
  const topSymbols = [...new Map(display.map(d => [d.symbol, d])).values()].slice(0, 5)
  const totalShortQty = short.reduce((s, d) => s + d.quantity, 0)

  return (
    <div className="deals-wrap">
      {/* ── Header ── */}
      <div className="deals-header">
        <div>
          <div className="deals-title">📋 BULK · BLOCK · SHORT DEALS</div>
          <div className="deals-sub">
            Institutional large trade activity · NSE
            {asOnDate && (
              <span style={{ marginLeft: 8, color: 'var(--accent)' }}>as on {asOnDate}</span>
            )}
          </div>
        </div>
        <div className="deals-controls">
          {error && (
            <span className="fyers-error" title={error}>
              ⚠ {error.slice(0, 50)}
            </span>
          )}
          <div className="countdown-wrap">
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
          <span className="fyers-scan">Last: {lastUpdate}</span>
          <button
            className="refresh-btn"
            onClick={() => {
              fetchDeals()
              countRef.current = INTERVAL
              setCountdown(INTERVAL)
            }}
            disabled={loading}
          >
            {loading ? '⟳ FETCHING...' : '⟳ REFRESH'}
          </button>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="deals-summary">
        {activeTab !== 'short' ? (
          <>
            <div className="deal-card">
              <div className="dc-label">Deals</div>
              <div className="dc-val">{display.length}</div>
            </div>
            <div className="deal-card">
              <div className="dc-label">Buy Value</div>
              <div className="dc-val green">{fmtCr(totalBuy)}</div>
            </div>
            <div className="deal-card">
              <div className="dc-label">Sell Value</div>
              <div className="dc-val red">{fmtCr(totalSell)}</div>
            </div>
            <div className="deal-card">
              <div className="dc-label">Net Flow</div>
              <div className={`dc-val ${netFlow >= 0 ? 'green' : 'red'}`}>
                {netFlow >= 0 ? '+' : ''}
                {fmtCr(netFlow)}
              </div>
            </div>
            <div className="deal-card deal-card-wide">
              <div className="dc-label">Active Symbols</div>
              <div className="dc-symbols">
                {topSymbols.map(d => (
                  <span
                    key={d.symbol}
                    className={`dc-sym-chip ${d.dealType === 'BUY' ? 'buy' : 'sell'}`}
                  >
                    {d.symbol}
                  </span>
                ))}
                {topSymbols.length === 0 && <span style={{ color: 'var(--muted)' }}>—</span>}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Short selling summary — only qty matters */}
            <div className="deal-card">
              <div className="dc-label">Symbols Shorted</div>
              <div className="dc-val red">{short.length}</div>
            </div>
            <div className="deal-card">
              <div className="dc-label">Total Short Qty</div>
              <div className="dc-val red">{fmtQty(totalShortQty)}</div>
            </div>
            <div className="deal-card deal-card-wide">
              <div className="dc-label">ℹ️ About Short Selling Data</div>
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--muted)',
                  marginTop: 4,
                  lineHeight: 1.6,
                }}
              >
                NSE discloses only <b style={{ color: 'var(--text)' }}>symbol + shorted quantity</b>
                . Client names and prices are <b style={{ color: 'var(--text)' }}>not published</b>{' '}
                by NSE for short selling — this is by regulation.
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Tabs + Filters ── */}
      <div className="deals-tabs">
        {(['bulk', 'block', 'short'] as DealTab[]).map(t => (
          <button
            key={t}
            className={`deals-tab ${activeTab === t ? 'active' : ''}`}
            onClick={() => {
              setActiveTab(t)
              setSortBy(t === 'short' ? 'quantity' : 'value')
              setFilterDir('all')
            }}
          >
            {t === 'bulk' ? '📦 BULK' : t === 'block' ? '🧱 BLOCK' : '📉 SHORT'}
            <span className="tab-count">
              {t === 'bulk' ? bulk.length : t === 'block' ? block.length : short.length}
            </span>
          </button>
        ))}
        <div className="deals-filters">
          <input
            className="deals-search"
            placeholder="Search symbol…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          {/* Direction filter — hidden for short (all are SELL) */}
          {activeTab !== 'short' &&
            (['all', 'BUY', 'SELL'] as FilterDir[]).map(f => (
              <button
                key={f}
                className={`gap-filter-btn ${filterDir === f ? 'active' : ''}`}
                onClick={() => setFilterDir(f)}
              >
                {f === 'all' ? 'All' : f === 'BUY' ? '↑ Buy' : '↓ Sell'}
              </button>
            ))}

          <span className="deals-sort-label">Sort:</span>
          {activeTab === 'short'
            ? // Short tab — only qty and A-Z sort make sense
              (
                [
                  ['quantity', 'Qty'],
                  ['symbol', 'A-Z'],
                ] as [SortField, string][]
              ).map(([k, l]) => (
                <button
                  key={k}
                  className={`gap-filter-btn ${shortSortBy === k ? 'active' : ''}`}
                  onClick={() => setSortBy(k)}
                >
                  {l}
                </button>
              ))
            : (
                [
                  ['value', 'Value'],
                  ['quantity', 'Qty'],
                  ['tradePrice', 'Price'],
                  ['symbol', 'A-Z'],
                ] as [SortField, string][]
              ).map(([k, l]) => (
                <button
                  key={k}
                  className={`gap-filter-btn ${sortBy === k ? 'active' : ''}`}
                  onClick={() => setSortBy(k)}
                >
                  {l}
                </button>
              ))}
        </div>
      </div>

      {/* ── Info strip ── */}
      <div className="deals-info-strip">
        {activeTab === 'bulk'
          ? '📦 Bulk Deal: any trade ≥ 0.5% of listed shares in a single order. Disclosed daily after market hours.'
          : activeTab === 'block'
            ? '🧱 Block Deal: min 5L shares or ₹5Cr, in special windows (9:15–9:50 AM & 2:05–2:40 PM IST). Often FII/DII activity.'
            : '📉 Short Selling: NSE publishes only symbol + shorted quantity per SEBI regulations. No price or client data available.'}
      </div>

      {/* ── Table ── */}
      <div className="deals-table-wrap">
        {/* SHORT tab — simplified 4-column layout */}
        {activeTab === 'short' ? (
          <>
            <div
              className="deals-table-header"
              style={{ gridTemplateColumns: '28px 1fr 120px 80px' }}
            >
              <span>#</span>
              <span>SYMBOL</span>
              <span>SHORTED QTY</span>
              <span>DATE</span>
            </div>
            {loading && display.length === 0 && (
              <div className="no-data">
                <div className="spinner" /> Loading…
              </div>
            )}
            {!loading && display.length === 0 && (
              <div className="no-data">
                No short selling data found{search ? ' matching search' : ''}.
              </div>
            )}
            {display.map((d, i) => (
              <div
                key={`${d.symbol}-${i}`}
                className="deals-row deal-sell"
                style={{ gridTemplateColumns: '28px 1fr 120px 80px' }}
              >
                <span className="col-rank">{i + 1}</span>
                <div>
                  <div className="col-symbol">{d.symbol}</div>
                  <div className="col-name">{d.name.substring(0, 28)}</div>
                </div>
                <div className="deal-num red">{fmtQty(d.quantity)}</div>
                <div className="deal-time">{d.date || '—'}</div>
              </div>
            ))}
          </>
        ) : (
          <>
            {/* BULK / BLOCK — full 8-column layout */}
            <div
              className="deals-table-header"
              style={{
                gridTemplateColumns: '28px 1fr 1fr 70px 80px 90px 90px 70px 36px',
              }}
            >
              <span>#</span>
              <span>SYMBOL</span>
              <span>CLIENT</span>
              <span>TYPE</span>
              <span>QTY</span>
              <span>WATP</span>
              <span>VALUE</span>
              <span>DATE</span>
              <span>PIN</span>
            </div>
            {loading && display.length === 0 && (
              <div className="no-data">
                <div className="spinner" /> Loading deals…
              </div>
            )}
            {!loading && display.length === 0 && (
              <div className="no-data">
                {error
                  ? `Error: ${error}`
                  : `No ${activeTab} deals found${search ? ' matching search' : ''}.`}
                {!error && (
                  <div
                    style={{
                      fontSize: 10,
                      marginTop: 6,
                      color: 'var(--muted)',
                    }}
                  >
                    Data published after each deal window closes.
                  </div>
                )}
              </div>
            )}
            {display.map((d, i) => (
              <div
                key={`${d.symbol}-${d.clientName}-${i}`}
                style={{
                  gridTemplateColumns: '28px 1fr 1fr 70px 80px 90px 90px 70px 36px',
                }}
                className={`deals-row ${d.dealType === 'BUY' ? 'deal-buy' : 'deal-sell'}`}
              >
                <span className="col-rank">{i + 1}</span>
                <div>
                  <div className="col-symbol">{d.symbol}</div>
                  <div className="col-name">{d.name.substring(0, 22)}</div>
                </div>
                <div className="deal-client" title={d.clientName}>
                  {d.clientName.substring(0, 26)}
                </div>
                <div>
                  <span className={`deal-type-badge ${d.dealType === 'BUY' ? 'buy' : 'sell'}`}>
                    {d.dealType === 'BUY' ? '▲ BUY' : '▼ SELL'}
                  </span>
                </div>
                <div className="deal-num">{fmtQty(d.quantity)}</div>
                <div className="deal-num">₹{fmtPrice(d.tradePrice)}</div>
                <div className={`deal-num deal-value ${d.dealType === 'BUY' ? 'green' : 'red'}`}>
                  {fmtCr(d.value)}
                </div>
                <div className="deal-time">{d.date || '—'}</div>
                <div>
                  {(() => {
                    const key = `${d.symbol}-${d.clientName}-${d.dealType}-${d.date}-${d.quantity}`
                    const isPinned = pinned.has(key)
                    const isPinning = pinning === key
                    return (
                      <button
                        className={`pin-btn ${isPinned ? 'pinned' : ''}`}
                        onClick={e => {
                          e.stopPropagation()
                          pinDeal(d, activeTab)
                        }}
                        disabled={isPinned || isPinning}
                        title={isPinned ? 'Tracked' : 'Track this deal'}
                      >
                        {isPinning ? '…' : isPinned ? '📌' : '📍'}
                      </button>
                    )
                  })()}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
