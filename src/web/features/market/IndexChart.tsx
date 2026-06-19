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
  { ticker: '^HSI',   label: '恒指' },
  { ticker: '^HSCE',  label: 'H股' },
]

type IndexData = { label: string; pct: number; values: number[] }

function pctChange(arr: number[]) {
  if (arr.length < 2) return 0
  return ((arr[arr.length - 1] - arr[0]) / arr[0]) * 100
}

export function IndexChart() {
  const { scope } = useApp()
  const [data, setData] = useState<IndexData[]>([])
  const indices = scope === 'US' ? US_INDICES : HK_INDICES

  useEffect(() => {
    setData([])
    Promise.all(
      indices.map(async ({ ticker, label }) => {
        try {
          const h = await fetchYahooTickerHistory(ticker, { interval: '1d', range: '1mo' })
          const values = h.bars.map(b => b.close)
          return { label, pct: pctChange(values), values }
        } catch {
          return null
        }
      })
    ).then(results => {
      setData(results.filter(Boolean) as IndexData[])
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope])

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
        <div key={d.label} className={styles.row}>
          <span className={styles.name}>{d.label}</span>
          <Sparkline values={d.values} width={80} height={24} />
          <span className={d.pct >= 0 ? styles.gain : styles.loss}>
            {d.pct >= 0 ? '+' : ''}{d.pct.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  )
}
