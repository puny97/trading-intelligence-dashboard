'use client'
import { Alert } from '@/lib/marketData'

export default function AlertFeed({ alerts }: { alerts: Alert[] }) {
  return (
    <div className="alert-feed">
      <div className="panel-header">
        <div className="panel-title"><span>🔔</span> LIVE ALERTS</div>
        <div className="live-badge">● LIVE</div>
      </div>
      <div className="alert-scroll">
        {alerts.length === 0 ? (
          <div className="no-data">Waiting for market data...</div>
        ) : (
          alerts.slice(0, 8).map((a, i) => {
            const cls = a.type === 'red' ? 'red-alert' : a.type === 'yellow' ? 'yellow-alert' : ''
            return (
              <div key={i} className={`alert-item ${cls}`}>
                <span className="alert-time">{a.time}</span>
                <span className="alert-sym">{a.sym}</span>
                <span className="alert-msg">{a.msg}</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
