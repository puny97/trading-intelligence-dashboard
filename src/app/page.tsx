import Dashboard from '@/components/Dashboard'
import FyersDashboard from '@/components/FyersDashboard'
import DealsPanel from '@/components/DealsPanel'
import DealTracker from '@/components/DealTracker'

export default function Home() {
  return (
    <>
      <Dashboard />
      <div style={{ borderTop: '2px solid #0e2a35', marginTop: 8 }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 20px 40px' }}>
          <FyersDashboard />
          <div
            style={{
              borderTop: '2px solid #0e2a35',
              paddingTop: 24,
              marginTop: 8,
            }}
          >
            <DealsPanel />
          </div>
          <div
            style={{
              borderTop: '2px solid #0e2a35',
              paddingTop: 24,
              marginTop: 24,
            }}
          >
            <DealTracker />
          </div>
        </div>
      </div>
    </>
  )
}
