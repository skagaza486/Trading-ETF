import { useState } from 'react'
import { useApp } from '../../app/providers/AppContext'
import { useIntraday, type TimeFrame } from '../../shared/hooks/useIntraday'
import { useSnapshot } from '../../shared/hooks/useSnapshot'
import { PriceChart } from '../../shared/components/PriceChart'
import styles from './IndexDetailSheet.module.css'

const TIMEFRAMES: { id: TimeFrame; label: string }[] = [
  { id: '1M', label: '1月' },
  { id: '3M', label: '3月' },
  { id: '1Y', label: '1年' },
]

const INDEX_DESC: Record<string, string> = {
  '^GSPC': '標普500 代表美國500家大型上市公司，是最廣泛使用的美股市場基準。',
  '^IXIC': 'Nasdaq綜合指數以科技股為主，反映成長型及科技板塊的整體走勢。',
  '^DJI':  '道瓊斯工業平均指數追蹤30隻藍籌股，偏向傳統工業與金融龍頭。',
  '^HSI':  '恆生指數是香港股市的主要基準，涵蓋港交所大型上市公司。',
  '^HSCE': '恆生中國企業指數（H股）反映在港上市中資企業的整體表現。',
}

const REGIME_ZH: Record<string, string> = {
  long_friendly:  '偏多',
  short_friendly: '偏弱',
  neutral:        '震盪',
}

export function IndexDetailSheet() {
  const { indexTarget, closeIndexDetail } = useApp()
  const [tf, setTf] = useState<TimeFrame>('3M')
  const chart = useIntraday(indexTarget?.ticker ?? '', tf)
  const snap = useSnapshot()

  if (!indexTarget) return null

  const bars = chart.status === 'ok' ? chart.bars : []
  const latest = bars[bars.length - 1]
  const first = bars[0]
  const pct = latest && first ? ((latest.close - first.close) / first.close) * 100 : null
  const desc = INDEX_DESC[indexTarget.ticker]
  const regime = snap.status === 'ok' ? snap.snapshot.regime : null
  const breadthPct = snap.status === 'ok'
    ? (() => {
        const stocks = snap.snapshot.stocks
        const above = stocks.filter(s => s.indicators.close > (s.indicators.ema50 ?? 0) && s.indicators.ema50).length
        return stocks.length ? Math.round(above / stocks.length * 100) : null
      })()
    : null

  return (
    <div className={styles.view}>
      <div className={styles.topBar}>
        <button className={styles.back} onClick={closeIndexDetail}>← 返回</button>
      </div>

      <div className={styles.titleBlock}>
        <h2 className={styles.title}>{indexTarget.label}</h2>
        <span className={styles.tickerCode}>{indexTarget.ticker}</span>
      </div>

      {latest && (
        <div className={styles.priceBlock}>
          <span className={styles.price}>{latest.close.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          {pct !== null && (
            <span className={pct >= 0 ? styles.gain : styles.loss}>
              {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
              <span className={styles.tfHint}>（{TIMEFRAMES.find(t => t.id === tf)?.label}）</span>
            </span>
          )}
        </div>
      )}

      <div className={styles.tfRow}>
        {TIMEFRAMES.map(t => (
          <button
            key={t.id}
            className={tf === t.id ? styles.tfActive : styles.tfBtn}
            onClick={() => setTf(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {chart.status === 'loading' && <div className={styles.chartLoading}>載入圖表中…</div>}
      {chart.status === 'ok' && bars.length > 0 && (
        <PriceChart bars={bars} height={260} showVolume={false} />
      )}

      <div className={styles.contextSection}>
        {desc && <p className={styles.desc}>{desc}</p>}

        {(regime || breadthPct !== null) && (
          <div className={styles.statsRow}>
            {regime && (
              <div className={styles.stat}>
                <span className={styles.statLabel}>整體市況</span>
                <span className={styles.statVal}>{REGIME_ZH[regime] ?? regime}</span>
              </div>
            )}
            {breadthPct !== null && (
              <div className={styles.stat}>
                <span className={styles.statLabel}>個股 EMA50 以上</span>
                <span className={styles.statVal}>{breadthPct}%</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
