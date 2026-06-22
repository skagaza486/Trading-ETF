import { useMemo } from 'react'
import { useSignalBreadth } from '../../shared/hooks/useSignalBreadth'
import styles from './MiniBreadthChart.module.css'

function buildPath(values: number[], width: number, height: number): string {
  if (!values.length) return ''
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = Math.max(max - min, 0.001)

  return values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width
    const y = height - ((value - min) / range) * height
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')
}

function buildAreaPath(values: number[], width: number, height: number): string {
  if (!values.length) return ''
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = Math.max(max - min, 0.001)

  const pts = values.map((v, i) => {
    const x = (i / Math.max(values.length - 1, 1)) * width
    const y = height - ((v - min) / range) * height
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })
  const lastX = ((values.length - 1) / Math.max(values.length - 1, 1) * width).toFixed(2)
  return `M${pts[0]} L${pts.slice(1).join(' L')} L${lastX},${height} L0,${height} Z`
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

  const width = 320
  const height = 88
  const values = points.map(row => row.ratio)
  const path = buildPath(values, width, height)
  const areaPath = buildAreaPath(values, width, height)
  const latest = values.at(-1) ?? 0
  const latestPoint = points.at(-1)
  const avg5d = values.slice(-5).reduce((sum, value) => sum + value, 0) / Math.min(values.length, 5)
  const high30d = Math.max(...values)
  const low30d = Math.min(...values)
  const prevAvg5d = values.length >= 10
    ? values.slice(-10, -5).reduce((s, v) => s + v, 0) / 5
    : avg5d
  const trend = avg5d > prevAvg5d * 1.005 ? '↑' : avg5d < prevAvg5d * 0.995 ? '↓' : '→'
  const trendClass = trend === '↑' ? styles.trendUp : trend === '↓' ? styles.trendDown : styles.trendFlat
  const interpretation = latest <= 0.03
    ? '真正強勢的突破/反彈仍然偏少，今天較像局部修復，未算全面轉強。'
    : latest <= 0.06
      ? '偏強訊號開始回升，但仍未到全面擴散，宜觀察是否持續。'
      : '偏強訊號擴散明顯，市場進攻面比前期更完整。'

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <div>
          <h2>偏強訊號趨勢（30天）</h2>
          <p>LONG_BREAK / VCP / 反彈 佔全市場比率</p>
        </div>
        <div className={styles.latestWrap}>
          <strong className={styles.latest}>{(latest * 100).toFixed(0)}%</strong>
          <span className={trendClass}>{trend}</span>
        </div>
      </div>
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span>5日均值</span>
          <strong>{(avg5d * 100).toFixed(0)}%</strong>
        </div>
        <div className={styles.stat}>
          <span>30天高位</span>
          <strong>{(high30d * 100).toFixed(0)}%</strong>
        </div>
        <div className={styles.stat}>
          <span>30天低位</span>
          <strong>{(low30d * 100).toFixed(0)}%</strong>
        </div>
        {latestPoint && (
          <div className={styles.stat}>
            <span>今日結構</span>
            <strong>{latestPoint.strongBull}/{latestPoint.base}/{latestPoint.bear}</strong>
          </div>
        )}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className={styles.chart} aria-label="偏強訊號趨勢">
        <defs>
          <linearGradient id="breadthGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} className={styles.area} />
        <path d={path} className={styles.line} />
      </svg>
      <div className={styles.axis}>
        <span>{points[0]?.date.slice(5) ?? ''}</span>
        <span>{points.at(-1)?.date.slice(5) ?? ''}</span>
      </div>
      <p className={styles.summary}>{interpretation}</p>
    </section>
  )
}
