import { useState, useEffect } from 'react'
import { fetchYahooTickerHistory } from '../../../services/marketData/yahooFinanceProvider'
import { useApp } from '../../app/providers/AppContext'
import { Sparkline } from '../../shared/components/Sparkline'
import styles from './IndexChart.module.css'

type IndexInfo = { ticker: string; label: string }

const US_INDICES: IndexInfo[] = [
  { ticker: '^GSPC',  label: 'S&P 500' },
  { ticker: '^IXIC',  label: 'Nasdaq' },
  { ticker: '^DJI',   label: '道指' },
]

const HK_INDICES: IndexInfo[] = [
  { ticker: '^HSI',   label: '恆指' },
  { ticker: '^HSCE',  label: 'H股' },
]

type IndexData = {
  ticker: string
  label: string
  pct: number
  weekPct: number
  latest: number
  rangePos: number
  values: number[]
  dayRange: number
  weekRange: number
  distEma20: number | null
}

type Props = {
  compact?: boolean
  breadthPct?: number
  rvolLabel?: string
}

function pctChange(arr: number[]) {
  if (arr.length < 2) return 0
  return ((arr[arr.length - 1] - arr[0]) / arr[0]) * 100
}

function computeEma20(values: number[]): number | null {
  const period = 20
  if (values.length < period) return null
  const k = 2 / (period + 1)
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k)
  }
  return ema
}

function trailingPct(arr: number[], lookback: number) {
  if (arr.length < lookback + 1) return pctChange(arr)
  const slice = arr.slice(-1 - lookback)
  return pctChange(slice)
}

function rangePosition(arr: number[]) {
  if (arr.length < 2) return 50
  const latest = arr[arr.length - 1]
  const low = Math.min(...arr)
  const high = Math.max(...arr)
  const range = high - low
  if (range <= 0) return 50
  return Math.round(((latest - low) / range) * 100)
}

export function IndexChart({ compact, breadthPct, rvolLabel }: Props) {
  const { scope, openIndexDetail } = useApp()
  const [data, setData] = useState<IndexData[]>([])
  const indices = scope === 'US' ? US_INDICES : HK_INDICES

  useEffect(() => {
    setData([])
    Promise.all(
      indices.map(async ({ ticker, label }) => {
        try {
          const h = await fetchYahooTickerHistory(ticker, { interval: '1d', range: '1mo' })
          const bars = h.bars
          const values = bars.map(b => b.close)
          const todayBar = bars[bars.length - 1]
          const last5 = bars.slice(-5)
          const dayRange = todayBar
            ? ((todayBar.high - todayBar.low) / todayBar.low) * 100
            : 0
          const weekHigh = Math.max(...last5.map(b => b.high))
          const weekLow  = Math.min(...last5.map(b => b.low))
          const weekRange = weekLow > 0 ? ((weekHigh - weekLow) / weekLow) * 100 : 0
          const ema20 = computeEma20(values)
          const latest = values[values.length - 1] ?? 0
          const distEma20 = ema20 !== null ? ((latest - ema20) / ema20) * 100 : null
          return {
            ticker,
            label,
            pct: pctChange(values),
            weekPct: trailingPct(values, 5),
            latest,
            rangePos: rangePosition(values),
            values,
            dayRange,
            weekRange,
            distEma20,
          }
        } catch {
          return null
        }
      })
    ).then(results => {
      setData(results.filter(Boolean) as IndexData[])
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope])

  if (compact) {
    const hasMeta = breadthPct !== undefined || rvolLabel
    const leadingCount = data.filter(d => d.pct > 0 && (d.distEma20 ?? 0) >= 0).length
    const summary = !data.length
      ? '等待三大指數資料…'
      : leadingCount >= 2
        ? '指數面偏強，但仍要配合市場內部廣度確認。'
        : '指數未形成一致強勢，暫以觀察為主。'
    return (
      <div className={styles.strip}>
        <div className={styles.stripCols}>
          {!data.length
            ? indices.map(idx => (
                <div key={idx.ticker} className={styles.stripCol}>
                  <span className={styles.stripName}>{idx.label}</span>
                  <span className={styles.stripLoading}>…</span>
                </div>
              ))
            : data.map(d => (
                <button
                  key={d.ticker}
                  className={styles.stripCol}
                  onClick={() => openIndexDetail({ ticker: d.ticker, label: d.label })}
                >
                  <span className={styles.stripName}>{d.label}</span>
                  <span className={styles.stripLevel}>{d.latest.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  <Sparkline values={d.values} width={56} height={20} />
                  <span className={d.pct >= 0 ? styles.stripGain : styles.stripLoss}>
                    {d.pct >= 0 ? '+' : ''}{d.pct.toFixed(1)}%
                  </span>
                  <span className={styles.stripSub}>
                    5日 {d.weekPct >= 0 ? '+' : ''}{d.weekPct.toFixed(1)}% · 區間 {d.rangePos}%
                  </span>
                  <span className={styles.stripSub}>
                    日幅 {d.dayRange.toFixed(1)}% · 週幅 {d.weekRange.toFixed(1)}%
                  </span>
                  {d.distEma20 !== null && (
                    <span className={d.distEma20 >= 0 ? styles.stripSmGain : styles.stripSmLoss}>
                      EMA20 {d.distEma20 >= 0 ? '+' : ''}{d.distEma20.toFixed(1)}%
                    </span>
                  )}
                </button>
              ))
          }
        </div>
        {hasMeta && (
          <p className={styles.stripMeta}>
            {breadthPct !== undefined && `市寬 EMA50 ${breadthPct}%`}
            {breadthPct !== undefined && rvolLabel && ' · '}
            {rvolLabel && `量能 ${rvolLabel}`}
          </p>
        )}
        <p className={styles.stripSummary}>{summary}</p>
      </div>
    )
  }

  if (!data.length) return (
    <div className={styles.card}>
      <div className={styles.header}>📊 主要指數（近一個月）</div>
      <div className={styles.loading}>載入中…</div>
    </div>
  )

  return (
    <div className={styles.card}>
      <div className={styles.header}>📊 主要指數（近一個月）</div>
      {data.map(d => (
        <button
          key={d.label}
          className={styles.row}
          onClick={() => openIndexDetail({ ticker: d.ticker, label: d.label })}
        >
          <span className={styles.name}>{d.label}</span>
          <Sparkline values={d.values} width={80} height={24} />
          <span className={d.pct >= 0 ? styles.gain : styles.loss}>
            {d.pct >= 0 ? '+' : ''}{d.pct.toFixed(1)}%
          </span>
        </button>
      ))}
    </div>
  )
}
