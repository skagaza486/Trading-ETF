import { useMemo } from 'react'
import { useSnapshot } from '../../shared/hooks/useSnapshot'
import { useApp } from '../../app/providers/AppContext'
import { LoadingScreen, ErrorScreen } from '../../shared/components/LoadingScreen'
import { HkPlaceholder } from '../../shared/components/HkPlaceholder'
import { WeatherCard } from './WeatherCard'
import { BreadthCard } from './BreadthCard'
import { VixCard } from './VixCard'
import { IndexChart } from './IndexChart'
import { SectorHeatMap } from './SectorHeatMap'
import { MarketTopPicks } from './MarketTopPicks'
import type { StockSnapshotEntry } from '../../../types/snapshot'
import styles from './MarketView.module.css'

function computeBreadth(stocks: StockSnapshotEntry[]) {
  const total = stocks.length
  if (!total) return { pctAboveEma50: 0, pctAboveEma200: 0, advancers: 0, decliners: 0 }

  let aboveEma50 = 0, aboveEma200 = 0, advancers = 0, decliners = 0
  for (const s of stocks) {
    const { close, ema50, ema200 } = s.indicators
    if (ema50  !== null && close > ema50)  aboveEma50++
    if (ema200 !== null && close > ema200) aboveEma200++
    // proxy advancers/decliners by positive/negative rvol signal
    const label = s.label
    if (['LONG_BREAK','LONG_VCP','LONG_BOUNCE','LONG_BASE','WATCH'].includes(label)) advancers++
    else if (['SHORT_BREAK','SHORT_BASE','SHORT_WATCH','AVOID_CHOP'].includes(label)) decliners++
  }
  return {
    pctAboveEma50:  Math.round((aboveEma50  / total) * 100),
    pctAboveEma200: Math.round((aboveEma200 / total) * 100),
    advancers,
    decliners,
  }
}

export function MarketView() {
  const { mode, scope } = useApp()
  const snap = useSnapshot()

  const breadth = useMemo(() => {
    if (snap.status !== 'ok') return null
    return computeBreadth(snap.snapshot.stocks)
  }, [snap])

  if (scope === 'HK') return <HkPlaceholder />
  if (snap.status === 'loading') return <LoadingScreen message="載入大市資料…" />
  if (snap.status === 'error')   return <ErrorScreen message={snap.message} />

  const { snapshot } = snap
  const staleWarning = snap.stale

  return (
    <div className={styles.view}>
      {staleWarning && (
        <div className={styles.stale}>⚠️ 資料或未更新（上次快照已逾 25 小時）</div>
      )}

      <div className={styles.dateRow}>
        <span className={styles.dateLabel}>信號日期</span>
        <span className={styles.date}>{snapshot.date}</span>
      </div>

      {/* Weather card — hero section */}
      <WeatherCard regime={snapshot.regime} proxyWeakBreadth={snapshot.proxyWeakBreadth} breadth={breadth} />

      {/* Three metric cards */}
      <div className={styles.metricGrid}>
        <BreadthCard breadth={breadth} mode={mode} />
        <VixCard />
      </div>

      {/* Index comparison */}
      <IndexChart />

      {/* Sector heat map */}
      <SectorHeatMap stocks={snapshot.stocks} />

      {/* Top picks today */}
      <MarketTopPicks stocks={snapshot.stocks} />
    </div>
  )
}
