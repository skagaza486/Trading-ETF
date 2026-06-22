import { useMemo } from 'react'
import type { SectorLeadership } from '../../shared/market/sectorLeadership'
import type { StockSnapshotEntry } from '../../../types/snapshot'
import { useApp } from '../../app/providers/AppContext'
import styles from './SectorTreemap.module.css'

const BULL = new Set(['LONG_BREAK', 'LONG_VCP', 'LONG_BOUNCE', 'LONG_BASE'])
const BEAR = new Set(['SHORT_BREAK', 'SHORT_BASE', 'SHORT_WATCH', 'AVOID_CHOP'])

function tileColor(label: StockSnapshotEntry['label']) {
  if (BULL.has(label)) return styles.tileBull
  if (BEAR.has(label)) return styles.tileBear
  return styles.tileNeutral
}

function formatCap(cap: number) {
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(1)}T`
  if (cap >= 1e9)  return `$${(cap / 1e9).toFixed(0)}B`
  return `$${(cap / 1e6).toFixed(0)}M`
}

type SectorRowProps = {
  sector: SectorLeadership
  onSelect: (ticker: string, name: string) => void
}

function SectorRow({ sector, onSelect }: SectorRowProps) {
  const stocks = useMemo(() => {
    const sorted = [...sector.stocks].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
    const totalCap = sorted.reduce((s, st) => s + (st.marketCap ?? 0), 0)
    return sorted.map(st => ({
      stock: st,
      pct: totalCap > 0 ? ((st.marketCap ?? 0) / totalCap) * 100 : 100 / sorted.length,
      hasCap: (st.marketCap ?? 0) > 0,
    }))
  }, [sector.stocks])

  const hasAnyCap = stocks.some(s => s.hasCap)

  return (
    <div className={styles.sectorRow}>
      <div className={styles.sectorLabel}>
        <span className={styles.sectorName}>{sector.sectorZh}</span>
        <span className={styles.sectorCount}>{sector.count} 檔</span>
      </div>
      <div className={styles.tilesRow}>
        {stocks.map(({ stock, pct }) => (
          <button
            key={stock.ticker}
            className={`${styles.tile} ${tileColor(stock.label)}`}
            style={{ flexBasis: `calc(${pct}% - 3px)` }}
            title={`${stock.ticker} ${stock.name}${stock.marketCap ? ' · ' + formatCap(stock.marketCap) : ''} · ${stock.label}`}
            onClick={() => onSelect(stock.ticker, stock.name)}
          >
            <span className={styles.tileTicker}>{stock.ticker}</span>
            {stock.marketCap && pct >= 5 && (
              <span className={styles.tileCap}>{formatCap(stock.marketCap)}</span>
            )}
          </button>
        ))}
      </div>
      {!hasAnyCap && (
        <p className={styles.noCapNote}>市值數據缺失（等下次 Actions 快照）</p>
      )}
    </div>
  )
}

type Props = {
  sectors: SectorLeadership[]
}

export function SectorTreemap({ sectors }: Props) {
  const { openDetail } = useApp()

  const sorted = useMemo(() =>
    [...sectors].sort((a, b) => {
      const capA = a.stocks.reduce((s, st) => s + (st.marketCap ?? 0), 0)
      const capB = b.stocks.reduce((s, st) => s + (st.marketCap ?? 0), 0)
      return capB - capA
    }),
    [sectors]
  )

  return (
    <div className={styles.treemap}>
      <div className={styles.legend}>
        <span className={`${styles.legendDot} ${styles.tileBull}`} />看漲訊號
        <span className={`${styles.legendDot} ${styles.tileNeutral}`} />中性/觀望
        <span className={`${styles.legendDot} ${styles.tileBear}`} />偏弱訊號
        <span className={styles.legendNote}>格子寬度 ≈ 市值比例</span>
      </div>
      {sorted.map(sector => (
        <SectorRow
          key={sector.sectorZh}
          sector={sector}
          onSelect={(ticker, name) => openDetail({ ticker, name })}
        />
      ))}
    </div>
  )
}
