import { useMemo, useState } from 'react'
import { useSnapshot } from '../../../web/shared/hooks/useSnapshot'
import { useWatchlist } from '../../../web/shared/hooks/useWatchlist'
import { buildSectorLeadership } from '../../../web/shared/market/sectorLeadership'
import { getStockMeta } from '../../../web/shared/i18n/stockNames'
import { SignalBadge } from '../../../web/shared/components/SignalBadge'
import { LoadingScreen, ErrorScreen } from '../../../web/shared/components/LoadingScreen'
import type { DailySnapshot, StockSnapshotEntry } from '../../../types/snapshot'
import type { RegimeClass } from '../../../types/signal'
import styles from './MarketContextView.module.css'

// ── Regime config ─────────────────────────────────────────────────────────────

const REGIME_CONFIG: Record<RegimeClass, {
  label: string
  cashFloor: string
  tone: 'gain' | 'warn' | 'loss'
  desc: string
}> = {
  long_friendly: {
    label: '偏多',
    cashFloor: '現金底 5%',
    tone: 'gain',
    desc: '市場偏向進攻，可維持較低現金比例',
  },
  neutral: {
    label: '中性',
    cashFloor: '現金底 15%',
    tone: 'warn',
    desc: '市場方向不明，保持適度現金緩衝',
  },
  short_friendly: {
    label: '防守',
    cashFloor: '現金底 30%',
    tone: 'loss',
    desc: '市場偏向弱勢，提高現金比例保護資本',
  },
}

// ── Derived computations ──────────────────────────────────────────────────────

const BULL_STRONG = new Set(['LONG_BREAK', 'LONG_VCP', 'LONG_BOUNCE'])
const BULL_WATCH  = new Set(['LONG_BASE', 'WATCH'])
const BEAR_SET    = new Set(['SHORT_BREAK', 'SHORT_BASE', 'SHORT_WATCH', 'AVOID_CHOP'])
const ALL_BULL    = new Set([...BULL_STRONG, ...BULL_WATCH])

function computeBreadth(stocks: StockSnapshotEntry[]) {
  let aboveEma50 = 0, aboveEma200 = 0, upgrades = 0, downgrades = 0
  for (const s of stocks) {
    if (s.indicators.ema50  !== null && s.indicators.close > s.indicators.ema50)  aboveEma50++
    if (s.indicators.ema200 !== null && s.indicators.close > s.indicators.ema200) aboveEma200++
    if (s.previousLabel !== undefined && s.previousLabel !== s.label) {
      if (ALL_BULL.has(s.label) && !ALL_BULL.has(s.previousLabel)) upgrades++
      if (BEAR_SET.has(s.label) && !BEAR_SET.has(s.previousLabel)) downgrades++
    }
  }
  const total = stocks.length
  return {
    pctAboveEma50:  total ? Math.round(aboveEma50  / total * 100) : 0,
    pctAboveEma200: total ? Math.round(aboveEma200 / total * 100) : 0,
    upgrades,
    downgrades,
  }
}

function computeSignalCounts(stocks: StockSnapshotEntry[]) {
  const c: Record<string, number> = {}
  for (const s of stocks) c[s.label] = (c[s.label] ?? 0) + 1
  return c
}

function computeThreeThings(
  stocks: StockSnapshotEntry[],
  breadth: ReturnType<typeof computeBreadth>,
  sigCounts: Record<string, number>,
) {
  const { pctAboveEma50, pctAboveEma200 } = breadth
  const breakCount  = (sigCounts.LONG_BREAK ?? 0) + (sigCounts.LONG_VCP ?? 0)
  const bounceCount = sigCounts.LONG_BOUNCE ?? 0
  const weakCount   = (sigCounts.SHORT_BREAK ?? 0) + (sigCounts.SHORT_BASE ?? 0) + (sigCounts.AVOID_CHOP ?? 0)
  const sectors     = buildSectorLeadership(stocks)
  const leader      = sectors[0]

  const t1: ThingItem = pctAboveEma50 >= 55
    ? { title: '大多數股票仍守得住', note: `${pctAboveEma50}% 股票仍站在 50 日均線之上，市場承接仍在。`, stat: `長期底 ${pctAboveEma200}%`, tone: 'positive' }
    : pctAboveEma50 >= 45
    ? { title: '市場未差，但仍在拉鋸', note: `${pctAboveEma50}% 股票守住 50 日均線，底子未壞但強勢未擴散。`, stat: `長期底 ${pctAboveEma200}%`, tone: 'neutral' }
    : { title: '承接開始變弱', note: `守住 50 日均線的股票不足一半（${pctAboveEma50}%），短線宜保守。`, stat: `長期底 ${pctAboveEma200}%`, tone: 'risk' }

  const t2: ThingItem = leader
    ? {
        title: `${leader.sectorZh}最有帶頭感`,
        note: `${Math.round(leader.bullishPct)}% 成份股維持偏強，有 ${leader.bullish} 個有效訊號。`,
        stat: `${leader.count} 檔在監測`,
        tone: leader.bullishPct >= 55 ? 'positive' : 'neutral',
      }
    : { title: '板塊領先仍未清晰', note: '暫未見哪個板塊全面跑出，宜觀察個別強股。', stat: '等待確認', tone: 'neutral' }

  const offensiveCount = breakCount + bounceCount
  const t3: ThingItem = weakCount > offensiveCount
    ? {
        title: '強勢訊號仍然不多',
        note: '偏弱訊號多於突破訊號，今天未算全面轉強，較適合等確認。',
        stat: `偏弱 ${weakCount} · 突破+反彈 ${offensiveCount}`,
        tone: 'risk',
      }
    : {
        title: '市場仍有進攻火種',
        note: '突破與反彈訊號多於偏弱，市場未熄火，留意能否進一步擴散。',
        stat: `突破+反彈 ${offensiveCount} · 偏弱 ${weakCount}`,
        tone: 'positive',
      }

  return [t1, t2, t3]
}

function groupWatchlist(stocks: StockSnapshotEntry[]) {
  const newStrength = stocks.filter(s =>
    BULL_STRONG.has(s.label) &&
    s.previousLabel !== undefined && !BULL_STRONG.has(s.previousLabel),
  )
  const continuing = stocks.filter(s =>
    BULL_STRONG.has(s.label) &&
    !(s.previousLabel !== undefined && !BULL_STRONG.has(s.previousLabel)),
  )
  const watching = stocks.filter(s => BULL_WATCH.has(s.label))
  const risk      = stocks.filter(s => BEAR_SET.has(s.label))
  const neutral   = stocks.filter(s => !BULL_STRONG.has(s.label) && !BULL_WATCH.has(s.label) && !BEAR_SET.has(s.label))
  return { newStrength, continuing, watching, risk, neutral }
}

function getDayPct(s: StockSnapshotEntry) {
  return s.prevClose && s.prevClose > 0
    ? ((s.indicators.close - s.prevClose) / s.prevClose) * 100
    : null
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ThingItem = { title: string; note: string; stat: string; tone: 'positive' | 'neutral' | 'risk' }

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({
  title,
  count,
  expanded,
  onToggle,
}: {
  title: string
  count?: string
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <button className={styles.sectionHeader} onClick={onToggle}>
      <span className={styles.sectionTitle}>{title}</span>
      {count && <span className={styles.sectionCount}>{count}</span>}
      <span className={styles.chevron}>{expanded ? '▲' : '▼'}</span>
    </button>
  )
}

function RegimeBanner({ snapshot, stale }: { snapshot: DailySnapshot; stale: boolean }) {
  const cfg = REGIME_CONFIG[snapshot.regime]
  const liq = snapshot.liquidityNote

  const weekday = ['日','一','二','三','四','五','六'][
    new Date(snapshot.date + 'T12:00:00').getDay()
  ]

  return (
    <div className={styles.regimeBanner}>
      {stale && (
        <div className={styles.stale}>⚠ 資料或未更新（上次快照已逾 25 小時）</div>
      )}
      <div className={styles.regimeRow}>
        <div className={styles.regimeLeft}>
          <span className={styles.dateLabel}>信號日期</span>
          <span className={styles.dateVal}>{snapshot.date} <span className={styles.dateWd}>（{weekday}）</span></span>
        </div>
        <div className={styles.regimeRight}>
          <span className={`${styles.regimePill} ${styles[`regime_${cfg.tone}`]}`}>
            {cfg.label}
          </span>
          <span className={styles.cashFloor}>{cfg.cashFloor}</span>
        </div>
      </div>
      <p className={styles.regimeDesc}>{cfg.desc}</p>
      {liq && (
        <div className={styles.liqChip}>
          <span className={
            liq.slope === 'expanding' ? styles.liqGreen
            : liq.slope === 'contracting' ? styles.liqRed
            : styles.liqYellow
          }>
            {liq.slope === 'expanding' ? '聯儲放水' : liq.slope === 'contracting' ? '聯儲收水' : '聯儲持平'}
          </span>
          <span className={styles.liqDetail}>
            4W {liq.change4wB >= 0 ? '+' : ''}{liq.change4wB}B
          </span>
        </div>
      )}
    </div>
  )
}

function SignalOverview({
  sigCounts,
  breadth,
}: {
  sigCounts: Record<string, number>
  breadth: ReturnType<typeof computeBreadth>
}) {
  const chips = [
    { label: '突破', val: (sigCounts.LONG_BREAK ?? 0), cls: styles.chipGreen },
    { label: 'VCP',  val: (sigCounts.LONG_VCP ?? 0),   cls: styles.chipGreen },
    { label: '反彈', val: (sigCounts.LONG_BOUNCE ?? 0), cls: styles.chipGreen },
    { label: '整固', val: (sigCounts.LONG_BASE ?? 0) + (sigCounts.WATCH ?? 0), cls: styles.chipYellow },
  ]
  const { pctAboveEma50, pctAboveEma200, upgrades, downgrades } = breadth

  return (
    <div className={styles.overview}>
      <div className={styles.chipRow}>
        {chips.map(c => (
          <span key={c.label} className={`${styles.chip} ${c.cls}`}>
            <strong>{c.val}</strong>
            <span>{c.label}</span>
          </span>
        ))}
      </div>
      <div className={styles.breadthRow}>
        <span className={styles.breadthItem}>
          <span className={styles.breadthLabel}>EMA50</span>
          <strong className={pctAboveEma50 >= 55 ? styles.gain : pctAboveEma50 < 45 ? styles.loss : styles.warn}>
            {pctAboveEma50}%
          </strong>
        </span>
        <span className={styles.breadthItem}>
          <span className={styles.breadthLabel}>EMA200</span>
          <strong className={pctAboveEma200 >= 50 ? styles.gain : styles.warn}>
            {pctAboveEma200}%
          </strong>
        </span>
        {(upgrades > 0 || downgrades > 0) && (
          <span className={styles.breadthItem}>
            {upgrades > 0 && <span className={styles.gain}>↑{upgrades} 升格</span>}
            {downgrades > 0 && <span className={styles.loss}> ↓{downgrades} 降格</span>}
          </span>
        )}
      </div>
    </div>
  )
}

function ThreeThingsSection({ items }: { items: ThingItem[] }) {
  return (
    <div className={styles.threeThings}>
      {items.map((item, i) => (
        <article key={i} className={`${styles.thingCard} ${styles[`thing_${item.tone}`]}`}>
          <div className={styles.thingMeta}>
            <span className={styles.thingNum}>{i + 1}</span>
            <h3 className={styles.thingTitle}>{item.title}</h3>
          </div>
          <p className={styles.thingNote}>{item.note}</p>
          <span className={styles.thingStat}>{item.stat}</span>
        </article>
      ))}
    </div>
  )
}

function SectorSection({ stocks, sectors: sectorData }: { stocks: StockSnapshotEntry[]; sectors: ReturnType<typeof buildSectorLeadership> }) {
  const top = sectorData.slice(0, 6)
  const maxBull = Math.max(...top.map(s => s.bullishPct), 1)

  return (
    <div className={styles.sectorList}>
      {top.map((sec, rank) => {
        const bullPct = Math.round(sec.bullishPct)
        const dayPctStr = sec.avgDayPct === null ? '—'
          : `${sec.avgDayPct >= 0 ? '+' : ''}${sec.avgDayPct.toFixed(1)}%`
        const isPositiveDay = (sec.avgDayPct ?? 0) >= 0

        return (
          <div key={sec.sectorZh} className={styles.sectorRow}>
            <span className={styles.sectorRank}>#{rank + 1}</span>
            <div className={styles.sectorInfo}>
              <span className={styles.sectorName}>{sec.sectorZh}</span>
              <span className={styles.sectorSub}>
                {sec.bullish} 看漲 · {sec.count} 檔
              </span>
            </div>
            <div className={styles.sectorBarWrap}>
              <div
                className={styles.sectorBar}
                style={{
                  width: `${(sec.bullishPct / maxBull) * 100}%`,
                  background: bullPct >= 50 ? 'var(--color-gain)' : bullPct >= 30 ? 'var(--color-warn)' : 'var(--color-loss)',
                  opacity: 0.7,
                }}
              />
            </div>
            <strong className={`${styles.sectorPct} ${bullPct >= 50 ? styles.gain : styles.warn}`}>
              {bullPct}%
            </strong>
            <span className={`${styles.sectorDay} ${isPositiveDay ? styles.gain : styles.loss}`}>
              {dayPctStr}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function WatchlistGroup({
  title,
  tone,
  stocks,
}: {
  title: string
  tone: 'gain' | 'warn' | 'loss' | 'muted'
  stocks: StockSnapshotEntry[]
}) {
  if (stocks.length === 0) return null
  return (
    <div className={styles.watchGroup}>
      <div className={`${styles.watchGroupHeader} ${styles[`wg_${tone}`]}`}>
        {title}
        <span className={styles.watchGroupCount}>{stocks.length}</span>
      </div>
      {stocks.map(s => {
        const meta  = getStockMeta(s.ticker, s.name)
        const dayPct = getDayPct(s)
        return (
          <div key={s.ticker} className={styles.watchRow}>
            <div className={styles.watchIdentity}>
              <strong className={styles.watchTicker}>{s.ticker}</strong>
              <span className={styles.watchName}>{meta.nameZh}</span>
            </div>
            <SignalBadge label={s.label} />
            <span className={`${styles.watchDay} ${dayPct === null ? '' : dayPct >= 0 ? styles.gain : styles.loss}`}>
              {dayPct === null ? '—' : `${dayPct >= 0 ? '+' : ''}${dayPct.toFixed(1)}%`}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function MarketContextView() {
  const snap = useSnapshot()
  const { starred } = useWatchlist()

  const [showPulse,   setShowPulse]   = useState(true)
  const [showSectors, setShowSectors] = useState(true)
  const [showWatch,   setShowWatch]   = useState(true)

  const derived = useMemo(() => {
    if (snap.status !== 'ok') return null
    const { stocks, sectors } = snap.snapshot
    return {
      breadth:    computeBreadth(stocks),
      sigCounts:  computeSignalCounts(stocks),
      sectorList: buildSectorLeadership(stocks, sectors ?? []),
    }
  }, [snap])

  const watchlistGroups = useMemo(() => {
    if (snap.status !== 'ok') return null
    const starredStocks = snap.snapshot.stocks.filter(s => starred.has(s.ticker))
    return groupWatchlist(starredStocks)
  }, [snap, starred])

  if (snap.status === 'loading') return <LoadingScreen message="載入市場資料…" />
  if (snap.status === 'error')   return <ErrorScreen message={snap.message} />
  if (!derived) return null

  const { snapshot } = snap
  const { breadth, sigCounts, sectorList } = derived
  const threeThings = computeThreeThings(snapshot.stocks, breadth, sigCounts)
  const totalStarred = starred.size

  return (
    <div className={styles.view}>
      <RegimeBanner snapshot={snapshot} stale={snap.stale} />
      <SignalOverview sigCounts={sigCounts} breadth={breadth} />

      {/* ── 市況脈搏 ── */}
      <section className={styles.section}>
        <SectionHeader
          title="市況脈搏"
          count="今日三件事"
          expanded={showPulse}
          onToggle={() => setShowPulse(v => !v)}
        />
        {showPulse && <ThreeThingsSection items={threeThings} />}
      </section>

      {/* ── 板塊強弱 ── */}
      <section className={styles.section}>
        <SectionHeader
          title="板塊強弱"
          count={`前 ${Math.min(6, sectorList.length)} 名`}
          expanded={showSectors}
          onToggle={() => setShowSectors(v => !v)}
        />
        {showSectors && (
          <SectorSection stocks={snapshot.stocks} sectors={sectorList} />
        )}
      </section>

      {/* ── 自選追蹤 ── */}
      <section className={styles.section}>
        <SectionHeader
          title="自選追蹤"
          count={totalStarred > 0 ? `${totalStarred} 檔` : undefined}
          expanded={showWatch}
          onToggle={() => setShowWatch(v => !v)}
        />
        {showWatch && (
          <div className={styles.watchlist}>
            {totalStarred === 0 ? (
              <p className={styles.watchEmpty}>
                尚未加入自選。在「市場羅盤」app 星標個股後，此處會自動顯示。
              </p>
            ) : watchlistGroups && (
              <>
                <WatchlistGroup title="剛轉強" tone="gain" stocks={watchlistGroups.newStrength} />
                <WatchlistGroup title="延續中" tone="gain" stocks={watchlistGroups.continuing} />
                <WatchlistGroup title="等待確認" tone="warn" stocks={watchlistGroups.watching} />
                <WatchlistGroup title="風險升高" tone="loss" stocks={watchlistGroups.risk} />
                <WatchlistGroup title="中性" tone="muted" stocks={watchlistGroups.neutral} />
              </>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
