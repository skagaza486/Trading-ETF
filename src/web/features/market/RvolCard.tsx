import type { StockSnapshotEntry } from '../../../types/snapshot'
import styles from './MetricCard.module.css'

function medianRvol(stocks: StockSnapshotEntry[]): number | null {
  const vals = stocks.map(s => s.indicators.rvol).filter((v): v is number => v !== null)
  if (!vals.length) return null
  vals.sort((a, b) => a - b)
  const mid = Math.floor(vals.length / 2)
  return vals.length % 2 === 0 ? (vals[mid - 1] + vals[mid]) / 2 : vals[mid]
}

function pctAbove(stocks: StockSnapshotEntry[], threshold: number): number {
  const vals = stocks.map(s => s.indicators.rvol).filter((v): v is number => v !== null)
  if (!vals.length) return 0
  return Math.round((vals.filter(v => v >= threshold).length / vals.length) * 100)
}

export function RvolCard({ stocks }: { stocks: StockSnapshotEntry[] }) {
  const median = medianRvol(stocks)
  const pctHigh = pctAbove(stocks, 1.5)

  const level = median === null ? '—' : median.toFixed(2)
  const color = median === null ? 'var(--text-muted)'
    : median >= 1.5 ? 'var(--color-gain)'
    : median >= 1.0 ? 'var(--text-primary)'
    : 'var(--color-loss)'
  const label = median === null ? '—'
    : median >= 1.5 ? '量能旺盛' : median >= 1.0 ? '量能正常' : '量能萎縮'

  return (
    <div className={styles.card}>
      <div className={styles.icon}>📊</div>
      <div className={styles.title}>市場量能 RVOL</div>
      <div className={styles.value} style={{ color }}>{level}</div>
      <div className={styles.sub}>{label}</div>
      <div className={styles.proDetail}>
        <span>RVOL≥1.5</span>
        <span>{pctHigh}% 個股</span>
      </div>
    </div>
  )
}
