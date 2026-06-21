import { useMemo } from 'react'
import { useSnapshot } from '../../shared/hooks/useSnapshot'
import { useApp } from '../../app/providers/AppContext'
import { LoadingScreen, ErrorScreen } from '../../shared/components/LoadingScreen'
import { HkPlaceholder } from '../../shared/components/HkPlaceholder'
import { BreadthCard } from './BreadthCard'
import { VixCard } from './VixCard'
import { RvolCard } from './RvolCard'
import { IndexChart } from './IndexChart'
import { SectorHeatMap } from './SectorHeatMap'
import { SignalBadge } from '../../shared/components/SignalBadge'
import { getStockMeta } from '../../shared/i18n/stockNames'
import type { StockSnapshotEntry } from '../../../types/snapshot'
import type { StockSignalLabel } from '../../../types/signal'
import styles from './MarketView.module.css'

const SIGNAL_CHIPS = [
  { label: 'LONG_BREAK', zh: '突破' },
  { label: 'LONG_VCP',   zh: 'VCP' },
  { label: 'LONG_BOUNCE', zh: '反彈' },
  { label: 'LONG_BASE',  zh: '整固' },
] as const

const STRONG_LABELS: StockSignalLabel[] = ['LONG_BREAK', 'LONG_VCP', 'LONG_BOUNCE']
const BULLISH_LABELS: StockSignalLabel[] = ['LONG_BREAK', 'LONG_VCP', 'LONG_BOUNCE', 'LONG_BASE', 'WATCH']
const BEARISH_LABELS: StockSignalLabel[] = ['SHORT_BREAK', 'SHORT_BASE', 'SHORT_WATCH', 'AVOID_CHOP']
const PREV_WEAK = new Set(['NEUTRAL', 'AVOID_CHOP', 'WATCH', 'SHORT_WATCH', 'SHORT_BASE', 'SHORT_BREAK'])

type StoryTone = 'positive' | 'neutral' | 'risk'
type StoryItem = { title: string; note: string; tone: StoryTone; stat: string }

type FocusNarrative = {
  opportunity: string
  risk: string
  invalidation: string
}

function computeSignalCounts(stocks: StockSnapshotEntry[]) {
  const counts: Record<string, number> = {}
  for (const s of stocks) { counts[s.label] = (counts[s.label] ?? 0) + 1 }
  return counts
}

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

function buildSectorLeader(stocks: StockSnapshotEntry[]) {
  const map = new Map<string, { total: number; bullish: number }>()
  for (const stock of stocks) {
    const sector = getStockMeta(stock.ticker, stock.name).sectorZh
    const row = map.get(sector) ?? { total: 0, bullish: 0 }
    row.total += 1
    if (BULLISH_LABELS.includes(stock.label)) row.bullish += 1
    map.set(sector, row)
  }

  return Array.from(map.entries())
    .filter(([, value]) => value.total >= 3)
    .map(([sectorZh, value]) => ({
      sectorZh,
      total: value.total,
      bullishPct: Math.round((value.bullish / value.total) * 100),
    }))
    .sort((a, b) => b.bullishPct - a.bullishPct)[0] ?? null
}

function buildHeroSummary(regime: string, breadth: ReturnType<typeof computeBreadth> | null, signalCounts: Record<string, number> | null) {
  const pctAbove50 = breadth?.pctAboveEma50 ?? 50
  const breakoutCount = (signalCounts?.LONG_BREAK ?? 0) + (signalCounts?.LONG_VCP ?? 0)
  const shortCount = (signalCounts?.SHORT_BREAK ?? 0) + (signalCounts?.SHORT_BASE ?? 0)

  let confidence = 52
  if (regime === 'long_friendly') confidence += 10
  if (regime === 'short_friendly') confidence -= 12
  confidence += Math.round((pctAbove50 - 50) * 0.6)
  confidence += Math.min(10, breakoutCount * 2)
  confidence -= Math.min(10, shortCount * 2)
  confidence = Math.max(24, Math.min(82, confidence))

  if (regime === 'long_friendly' && pctAbove50 >= 55) {
    return {
      title: '震盪偏多',
      action: '可小注觀察，暫勿追高',
      confidence,
      summary: `${pctAbove50}% 個股站穩 EMA50，市場承接仍在。`,
    }
  }
  if (regime === 'short_friendly' || pctAbove50 < 40) {
    return {
      title: '偏弱觀察',
      action: '先收窄期望，避免勉強出手',
      confidence,
      summary: `市寬偏弱，僅 ${pctAbove50}% 個股企穩 EMA50。`,
    }
  }

  return {
    title: '區間震盪',
    action: '先觀察變化，再決定是否跟進',
    confidence,
    summary: '市場仍在拉鋸，先等領先板塊與突破數量再確認。',
  }
}

function buildThreeThings(
  stocks: StockSnapshotEntry[],
  breadth: ReturnType<typeof computeBreadth> | null,
  signalCounts: Record<string, number> | null,
): StoryItem[] {
  const pctAbove50 = breadth?.pctAboveEma50 ?? 50
  const pctAbove200 = breadth?.pctAboveEma200 ?? 50
  const leader = buildSectorLeader(stocks)
  const breakoutCount = (signalCounts?.LONG_BREAK ?? 0) + (signalCounts?.LONG_VCP ?? 0)
  const cautionCount = (signalCounts?.SHORT_BREAK ?? 0) + (signalCounts?.SHORT_BASE ?? 0) + (signalCounts?.AVOID_CHOP ?? 0)

  const first: StoryItem = pctAbove50 >= 55
    ? {
        title: '市場仍偏強',
        note: `${pctAbove50}% 個股站穩 EMA50，整體承接仍在，回吐未見大面積轉弱。`,
        tone: 'positive',
        stat: `EMA200 以上 ${pctAbove200}%`,
      }
    : pctAbove50 >= 45
      ? {
          title: '市場保持分化',
          note: `${pctAbove50}% 個股仍守住 EMA50，暫未轉弱，但追價勝算一般。`,
          tone: 'neutral',
          stat: `EMA200 以上 ${pctAbove200}%`,
        }
      : {
          title: '承接開始轉弱',
          note: '企穩 EMA50 的股票不足一半，短線宜先收窄進攻範圍。',
          tone: 'risk',
          stat: `EMA200 以上 ${pctAbove200}%`,
        }

  const second: StoryItem = leader
    ? {
        title: `${leader.sectorZh}板塊領先`,
        note: `${leader.bullishPct}% 成份股維持偏強，今天最值得先看這個板塊。`,
        tone: leader.bullishPct >= 55 ? 'positive' : 'neutral',
        stat: `${leader.total} 檔樣本`,
      }
    : {
        title: '領先板塊未明',
        note: '暫未見板塊形成一致領先，先聚焦個別強勢標的。',
        tone: 'neutral',
        stat: '等待確認',
      }

  const third: StoryItem = cautionCount > breakoutCount
    ? {
        title: '波動訊號增加',
        note: '偏弱或震盪訊號已多於突破訊號，今天較適合等而不是追。',
        tone: 'risk',
        stat: `偏弱 ${cautionCount} · 突破 ${breakoutCount}`,
      }
    : {
        title: '突破仍在增加',
        note: '今天突破與反彈訊號仍多，市場未見全面熄火。',
        tone: 'positive',
        stat: `偏弱 ${cautionCount} · 突破 ${breakoutCount}`,
      }

  return [first, second, third]
}

function getChangedStocks(stocks: StockSnapshotEntry[]) {
  return stocks
    .filter(stock => stock.previousLabel !== undefined && stock.previousLabel !== stock.label)
    .sort((a, b) => (b.rsRank ?? 0) - (a.rsRank ?? 0))
}

function sortTopIdeas(stocks: StockSnapshotEntry[]) {
  const priority: Partial<Record<StockSignalLabel, number>> = {
    LONG_BREAK: 0,
    LONG_VCP: 1,
    LONG_BOUNCE: 2,
    LONG_BASE: 3,
    WATCH: 4,
  }

  return [...stocks]
    .filter(stock => BULLISH_LABELS.includes(stock.label))
    .sort((a, b) => {
      const pa = priority[a.label] ?? 99
      const pb = priority[b.label] ?? 99
      if (pa !== pb) return pa - pb
      return (b.rsRank ?? 0) - (a.rsRank ?? 0)
    })
}

function buildFocusNarrative(stock: StockSnapshotEntry, breadth: ReturnType<typeof computeBreadth> | null): FocusNarrative {
  const marketSoft = (breadth?.pctAboveEma50 ?? 50) < 45

  if (stock.label === 'LONG_BREAK' || stock.label === 'LONG_VCP') {
    return {
      opportunity: '價格剛完成突破，若量價保持，短線仍有延續強勢空間。',
      risk: marketSoft ? '整體市寬偏弱，個股就算強，也較易出現假突破。' : '若明天承接不足，突破後很容易回抽測試。',
      invalidation: '若兩日內失守突破區附近，這次上破可信度會明顯下降。',
    }
  }
  if (stock.label === 'LONG_BOUNCE') {
    return {
      opportunity: '回檔後重新見承接，若大市維持穩定，較適合順勢觀察。',
      risk: '這類信號通常較倚賴大市配合，若市場轉弱，反彈容易夭折。',
      invalidation: '若很快跌穿 EMA20 附近，代表這次回檔承接失效。',
    }
  }
  return {
    opportunity: '整固結構仍在，只要後續有量價配合，仍可能演變成下一輪突破。',
    risk: '目前仍未觸發，若太早出手，容易被橫行時間磨掉耐性。',
    invalidation: '若整固下沿被明確跌穿，這段準備結構就要重新評估。',
  }
}

export function MarketView() {
  const { mode, scope, openDetail } = useApp()
  const snap = useSnapshot()

  const breadth = useMemo(() => {
    if (snap.status !== 'ok') return null
    return computeBreadth(snap.snapshot.stocks)
  }, [snap])

  const sigCounts = useMemo(() => {
    if (snap.status !== 'ok') return null
    return computeSignalCounts(snap.snapshot.stocks)
  }, [snap])

  if (scope === 'HK') return <HkPlaceholder />
  if (snap.status === 'loading') return <LoadingScreen message="載入大市資料…" />
  if (snap.status === 'error')   return <ErrorScreen message={snap.message} />

  const { snapshot } = snap
  const staleWarning = snap.stale
  const hero = buildHeroSummary(snapshot.regime, breadth, sigCounts)
  const changedStocks = getChangedStocks(snapshot.stocks).slice(0, 3)
  const topIdeas = sortTopIdeas(snapshot.stocks)
  const focusStock = changedStocks.find(stock => STRONG_LABELS.includes(stock.label)) ?? topIdeas[0] ?? snapshot.stocks[0]
  const focusMeta = getStockMeta(focusStock.ticker, focusStock.name)
  const focusNarrative = buildFocusNarrative(focusStock, breadth)
  const threeThings = buildThreeThings(snapshot.stocks, breadth, sigCounts)
  const discoveryList = topIdeas
    .filter(stock => stock.ticker !== focusStock.ticker)
    .slice(0, 3)

  return (
    <div className={styles.view}>
      {staleWarning && (
        <div className={styles.stale}>⚠️ 資料或未更新（上次快照已逾 25 小時）</div>
      )}

      <div className={styles.dateRow}>
        <span className={styles.dateLabel}>信號日期</span>
        <span className={styles.date}>
          {snapshot.date}
          <span className={styles.dateWeekday}>
            {['日','一','二','三','四','五','六'][new Date(snapshot.date + 'T12:00:00').getDay()]}
          </span>
        </span>
      </div>

      <section className={styles.heroCard}>
        <div className={styles.heroTop}>
          <div>
            <span className={styles.heroEyebrow}>今日市場</span>
            <h1 className={styles.heroTitle}>{hero.title}</h1>
            <p className={styles.heroAction}>{hero.action}</p>
          </div>
          <div className={styles.heroConfidenceCard}>
            <div className={styles.heroConfidenceHead}>
              <span>信心指標</span>
              <strong>{hero.confidence} / 100</strong>
            </div>
            <div className={styles.heroProgress}>
              <span style={{ width: `${hero.confidence}%` }} />
            </div>
            <div className={styles.heroScale}>
              <span>保守</span>
              <span>中性</span>
              <span>偏多</span>
            </div>
          </div>
        </div>

        <div className={styles.heroBottom}>
          <p className={styles.heroSummary}>{hero.summary}</p>
          {sigCounts && (
            <div className={styles.signalSummary}>
              {SIGNAL_CHIPS.map(({ label, zh }) => {
                const n = sigCounts[label] ?? 0
                return (
                  <span key={label} className={styles.sigChip}>
                    {n}
                    <span className={styles.sigLabel}>{zh}</span>
                  </span>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <div className={styles.storyGrid}>
        <section className={styles.storyCard}>
          <div className={styles.sectionHeader}>
            <h2>今日三件事</h2>
            <span>先看這三點</span>
          </div>
          <div className={styles.storyList}>
            {threeThings.map(item => (
              <article key={item.title} className={`${styles.storyRow} ${styles[`story${item.tone[0].toUpperCase()}${item.tone.slice(1)}`]}`}>
                <div className={styles.storyCopy}>
                  <h3>{item.title}</h3>
                  <p>{item.note}</p>
                </div>
                <span className={styles.storyStat}>{item.stat}</span>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.focusCard}>
          <div className={styles.sectionHeader}>
            <h2>今日值得研究</h2>
            <button
              className={styles.focusAction}
              onClick={() => openDetail({ ticker: focusStock.ticker, name: focusMeta.nameZh })}
            >
              查看原因
            </button>
          </div>
          <div className={styles.focusHeader}>
            <div>
              <span className={styles.focusTicker}>{focusStock.ticker}</span>
              <h3>{focusMeta.nameZh}</h3>
            </div>
            <SignalBadge label={focusStock.label} showCode={mode === 'pro'} />
          </div>
          <div className={styles.focusNotes}>
            <article className={styles.focusNote}>
              <h4>機會</h4>
              <p>{focusNarrative.opportunity}</p>
            </article>
            <article className={`${styles.focusNote} ${styles.focusNoteRisk}`}>
              <h4>主要風險</h4>
              <p>{focusNarrative.risk}</p>
            </article>
            <article className={styles.focusNote}>
              <h4>失效條件</h4>
              <p>{focusNarrative.invalidation}</p>
            </article>
          </div>
        </section>

        <aside className={styles.sideRail}>
          <section className={styles.railCard}>
            <div className={styles.sectionHeader}>
              <h2>今日動向</h2>
              <span>信號有變</span>
            </div>
            <div className={styles.changeList}>
              {(changedStocks.length ? changedStocks : topIdeas.slice(0, 3)).map(stock => {
                const meta = getStockMeta(stock.ticker, stock.name)
                const statusTone =
                  BEARISH_LABELS.includes(stock.label) ? styles.statusRisk
                  : STRONG_LABELS.includes(stock.label) ? styles.statusPositive
                  : styles.statusNeutral
                const statusLabel =
                  stock.previousLabel && PREV_WEAK.has(stock.previousLabel) && STRONG_LABELS.includes(stock.label) ? '轉強'
                  : BEARISH_LABELS.includes(stock.label) ? '偏弱'
                  : stock.label === 'LONG_BASE' || stock.label === 'WATCH' ? '觀察'
                  : '延續'

                return (
                  <button
                    key={stock.ticker}
                    className={styles.changeRow}
                    onClick={() => openDetail({ ticker: stock.ticker, name: meta.nameZh })}
                  >
                    <div className={styles.changeCopy}>
                      <div className={styles.changeTickerRow}>
                        <strong>{stock.ticker}</strong>
                        <span>{meta.nameZh}</span>
                      </div>
                      <p>{stock.reason}</p>
                    </div>
                    <span className={`${styles.statusPill} ${statusTone}`}>{statusLabel}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className={styles.railCard}>
            <div className={styles.sectionHeader}>
              <h2>發現清單</h2>
              <span>值得留意</span>
            </div>
            <div className={styles.discoveryList}>
              {discoveryList.map(stock => {
                const meta = getStockMeta(stock.ticker, stock.name)
                return (
                  <button
                    key={stock.ticker}
                    className={styles.discoveryRow}
                    onClick={() => openDetail({ ticker: stock.ticker, name: meta.nameZh })}
                  >
                    <strong>{stock.ticker}</strong>
                    <p>{meta.descriptionZh}</p>
                  </button>
                )
              })}
            </div>
          </section>
        </aside>
      </div>

      <div className={styles.metricGrid}>
        <BreadthCard breadth={breadth} mode={mode} />
        <VixCard />
        <RvolCard stocks={snapshot.stocks} />
      </div>

      <IndexChart />

      <SectorHeatMap stocks={snapshot.stocks} />
    </div>
  )
}
