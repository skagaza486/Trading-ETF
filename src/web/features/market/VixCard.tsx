import { useState, useEffect } from 'react'
import { fetchYahooTickerHistory } from '../../../services/marketData/yahooFinanceProvider'
import styles from './MetricCard.module.css'
import { Sparkline } from '../../shared/components/Sparkline'
import { InfoDot } from '../../shared/components/InfoDot'

export function VixCard() {
  const [vix, setVix] = useState<number | null>(null)
  const [history, setHistory] = useState<number[]>([])

  useEffect(() => {
    fetchYahooTickerHistory('^VIX', { interval: '1d', range: '1mo' })
      .then(h => {
        const closes = h.bars.map(b => b.close)
        setVix(closes[closes.length - 1] ?? null)
        setHistory(closes)
      })
      .catch(() => { /* silent fail — non-critical */ })
  }, [])

  const level = vix === null ? '—' : vix.toFixed(1)
  const color = vix === null ? 'var(--text-muted)' : vix < 18 ? 'var(--color-gain)' : vix < 26 ? 'var(--color-warn)' : 'var(--color-loss)'
  const label = vix === null ? '—' : vix < 18 ? '低位' : vix < 26 ? '中性' : '高位（恐慌）'

  return (
    <div className={styles.card}>
      <div className={styles.icon}>😰</div>
      <div className={styles.title}>恐慌指數 VIX <InfoDot text="反映市場對未來 30 日波動的預期。一般 <18 偏平靜、18–26 中性、>26 代表恐慌升溫。數字越高，市場越不安。" /></div>
      <div className={styles.value} style={{ color }}>{level}</div>
      <div className={styles.sub}>{label}</div>
      {history.length > 1 && <Sparkline values={history} width={70} height={22} />}
    </div>
  )
}
