'use client'
import { StockData, fmtVol } from '@/lib/marketData'

interface Props {
  data: Record<string, StockData>
  mode: 'gainers' | 'losers'
}

export default function GainersLosers({ data, mode }: Props) {
  const sorted = Object.values(data).sort((a, b) => parseFloat(b.chgPct) - parseFloat(a.chgPct))
  const list = mode === 'gainers' ? sorted.slice(0, 10) : sorted.slice(-10).reverse()
  const isGainers = mode === 'gainers'

  return (
    <div className="section-panel">
      <div className="panel-header">
        <div className="panel-title">
          <span>{isGainers ? '📈' : '📉'}</span>
          {isGainers ? 'TOP GAINERS' : 'TOP LOSERS'}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--muted)' }}>NSE · Today</div>
      </div>
      <div className="table-header rapid-row">
        <span>#</span>
        <span>SYMBOL</span>
        <span style={{ textAlign: 'right' }}>PRICE</span>
        <span style={{ textAlign: 'right' }}>CHG%</span>
        <span style={{ textAlign: 'right' }}>VOLUME</span>
      </div>

      {list.map((s, i) => {
        const isUp = parseFloat(s.chgPct) >= 0
        const color = isUp ? 'var(--green)' : 'var(--red)'
        const bg = isUp ? 'rgba(0,230,118,0.08)' : 'rgba(255,23,68,0.08)'

        return (
          <div key={s.sym} className="stock-row rapid-row">
            <span className="col-rank">{i + 1}</span>
            <div>
              <div className="col-symbol">{s.sym}</div>
              <div className="col-name">{s.sector}</div>
            </div>
            <div className="col-price" style={{ color }}>
              ₹{parseFloat(s.price).toLocaleString('en-IN')}
            </div>
            <div className="col-change" style={{ color, background: bg }}>
              {isUp ? '+' : ''}
              {s.chgPct}%
            </div>
            <div className="col-vol" style={{ textAlign: 'right' }}>
              {fmtVol(s.volume)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
