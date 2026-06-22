import { useMemo, useState } from 'react'
import { useSnapshot } from '../../shared/hooks/useSnapshot'
import { useEtfSignals } from '../../shared/hooks/useEtfSignals'
import { useApp } from '../../app/providers/AppContext'
import { useWatchlist } from '../../shared/hooks/useWatchlist'
import { StockCard } from '../../shared/components/StockCard'
import { EtfCard } from '../../shared/components/EtfCard'
import { SignalBadge } from '../../shared/components/SignalBadge'
import { LoadingScreen, ErrorScreen } from '../../shared/components/LoadingScreen'
import { HkPlaceholder } from '../../shared/components/HkPlaceholder'
import { getStockMeta } from '../../shared/i18n/stockNames'
import { etfUniverse } from '../../../data/etfUniverse'
import type { StockSnapshotEntry } from '../../../types/snapshot'
import type { StockSignalLabel } from '../../../types/signal'
import type { EtfSignalEntry, EtfSignalLabel } from '../../shared/hooks/useEtfSignals'
import styles from './DiscoverView.module.css'

const ETF_CATEGORY_ZH: Record<string, string> = {
  US_TREASURY:    '美國國債',
  HY_BOND:        '高收益債',
  US_EQUITY_CORE: '美股寬基',
  SECTOR:         '行業板塊',
  INTL_EQUITY:    '環球股票',
  HK_CHINA:       '港股/中國',
  REIT:           '房地產',
  COMMODITY:      '大宗商品',
  GOLD:           '黃金',
  DIVIDEND:       '股息收益',
}

const etfCategoryMap = new Map(etfUniverse.map(e => [e.ticker, e.category]))

type AssetType = 'stocks' | 'etf' | 'changes'
type Filter = 'all' | 'starred' | 'bullish' | 'watchlist' | 'bearish'
type OpportunityKind = 'new' | 'continuing' | 'waiting' | 'risk'

type OpportunityGroup = {
  kind: OpportunityKind
  title: string
  description: string
  stocks: StockSnapshotEntry[]
}

const BULL_SET = new Set<StockSignalLabel>(['LONG_BREAK','LONG_VCP','LONG_BOUNCE','LONG_BASE','WATCH'])
const BEAR_SET = new Set<StockSignalLabel>(['SHORT_BREAK','SHORT_BASE','SHORT_WATCH','AVOID_CHOP'])

function getChangedStocks(stocks: StockSnapshotEntry[]) {
  return stocks
    .filter(s => s.previousLabel !== undefined && s.previousLabel !== s.label)
    .sort((a, b) => {
      const aUp = BULL_SET.has(a.label) && !BULL_SET.has(a.previousLabel!) ? -1 : 0
      const bUp = BULL_SET.has(b.label) && !BULL_SET.has(b.previousLabel!) ? -1 : 0
      if (aUp !== bUp) return aUp - bUp
      return (b.rsRank ?? 0) - (a.rsRank ?? 0)
    })
}

const BULLISH_STOCK: StockSignalLabel[] = ['LONG_BREAK','LONG_VCP','LONG_BOUNCE']
const WATCHLIST_STOCK: StockSignalLabel[] = ['LONG_BASE','WATCH']
const BEARISH_STOCK: StockSignalLabel[] = ['SHORT_BREAK','SHORT_BASE','SHORT_WATCH','AVOID_CHOP']

const BULLISH_ETF: EtfSignalLabel[] = ['FAVOUR']
const WATCHLIST_ETF: EtfSignalLabel[] = ['WATCH', 'WAIT']
const BEARISH_ETF: EtfSignalLabel[] = ['AVOID']

const FILTER_LABELS: { id: Filter; label: string }[] = [
  { id: 'all',       label: '全部' },
  { id: 'starred',   label: '⭐ 自選' },
  { id: 'bullish',   label: '🟢 看漲' },
  { id: 'watchlist', label: '🟡 觀察' },
  { id: 'bearish',   label: '🔴 偏弱' },
]

function filterStocks(stocks: StockSnapshotEntry[], f: Filter, starred: Set<string>): StockSnapshotEntry[] {
  switch (f) {
    case 'starred':   return stocks.filter(s => starred.has(s.ticker))
    case 'bullish':   return stocks.filter(s => BULLISH_STOCK.includes(s.label))
    case 'watchlist': return stocks.filter(s => WATCHLIST_STOCK.includes(s.label))
    case 'bearish':   return stocks.filter(s => BEARISH_STOCK.includes(s.label))
    default:          return stocks
  }
}

function filterEtfs(etfs: EtfSignalEntry[], f: Filter, starred: Set<string>): EtfSignalEntry[] {
  switch (f) {
    case 'starred':   return etfs.filter(e => starred.has(e.ticker))
    case 'bullish':   return etfs.filter(e => BULLISH_ETF.includes(e.label))
    case 'watchlist': return etfs.filter(e => WATCHLIST_ETF.includes(e.label))
    case 'bearish':   return etfs.filter(e => BEARISH_ETF.includes(e.label))
    default:          return etfs
  }
}

function buildSummary(stocks: StockSnapshotEntry[]) {
  const total = stocks.length
  const upgrades = stocks.filter(s =>
    s.previousLabel !== undefined &&
    s.previousLabel !== s.label &&
    BULL_SET.has(s.label) &&
    !BULL_SET.has(s.previousLabel!)
  ).length
  const sectorMap = new Map<string, number>()
  for (const s of stocks) {
    if (BULL_SET.has(s.label)) {
      const meta = getStockMeta(s.ticker, s.name)
      sectorMap.set(meta.sectorZh, (sectorMap.get(meta.sectorZh) ?? 0) + 1)
    }
  }
  let topSector = ''
  let topCount = 0
  for (const [sector, count] of sectorMap) {
    if (count > topCount) { topCount = count; topSector = sector }
  }
  return { total, upgrades, topSector }
}

function buildOpportunityGroups(stocks: StockSnapshotEntry[]): OpportunityGroup[] {
  const isNewStrength = (stock: StockSnapshotEntry) =>
    stock.previousLabel !== undefined &&
    stock.previousLabel !== stock.label &&
    BULLISH_STOCK.includes(stock.label) &&
    !BULL_SET.has(stock.previousLabel)

  const byRs = (a: StockSnapshotEntry, b: StockSnapshotEntry) => (b.rsRank ?? 0) - (a.rsRank ?? 0)
  const newStrength = stocks.filter(isNewStrength).sort(byRs)
  const continuing = stocks
    .filter(stock => BULLISH_STOCK.includes(stock.label) && !isNewStrength(stock))
    .sort(byRs)
  const waiting = stocks
    .filter(stock => WATCHLIST_STOCK.includes(stock.label))
    .sort(byRs)
  const risk = stocks
    .filter(stock => BEARISH_STOCK.includes(stock.label))
    .sort((a, b) => {
      const aChanged = a.previousLabel !== undefined && a.previousLabel !== a.label ? 1 : 0
      const bChanged = b.previousLabel !== undefined && b.previousLabel !== b.label ? 1 : 0
      if (aChanged !== bChanged) return bChanged - aChanged
      return (a.rsRank ?? 0) - (b.rsRank ?? 0)
    })

  return [
    { kind: 'new', title: '剛轉強', description: '今日首次進入強勢訊號，最值得先看原因', stocks: newStrength },
    { kind: 'continuing', title: '延續中', description: '強勢結構仍在，留意是否過度追高', stocks: continuing },
    { kind: 'waiting', title: '等待確認', description: '接近機會，但尚欠突破或量能確認', stocks: waiting },
    { kind: 'risk', title: '風險升高', description: '弱勢或剛轉差，優先檢查自選與持倉', stocks: risk },
  ]
}

export function DiscoverView() {
  const { mode, scope } = useApp()
  const snap = useSnapshot()
  const etfState = useEtfSignals()
  const { starred } = useWatchlist()
  const [assetType, setAssetType] = useState<AssetType>('stocks')
  const [filter, setFilter] = useState<Filter>('all')
  const [etfCategory, setEtfCategory] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const displayedStocks = useMemo(() => {
    if (snap.status !== 'ok') return []
    let stocks = filterStocks(snap.snapshot.stocks, filter, starred)
    if (search) {
      const q = search.toUpperCase()
      stocks = stocks.filter(s =>
        s.ticker.includes(q) || s.name.toUpperCase().includes(q)
      )
    }
    return [...stocks].sort((a, b) => {
      if (filter === 'starred') {
        const aChanged = (a.previousLabel !== undefined && a.previousLabel !== a.label) ? 1 : 0
        const bChanged = (b.previousLabel !== undefined && b.previousLabel !== b.label) ? 1 : 0
        if (aChanged !== bChanged) return bChanged - aChanged
      }
      const aScore = BULLISH_STOCK.includes(a.label) ? 2 : WATCHLIST_STOCK.includes(a.label) ? 1 : 0
      const bScore = BULLISH_STOCK.includes(b.label) ? 2 : WATCHLIST_STOCK.includes(b.label) ? 1 : 0
      if (aScore !== bScore) return bScore - aScore
      return (b.rsRank ?? 0) - (a.rsRank ?? 0)
    })
  }, [snap, filter, search, starred])

  const etfsForCategory = useMemo(() => {
    if (etfState.status !== 'ok') return []
    return filterEtfs(etfState.entries, filter, starred)
  }, [etfState, filter, starred])

  const availableCategories = useMemo(() => {
    const seen = new Set<string>()
    for (const e of etfsForCategory) {
      const cat = etfCategoryMap.get(e.ticker)
      if (cat) seen.add(cat)
    }
    return Array.from(seen)
  }, [etfsForCategory])

  const displayedEtfs = useMemo(() => {
    let etfs = etfsForCategory
    if (etfCategory) etfs = etfs.filter(e => etfCategoryMap.get(e.ticker) === etfCategory)
    if (search) {
      const q = search.toUpperCase()
      etfs = etfs.filter(e => e.ticker.includes(q))
    }
    const order: Record<EtfSignalLabel, number> = { FAVOUR: 3, WATCH: 2, WAIT: 1, AVOID: 0 }
    return [...etfs].sort((a, b) => {
      const labelDiff = (order[b.label] ?? 0) - (order[a.label] ?? 0)
      if (labelDiff !== 0) return labelDiff
      return (b.indicators.rankScore ?? 0) - (a.indicators.rankScore ?? 0)
    })
  }, [etfsForCategory, etfCategory, search])

  const changedStocks = useMemo(() => {
    if (snap.status !== 'ok') return []
    let stocks = getChangedStocks(snap.snapshot.stocks)
    if (search) {
      const q = search.toUpperCase()
      stocks = stocks.filter(s => s.ticker.includes(q) || s.name.toUpperCase().includes(q))
    }
    return stocks
  }, [snap, search])

  const opportunityGroups = useMemo(() => {
    if (snap.status !== 'ok') return []
    const groups = buildOpportunityGroups(snap.snapshot.stocks)
    if (!search) return groups
    const q = search.toUpperCase()
    return groups.map(group => ({
      ...group,
      stocks: group.stocks.filter(stock =>
        stock.ticker.includes(q) || stock.name.toUpperCase().includes(q)
      ),
    }))
  }, [snap, search])

  const summary = useMemo(() => {
    if (snap.status !== 'ok') return null
    return buildSummary(snap.snapshot.stocks)
  }, [snap])

  const filterCounts = useMemo((): Record<Filter, number> => {
    if (assetType === 'stocks' && snap.status === 'ok') {
      const s = snap.snapshot.stocks
      return {
        all:       s.length,
        starred:   s.filter(x => starred.has(x.ticker)).length,
        bullish:   s.filter(x => BULLISH_STOCK.includes(x.label)).length,
        watchlist: s.filter(x => WATCHLIST_STOCK.includes(x.label)).length,
        bearish:   s.filter(x => BEARISH_STOCK.includes(x.label)).length,
      }
    }
    if (assetType === 'etf' && etfState.status === 'ok') {
      const e = etfState.entries
      return {
        all:       e.length,
        starred:   e.filter(x => starred.has(x.ticker)).length,
        bullish:   e.filter(x => BULLISH_ETF.includes(x.label)).length,
        watchlist: e.filter(x => WATCHLIST_ETF.includes(x.label)).length,
        bearish:   e.filter(x => BEARISH_ETF.includes(x.label)).length,
      }
    }
    return { all: 0, starred: 0, bullish: 0, watchlist: 0, bearish: 0 }
  }, [snap, etfState, starred, assetType])

  const isLoading = assetType === 'etf'
    ? etfState.status === 'loading'
    : snap.status === 'loading'

  const isError = assetType === 'etf'
    ? etfState.status === 'error'
    : snap.status === 'error'

  const errorMsg = assetType === 'etf'
    ? (etfState.status === 'error' ? etfState.message : '')
    : (snap.status === 'error' ? snap.message : '')

  if (scope === 'HK') return <HkPlaceholder />
  if (isLoading) return <LoadingScreen message={assetType === 'stocks' ? '載入股票資料…' : '載入 ETF 資料…'} />
  if (isError)   return <ErrorScreen message={errorMsg} />

  const count = assetType === 'stocks' ? displayedStocks.length
    : assetType === 'etf' ? displayedEtfs.length
    : opportunityGroups.reduce((sum, group) => sum + group.stocks.length, 0)

  return (
    <div className={styles.view}>
      {summary && (
        <div className={styles.summaryStrip}>
          今日 {summary.total} 檔
          {summary.upgrades > 0 && (
            <> · <span className={styles.upgradeCount}>{summary.upgrades} 項轉強</span></>
          )}
          {summary.topSector && ` · ${summary.topSector}最多`}
        </div>
      )}
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <div className={styles.searchInner}>
            <input
              className={styles.search}
              placeholder={assetType === 'stocks' ? '搜尋 ticker 或名稱…' : '搜尋 ETF ticker…'}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className={styles.clearBtn} onClick={() => setSearch('')}>✕</button>
            )}
          </div>
        </div>

        <div className={styles.typeToggle}>
          <button
            className={assetType === 'stocks' ? styles.typeActive : styles.typeBtn}
            onClick={() => { setAssetType('stocks'); setFilter('all'); setEtfCategory(null) }}
          >
            <span className={styles.typeIcon}>◉</span>
            <span>股票</span>
            <span className={styles.typeCount}>{snap.status === 'ok' ? snap.snapshot.stocks.length : 0}</span>
          </button>
          <button
            className={assetType === 'etf' ? styles.typeActive : styles.typeBtn}
            onClick={() => { setAssetType('etf'); setFilter('all'); setEtfCategory(null) }}
          >
            <span className={styles.typeIcon}>◇</span>
            <span>ETF</span>
            <span className={styles.typeCount}>{etfState.status === 'ok' ? etfState.entries.length : 0}</span>
          </button>
          <button
            className={assetType === 'changes' ? styles.typeActive : styles.typeBtn}
            onClick={() => { setAssetType('changes'); setFilter('all'); setEtfCategory(null) }}
          >
            <span className={styles.typeIcon}>↗</span>
            <span>機會佇列</span>
            {changedStocks.length > 0 && <span className={styles.changeCount}>{changedStocks.length}</span>}
          </button>
        </div>
      </div>

      {assetType !== 'changes' && (
        <div className={styles.filters}>
          {FILTER_LABELS.map(f => (
            <button
              key={f.id}
              className={filter === f.id ? styles.filterActive : styles.filterBtn}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              {filterCounts[f.id] > 0 && (
                <span className={styles.filterCount}>{filterCounts[f.id]}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {assetType === 'etf' && availableCategories.length > 1 && (
        <div className={styles.catRow}>
          <button
            className={etfCategory === null ? styles.catActive : styles.catBtn}
            onClick={() => setEtfCategory(null)}
          >
            全類別
          </button>
          {availableCategories.map(cat => (
            <button
              key={cat}
              className={etfCategory === cat ? styles.catActive : styles.catBtn}
              onClick={() => setEtfCategory(cat === etfCategory ? null : cat)}
            >
              {ETF_CATEGORY_ZH[cat] ?? cat}
            </button>
          ))}
        </div>
      )}

      {assetType !== 'changes' && <div className={styles.count}>{count} 項</div>}

      <div className={styles.list}>
        {count === 0 ? (
          <div className={styles.empty}>
            {assetType === 'changes' ? '今日無信號變動記錄'
              : search ? `找不到「${search}」的結果`
              : filter === 'starred' ? '尚未加入自選。在個股詳情頁點 ☆ 即可加入。'
              : '此篩選條件下沒有項目'}
          </div>
        ) : assetType === 'stocks'
          ? displayedStocks.map((s, i) => <StockCard key={s.ticker} stock={s} showMode={mode} delay={i * 0.04} />)
          : assetType === 'etf'
          ? displayedEtfs.map(e => <EtfCard key={e.ticker} etf={e} showMode={mode} />)
          : <OpportunityQueue groups={opportunityGroups} />
        }
      </div>
    </div>
  )
}

function OpportunityQueue({ groups }: { groups: OpportunityGroup[] }) {
  return (
    <div className={styles.queue}>
      <div className={styles.queueIntro}>
        <div>
          <span className={styles.queueEyebrow}>今日研究順序</span>
          <h2>先看變化，再看延續</h2>
        </div>
        <p>訊號是研究起點，不是買賣指令。</p>
      </div>

      {groups.map(group => (
        <section key={group.kind} className={`${styles.queueGroup} ${styles[`queue_${group.kind}`]}`}>
          <header className={styles.queueHeader}>
            <div>
              <h3>{group.title}</h3>
              <p>{group.description}</p>
            </div>
            <span className={styles.queueCount}>{group.stocks.length}</span>
          </header>
          {group.stocks.length === 0 ? (
            <div className={styles.queueEmpty}>今天沒有符合項目</div>
          ) : (
            <div className={styles.queueRows}>
              {group.stocks.slice(0, 8).map(stock => (
                <OpportunityRow key={stock.ticker} stock={stock} />
              ))}
              {group.stocks.length > 8 && (
                <div className={styles.queueMore}>另有 {group.stocks.length - 8} 檔，使用上方篩選繼續查看</div>
              )}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}

function OpportunityRow({ stock }: { stock: StockSnapshotEntry }) {
  const { openDetail } = useApp()
  const meta = getStockMeta(stock.ticker, stock.name)
  const dayPct = stock.prevClose && stock.prevClose > 0
    ? ((stock.indicators.close - stock.prevClose) / stock.prevClose) * 100
    : null
  const changed = stock.previousLabel !== undefined && stock.previousLabel !== stock.label

  return (
    <button
      className={styles.opportunityRow}
      onClick={() => openDetail({ ticker: stock.ticker, name: meta.nameZh })}
    >
      <div className={styles.opportunityIdentity}>
        <strong>{stock.ticker}</strong>
        <span>{meta.nameZh}</span>
      </div>
      <div className={styles.opportunityMove}>
        {changed
          ? `${LABEL_SHORT[stock.previousLabel ?? ''] ?? stock.previousLabel} → ${LABEL_SHORT[stock.label] ?? stock.label}`
          : `RS ${stock.rsRank ?? '—'}`}
      </div>
      <div className={styles.opportunityPrice}>
        <strong>${stock.indicators.close.toFixed(2)}</strong>
        <span className={dayPct === null ? undefined : dayPct >= 0 ? styles.arrowUp : styles.arrowDown}>
          {dayPct === null ? '今日 —' : `${dayPct >= 0 ? '+' : ''}${dayPct.toFixed(1)}%`}
        </span>
      </div>
      <SignalBadge label={stock.label} />
    </button>
  )
}

const LABEL_SHORT: Record<string, string> = {
  LONG_BREAK:'突破', LONG_VCP:'VCP', LONG_BOUNCE:'反彈', LONG_BASE:'整固',
  WATCH:'觀察', NEUTRAL:'中性', AVOID_CHOP:'震盪',
  SHORT_BREAK:'空頭突破', SHORT_BASE:'空頭整固', SHORT_WATCH:'空頭轉弱',
}

function ChangeRow({ stock }: { stock: StockSnapshotEntry }) {
  const { openDetail } = useApp()
  const meta = getStockMeta(stock.ticker, stock.name)
  const isUpgrade = BULL_SET.has(stock.label) && !BULL_SET.has(stock.previousLabel ?? 'NEUTRAL')
  const isDowngrade = BEAR_SET.has(stock.label)

  return (
    <button
      className={styles.changeRow}
      onClick={() => openDetail({ ticker: stock.ticker, name: meta.nameZh })}
    >
      <div className={styles.changeLeft}>
        <div className={styles.changeTicker}>{stock.ticker}</div>
        <div className={styles.changeName}>{meta.nameZh}</div>
        <div className={styles.changeArrow}>
          <span className={styles.changePrev}>{LABEL_SHORT[stock.previousLabel ?? ''] ?? stock.previousLabel}</span>
          <span className={isUpgrade ? styles.arrowUp : isDowngrade ? styles.arrowDown : styles.arrowFlat}>
            {isUpgrade ? '↑' : isDowngrade ? '↓' : '→'}
          </span>
          <span>{LABEL_SHORT[stock.label] ?? stock.label}</span>
        </div>
      </div>
      <SignalBadge label={stock.label} />
    </button>
  )
}
