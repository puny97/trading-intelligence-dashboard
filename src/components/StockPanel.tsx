'use client'
import { useRef, useEffect } from 'react'
import { StockRow, FetchStatus, fmtPrice, fmtVol } from '@/lib/types'

interface Props {
  title: string
  icon: string
  stocks: StockRow[]
  status: FetchStatus
  error?: string
  mode: 'vol-buzzer' | 'gainers' | 'losers' | 'active'
  exchange: 'NSE' | 'BSE' | 'BOTH'
  // Map of symbol → previous data for flash detection
  prevStocks?: Map<string, StockRow>
}

export default function StockPanel({
  title,
  icon,
  stocks,
  status,
  error,
  mode,
  exchange,
  prevStocks,
}: Props) {
  const isUp = (s: StockRow) => s.pChange >= 0
  const color = (s: StockRow) => (isUp(s) ? 'var(--green)' : 'var(--red)')
  const bg = (s: StockRow) => (isUp(s) ? 'rgba(0,230,118,0.08)' : 'rgba(255,23,68,0.08)')

  // Track per-row DOM refs so we can imperatively add/remove flash classes
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const exBadge = (ex: string) =>
    ex === 'NSE' ? (
      <span className="source-badge source-nse">NSE</span>
    ) : (
      <span className="source-badge source-bse">BSE</span>
    )

  // Flash effect when price or volume changes
  useEffect(() => {
    if (!prevStocks || !stocks.length) return
    stocks.forEach(s => {
      const prev = prevStocks.get(s.symbol)
      if (!prev) return
      const el = rowRefs.current.get(s.symbol)
      if (!el) return

      // Price changed → flash green or red
      if (s.ltp !== prev.ltp) {
        const cls = s.ltp > prev.ltp ? 'flash-up' : 'flash-down'
        el.classList.remove('flash-up', 'flash-down', 'flash-buzz')
        void el.offsetWidth // force reflow to restart animation
        el.classList.add(cls)
        setTimeout(() => el.classList.remove(cls), 600)
      }

      // Volume buzzer: volRatio jumped by > 0.5 → buzz flash
      if (mode === 'vol-buzzer' && s.volRatio && prev.volRatio) {
        if (s.volRatio - prev.volRatio > 0.5) {
          el.classList.remove('flash-up', 'flash-down', 'flash-buzz')
          void el.offsetWidth
          el.classList.add('flash-buzz')
          setTimeout(() => el.classList.remove('flash-buzz'), 900)
        }
      }
    })
  }, [stocks, prevStocks, mode])

  return (
    <div className="section-panel">
      <div className="panel-header">
        <div className="panel-title">
          <span>{icon}</span> {title}
        </div>
        <div className="live-badge">● LIVE</div>
      </div>

      {mode === 'vol-buzzer' ? (
        <div className="table-header vol-row">
          <span>#</span>
          <span>SYMBOL</span>
          <span style={{ textAlign: 'right' }}>PRICE</span>
          <span style={{ textAlign: 'right' }}>CHG%</span>
          <span style={{ textAlign: 'right' }}>VOLUME</span>
          <span style={{ textAlign: 'right' }}>VOL×</span>
        </div>
      ) : (
        <div className="table-header rapid-row">
          <span>#</span>
          <span>SYMBOL</span>
          <span style={{ textAlign: 'right' }}>PRICE</span>
          <span style={{ textAlign: 'right' }}>CHG%</span>
          <span style={{ textAlign: 'right' }}>VOLUME</span>
        </div>
      )}

      {status === 'loading' && stocks.length === 0 && (
        <div className="loading-state">
          <div className="spinner" />
          Fetching live data...
        </div>
      )}
      {status === 'error' && <div className="error-state">⚠ {error || 'Failed to fetch.'}</div>}
      {status === 'ok' && stocks.length === 0 && (
        <div className="no-data">No data available right now</div>
      )}

      {stocks.map((s, i) => {
        const ratio = s.volRatio ?? 0
        const barWidth = Math.min((ratio / 8) * 100, 100)

        return (
          <div
            key={`${s.exchange}-${s.symbol}`}
            ref={el => {
              if (el) rowRefs.current.set(s.symbol, el)
            }}
            className={`stock-row ${mode === 'vol-buzzer' ? 'vol-row' : 'rapid-row'}`}
          >
            <span className="col-rank">{i + 1}</span>

            <div>
              <div className="col-symbol">{s.symbol || s.name?.substring(0, 10)}</div>
              <div className="col-name">
                {s.name?.substring(0, 18)}
                {exchange === 'BOTH' && <> · {exBadge(s.exchange)}</>}
              </div>
            </div>

            <div className="col-price" style={{ color: color(s) }}>
              ₹{fmtPrice(s.ltp)}
            </div>

            <div className="col-change" style={{ color: color(s), background: bg(s) }}>
              {isUp(s) ? '+' : ''}
              {s.pChange.toFixed(2)}%
            </div>

            {mode === 'vol-buzzer' ? (
              <>
                <div className="col-vol">{fmtVol(s.volume)}</div>
                <div style={{ textAlign: 'right' }}>
                  <div className="ratio-bar-wrap">
                    <div className="ratio-bar">
                      <div className="ratio-fill" style={{ width: `${barWidth}%` }} />
                    </div>
                    <span className="ratio-val">{ratio.toFixed(1)}×</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="col-vol">{fmtVol(s.volume)}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
