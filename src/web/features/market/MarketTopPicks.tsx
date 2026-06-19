import { useMemo } from 'react'
import { useApp } from '../../app/providers/AppContext'
import { SignalBadge } from '../../shared/components/SignalBadge'
import { getStockMeta } from '../../shared/i18n/stockNames'
import type { StockSnapshotEntry } from '../../../types/snapshot'
import styles from './MarketTopPicks.module.css'

const STRONG_LABELS = ['LONG_BREAK', 'LONG_VCP', 'LONG_BOUNCE']
const LABEL_PRIORITY: Record<string, number> = {
  LONG_BREAK: 0, LONG_VCP: 1, LONG_BOUNCE: 2, LONG_BASE: 3
}

function sortPicks(stocks: StockSnapshotEntry[]): StockSnapshotEntry[] {
  return [...stocks].sort((a, b) => {
    const pa = LABEL_PRIORITY[a.label] ?? 99
    const pb = LABEL_PRIORITY[b.label] ?? 99
    if (pa !== pb) return pa - pb
    return (b.rsRank ?? 0) - (a.rsRank ?? 0)
  })
}

export function MarketTopPicks({ stocks }: { stocks: StockSnapshotEntry[] }) {
  const { openDetail } = useApp()

  const picks = useMemo(() => {
    const strong = stocks.filter(s => STRONG_LABELS.includes(s.label))
    // If fewer than 4 strong signals, supplement with LONG_BASE by RS rank
    if (strong.length < 4) {
      const base = stocks
        .filter(s => s.label === 'LONG_BASE')
        .sort((a, b) => (b.rsRank ?? 0) - (a.rsRank ?? 0))
        .slice(0, 8 - strong.length)
      return sortPicks([...strong, ...base]).slice(0, 8)
    }
    return sortPicks(strong).slice(0, 8)
  }, [stocks])

  if (!picks.length) return null

  const PREV_WEAK = new Set(['NEUTRAL', 'AVOID_CHOP', 'WATCH', 'SHORT_WATCH', 'SHORT_BASE', 'SHORT_BREAK'])

  return (
    <div className={styles.section}>
      <h3 className={styles.heading}>值得留意</h3>
      <div className={styles.list}>
        {picks.map(s => {
          const meta = getStockMeta(s.ticker, s.name)
          const isFresh = STRONG_LABELS.includes(s.label) && PREV_WEAK.has(s.previousLabel ?? '')
          return (
            <button
              key={s.ticker}
              className={styles.row}
              onClick={() => openDetail({ ticker: s.ticker, name: meta.nameZh })}
            >
              <div className={styles.left}>
                <div className={styles.tickerRow}>
                  <span className={styles.ticker}>{s.ticker}</span>
                  {isFresh && <span className={styles.fresh}>新</span>}
                </div>
                <span className={styles.name}>{meta.nameZh}</span>
              </div>
              <div className={styles.right}>
                {s.earningsWithinWindow && <span className={styles.earnings}>財報</span>}
                {s.rsRank !== null && <span className={styles.rs}>RS {s.rsRank}</span>}
                <SignalBadge label={s.label} />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
