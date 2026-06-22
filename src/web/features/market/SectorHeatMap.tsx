import { useMemo } from 'react'
import { useApp } from '../../app/providers/AppContext'
import { buildSectorLeadership } from '../../shared/market/sectorLeadership'
import type { StockSnapshotEntry } from '../../../types/snapshot'
import styles from './SectorHeatMap.module.css'

export function SectorHeatMap({ stocks }: { stocks: StockSnapshotEntry[] }) {
  const { setView } = useApp()
  const bars = useMemo(() => buildSectorLeadership(stocks), [stocks])

  if (!bars.length) return null

  return (
    <div className={styles.section}>
      <button className={styles.heading} onClick={() => setView('sectors')}>
        板塊速覽 <span className={styles.more}>查看詳情 →</span>
      </button>
      <div className={styles.grid}>
        {bars.map(b => {
          const cls = b.bullishPct >= 50 ? styles.bull : b.bullishPct >= 25 ? styles.mid : styles.bear
          return (
            <div key={b.sectorZh} className={`${styles.pill} ${cls}`}>
              <span className={styles.name}>{b.sectorZh}</span>
              <span className={styles.pct}>{Math.round(b.bullishPct)}%</span>
              <span className={styles.cnt}>({b.bullish}/{b.count})</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
