import type { UiMode } from '../../app/providers/AppContext'
import { InfoDot } from '../../shared/components/InfoDot'
import styles from './MetricCard.module.css'

type Breadth = { pctAboveEma50: number; pctAboveEma200: number; advancers: number; decliners: number } | null

function Bar({ pct }: { pct: number }) {
  const color = pct >= 60 ? 'var(--color-gain)' : pct >= 40 ? 'var(--color-warn)' : 'var(--color-loss)'
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
      <div className={styles.title}>市寬 <InfoDot text="全市場股票中，有多少百分比股價企穩在 50 日平均線之上。數字越高，代表越多股票處於上升趨勢、市場越健康。" /></div>
      <div className={styles.value} style={{ color }}>{pctAboveEma50}%</div>
      <div className={styles.sub}>企穩 EMA50</div>
      <Bar pct={pctAboveEma50} />
      {mode === 'pro' && (
        <div className={styles.proDetail}>
          <span>EMA200: {pctAboveEma200}%</span>
          <span title="按信號分類統計，非當日實際升跌家數">偏強訊號 {advancers} · 偏弱 {decliners}</span>
        </div>
      )}
    </div>
  )
}
