import { useMemo, useState } from 'react'
import { useSnapshot } from '../../shared/hooks/useSnapshot'
import { useApp } from '../../app/providers/AppContext'
import { LoadingScreen, ErrorScreen } from '../../shared/components/LoadingScreen'
import { getStockMeta } from '../../shared/i18n/stockNames'
import { SignalBadge } from '../../shared/components/SignalBadge'
import type { StockSnapshotEntry } from '../../../types/snapshot'
import styles from './SectorsView.module.css'

type SectorSummary = {
  sectorZh: string
  sector: string
  count: number
  bullish: number
  bearish: number
  avgRs: number
  stocks: StockSnapshotEntry[]
}

const BULL_LABELS = new Set(['LONG_BREAK','LONG_VCP','LONG_BOUNCE','LONG_BASE'])
const BEAR_LABELS = new Set(['SHORT_BREAK','SHORT_BASE','SHORT_WATCH','AVOID_CHOP'])

function buildSectors(stocks: StockSnapshotEntry[]): SectorSummary[] {
  const map = new Map<string, { sector: string; stocks: StockSnapshotEntry[] }>()
  for (const s of stocks) {
    const meta = getStockMeta(s.ticker, s.name)
    const key = meta.sectorZh
    if (!map.has(key)) map.set(key, { sector: s.sector, stocks: [] })
    map.get(key)!.stocks.push(s)
  }

  const summaries: SectorSummary[] = []
  for (const [sectorZh, { sector, stocks: ss }] of map) {
    const bullish = ss.filter(s => BULL_LABELS.has(s.label)).length
    const bearish = ss.filter(s => BEAR_LABELS.has(s.label)).length
    const rsValues = ss.map(s => s.rsRank ?? 50)
    const avgRs = rsValues.reduce((a, b) => a + b, 0) / rsValues.length
    summaries.push({ sectorZh, sector, count: ss.length, bullish, bearish, avgRs, stocks: ss })
  }

  // Sort by bullish ratio desc, then avgRs
  return summaries.sort((a, b) => {
    const aRatio = a.bullish / a.count
    const bRatio = b.bullish / b.count
    if (Math.abs(aRatio - bRatio) > 0.05) return bRatio - aRatio
    return b.avgRs - a.avgRs
  })
}

export function SectorsView() {
  const { mode, openDetail } = useApp()
  const snap = useSnapshot()
  const [expanded, setExpanded] = useState<string | null>(null)

  const sectors = useMemo(() => {
    if (snap.status !== 'ok') return []
    return buildSectors(snap.snapshot.stocks)
  }, [snap])

  if (snap.status === 'loading') return <LoadingScreen message="載入板塊資料…" />
  if (snap.status === 'error')   return <ErrorScreen message={snap.message} />

  return (
    <div className={styles.view}>
      <h2 className={styles.heading}>板塊強弱</h2>
      <p className={styles.sub}>按看漲比率排序 · 點板塊展開成份股</p>

      {sectors.map(sec => {
        const bullRatio = sec.count ? sec.bullish / sec.count : 0
        const isExpanded = expanded === sec.sectorZh

        return (
          <div key={sec.sectorZh} className={styles.sectorCard}>
            <button
              className={styles.sectorRow}
              onClick={() => setExpanded(isExpanded ? null : sec.sectorZh)}
            >
              <StrengthDot ratio={bullRatio} />
              <span className={styles.sectorName}>{sec.sectorZh}</span>
              <div className={styles.bars}>
                <BullBar ratio={bullRatio} />
              </div>
              <span className={`${styles.pct} ${bullRatio >= 0.5 ? styles.bull : styles.bear}`}>
                {Math.round(bullRatio * 100)}%
              </span>
              {mode === 'pro' && (
                <span className={styles.rs}>RS {sec.avgRs.toFixed(0)}</span>
              )}
              <span className={styles.chevron}>{isExpanded ? '▲' : '▼'}</span>
            </button>

            {isExpanded && (
              <div className={styles.stocks}>
                {sec.stocks
                  .sort((a, b) => (b.rsRank ?? 0) - (a.rsRank ?? 0))
                  .map(s => {
                    const meta = getStockMeta(s.ticker, s.name)
                    return (
                      <button
                        key={s.ticker}
                        className={styles.stockRow}
                        onClick={() => openDetail({ ticker: s.ticker, name: meta.nameZh })}
                      >
                        <span className={styles.sticker}>{s.ticker}</span>
                        <span className={styles.sname}>{meta.nameZh}</span>
                        <SignalBadge label={s.label} />
                      </button>
                    )
                  })
                }
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function StrengthDot({ ratio }: { ratio: number }) {
  const color = ratio >= 0.6 ? 'var(--color-gain)' : ratio >= 0.35 ? 'var(--color-warn)' : 'var(--color-loss)'
  return <span style={{ color, fontSize: 14 }}>●</span>
}

function BullBar({ ratio }: { ratio: number }) {
  const color = ratio >= 0.6 ? 'var(--color-gain)' : ratio >= 0.35 ? 'var(--color-warn)' : 'var(--color-loss)'
  return (
    <div className={styles.barTrack}>
      <div className={styles.barFill} style={{ width: `${ratio * 100}%`, background: color }} />
    </div>
  )
}
