'use client'
import { IndexData } from '@/lib/marketData'

export default function IndexStrip({ indices }: { indices: IndexData[] }) {
  return (
    <div className="index-strip">
      {indices.map(idx => (
        <div key={idx.id} className={`index-card ${idx.isUp ? 'up' : 'down'}`}>
          <div className="index-name">{idx.label}</div>
          <div className="index-value">{idx.value}</div>
          <div className={`index-change ${idx.isUp ? 'up-text' : 'down-text'}`}>{idx.chg}</div>
        </div>
      ))}
    </div>
  )
}
