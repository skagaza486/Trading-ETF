import { useMemo, useState, useEffect } from 'react'
import { useSnapshot } from '../../shared/hooks/useSnapshot'
import { useApp } from '../../app/providers/AppContext'
import { useWatchlist } from '../../shared/hooks/useWatchlist'
import { LoadingScreen, ErrorScreen } from '../../shared/components/LoadingScreen'
import { HkPlaceholder } from '../../shared/components/HkPlaceholder'
import { fetchYahooTickerHistory } from '../../../services/marketData/yahooFinanceProvider'
import { IndexChart } from './IndexChart'
import { MiniBreadthChart } from './MiniBreadthChart'
import { SectorHeatMap } from './SectorHeatMap'
import { SignalBadge } from '../../shared/components/SignalBadge'
import { getStockMeta } from '../../shared/i18n/stockNames'
import { buildSectorLeadership } from '../../shared/market/sectorLeadership'
import { buildVerificationNote, buildWatchout, buildWhyNow, byPriority, hasMeaningfulChange } from '../../shared/stockNarrative'
import { useSignalStats } from '../../shared/hooks/useSignalStats'
import type { StockSnapshotEntry, LiquidityNote } from '../../../types/snapshot'
import type { StockSignalLabel } from '../../../types/signal'
import styles from './MarketView.module.css'

const LABEL_SHORT_MV: Partial<Record<StockSignalLabel, string>> = {
  LONG_BREAK: '突破', LONG_VCP: 'VCP', LONG_BOUNCE: '反彈', LONG_BASE: '整固',
  WATCH: '觀察', NEUTRAL: '中性', AVOID_CHOP: '震盪',
  SHORT_BREAK: '空頭突破', SHORT_BASE: '空頭整固', SHORT_WATCH: '空頭轉弱',
}

function medianRvol(stocks: StockSnapshotEntry[]): number | null {
  const vals = stocks.map(s => s.indicators.rvol).filter((v): v is number => v !== null)
  if (!vals.length) return null
  vals.sort((a, b) => a - b)
  const mid = Math.floor(vals.length / 2)
  return vals.length % 2 === 0 ? (vals[mid - 1] + vals[mid]) / 2 : vals[mid]
}

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

type HeroFact = {
  label: string
  value: string
  note: string
  priority: 'primary' | 'secondary'
  tone?: 'gain' | 'warn' | 'muted'
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
  return buildSectorLeadership(stocks)[0] ?? null
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

function buildHeroFacts(
  stocks: StockSnapshotEntry[],
  breadth: ReturnType<typeof computeBreadth> | null,
  signalCounts: Record<string, number> | null,
) : HeroFact[] {
  const leader = buildSectorLeader(stocks)
  const breakoutCount = (signalCounts?.LONG_BREAK ?? 0) + (signalCounts?.LONG_VCP ?? 0)
  const reboundCount = signalCounts?.LONG_BOUNCE ?? 0
  const weakCount = (signalCounts?.SHORT_BREAK ?? 0) + (signalCounts?.SHORT_BASE ?? 0) + (signalCounts?.AVOID_CHOP ?? 0)

  return [
    {
      label: '中期趨勢仍穩',
      value: `${breadth?.pctAboveEma50 ?? 0}%`,
      note: '股票仍守住 50 日均線',
      priority: 'primary',
      tone: (breadth?.pctAboveEma50 ?? 0) >= 55 ? 'gain' : 'muted',
    },
    {
      label: '長期底子未差',
      value: `${breadth?.pctAboveEma200 ?? 0}%`,
      note: '股票仍站在 200 日均線之上',
      priority: 'primary',
      tone: (breadth?.pctAboveEma200 ?? 0) >= 50 ? 'gain' : 'muted',
    },
    {
      label: '強勢觸發',
      value: `${breakoutCount} 突破 · ${reboundCount} 反彈`,
      note: breakoutCount + reboundCount >= weakCount ? '今天仍有進攻訊號' : '進攻訊號仍偏少',
      priority: 'secondary',
      tone: breakoutCount + reboundCount >= weakCount ? 'gain' : 'warn',
    },
    {
      label: '領先板塊',
      value: leader ? `${leader.sectorZh} ${Math.round(leader.bullishPct)}%` : '未明',
      note: leader ? '今天最值得先看這個方向' : '暫未見明顯領先群組',
      priority: 'secondary',
      tone: leader && leader.bullishPct >= 55 ? 'gain' : 'muted',
    },
  ]
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
        title: '大多數股票仍守得住',
        note: `${pctAbove50}% 股票仍站在 50 日均線之上，代表市場承接仍在，暫未見明顯轉弱。`,
        tone: 'positive',
        stat: `${pctAbove200}% 仍守住長期趨勢`,
      }
    : pctAbove50 >= 45
      ? {
          title: '市場未差，但仍在拉鋸',
          note: `${pctAbove50}% 股票仍守住 50 日均線，代表底子未壞，但強勢範圍仍未全面擴散。`,
          tone: 'neutral',
          stat: `${pctAbove200}% 仍守住長期趨勢`,
        }
      : {
          title: '承接開始變弱',
          note: '守住 50 日均線的股票不足一半，代表市場支撐變薄，短線宜先保守一點。',
          tone: 'risk',
          stat: `${pctAbove200}% 仍守住長期趨勢`,
        }

  const second: StoryItem = leader
    ? {
        title: `${leader.sectorZh}最有帶頭感`,
        note: `${Math.round(leader.bullishPct)}% 成份股維持偏強，並有 ${leader.bullish} 個有效訊號；若今天要先看一個方向，這個板塊最值得優先觀察。`,
        tone: leader.bullishPct >= 55 ? 'positive' : 'neutral',
        stat: `${leader.count} 檔在監測名單`,
      }
    : {
        title: '板塊領先仍未清晰',
        note: '暫未見到哪個板塊全面跑出，現階段較適合先觀察個別較強股票。',
        tone: 'neutral',
        stat: '等待確認',
      }

  const third: StoryItem = cautionCount > breakoutCount
    ? {
        title: '真正強勢訊號仍然不多',
        note: '偏弱或震盪訊號仍多於突破訊號，代表今天未算全面轉強，較適合等確認而不是追價。',
        tone: 'risk',
        stat: `偏弱 ${cautionCount} · 突破 ${breakoutCount}`,
      }
    : {
        title: '市場仍有進攻火種',
        note: '今天突破與反彈訊號仍在增加，代表市場未熄火，但仍要觀察會否進一步擴散。',
        tone: 'positive',
        stat: `偏弱 ${cautionCount} · 突破 ${breakoutCount}`,
      }

  return [first, second, third]
}

function getChangedStocks(stocks: StockSnapshotEntry[]) {
  return stocks
    .filter(hasMeaningfulChange)
    .sort(byPriority)
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
      return byPriority(a, b)
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

function buildMarketQueue(stock: StockSnapshotEntry, breadth: ReturnType<typeof computeBreadth> | null) {
  const whyNow = buildWhyNow(stock)
  const verification = buildVerificationNote(stock)
  const marketSoft = (breadth?.pctAboveEma50 ?? 50) < 45

  return {
    whyNow,
    watchout: marketSoft && STRONG_LABELS.includes(stock.label)
      ? '大市承接仍偏薄，就算個股漂亮，也要防止假突破。'
      : buildWatchout(stock),
    verification,
  }
}

const LIQUIDITY_CONFIG = {
  expanding: {
    dot: styles.liqDotGreen,
    badge: '聯儲偏放水',
    headline: '市場資金環境偏寬鬆，對股市通常較友善',
    takeaway: '可理解成大環境順風較多，但仍要配合真正強的突破與市寬，不是單獨買入訊號。',
  },
  flat: {
    dot: styles.liqDotYellow,
    badge: '聯儲偏持平',
    headline: '市場資金環境沒有明顯變好或變差',
    takeaway: '意思是大環境暫時不幫忙也不拖後腿，選股仍要看市寬、量價和個股結構。',
  },
  contracting: {
    dot: styles.liqDotRed,
    badge: '聯儲偏收水',
    headline: '市場資金環境在收緊，股市較容易轉弱',
    takeaway: '可理解成大環境逆風變多，追高要更小心，尤其不要太相信弱勢反彈。',
  },
}

function LiquidityBanner({ note }: { note: LiquidityNote }) {
  const cfg = LIQUIDITY_CONFIG[note.slope]
  const sign = note.change4wB >= 0 ? '+' : ''
  return (
    <div className={styles.liqBanner}>
      <div className={styles.liqHeader}>
        <span className={`${styles.liqDot} ${cfg.dot}`} />
        <span className={styles.liqLabel}>{cfg.badge}</span>
      </div>
      <div className={styles.liqCopy}>
        <p className={styles.liqEyebrow}>這是什麼：看聯儲最近是在放水、收水，還是大致持平</p>
        <p className={styles.liqHeadline}>{cfg.headline}</p>
        <p className={styles.liqTakeaway}>{cfg.takeaway}</p>
        <p className={styles.liqDetail}>
          4周變化 {sign}{note.change4wB}B · 淨流動性 {note.netLiquidityB}B · 資料截至 {note.asOf}
        </p>
      </div>
    </div>
  )
}

// 誠實戰績卡：用真實已結算的 forward returns（/api/d1/signal-stats）聚合看漲訊號整體表現。
// 不挑單一最佳形態、不挑時間窗 —— 把三類進攻訊號（突破/VCP/反彈）按樣本數加權合併；
// 樣本不足時刻意不顯示回報數字。面向普通用戶、可驗證、非 cherry-pick 的信任錨。
const TRACK_RECORD_LABELS = ['LONG_BREAK', 'LONG_VCP', 'LONG_BOUNCE']
const TRACK_MIN_SAMPLE = 30

function fmtTrackPct(v: number | null): string {
  if (v === null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}

function toneFor(v: number | null): string | undefined {
  if (v === null) return undefined
  return v > 0 ? styles.trackGain : v < 0 ? styles.trackLoss : undefined
}

function SignalTrackRecord() {
  const stats = useSignalStats(90)
  if (stats.status !== 'ok') return null

  const rows = stats.stats.filter(s => TRACK_RECORD_LABELS.includes(s.label))
  const totalN = rows.reduce((sum, r) => sum + r.n, 0)
  const weighted = (pick: (s: (typeof rows)[number]) => number | null): number | null => {
    let num = 0, den = 0
    for (const r of rows) {
      const v = pick(r)
      if (v !== null) { num += v * r.n; den += r.n }
    }
    return den > 0 ? num / den : null
  }

  const avg5d = weighted(s => s.avgRet5d)
  const vsSpy = weighted(s => s.avgVsSpy)
  const winRate = weighted(s => s.winRate)
  const insufficient = totalN < TRACK_MIN_SAMPLE

  return (
    <section className={styles.trackCard}>
      <div className={styles.sectionHeader}>
        <h2>看漲訊號 90 天戰績</h2>
        <span>已結算樣本</span>
      </div>
      {insufficient ? (
        <p className={styles.trackEmpty}>
          目前僅 {totalN} 個已結算樣本，數量不足以提供可靠戰績，因此暫不顯示回報數字。
        </p>
      ) : (
        <div className={styles.trackGrid}>
          <div className={styles.trackStat}>
            <span>樣本數</span>
            <strong>{totalN}</strong>
          </div>
          <div className={styles.trackStat}>
            <span>勝率</span>
            <strong>{winRate !== null ? `${winRate.toFixed(0)}%` : '—'}</strong>
          </div>
          <div className={styles.trackStat}>
            <span>平均 5 日</span>
            <strong className={toneFor(avg5d)}>{fmtTrackPct(avg5d)}</strong>
          </div>
          <div className={styles.trackStat}>
            <span>相對大盤</span>
            <strong className={toneFor(vsSpy)}>{fmtTrackPct(vsSpy)}</strong>
          </div>
        </div>
      )}
      <p className={styles.trackDisclaimer}>
        統計自過去 90 天「突破／VCP／反彈」三類進攻訊號的已結算實際回報，按樣本數加權合併，非挑選最佳形態或最佳時段。屬研究統計、非未來預測。
      </p>
    </section>
  )
}

export function MarketView() {
  const { mode, scope, openDetail } = useApp()
  const snap = useSnapshot()
  const { starred } = useWatchlist()
  const [vix, setVix] = useState<number | null>(null)

  useEffect(() => {
    fetchYahooTickerHistory('^VIX', { interval: '1d', range: '5d' })
      .then(h => {
        const closes = h.bars.map(b => b.close)
        setVix(closes[closes.length - 1] ?? null)
      })
      .catch(() => {})
  }, [])

  const breadth = useMemo(() => {
    if (snap.status !== 'ok') return null
    return computeBreadth(snap.snapshot.stocks)
  }, [snap])

  const sigCounts = useMemo(() => {
    if (snap.status !== 'ok') return null
    return computeSignalCounts(snap.snapshot.stocks)
  }, [snap])

  const rvolMedian = useMemo(() => {
    if (snap.status !== 'ok') return null
    return medianRvol(snap.snapshot.stocks)
  }, [snap])

  const upgradeDelta = useMemo(() => {
    if (snap.status !== 'ok') return null
    const stocks = snap.snapshot.stocks
    const upgrades = stocks.filter(s =>
      s.previousLabel !== undefined &&
      s.previousLabel !== s.label &&
      BULLISH_LABELS.includes(s.label) &&
      !BULLISH_LABELS.includes(s.previousLabel)
    ).length
    const downgrades = stocks.filter(s =>
      s.previousLabel !== undefined &&
      s.previousLabel !== s.label &&
      BEARISH_LABELS.includes(s.label) &&
      !BEARISH_LABELS.includes(s.previousLabel)
    ).length
    return { upgrades, downgrades }
  }, [snap])

  const vixColor = vix === null ? 'var(--text-muted)' : vix < 18 ? 'var(--color-gain)' : vix < 26 ? 'var(--color-warn)' : 'var(--color-loss)'
  const vixTag   = vix === null ? null : vix < 18 ? '低位' : vix < 26 ? '中性' : '高位'
  const rvolLabel = rvolMedian === null ? null
    : rvolMedian >= 1.5 ? '量能旺盛' : rvolMedian >= 1.0 ? '量能正常' : '量能萎縮'

  if (scope === 'HK') return <HkPlaceholder />
  if (snap.status === 'loading') return <LoadingScreen message="載入大市資料…" />
  if (snap.status === 'error')   return <ErrorScreen message={snap.message} />

  const { snapshot } = snap
  const staleWarning = snap.stale
  const hero = buildHeroSummary(snapshot.regime, breadth, sigCounts)
  const changedStocks = getChangedStocks(snapshot.stocks)
    .sort((a, b) => {
      const aS = starred.has(a.ticker) ? 1 : 0
      const bS = starred.has(b.ticker) ? 1 : 0
      if (aS !== bS) return bS - aS
      return byPriority(a, b)
    })
    .slice(0, 3)
  const topIdeas = sortTopIdeas(snapshot.stocks)
  const focusStock = changedStocks.find(stock => STRONG_LABELS.includes(stock.label)) ?? topIdeas[0] ?? snapshot.stocks[0]
  const focusMeta = getStockMeta(focusStock.ticker, focusStock.name)
  const focusNarrative = buildFocusNarrative(focusStock, breadth)
  const focusQueue = buildMarketQueue(focusStock, breadth)
  const threeThings = buildThreeThings(snapshot.stocks, breadth, sigCounts)
  const heroFacts = buildHeroFacts(snapshot.stocks, breadth, sigCounts)
  const otherIdeas = topIdeas.filter(stock => stock.ticker !== focusStock.ticker)
  const starredIdeas = otherIdeas.filter(s => starred.has(s.ticker))
  const unstarredIdeas = otherIdeas.filter(s => !starred.has(s.ticker))
  const discoveryList = [...starredIdeas, ...unstarredIdeas].slice(0, 3)

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
          {upgradeDelta && (upgradeDelta.upgrades > 0 || upgradeDelta.downgrades > 0) && (
            <div className={styles.heroDelta}>
              {upgradeDelta.upgrades > 0 && (
                <span className={styles.heroDeltaGain}>↑ {upgradeDelta.upgrades} 轉強</span>
              )}
              {upgradeDelta.downgrades > 0 && (
                <span className={styles.heroDeltaLoss}>↓ {upgradeDelta.downgrades} 轉弱</span>
              )}
            </div>
          )}
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
          {vix !== null && (
            <div className={styles.vixInline}>
              <span className={styles.vixKey}>VIX</span>
              <span className={styles.vixVal} style={{ color: vixColor }}>{vix.toFixed(1)}</span>
              <span className={styles.vixTag}>{vixTag}</span>
            </div>
          )}
          <div className={styles.heroFacts}>
            {heroFacts.map(fact => (
              <div
                key={fact.label}
                className={fact.priority === 'primary' ? styles.heroFactPrimary : styles.heroFactSecondary}
              >
                <span>{fact.label}</span>
                <strong className={fact.tone === 'gain' ? styles.factGain : fact.tone === 'warn' ? styles.factWarn : undefined}>
                  {fact.value}
                </strong>
                <small>{fact.note}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      <IndexChart compact breadthPct={breadth?.pctAboveEma50} rvolLabel={rvolLabel ?? undefined} />

      <SignalTrackRecord />

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
            <article className={styles.focusNote}>
              <h4>仍需確認</h4>
              <p>{focusQueue.verification}</p>
            </article>
          </div>
        </section>

        {mode === 'pro' && snap.status === 'ok' && snap.snapshot.liquidityNote && (
          <div className={styles.storyLiquidity}>
            <LiquidityBanner note={snap.snapshot.liquidityNote} />
          </div>
        )}

        <aside className={styles.sideRail}>
          <section className={styles.railCard}>
            <div className={styles.sectionHeader}>
              <h2>今日動向</h2>
              <span>信號有變</span>
            </div>
            <div className={styles.changeList}>
              {(changedStocks.length ? changedStocks : topIdeas.slice(0, 3)).map(stock => {
                const meta = getStockMeta(stock.ticker, stock.name)
                const queue = buildMarketQueue(stock, breadth)
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
                      {stock.previousLabel && stock.previousLabel !== stock.label && (
                        <p className={styles.changeTrans}>
                          {LABEL_SHORT_MV[stock.previousLabel] ?? stock.previousLabel}
                          {' → '}
                          {LABEL_SHORT_MV[stock.label] ?? stock.label}
                        </p>
                      )}
                      <p>{queue.whyNow}</p>
                      <p className={styles.changeSubtle}>先留意：{queue.watchout}</p>
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
                const isStarred = starred.has(stock.ticker)
                const queue = buildMarketQueue(stock, breadth)
                return (
                  <button
                    key={stock.ticker}
                    className={styles.discoveryRow}
                    onClick={() => openDetail({ ticker: stock.ticker, name: meta.nameZh })}
                  >
                    <strong>{isStarred ? '⭐ ' : ''}{stock.ticker}</strong>
                    <p>{queue.whyNow}</p>
                    <p className={styles.discoverySubtle}>仍需確認：{queue.verification}</p>
                  </button>
                )
              })}
            </div>
          </section>
        </aside>
      </div>

      <MiniBreadthChart />

      <SectorHeatMap stocks={snapshot.stocks} />
    </div>
  )
}
