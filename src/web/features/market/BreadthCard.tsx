import type { UiMode } from '../../app/providers/AppContext'
import styles from './MetricCard.module.css'

type Breadth = { pctAboveEma50: number; pctAboveEma200: number; advancers: number; decliners: number } | null

function Bar({ pct }: { pct: number }) {
  const color = pct >= 60 ? '#38f19d' : pct >= 40 ? '#ffbf3c' : '#ff7b7b'
  return (
    <div className={styles.barTrack}>
      <div className={styles.barFill} style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export function BreadthCard({ breadth, mode }: { breadth: Breadth; mode: UiMode }) {
  if (!breadth) return (
    <div className={styles.card}>
      <div className={styles.icon}>📈</div>
      <div className={styles.title}>市寬</div>
      <div className={styles.value}>—</div>
    </div>
  )

  const { pctAboveEma50, pctAboveEma200, advancers, decliners } = breadth
  const color = pctAboveEma50 >= 60 ? 'var(--color-gain)' : pctAboveEma50 >= 40 ? 'var(--color-warn)' : 'var(--color-loss)'

  return (
    <div className={styles.card}>
      <div className={styles.icon}>📈</div>
      <div className={styles.title}>市寬 <span className={styles.hint}>❓</span></div>
      <div className={styles.value} style={{ color }}>{pctAboveEma50}%</div>
      <div className={styles.sub}>企穩 EMA50</div>
      <Bar pct={pctAboveEma50} />
      {mode === 'pro' && (
        <div className={styles.proDetail}>
          <span>EMA200: {pctAboveEma200}%</span>
          <span>升↑{advancers} 跌↓{decliners}</span>
        </div>
      )}
    </div>
  )
}
