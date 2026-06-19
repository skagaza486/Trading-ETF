import { useMemo, useState } from 'react'
import { useSnapshot } from '../../shared/hooks/useSnapshot'
import { useApp } from '../../app/providers/AppContext'
import { StockCard } from '../../shared/components/StockCard'
import { LoadingScreen, ErrorScreen } from '../../shared/components/LoadingScreen'
import type { StockSnapshotEntry } from '../../../types/snapshot'
import type { StockSignalLabel } from '../../../types/signal'
import styles from './DiscoverView.module.css'

type Filter = 'all' | 'bullish' | 'watchlist' | 'bearish'

const BULLISH: StockSignalLabel[] = ['LONG_BREAK','LONG_VCP','LONG_BOUNCE']
const WATCHLIST: StockSignalLabel[] = ['LONG_BASE','WATCH']
const BEARISH: StockSignalLabel[] = ['SHORT_BREAK','SHORT_BASE','SHORT_WATCH','AVOID_CHOP']

const FILTER_LABELS: { id: Filter; label: string }[] = [
  { id: 'all',       label: '全部' },
  { id: 'bullish',   label: '🟢 看漲' },
  { id: 'watchlist', label: '🟡 觀察' },
  { id: 'bearish',   label: '🔴 偏弱' },
]

function filterStocks(stocks: StockSnapshotEntry[], f: Filter): StockSnapshotEntry[] {
  switch (f) {
    case 'bullish':   return stocks.filter(s => BULLISH.includes(s.label))
    case 'watchlist': return stocks.filter(s => WATCHLIST.includes(s.label))
    case 'bearish':   return stocks.filter(s => BEARISH.includes(s.label))
    default:          return stocks
  }
}

export function DiscoverView() {
  const { mode } = useApp()
  const snap = useSnapshot()
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  const displayed = useMemo(() => {
    if (snap.status !== 'ok') return []
    let stocks = filterStocks(snap.snapshot.stocks, filter)
    if (search) {
      const q = search.toUpperCase()
      stocks = stocks.filter(s =>
        s.ticker.includes(q) || s.name.toUpperCase().includes(q)
      )
    }
    // sort: bullish first, then by rsRank desc
    return [...stocks].sort((a, b) => {
      const aScore = BULLISH.includes(a.label) ? 2 : WATCHLIST.includes(a.label) ? 1 : 0
      const bScore = BULLISH.includes(b.label) ? 2 : WATCHLIST.includes(b.label) ? 1 : 0
      if (aScore !== bScore) return bScore - aScore
      return (b.rsRank ?? 0) - (a.rsRank ?? 0)
    })
  }, [snap, filter, search])

  if (snap.status === 'loading') return <LoadingScreen message="載入股票資料…" />
  if (snap.status === 'error')   return <ErrorScreen message={snap.message} />

  return (
    <div className={styles.view}>
      <div className={styles.searchWrap}>
        <input
          className={styles.search}
          placeholder="搜尋 ticker 或名稱…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className={styles.filters}>
        {FILTER_LABELS.map(f => (
          <button
            key={f.id}
            className={filter === f.id ? styles.filterActive : styles.filterBtn}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className={styles.count}>{displayed.length} 支</div>

      <div className={styles.list}>
        {displayed.map(s => (
          <StockCard key={s.ticker} stock={s} showMode={mode} />
        ))}
      </div>
    </div>
  )
}
