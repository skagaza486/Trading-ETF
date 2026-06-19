import type { RegimeClass } from '../../../types/signal'
import styles from './WeatherCard.module.css'

type Breadth = { pctAboveEma50: number; advancers: number; decliners: number } | null

type Props = {
  regime: RegimeClass
  proxyWeakBreadth: boolean
  breadth: Breadth
}

type Weather = { emoji: string; title: string; desc: string; cls: 'bull' | 'bear' | 'neutral' }

function getWeather(regime: RegimeClass, weakBreadth: boolean, breadth: Breadth): Weather {
  const pct = breadth?.pctAboveEma50 ?? 50

  if (regime === 'long_friendly' && !weakBreadth && pct >= 55) {
    return {
      emoji: '🟢',
      title: '偏多',
      desc: `指數偏強、${pct}% 股票企穩 EMA50，可積極留意信號`,
      cls: 'bull',
    }
  }
  if (regime === 'short_friendly' || (weakBreadth && pct < 40)) {
    return {
      emoji: '🔴',
      title: '偏空',
      desc: `大市偏弱、僅 ${pct}% 股票企穩 EMA50，宜避險減持`,
      cls: 'bear',
    }
  }
  return {
    emoji: '🟡',
    title: '震盪',
    desc: `方向未明、${pct}% 股票企穩 EMA50，先觀察、勿追高`,
    cls: 'neutral',
  }
}

export function WeatherCard({ regime, proxyWeakBreadth, breadth }: Props) {
  const w = getWeather(regime, proxyWeakBreadth, breadth)

  return (
    <div className={`${styles.card} ${styles[w.cls]}`}>
      <div className={styles.top}>
        <span className={styles.emoji}>{w.emoji}</span>
        <div>
          <div className={styles.titleRow}>
            <span className={styles.label}>今日市場</span>
          </div>
          <h2 className={styles.title}>{w.title}</h2>
        </div>
      </div>
      <p className={styles.desc}>{w.desc}</p>
      <p className={styles.disclaimer}>研究工具，非投資建議</p>
    </div>
  )
}
