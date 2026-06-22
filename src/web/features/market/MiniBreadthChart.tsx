import { useMemo } from 'react'
import { useSignalBreadth } from '../../shared/hooks/useSignalBreadth'
import styles from './MiniBreadthChart.module.css'

function pct(value: number) {
  return `${(value * 100).toFixed(0)}%`
}

export function MiniBreadthChart() {
  const breadth = useSignalBreadth(30)

  const points = useMemo(() => {
    if (breadth.status !== 'ok') return []
    return breadth.rows
      .filter(row => row.total > 0)
      .map(row => ({
        date: row.date,
        ratio: row.strongBull / row.total,
        strongBull: row.strongBull,
        base: row.base,
        bear: row.bear,
        total: row.total,
      }))
  }, [breadth])

  if (breadth.status !== 'ok' || points.length < 5) return null

  const latest = points.at(-1)
  if (!latest) return null

  const avg5d = points.slice(-5).reduce((sum, point) => sum + point.ratio, 0) / Math.min(points.length, 5)
  const prevAvg5d = points.length >= 10
    ? points.slice(-10, -5).reduce((sum, point) => sum + point.ratio, 0) / 5
    : avg5d
  const delta = avg5d - prevAvg5d
  const isImproving = delta > 0.005
  const isWeak = latest.ratio <= 0.03
  const isConstructive = latest.ratio >= 0.06

  const verdict = isConstructive
    ? '可進攻'
    : isWeak
      ? '先等擴散'
      : '可小試，但不宜太重'

  const takeaway = isConstructive
    ? '偏強訊號已擴散到較多股票，若板塊與量價也配合，今天可以先看主流方向。'
    : isWeak
      ? '真正強勢的 setup 仍偏少，今天較像局部修復盤，耐心比出手更重要。'
      : '市場有零星可做標的，但尚未全面擴散，較適合挑最強板塊與最乾淨結構。'

  const trendText = isImproving
    ? '比前 5 日改善'
    : delta < -0.005
      ? '比前 5 日轉弱'
      : '與前 5 日相若'

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <div>
          <h2>今日進攻面</h2>
          <p>看今天真正偏強的 setup 有沒有擴散開來</p>
        </div>
        <div className={styles.verdictWrap}>
          <strong className={isConstructive ? styles.verdictGood : isWeak ? styles.verdictWeak : styles.verdictMid}>
            {verdict}
          </strong>
          <span>{trendText}</span>
        </div>
      </div>

      <div className={styles.stats}>
        <div className={styles.statPrimary}>
          <span>偏強比例</span>
          <strong>{pct(latest.ratio)}</strong>
          <small>{latest.strongBull}/{latest.total} 檔</small>
        </div>
        <div className={styles.stat}>
          <span>今日偏強</span>
          <strong>{latest.strongBull}</strong>
          <small>LONG_BREAK / VCP / BOUNCE</small>
        </div>
        <div className={styles.stat}>
          <span>底部準備</span>
          <strong>{latest.base}</strong>
          <small>等待突破的 base</small>
        </div>
        <div className={styles.stat}>
          <span>偏弱訊號</span>
          <strong>{latest.bear}</strong>
          <small>short / avoid / risk-off</small>
        </div>
      </div>

      <p className={styles.summary}>{takeaway}</p>
      <p className={styles.footnote}>資料截至 {latest.date} · 5日均值 {pct(avg5d)}</p>
    </section>
  )
}
