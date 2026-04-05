import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Magic Dashboard — Nifty Intelligence',
  description: 'Pre-market direction, Support & Resistance, History & Backtest',
}

export default function MagicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 1500, margin: '0 auto', padding: '0 16px 60px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 0',
          borderBottom: '1px solid #0e2a35',
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <a
            href="/"
            style={{
              color: '#00ffe7',
              textDecoration: 'none',
              fontSize: 11,
              letterSpacing: 2,
            }}
          >
            ← MAIN DASHBOARD
          </a>
          <span style={{ color: '#0e2a35' }}>|</span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 3,
              color: '#c8e6f0',
            }}
          >
            🪄 MAGIC DASHBOARD
          </span>
        </div>
        <div style={{ fontSize: 9, color: '#4a7a8a', letterSpacing: 1 }}>
          NIFTY INTELLIGENCE · SUPPORT &amp; RESISTANCE · THEORY BACKTEST
        </div>
      </div>
      {children}
    </div>
  )
}
