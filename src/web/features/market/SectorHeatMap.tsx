import { useMemo } from 'react'
import { useApp } from '../../app/providers/AppContext'
import { getStockMeta } from '../../shared/i18n/stockNames'
import type { StockSnapshotEntry } from '../../../types/snapshot'
import styles from './SectorHeatMap.module.css'

const BULL_LABELS = new Set(['LONG_BREAK','LONG_VCP','LONG_BOUNCE','LONG_BASE'])
const BEAR_LABELS = new Set(['SHORT_BREAK','SHORT_BASE','SHORT_WATCH','AVOID_CHOP'])

type SectorBar = { sectorZh: string; bullPct: number; count: number }

function buildBars(stocks: StockSnapshotEntry[]): SectorBar[] {
  const map = new Map<string, { bull: number; total: number }>()
  for (const s of stocks) {
    const { sectorZh } = getStockMeta(s.ticker, s.name)
    if (!map.has(sectorZh)) map.set(sectorZh, { bull: 0, total: 0 })
    const row = map.get(sectorZh)!
    row.total++
    if (BULL_LABELS.has(s.label)) row.bull++
  }

  return Array.from(map.entries())
    .map(([sectorZh, { bull, total }]) => ({
      sectorZh,
      bullPct: total ? Math.round((bull / total) * 100) : 0,
      count: total,
    }))
    .filter(b => b.count >= 3)
    .sort((a, b) => b.bullPct - a.bullPct)
}

export function SectorHeatMap({ stocks }: { stocks: StockSnapshotEntry[] }) {
  const { setView } = useApp()
  const bars = useMemo(() => buildBars(stocks), [stocks])

  if (!bars.length) return null

  return (
    <div className={styles.section}>
      <button className={styles.heading} onClick={() => setView('sectors')}>
        板塊速覽 <span className={styles.more}>查看詳情 →</span>
      </button>
      <div className={styles.grid}>
        {bars.map(b => {
          const cls = b.bullPct >= 50 ? styles.bull : b.bullPct >= 25 ? styles.mid : styles.bear
          return (
            <div key={b.sectorZh} className={`${styles.pill} ${cls}`}>
              <span className={styles.name}>{b.sectorZh}</span>
              <span className={styles.pct}>{b.bullPct}%</span>
              <span className={styles.cnt}>({Math.round(b.bullPct * b.count / 100)}/{b.count})</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
