'use client'
import { StockData, fmtVol } from '@/lib/marketData'

export default function VolumeBuzzers({ data }: { data: Record<string, StockData> }) {
  const buzzers = Object.values(data)
    .filter(s => parseFloat(s.volRatio) > 1.5)
    .sort((a, b) => parseFloat(b.volRatio) - parseFloat(a.volRatio))
    .slice(0, 12)

  return (
    <div className="section-panel">
      <div className="panel-header">
        <div className="panel-title"><span>🔊</span> VOLUME BUZZERS</div>
        <div className="live-badge">● LIVE</div>
      </div>
      <div className="table-header vol-row">
        <span>#</span>
        <span>SYMBOL</span>
        <span style={{ textAlign: 'right' }}>PRICE</span>
        <span style={{ textAlign: 'right' }}>CHG%</span>
        <span style={{ textAlign: 'right' }}>VOLUME</span>
        <span style={{ textAlign: 'right' }}>VOL×</span>
      </div>

      {buzzers.length === 0 ? (
        <div className="no-data">No significant volume spikes detected</div>
      ) : (
        buzzers.map((s, i) => {
          const ratio = parseFloat(s.volRatio)
          const barWidth = Math.min((ratio / 8) * 100, 100)
          const isUp = parseFloat(s.chgPct) >= 0
          const color = isUp ? 'var(--green)' : 'var(--red)'
          const bg = isUp ? 'rgba(0,230,118,0.08)' : 'rgba(255,23,68,0.08)'
          const isNew = ratio > 4

          return (
            <div key={s.sym} className={`stock-row vol-row${isNew ? ' new-entry' : ''}`}>
              <span className="col-rank">{i + 1}</span>
              <div>
                <div className="col-symbol">{s.sym}</div>
                <div className="col-name">{s.sector}</div>
              </div>
              <div className="col-price" style={{ color }}>
                ₹{parseFloat(s.price).toLocaleString('en-IN')}
              </div>
              <div className="col-change" style={{ color, background: bg }}>
                {isUp ? '+' : ''}{s.chgPct}%
              </div>
              <div className="col-vol">{fmtVol(s.volume)}</div>
              <div style={{ textAlign: 'right' }}>
                <div className="ratio-bar-wrap">
                  <div className="ratio-bar">
                    <div className="ratio-fill" style={{ width: `${barWidth}%` }} />
                  </div>
                  <span className="ratio-val">{s.volRatio}×</span>
                </div>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
