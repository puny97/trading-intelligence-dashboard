'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────────────────
interface DayRow {
  date: string
  open: number
  high: number
  low: number
  close_330: number
  prev_close: number
  points_moved: number
  pct_moved: number
  day_range: number
  open_gap: number
  open_gap_pct: number
  market_type: 'FLAT' | 'POSITIVE' | 'NEGATIVE'
  range_type: string
  theory_ok: number
}
interface StatRow {
  market_type: string
  total: number
  theory_correct: number
  avg_range: number
  min_range: number
  max_range: number
  avg_gap: number
  avg_pts_moved: number
}
interface Overall {
  total_days: number
  earliest: string
  latest: string
  total_correct: number
  avg_range: number
}
interface ImportMsg {
  type: string
  message?: string
  window?: number
  total?: number
  from?: string
  to?: string
  saved?: number
  totalSaved?: number
  totalSkipped?: number
  totalInDB?: number
  candles?: number
  days?: number
  new?: number
  startDate?: string
  resume?: boolean
}

type Tab = 'live' | 'history' | 'backtest' | 'import'

// ── Constants ─────────────────────────────────────────────────────────────
const M_CONFIG = {
  FLAT: {
    label: 'FLAT MARKET',
    color: '#ffc800',
    bg: 'rgba(255,200,0,0.08)',
    icon: '↔',
    rangeNote: 'Expected H-L range: 72–84 pts',
    gapNote: 'Gap within ±40 pts',
  },
  POSITIVE: {
    label: 'POSITIVE MARKET',
    color: '#00e676',
    bg: 'rgba(0,230,118,0.08)',
    icon: '↑',
    rangeNote: 'Expected H-L range: 135–150 pts',
    gapNote: 'Gap > +40 pts',
  },
  NEGATIVE: {
    label: 'NEGATIVE MARKET',
    color: '#ff1744',
    bg: 'rgba(255,23,68,0.08)',
    icon: '↓',
    rangeNote: 'Expected H-L range: 135–150 pts',
    gapNote: 'Gap < -40 pts',
  },
}

const STARCAST = [
  { symbol: 'RELIANCE', role: 'Megastar', icon: '⭐', rangeDiv: 30 },
  { symbol: 'HDFCBANK', role: 'Super Star', icon: '🌟', rangeDiv: 34.9 },
  { symbol: 'TCS', role: 'Jr Artist', icon: '🎬', rangeDiv: 45.9 },
  { symbol: 'INFY', role: 'Supporting', icon: '🎭', rangeDiv: 16.53 },
  { symbol: 'ITC', role: 'Supporting', icon: '🎭', rangeDiv: 5.51 },
  { symbol: 'ICICIBANK', role: 'Supporting', icon: '🎭', rangeDiv: 10.13 },
  { symbol: 'SBIN', role: 'Supporting', icon: '🎭', rangeDiv: 8.64 },
  { symbol: 'KOTAKBANK', role: 'Supporting', icon: '🎭', rangeDiv: 32.89 },
  { symbol: 'HINDUNILVR', role: 'Supporting', icon: '🎭', rangeDiv: 34.79 },
]

// ── Helpers ───────────────────────────────────────────────────────────────
const fmt = (n: number, d = 2) =>
  n == null
    ? '—'
    : Number(n).toLocaleString('en-IN', {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      })
const sign = (n: number) => (n >= 0 ? '+' : '')
const pct = (correct: number, total: number) =>
  total > 0 ? ((correct / total) * 100).toFixed(1) + '%' : '—'

function LevelBar({ levels, ltp }: { levels: Record<string, number>; ltp: number }) {
  const entries = Object.entries(levels).sort((a, b) => b[1] - a[1])
  const max = entries[0][1]
  const min = entries[entries.length - 1][1]
  const range = max - min || 1
  return (
    <div
      style={{
        position: 'relative',
        height: 320,
        display: 'flex',
        alignItems: 'stretch',
        gap: 0,
      }}
    >
      {/* Price bar */}
      <div
        style={{
          width: 8,
          background: '#0e2a35',
          borderRadius: 4,
          position: 'relative',
          margin: '0 12px',
          flexShrink: 0,
        }}
      >
        {ltp > 0 && (
          <div
            style={{
              position: 'absolute',
              left: '-3px',
              bottom: `${((ltp - min) / range) * 100}%`,
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: '#00ffe7',
              boxShadow: '0 0 8px rgba(0,255,231,0.8)',
              transform: 'translateY(50%)',
              zIndex: 2,
            }}
          />
        )}
      </div>
      {/* Level lines */}
      <div style={{ flex: 1, position: 'relative' }}>
        {entries.map(([key, val]) => {
          const bottomPct = ((val - min) / range) * 100
          const isR = key.startsWith('r')
          const isBL = key === 'baseline'
          const isNear = ltp > 0 && Math.abs(val - ltp) < 15
          return (
            <div
              key={key}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: `${bottomPct}%`,
                transform: 'translateY(50%)',
              }}
            >
              <div
                style={{
                  height: isBL ? 2 : 1,
                  background: isBL
                    ? '#00ffe7'
                    : isR
                      ? 'rgba(0,230,118,0.5)'
                      : 'rgba(255,23,68,0.5)',
                  borderStyle: isBL ? 'solid' : 'dashed',
                  boxShadow: isNear ? '0 0 6px rgba(255,200,0,0.6)' : 'none',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: -9,
                  fontSize: 9,
                  letterSpacing: 1,
                  color: isBL ? '#00ffe7' : isR ? '#00e676' : '#ff1744',
                  background: '#030a0e',
                  padding: '0 4px',
                  whiteSpace: 'nowrap',
                }}
              >
                {key.toUpperCase()} {fmt(val, 0)}
                {isNear && <span style={{ color: '#ffc800', marginLeft: 4 }}>← LTP</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────
export default function MagicPage() {
  const [tab, setTab] = useState<Tab>('live')
  const [liveData, setLiveData] = useState<any>(null)
  const [histRows, setHistRows] = useState<DayRow[]>([])
  const [stats, setStats] = useState<StatRow[]>([])
  const [overall, setOverall] = useState<Overall | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(30)
  const [lastUpdate, setLastUpdate] = useState('—')
  const [importLog, setImportLog] = useState<ImportMsg[]>([])
  const [importing, setImporting] = useState(false)
  const [importDone, setImportDone] = useState(false)
  const [startDate, setStartDate] = useState('2018-01-01')
  const [filterType, setFilterType] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const countRef = useRef(30)
  const logEndRef = useRef<HTMLDivElement>(null)

  // ── Live data ─────────────────────────────────────────────────────────
  const fetchLive = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/magic')
      const json = await res.json()
      if (json.error) {
        setError(json.error)
        return
      }
      setLiveData(json)
      const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
      setLastUpdate(ist.toUTCString().slice(17, 25) + ' IST')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── History data ──────────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '2000' })
      if (filterType) params.set('type', filterType)
      const res = await fetch('/api/magic/history?' + params)
      const json = await res.json()
      if (json.error) {
        setError(json.error)
        return
      }
      setHistRows(json.rows || [])
      setStats(json.stats || [])
      setOverall(json.overall || null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [filterType])

  // ── Auto refresh live ─────────────────────────────────────────────────
  useEffect(() => {
    fetchLive()
    const id = setInterval(() => {
      countRef.current -= 1
      if (countRef.current <= 0) {
        countRef.current = 30
        fetchLive()
      }
      setCountdown(countRef.current)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (tab === 'history' || tab === 'backtest') fetchHistory()
  }, [tab, filterType])
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [importLog])

  // ── Sync today ────────────────────────────────────────────────────────
  async function syncToday() {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const j = await fetch('/api/magic/today', { method: 'POST' }).then(r => r.json())
      if (j.error) {
        setSyncMsg('Error: ' + j.error)
        return
      }
      setSyncMsg(
        `✓ Today saved: ${j.row?.date} | Close: ${j.row?.close_330} | Gap: ${j.row?.open_gap > 0 ? '+' : ''}${j.row?.open_gap} pts | ${j.row?.market_type}`
      )
      fetchHistory()
    } catch (e: any) {
      setSyncMsg('Error: ' + e.message)
    } finally {
      setSyncing(false)
    }
  }

  // ── Bulk import ───────────────────────────────────────────────────────
  async function startImport(resume: boolean) {
    setImporting(true)
    setImportDone(false)
    setImportLog([])
    try {
      const res = await fetch('/api/magic/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, resume }),
      })
      const reader = res.body!.getReader()
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          try {
            const msg: ImportMsg = JSON.parse(line.slice(5).trim())
            setImportLog(prev => [...prev, msg])
            if (msg.type === 'done') {
              setImportDone(true)
              fetchHistory()
            }
          } catch {}
        }
      }
    } catch (e: any) {
      setImportLog(prev => [...prev, { type: 'error', message: String(e.message) }])
    } finally {
      setImporting(false)
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────
  const nifty = liveData?.nifty
  const levels = liveData?.levels
  const mCfg = nifty ? M_CONFIG[nifty.marketType as keyof typeof M_CONFIG] : null
  const ltp = nifty?.ltp || 0

  // Find nearest level
  const nearLevel = levels
    ? Object.entries(levels as Record<string, number>).reduce(
        (b, [k, v]) => {
          const d = Math.abs(v - ltp)
          return d < b.d ? { k, v, d } : b
        },
        { k: '', v: 0, d: Infinity }
      )
    : null

  // Theory range prediction for today
  const flatTheory = stats.find(s => s.market_type === 'FLAT')
  const positiveTheory = stats.find(s => s.market_type === 'POSITIVE')
  const negativeTheory = stats.find(s => s.market_type === 'NEGATIVE')

  return (
    <div>
      {/* ── Tabs ── */}
      <div
        style={{
          display: 'flex',
          borderBottom: '2px solid #0e2a35',
          marginBottom: 20,
          gap: 0,
        }}
      >
        {(
          [
            ['live', '📡 LIVE'],
            ['history', '📅 HISTORY'],
            ['backtest', '📊 BACKTEST'],
            ['import', '⬇ IMPORT DATA'],
          ] as [Tab, string][]
        ).map(([t, l]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 22px',
              fontSize: 10,
              letterSpacing: 2,
              textTransform: 'uppercase',
              cursor: 'pointer',
              border: 'none',
              borderBottom: tab === t ? '2px solid #00ffe7' : '2px solid transparent',
              background: 'none',
              color: tab === t ? '#00ffe7' : '#4a7a8a',
              fontFamily: "'Space Mono',monospace",
              marginBottom: -2,
              transition: 'all 0.2s',
            }}
          >
            {l}
          </button>
        ))}
        {/* Header controls */}
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            paddingBottom: 8,
          }}
        >
          {tab === 'live' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg viewBox="0 0 32 32" width={24} height={24}>
                  <circle cx="16" cy="16" r="13" fill="none" stroke="#0e2a35" strokeWidth="3" />
                  <circle
                    cx="16"
                    cy="16"
                    r="13"
                    fill="none"
                    stroke="#00ffe7"
                    strokeWidth="3"
                    strokeDasharray={`${2 * Math.PI * 13}`}
                    strokeDashoffset={`${2 * Math.PI * 13 * (1 - countdown / 30)}`}
                    style={{
                      transformOrigin: 'center',
                      transform: 'rotate(-90deg)',
                    }}
                  />
                </svg>
                <span style={{ fontSize: 10, color: '#4a7a8a' }}>{countdown}s</span>
              </div>
              <span style={{ fontSize: 9, color: '#4a7a8a' }}>Last: {lastUpdate}</span>
              <button
                onClick={() => {
                  fetchLive()
                  countRef.current = 30
                  setCountdown(30)
                }}
                style={{
                  padding: '5px 12px',
                  fontSize: 9,
                  letterSpacing: 1,
                  border: '1px solid #0e2a35',
                  background: 'none',
                  color: '#4a7a8a',
                  cursor: 'pointer',
                  fontFamily: "'Space Mono',monospace",
                }}
                disabled={loading}
              >
                {loading ? 'FETCHING…' : '⟳ REFRESH'}
              </button>
            </>
          )}
          {(tab === 'history' || tab === 'backtest') && (
            <>
              <button
                onClick={syncToday}
                disabled={syncing}
                style={{
                  padding: '5px 14px',
                  fontSize: 9,
                  letterSpacing: 1,
                  border: '1px solid #00ffe7',
                  background: 'rgba(0,255,231,0.08)',
                  color: '#00ffe7',
                  cursor: 'pointer',
                  fontFamily: "'Space Mono',monospace",
                }}
              >
                {syncing ? 'SYNCING…' : '⚡ SYNC TODAY'}
              </button>
              {syncMsg && (
                <span
                  style={{
                    fontSize: 9,
                    color: syncMsg.startsWith('Error') ? '#ff1744' : '#00e676',
                    maxWidth: 300,
                  }}
                >
                  {syncMsg}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '8px 14px',
            background: 'rgba(255,23,68,0.1)',
            border: '1px solid #ff1744',
            borderRadius: 4,
            color: '#ff1744',
            fontSize: 11,
            marginBottom: 16,
          }}
        >
          ⚠ {error}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          LIVE TAB
      ══════════════════════════════════════════════════════════════ */}
      {tab === 'live' && (
        <div>
          {!nifty && loading && (
            <div style={{ textAlign: 'center', padding: 60, color: '#4a7a8a' }}>
              Loading live data…
            </div>
          )}

          {nifty && mCfg && (
            <>
              {/* Market type banner */}
              <div
                style={{
                  padding: '16px 20px',
                  background: mCfg.bg,
                  border: `1px solid ${mCfg.color}`,
                  borderRadius: 8,
                  marginBottom: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ fontSize: 36 }}>{mCfg.icon}</span>
                  <div>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 800,
                        letterSpacing: 3,
                        color: mCfg.color,
                      }}
                    >
                      {mCfg.label}
                    </div>
                    <div style={{ fontSize: 10, color: '#4a7a8a', marginTop: 3 }}>
                      {mCfg.gapNote} · {mCfg.rangeNote}
                    </div>
                    <div style={{ fontSize: 10, color: '#4a7a8a', marginTop: 2 }}>
                      Day range so far:{' '}
                      <b style={{ color: '#c8e6f0' }}>{fmt(nifty.dayRange, 0)} pts</b>
                      {nifty.dayRange > 0 && (
                        <span
                          style={{
                            marginLeft: 8,
                            color:
                              nifty.dayRange <= 84
                                ? '#ffc800'
                                : nifty.dayRange <= 210
                                  ? '#00e676'
                                  : '#ff1744',
                          }}
                        >
                          ({nifty.rangeType.replace('_RANGE', '').replace('_', ' ')})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {/* Key numbers */}
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  {[
                    ['Prev Close (3:30)', nifty.prevClose, '#c8e6f0'],
                    [
                      'Open / Pre-Open',
                      nifty.todayOpen,
                      nifty.todayOpen >= nifty.prevClose ? '#00e676' : '#ff1744',
                    ],
                    ['LTP', ltp, mCfg.color],
                    ['Points Moved', null, mCfg.color],
                  ].map(([label, val, color]) => (
                    <div key={String(label)} style={{ textAlign: 'center' }}>
                      <div
                        style={{
                          fontSize: 9,
                          color: '#4a7a8a',
                          letterSpacing: 1,
                          textTransform: 'uppercase',
                        }}
                      >
                        {label as string}
                      </div>
                      {val != null ? (
                        <div
                          style={{
                            fontSize: 20,
                            fontWeight: 700,
                            fontFamily: "'Space Mono',monospace",
                            color: color as string,
                          }}
                        >
                          {fmt(val as number)}
                        </div>
                      ) : (
                        <div
                          style={{
                            fontSize: 20,
                            fontWeight: 700,
                            fontFamily: "'Space Mono',monospace",
                            color: color as string,
                          }}
                        >
                          {sign(nifty.pointsMoved)}
                          {fmt(nifty.pointsMoved)} ({sign(nifty.pointsMovedPct)}
                          {fmt(nifty.pointsMovedPct)}%)
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 16,
                  marginBottom: 20,
                }}
              >
                {/* OHLC card */}
                <div
                  style={{
                    background: '#080f14',
                    border: '1px solid #0e2a35',
                    borderRadius: 8,
                    padding: 16,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: 2,
                      color: '#4a7a8a',
                      marginBottom: 12,
                      textTransform: 'uppercase',
                    }}
                  >
                    📊 Nifty 50 — OHLC Today
                  </div>
                  {[
                    ['Prev Close (3:30 PM)', nifty.prevClose, '#c8e6f0', null],
                    [
                      'Open (Pre-open)',
                      nifty.todayOpen,
                      nifty.todayOpen >= nifty.prevClose ? '#00e676' : '#ff1744',
                      nifty.todayOpen - nifty.prevClose,
                    ],
                    ['High', nifty.todayHigh, '#00e676', nifty.todayHigh - nifty.prevClose],
                    ['Low', nifty.todayLow, '#ff1744', nifty.todayLow - nifty.prevClose],
                    ['LTP', ltp, mCfg.color, nifty.pointsMoved],
                  ].map(([label, val, color, diff]) => (
                    <div
                      key={String(label)}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '7px 0',
                        borderBottom: '1px solid #0e2a35',
                      }}
                    >
                      <span style={{ fontSize: 10, color: '#4a7a8a' }}>{label as string}</span>
                      <div style={{ textAlign: 'right' }}>
                        <span
                          style={{
                            fontFamily: "'Space Mono',monospace",
                            fontSize: 13,
                            color: color as string,
                          }}
                        >
                          {fmt(val as number)}
                        </span>
                        {diff != null && (
                          <span
                            style={{
                              fontSize: 9,
                              color: (diff as number) >= 0 ? '#00e676' : '#ff1744',
                              marginLeft: 8,
                            }}
                          >
                            ({sign(diff as number)}
                            {fmt(diff as number, 0)})
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '7px 0',
                      marginTop: 4,
                    }}
                  >
                    <span style={{ fontSize: 10, color: '#4a7a8a' }}>Day Range (H-L)</span>
                    <span
                      style={{
                        fontFamily: "'Space Mono',monospace",
                        fontSize: 13,
                      }}
                    >
                      {fmt(nifty.dayRange, 0)} pts
                    </span>
                  </div>
                </div>

                {/* S&R Levels */}
                <div
                  style={{
                    background: '#080f14',
                    border: '1px solid #0e2a35',
                    borderRadius: 8,
                    padding: 16,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: 2,
                      color: '#4a7a8a',
                      marginBottom: 12,
                      textTransform: 'uppercase',
                    }}
                  >
                    📐 Support &amp; Resistance
                  </div>
                  <div style={{ fontSize: 9, color: '#4a7a8a', marginBottom: 10 }}>
                    Baseline = Prev Close ± 45 pts per level
                  </div>
                  {levels &&
                    Object.entries(levels as Record<string, number>)
                      .sort((a, b) => b[1] - a[1])
                      .map(([key, val]) => {
                        const isR = key.startsWith('r')
                        const isBL = key === 'baseline'
                        const isNear = Math.abs((val as number) - ltp) < 20
                        return (
                          <div
                            key={key}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '6px 8px',
                              marginBottom: 3,
                              borderRadius: 4,
                              background: isNear
                                ? 'rgba(255,200,0,0.08)'
                                : isBL
                                  ? 'rgba(0,255,231,0.05)'
                                  : 'transparent',
                              border: isNear
                                ? '1px solid rgba(255,200,0,0.3)'
                                : isBL
                                  ? '1px solid rgba(0,255,231,0.2)'
                                  : '1px solid transparent',
                            }}
                          >
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: 1,
                                color: isBL ? '#00ffe7' : isR ? '#00e676' : '#ff1744',
                              }}
                            >
                              {key.toUpperCase()}
                              {isNear ? ' ←' : ''}
                            </span>
                            <span
                              style={{
                                fontFamily: "'Space Mono',monospace",
                                fontSize: 13,
                                color: isBL ? '#00ffe7' : isR ? '#00e676' : '#ff1744',
                              }}
                            >
                              {fmt(val as number)}
                            </span>
                            <span style={{ fontSize: 9, color: '#4a7a8a' }}>
                              {(val as number) > ltp
                                ? `+${fmt((val as number) - ltp, 0)}`
                                : `${fmt((val as number) - ltp, 0)}`}{' '}
                              pts
                            </span>
                          </div>
                        )
                      })}
                  {nearLevel && (
                    <div style={{ marginTop: 8, fontSize: 9, color: '#ffc800' }}>
                      ⚡ Nearest level: <b>{nearLevel.k.toUpperCase()}</b> ({fmt(nearLevel.d, 0)}{' '}
                      pts away)
                    </div>
                  )}
                </div>

                {/* Index overview */}
                <div
                  style={{
                    background: '#080f14',
                    border: '1px solid #0e2a35',
                    borderRadius: 8,
                    padding: 16,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: 2,
                      color: '#4a7a8a',
                      marginBottom: 12,
                      textTransform: 'uppercase',
                    }}
                  >
                    🏦 Index Overview
                  </div>
                  {[
                    ['BANK NIFTY', liveData?.bankNifty?.ltp, liveData?.bankNifty?.pChange],
                    ['INDIA VIX', liveData?.indiaVix?.value, liveData?.indiaVix?.pChange],
                  ].map(([name, val, chg]) => (
                    <div
                      key={String(name)}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '8px 0',
                        borderBottom: '1px solid #0e2a35',
                      }}
                    >
                      <span style={{ fontSize: 10, color: '#4a7a8a' }}>{name as string}</span>
                      <div>
                        <span
                          style={{
                            fontFamily: "'Space Mono',monospace",
                            fontSize: 13,
                          }}
                        >
                          {fmt(val as number)}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            marginLeft: 8,
                            color: (chg as number) >= 0 ? '#00e676' : '#ff1744',
                          }}
                        >
                          {sign(chg as number)}
                          {fmt(chg as number)}%
                        </span>
                      </div>
                    </div>
                  ))}
                  {liveData?.usdinr?.price > 0 && (
                    <div
                      style={{
                        padding: '8px 0',
                        borderBottom: '1px solid #0e2a35',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span style={{ fontSize: 10, color: '#4a7a8a' }}>USD-INR</span>
                        <div>
                          <span
                            style={{
                              fontFamily: "'Space Mono',monospace",
                              fontSize: 13,
                            }}
                          >
                            {fmt(liveData.usdinr.price)}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              marginLeft: 8,
                              color: liveData.usdinr.pChange >= 0 ? '#ff1744' : '#00e676',
                            }}
                          >
                            {sign(liveData.usdinr.pChange)}
                            {fmt(liveData.usdinr.pChange)}%
                          </span>
                        </div>
                      </div>
                      <div style={{ fontSize: 9, color: '#4a7a8a', marginTop: 3 }}>
                        Market impact:{' '}
                        <span
                          style={{
                            color: liveData.usdinr.marketImpact >= 0 ? '#00e676' : '#ff1744',
                          }}
                        >
                          {sign(liveData.usdinr.marketImpact)}
                          {fmt(liveData.usdinr.marketImpact)}% (USDINR ↑ = Nifty ↓)
                        </span>
                      </div>
                    </div>
                  )}
                  {/* Gift Nifty */}
                  {liveData?.giftNifty?.price > 0 && (
                    <div style={{ padding: '8px 0' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <span style={{ fontSize: 10, color: '#4a7a8a' }}>Gift Nifty Gap</span>
                        <span
                          style={{
                            fontFamily: "'Space Mono',monospace",
                            fontSize: 13,
                            color: liveData.giftNifty.gap > 0 ? '#00e676' : '#ff1744',
                          }}
                        >
                          {sign(liveData.giftNifty.gap)}
                          {fmt(liveData.giftNifty.gap, 0)} pts
                        </span>
                      </div>
                      <div style={{ fontSize: 9, color: '#4a7a8a', marginTop: 2 }}>
                        Direction:{' '}
                        <span
                          style={{
                            color:
                              liveData.giftNifty.direction === 'FLAT'
                                ? '#ffc800'
                                : liveData.giftNifty.direction === 'POSITIVE'
                                  ? '#00e676'
                                  : '#ff1744',
                          }}
                        >
                          {liveData.giftNifty.direction}{' '}
                          {liveData.giftNifty.direction === 'FLAT'
                            ? '(within ±40)'
                            : liveData.giftNifty.direction === 'POSITIVE'
                              ? '(>+40)'
                              : '(<-40)'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Starcast */}
              {liveData?.keyStocks?.length > 0 && (
                <div
                  style={{
                    background: '#080f14',
                    border: '1px solid #0e2a35',
                    borderRadius: 8,
                    padding: 16,
                    marginBottom: 20,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: 2,
                      color: '#4a7a8a',
                      marginBottom: 12,
                      textTransform: 'uppercase',
                    }}
                  >
                    🎬 STARCAST — Key Market Movers
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))',
                      gap: 10,
                    }}
                  >
                    {STARCAST.map(sc => {
                      const s = liveData.keyStocks?.find((k: any) => k.symbol === sc.symbol)
                      const isUp = (s?.pChange || 0) >= 0
                      return (
                        <div
                          key={sc.symbol}
                          style={{
                            background: '#030a0e',
                            border: '1px solid #0e2a35',
                            borderRadius: 6,
                            padding: 10,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              marginBottom: 4,
                            }}
                          >
                            <span style={{ fontSize: 14 }}>{sc.icon}</span>
                            <div>
                              <div
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  letterSpacing: 1,
                                }}
                              >
                                {sc.symbol}
                              </div>
                              <div
                                style={{
                                  fontSize: 8,
                                  color: '#4a7a8a',
                                  letterSpacing: 1,
                                }}
                              >
                                {sc.role}
                              </div>
                            </div>
                          </div>
                          {s ? (
                            <>
                              <div
                                style={{
                                  fontFamily: "'Space Mono',monospace",
                                  fontSize: 13,
                                  color: isUp ? '#00e676' : '#ff1744',
                                }}
                              >
                                ₹{fmt(s.ltp)}
                              </div>
                              <div
                                style={{
                                  fontSize: 10,
                                  color: isUp ? '#00e676' : '#ff1744',
                                }}
                              >
                                {sign(s.pChange)}
                                {fmt(s.pChange)}%
                              </div>
                              <div
                                style={{
                                  fontSize: 9,
                                  color: '#4a7a8a',
                                  marginTop: 3,
                                }}
                              >
                                H: {fmt(s.high)} L: {fmt(s.low)}
                              </div>
                            </>
                          ) : (
                            <div style={{ fontSize: 10, color: '#4a7a8a' }}>—</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Theory quick reference */}
              <div
                style={{
                  background: 'rgba(0,255,231,0.03)',
                  border: '1px solid rgba(0,255,231,0.1)',
                  borderRadius: 8,
                  padding: 16,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: 2,
                    color: '#4a7a8a',
                    marginBottom: 10,
                    textTransform: 'uppercase',
                  }}
                >
                  📖 Theory Quick Reference (Today)
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: 12,
                    fontSize: 10,
                  }}
                >
                  {Object.entries(M_CONFIG).map(([type, cfg]) => {
                    const st = stats.find(s => s.market_type === type)
                    const isToday = nifty.marketType === type
                    return (
                      <div
                        key={type}
                        style={{
                          padding: 10,
                          borderRadius: 6,
                          border: `1px solid ${cfg.color}33`,
                          background: isToday ? cfg.bg : 'transparent',
                        }}
                      >
                        <div
                          style={{
                            color: cfg.color,
                            fontWeight: 700,
                            marginBottom: 4,
                          }}
                        >
                          {cfg.icon} {cfg.label} {isToday && '← TODAY'}
                        </div>
                        <div style={{ color: '#4a7a8a', lineHeight: 1.8 }}>
                          <div>Gap: {cfg.gapNote}</div>
                          <div>Expected range: {type === 'FLAT' ? '72–84' : '135–150'} pts</div>
                          {st && (
                            <div style={{ color: '#c8e6f0', marginTop: 4 }}>
                              Historical avg: <b>{fmt(st.avg_range, 0)} pts</b> · Accuracy:{' '}
                              <b style={{ color: '#00e676' }}>
                                {pct(Number(st.theory_correct), Number(st.total))}
                              </b>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          HISTORY TAB
      ══════════════════════════════════════════════════════════════ */}
      {tab === 'history' && (
        <div>
          {/* Filters */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              marginBottom: 16,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontSize: 9,
                color: '#4a7a8a',
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              Filter:
            </span>
            {['', 'FLAT', 'POSITIVE', 'NEGATIVE'].map(f => (
              <button
                key={f}
                onClick={() => setFilterType(f)}
                style={{
                  fontSize: 9,
                  letterSpacing: 1,
                  padding: '4px 10px',
                  borderRadius: 3,
                  border: `1px solid ${filterType === f ? '#00ffe7' : '#0e2a35'}`,
                  background: filterType === f ? 'rgba(0,255,231,0.08)' : 'none',
                  color: filterType === f ? '#00ffe7' : '#4a7a8a',
                  cursor: 'pointer',
                  fontFamily: "'Space Mono',monospace",
                  textTransform: 'uppercase',
                }}
              >
                {f || 'ALL'}
              </button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#4a7a8a' }}>
              {histRows.length} days
            </span>
          </div>

          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: '#4a7a8a' }}>Loading…</div>
          )}
          {!loading && histRows.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60, color: '#4a7a8a' }}>
              <div style={{ fontSize: 32 }}>📭</div>
              <div style={{ marginTop: 12 }}>
                No data yet. Go to Import Data tab to fetch history.
              </div>
            </div>
          )}

          {histRows.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 11,
                }}
              >
                <thead>
                  <tr style={{ borderBottom: '2px solid #0e2a35' }}>
                    {[
                      'DATE',
                      'PREV CLOSE',
                      'OPEN',
                      'GAP (pts)',
                      'GAP %',
                      'HIGH',
                      'LOW',
                      'RANGE (H-L)',
                      'CLOSE 3:30',
                      'MOVED',
                      'TYPE',
                      'THEORY',
                    ].map(h => (
                      <th
                        key={h}
                        style={{
                          padding: '8px 10px',
                          textAlign: 'left',
                          fontSize: 8,
                          letterSpacing: 1.5,
                          color: '#4a7a8a',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {histRows.map((r, i) => {
                    const cfg = r.market_type ? M_CONFIG[r.market_type] : null
                    return (
                      <tr
                        key={r.date}
                        style={{
                          borderBottom: '1px solid rgba(14,42,53,0.4)',
                          background: i % 2 === 0 ? 'transparent' : 'rgba(8,15,20,0.5)',
                        }}
                      >
                        <td
                          style={{
                            padding: '7px 10px',
                            fontFamily: "'Space Mono',monospace",
                            fontSize: 10,
                            color: '#4a7a8a',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {r.date}
                        </td>
                        <td
                          style={{
                            padding: '7px 10px',
                            fontFamily: "'Space Mono',monospace",
                          }}
                        >
                          {fmt(r.prev_close)}
                        </td>
                        <td
                          style={{
                            padding: '7px 10px',
                            fontFamily: "'Space Mono',monospace",
                            color: r.open >= r.prev_close ? '#00e676' : '#ff1744',
                          }}
                        >
                          {fmt(r.open)}
                        </td>
                        <td
                          style={{
                            padding: '7px 10px',
                            fontFamily: "'Space Mono',monospace",
                            color:
                              r.open_gap > 0 ? '#00e676' : r.open_gap < 0 ? '#ff1744' : '#4a7a8a',
                            fontWeight: 700,
                          }}
                        >
                          {sign(r.open_gap)}
                          {fmt(r.open_gap, 0)}
                        </td>
                        <td
                          style={{
                            padding: '7px 10px',
                            fontFamily: "'Space Mono',monospace",
                            color:
                              r.open_gap_pct > 0
                                ? '#00e676'
                                : r.open_gap_pct < 0
                                  ? '#ff1744'
                                  : '#4a7a8a',
                          }}
                        >
                          {sign(r.open_gap_pct)}
                          {fmt(r.open_gap_pct, 3)}%
                        </td>
                        <td
                          style={{
                            padding: '7px 10px',
                            fontFamily: "'Space Mono',monospace",
                            color: '#00e676',
                          }}
                        >
                          {fmt(r.high)}
                        </td>
                        <td
                          style={{
                            padding: '7px 10px',
                            fontFamily: "'Space Mono',monospace",
                            color: '#ff1744',
                          }}
                        >
                          {fmt(r.low)}
                        </td>
                        <td
                          style={{
                            padding: '7px 10px',
                            fontFamily: "'Space Mono',monospace",
                            fontWeight: 600,
                            color:
                              r.day_range <= 84
                                ? '#ffc800'
                                : r.day_range <= 210
                                  ? '#00e676'
                                  : '#ff1744',
                          }}
                        >
                          {fmt(r.day_range, 0)}
                        </td>
                        <td
                          style={{
                            padding: '7px 10px',
                            fontFamily: "'Space Mono',monospace",
                            fontWeight: 700,
                          }}
                        >
                          {fmt(r.close_330)}
                        </td>
                        <td
                          style={{
                            padding: '7px 10px',
                            fontFamily: "'Space Mono',monospace",
                            color: r.points_moved > 0 ? '#00e676' : '#ff1744',
                          }}
                        >
                          {sign(r.points_moved)}
                          {fmt(r.points_moved, 0)}
                        </td>
                        <td style={{ padding: '7px 10px' }}>
                          {cfg && (
                            <span
                              style={{
                                fontSize: 9,
                                padding: '2px 7px',
                                borderRadius: 3,
                                background: cfg.bg,
                                color: cfg.color,
                                border: `1px solid ${cfg.color}44`,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {cfg.icon} {r.market_type}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                          <span style={{ fontSize: 13 }}>{r.theory_ok ? '✅' : '❌'}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          BACKTEST TAB
      ══════════════════════════════════════════════════════════════ */}
      {tab === 'backtest' && (
        <div>
          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: '#4a7a8a' }}>Loading…</div>
          )}
          {!loading && !overall && (
            <div style={{ textAlign: 'center', padding: 60, color: '#4a7a8a' }}>
              <div style={{ fontSize: 32 }}>📊</div>
              <div style={{ marginTop: 12 }}>No data yet. Import history first.</div>
            </div>
          )}
          {overall && (
            <>
              {/* Overall header */}
              <div
                style={{
                  background: 'rgba(0,255,231,0.04)',
                  border: '1px solid rgba(0,255,231,0.15)',
                  borderRadius: 8,
                  padding: 20,
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    letterSpacing: 2,
                    color: '#4a7a8a',
                    marginBottom: 12,
                    textTransform: 'uppercase',
                  }}
                >
                  📈 Overall Theory Performance
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))',
                    gap: 16,
                  }}
                >
                  {[
                    ['Total Days', overall.total_days, '#c8e6f0'],
                    ['Data From', overall.earliest, '#4a7a8a'],
                    ['Data To', overall.latest, '#4a7a8a'],
                    [
                      'Theory Correct',
                      `${overall.total_correct} / ${overall.total_days}`,
                      '#00e676',
                    ],
                    [
                      'Overall Accuracy',
                      pct(Number(overall.total_correct), Number(overall.total_days)),
                      '#00ffe7',
                    ],
                    ['Avg Day Range', fmt(overall.avg_range, 0) + ' pts', '#c8e6f0'],
                  ].map(([label, val, color]) => (
                    <div key={String(label)}>
                      <div
                        style={{
                          fontSize: 9,
                          color: '#4a7a8a',
                          letterSpacing: 1,
                          textTransform: 'uppercase',
                        }}
                      >
                        {label as string}
                      </div>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 700,
                          fontFamily: "'Space Mono',monospace",
                          color: color as string,
                          marginTop: 3,
                        }}
                      >
                        {String(val)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Per market type */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 16,
                  marginBottom: 20,
                }}
              >
                {['FLAT', 'POSITIVE', 'NEGATIVE'].map(mtype => {
                  const st = stats.find(s => s.market_type === mtype)
                  const cfg = M_CONFIG[mtype as keyof typeof M_CONFIG]
                  if (!st) return null
                  const accPct =
                    Number(st.total) > 0
                      ? ((Number(st.theory_correct) / Number(st.total)) * 100).toFixed(1)
                      : 0
                  return (
                    <div
                      key={mtype}
                      style={{
                        background: '#080f14',
                        border: `1px solid ${cfg.color}33`,
                        borderRadius: 8,
                        padding: 16,
                      }}
                    >
                      <div
                        style={{
                          color: cfg.color,
                          fontSize: 13,
                          fontWeight: 700,
                          marginBottom: 12,
                        }}
                      >
                        {cfg.icon} {mtype} DAYS
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: 10,
                        }}
                      >
                        {[
                          ['Total Days', st.total, '#c8e6f0'],
                          ['Theory ✅', st.theory_correct, '#00e676'],
                          ['Accuracy', accPct + '%', Number(accPct) >= 60 ? '#00e676' : '#ff1744'],
                          ['Avg Range', fmt(st.avg_range, 0) + ' pts', '#c8e6f0'],
                          ['Min Range', fmt(st.min_range, 0) + ' pts', '#4a7a8a'],
                          ['Max Range', fmt(st.max_range, 0) + ' pts', '#4a7a8a'],
                          ['Avg Gap', fmt(st.avg_gap, 0) + ' pts', cfg.color],
                          ['Avg Pts Moved', fmt(st.avg_pts_moved, 0) + ' pts', '#c8e6f0'],
                        ].map(([label, val, color]) => (
                          <div key={String(label)}>
                            <div
                              style={{
                                fontSize: 8,
                                color: '#4a7a8a',
                                letterSpacing: 1,
                                textTransform: 'uppercase',
                              }}
                            >
                              {label as string}
                            </div>
                            <div
                              style={{
                                fontSize: 15,
                                fontWeight: 700,
                                fontFamily: "'Space Mono',monospace",
                                color: color as string,
                              }}
                            >
                              {String(val)}
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Accuracy bar */}
                      <div style={{ marginTop: 12 }}>
                        <div
                          style={{
                            fontSize: 9,
                            color: '#4a7a8a',
                            marginBottom: 4,
                          }}
                        >
                          Theory accuracy
                        </div>
                        <div
                          style={{
                            background: '#0e2a35',
                            borderRadius: 3,
                            height: 8,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: `${accPct}%`,
                              background: Number(accPct) >= 60 ? cfg.color : '#ff1744',
                              borderRadius: 3,
                              transition: 'width 0.5s',
                            }}
                          />
                        </div>
                      </div>
                      {/* Range note */}
                      <div
                        style={{
                          marginTop: 10,
                          fontSize: 9,
                          color: '#4a7a8a',
                          lineHeight: 1.7,
                          padding: '8px',
                          background: 'rgba(0,0,0,0.2)',
                          borderRadius: 4,
                        }}
                      >
                        Theory predicts:{' '}
                        <b style={{ color: cfg.color }}>
                          {mtype === 'FLAT' ? '72–84' : '135–150'} pts
                        </b>
                        <br />
                        Actual avg: <b style={{ color: '#c8e6f0' }}>{fmt(st.avg_range, 0)} pts</b>
                        <br />
                        {Number(accPct) >= 70 ? (
                          <span style={{ color: '#00e676' }}>
                            ✅ Theory holds well for this type
                          </span>
                        ) : Number(accPct) >= 50 ? (
                          <span style={{ color: '#ffc800' }}>⚠ Theory moderately accurate</span>
                        ) : (
                          <span style={{ color: '#ff1744' }}>
                            ❌ Theory needs refinement for this type
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Theory explanation */}
              <div
                style={{
                  background: 'rgba(0,255,231,0.03)',
                  border: '1px solid rgba(0,255,231,0.1)',
                  borderRadius: 8,
                  padding: 16,
                  fontSize: 10,
                  lineHeight: 1.9,
                  color: '#4a7a8a',
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#c8e6f0',
                    marginBottom: 8,
                  }}
                >
                  📖 Theory Validation Methodology
                </div>
                <div>
                  <b style={{ color: '#00ffe7' }}>Market Type</b> is determined by open gap (today
                  open − prev 3:30 PM close):
                </div>
                <div style={{ marginLeft: 12 }}>
                  • FLAT: gap within ±40 pts → theory predicts H-L range ≤ 84 pts
                </div>
                <div style={{ marginLeft: 12 }}>
                  • POSITIVE: gap &gt; +40 pts → theory predicts H-L range 100–210 pts
                </div>
                <div style={{ marginLeft: 12 }}>
                  • NEGATIVE: gap &lt; -40 pts → theory predicts H-L range 100–210 pts
                </div>
                <div style={{ marginTop: 6 }}>
                  <b style={{ color: '#00ffe7' }}>Theory OK (✅)</b> = actual day range fell within
                  the predicted range band.
                </div>
                <div style={{ marginTop: 6, color: '#c8e6f0' }}>
                  All data sourced from Fyers 4hr candles. Last candle close of each day = 3:30 PM
                  close (exact NSE closing price).
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          IMPORT TAB
      ══════════════════════════════════════════════════════════════ */}
      {tab === 'import' && (
        <div>
          <div
            style={{
              background: 'rgba(0,255,231,0.04)',
              border: '1px solid rgba(0,255,231,0.15)',
              borderRadius: 8,
              padding: 20,
              marginBottom: 20,
            }}
          >
            <div
              style={{
                fontSize: 12,
                letterSpacing: 2,
                color: '#c8e6f0',
                marginBottom: 8,
                textTransform: 'uppercase',
              }}
            >
              ⬇ Bulk Import — Nifty History from Fyers
            </div>
            <div
              style={{
                fontSize: 10,
                color: '#4a7a8a',
                lineHeight: 1.9,
                marginBottom: 16,
              }}
            >
              Fetches Nifty 4hr candles from Fyers in 90-day windows. Extracts last candle of each
              day as 3:30 PM close.
              <br />
              All data stored in Turso. One-time operation — after this, just click{' '}
              <b style={{ color: '#00ffe7' }}>SYNC TODAY</b> daily after 3:30 PM.
            </div>
            <div
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'flex-end',
                flexWrap: 'wrap',
                marginBottom: 16,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 9,
                    color: '#4a7a8a',
                    marginBottom: 4,
                    letterSpacing: 1,
                  }}
                >
                  START DATE
                </div>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  style={{
                    background: '#030a0e',
                    border: '1px solid #0e2a35',
                    color: '#c8e6f0',
                    padding: '6px 10px',
                    borderRadius: 4,
                    fontSize: 12,
                    fontFamily: "'Space Mono',monospace",
                  }}
                />
              </div>
              <button
                onClick={() => startImport(true)}
                disabled={importing}
                style={{
                  padding: '8px 20px',
                  fontSize: 10,
                  letterSpacing: 1.5,
                  border: '1px solid #00ffe7',
                  background: 'rgba(0,255,231,0.1)',
                  color: '#00ffe7',
                  cursor: 'pointer',
                  fontFamily: "'Space Mono',monospace",
                  borderRadius: 4,
                }}
              >
                {importing ? '⟳ IMPORTING…' : '⬇ IMPORT (RESUME)'}
              </button>
              <button
                onClick={() => startImport(false)}
                disabled={importing}
                style={{
                  padding: '8px 20px',
                  fontSize: 10,
                  letterSpacing: 1.5,
                  border: '1px solid #ff1744',
                  background: 'rgba(255,23,68,0.08)',
                  color: '#ff1744',
                  cursor: 'pointer',
                  fontFamily: "'Space Mono',monospace",
                  borderRadius: 4,
                }}
              >
                🔄 REIMPORT ALL
              </button>
            </div>
            <div style={{ fontSize: 9, color: '#4a7a8a' }}>
              ⚡ IMPORT (RESUME) = skips dates already saved. Safe to run multiple times.
              <br />
              🔄 REIMPORT ALL = replaces everything from scratch.
            </div>
          </div>

          {/* Progress log */}
          {importLog.length > 0 && (
            <div
              style={{
                background: '#030a0e',
                border: '1px solid #0e2a35',
                borderRadius: 8,
                padding: 16,
                fontFamily: "'Space Mono',monospace",
                fontSize: 10,
                maxHeight: 400,
                overflowY: 'auto',
              }}
            >
              {importLog.map((msg, i) => {
                const color =
                  msg.type === 'error'
                    ? '#ff1744'
                    : msg.type === 'done'
                      ? '#00e676'
                      : msg.type === 'warning'
                        ? '#ffc800'
                        : msg.type === 'progress'
                          ? '#00ffe7'
                          : '#4a7a8a'
                return (
                  <div key={i} style={{ color, marginBottom: 3, lineHeight: 1.5 }}>
                    {msg.type === 'progress' &&
                      `[${msg.window}/${msg.total}] Fetching ${msg.from} → ${msg.to}…`}
                    {msg.type === 'window_done' &&
                      `  ✓ ${msg.from}→${msg.to}: ${msg.candles} candles, ${msg.days} days, ${msg.new} new`}
                    {msg.type === 'processing' && `  ⚙ ${msg.message}`}
                    {msg.type === 'inserting' && `  💾 Inserting… ${msg.saved}/${msg.total} rows`}
                    {msg.type === 'done' && `✅ ${msg.message}`}
                    {msg.type === 'error' && `❌ Error: ${msg.message}`}
                    {msg.type === 'warning' && `⚠ ${msg.message}`}
                    {msg.type === 'info' && `  ℹ ${msg.message}`}
                    {msg.type === 'start' &&
                      `🚀 Starting import from ${msg.startDate} (${msg.total} windows, resume=${msg.resume})`}
                  </div>
                )
              })}
              {importDone && (
                <div
                  style={{
                    color: '#00e676',
                    marginTop: 8,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  Import complete! Switch to History or Backtest tab to view data.
                </div>
              )}
              <div ref={logEndRef} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
