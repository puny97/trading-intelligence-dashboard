'use client'
import { StockData } from '@/lib/marketData'

export default function RapidMovers({ data }: { data: Record<string, StockData> }) {
  const movers = Object.values(data)
    .sort((a, b) => parseFloat(b.speed) - parseFloat(a.speed))
    .slice(0, 12)

  return (
    <div className="section-panel">
      <div className="panel-header">
        <div className="panel-title">
          <span>⚡</span> RAPID MOVERS
        </div>
        <div className="live-badge">● LIVE</div>
      </div>
      <div className="table-header rapid-row">
        <span>#</span>
        <span>SYMBOL</span>
        <span style={{ textAlign: 'right' }}>PRICE</span>
        <span style={{ textAlign: 'right' }}>CHG%</span>
        <span style={{ textAlign: 'right' }}>SPEED</span>
      </div>

      {movers.map((s, i) => {
        const isUp = parseFloat(s.chgPct) >= 0
        const color = isUp ? 'var(--green)' : 'var(--red)'
        const bg = isUp ? 'rgba(0,230,118,0.08)' : 'rgba(255,23,68,0.08)'
        const speed = parseFloat(s.speed)
        const bars = Math.min(Math.ceil(speed / 0.3), 5)

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
            <div className="speed-indicator">
              {Array.from({ length: 5 }, (_, j) => (
                <div
                  key={j}
                  className={`speed-bar${j < bars ? (isUp ? ' active-up' : ' active-down') : ''}`}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
