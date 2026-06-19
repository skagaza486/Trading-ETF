import { useMemo } from 'react'
import { useApp } from '../../app/providers/AppContext'
import { SignalBadge } from '../../shared/components/SignalBadge'
import { getStockMeta } from '../../shared/i18n/stockNames'
import type { StockSnapshotEntry } from '../../../types/snapshot'
import styles from './MarketTopPicks.module.css'

const PRIORITY = ['LONG_BREAK', 'LONG_VCP', 'LONG_BOUNCE']

export function MarketTopPicks({ stocks }: { stocks: StockSnapshotEntry[] }) {
  const { openDetail } = useApp()

  const picks = useMemo(() => {
    return stocks
      .filter(s => PRIORITY.includes(s.label))
      .sort((a, b) => PRIORITY.indexOf(a.label) - PRIORITY.indexOf(b.label))
      .slice(0, 5)
  }, [stocks])

  if (!picks.length) return null

  return (
    <div className={styles.section}>
      <h3 className={styles.heading}>今日值得留意</h3>
      <div className={styles.list}>
        {picks.map(s => {
          const meta = getStockMeta(s.ticker, s.name)
          return (
            <button
              key={s.ticker}
              className={styles.row}
              onClick={() => openDetail({ ticker: s.ticker, name: meta.nameZh })}
            >
              <div className={styles.left}>
                <span className={styles.ticker}>{s.ticker}</span>
                <span className={styles.name}>{meta.nameZh}</span>
              </div>
              <SignalBadge label={s.label} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
