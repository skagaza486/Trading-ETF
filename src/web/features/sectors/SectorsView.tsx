import { useMemo, useState } from 'react'
import { useSnapshot } from '../../shared/hooks/useSnapshot'
import { useApp } from '../../app/providers/AppContext'
import { LoadingScreen, ErrorScreen } from '../../shared/components/LoadingScreen'
import { HkPlaceholder } from '../../shared/components/HkPlaceholder'
import { getStockMeta } from '../../shared/i18n/stockNames'
import { SignalBadge } from '../../shared/components/SignalBadge'
import { useWatchlist } from '../../shared/hooks/useWatchlist'
import {
  buildSectorLeadership,
  getStockDayPct,
  type SectorLeadership,
} from '../../shared/market/sectorLeadership'
import { TabIntroBanner } from '../../shared/components/TabIntroBanner'
import styles from './SectorsView.module.css'

function sectorVerdict(sector: SectorLeadership) {
  const ratio = sector.bullish / sector.count
  if (ratio >= 0.35 && sector.avgRs >= 60) return '領先市場，可優先研究強勢股'
  if (ratio >= 0.15 || sector.upgrades > sector.downgrades) return '動能改善中，留意能否擴散'
  if (sector.bearish > sector.bullish) return '弱勢訊號較多，暫宜保守'
  return '尚未形成方向，等待更多股票跟上'
}

export function SectorsView() {
  const { mode, openDetail, scope } = useApp()
  const { starred } = useWatchlist()
  const snap = useSnapshot()
  const [expanded, setExpanded] = useState<string | null>(null)

  const sectors = useMemo(() => {
    if (snap.status !== 'ok') return []
    return buildSectorLeadership(snap.snapshot.stocks, snap.snapshot.sectors ?? [])
  }, [snap])

  const watchlistExposure = useMemo(() => sectors
    .map(sector => ({
      sectorZh: sector.sectorZh,
      sectorRank: sectors.findIndex(item => item.sectorZh === sector.sectorZh) + 1,
      count: sector.stocks.filter(stock => starred.has(stock.ticker)).length,
      tickers: sector.stocks.filter(stock => starred.has(stock.ticker)).map(stock => stock.ticker),
    }))
    .filter(item => item.count > 0)
    .sort((a, b) => b.count - a.count), [sectors, starred])

  if (scope === 'HK') return <HkPlaceholder />
  if (snap.status === 'loading') return <LoadingScreen message="載入板塊資料…" />
  if (snap.status === 'error')   return <ErrorScreen message={snap.message} />

  if (sectors.length === 0) return (
    <div className={styles.view}>
      <TabIntroBanner
        tabId="sectors"
        message="睇邊個板塊最強、邊個轉弱,搵今日值得優先研究嘅方向。"
      />
      <div className={styles.emptyState}>
        <span className={styles.emptyIcon}>🗺️</span>
        <h2>暫無板塊資料</h2>
        <p>今日快照未包含足夠個股,板塊強弱需待下次資料更新後重新計算。</p>
      </div>
    </div>
  )

  const hero = sectors[0]
  const second = sectors[1]
  const focusSector = sectors.find(sec => sec.sectorZh === expanded) ?? hero
  const strongSectors = sectors.filter(sec => sec.bullish / sec.count >= 0.2).length
  const improvingSectors = sectors.filter(sec => sec.upgrades > sec.downgrades).length
  const positiveSectors = sectors.filter(sec => (sec.avgDayPct ?? 0) > 0).length
  const watchlistCount = watchlistExposure.reduce((sum, item) => sum + item.count, 0)
  const topExposure = watchlistExposure[0]
  const leadingOverlap = watchlistExposure.filter(item => item.sectorRank <= 3)

  return (
    <div className={styles.view}>
      <TabIntroBanner
        tabId="sectors"
        message="睇邊個板塊最強、邊個轉弱,搵今日值得優先研究嘅方向。"
      />
      {hero && (
        <section className={styles.summaryCard}>
          <div className={styles.summaryBlock}>
            <span className={styles.heroEyebrow}>今日板塊焦點</span>
            <div className={styles.heroMain}>
              <StrengthDot ratio={hero.bullish / hero.count} />
              <h2 className={styles.heroName}>{hero.sectorZh}</h2>
              <span className={`${styles.heroPct} ${hero.bullish / hero.count >= 0.5 ? styles.bull : styles.bear}`}>
                {Math.round(hero.bullish / hero.count * 100)}%
              </span>
            </div>
            <div className={styles.heroMeta}>
              <span className={styles.heroUp}>{hero.bullish} 看漲</span>
              <span className={styles.heroDivider}>·</span>
              <span className={styles.heroDown}>{hero.bearish} 偏弱</span>
              <span className={styles.heroDivider}>·</span>
              <span className={styles.heroNeutral}>{Math.max(0, hero.count - hero.bullish - hero.bearish)} 觀望</span>
              <span className={styles.heroDivider}>·</span>
              <span className={styles.heroTotal}>共 {hero.count} 檔</span>
            </div>
            <p className={styles.heroVerdict}>{sectorVerdict(hero)}</p>
            {(second || hero.topTicker) && (
              <p className={styles.heroSecond}>
                {second && `次選：${second.sectorZh}`}
                {second && hero.topTicker && '　'}
                {hero.topTicker && `代表股 ${hero.topTicker}`}
              </p>
            )}
          </div>

          <div className={styles.heroStats}>
            <Metric label="看漲廣度" value={`${Math.round(hero.bullish / hero.count * 100)}%`} />
            <Metric
              label="板塊今日"
              value={hero.avgDayPct === null ? '待資料' : `${hero.avgDayPct >= 0 ? '+' : ''}${hero.avgDayPct.toFixed(1)}%`}
              tone={hero.avgDayPct === null ? undefined : hero.avgDayPct >= 0 ? 'gain' : 'loss'}
            />
            <Metric label="相對強度" value={`RS ${hero.avgRs.toFixed(0)}`} />
            <Metric label="強勢板塊" value={`${strongSectors} 個`} />
            <Metric label="改善中" value={`${improvingSectors} 個`} />
            <Metric label="今日上升" value={`${positiveSectors}/${sectors.length}`} />
          </div>
        </section>
      )}

      <section className={styles.insightCard}>
        <RotationQuadrant
          sectors={sectors}
          selected={focusSector?.sectorZh ?? null}
          focusSector={focusSector}
          onSelect={sector => setExpanded(expanded === sector ? null : sector)}
        />

        <div className={styles.exposurePanel}>
          <div className={styles.exposureHeader}>
            <div>
              <span className={styles.sectionEyebrow}>自選曝險</span>
              <h2>你的關注是否跟上市場？</h2>
            </div>
            <span className={styles.proxyNote}>按自選檔數估算</span>
          </div>
          {watchlistCount === 0 ? (
            <p className={styles.exposureEmpty}>尚未加入自選，加入股票後便可比較自選分布與領先板塊。</p>
          ) : (
            <>
              <div className={styles.exposureSummary}>
                <Metric label="自選股票" value={`${watchlistCount} 檔`} />
                <Metric
                  label="最大曝險"
                  value={`${topExposure.sectorZh} ${Math.round(topExposure.count / watchlistCount * 100)}%`}
                />
                <Metric label="覆蓋領先板塊" value={`${leadingOverlap.length}/3`} />
              </div>
              <p className={styles.alignmentVerdict}>
                {leadingOverlap.length >= 2
                  ? '自選與市場領先方向大致一致，但仍要留意單一板塊過度集中。'
                  : leadingOverlap.length === 1
                    ? `部分對齊：目前只覆蓋 ${leadingOverlap[0].sectorZh}，其餘領先板塊仍未納入。`
                    : `出現錯配：自選主要集中在 ${topExposure.sectorZh}，未覆蓋目前前三名領先板塊。`}
              </p>
              <div className={styles.exposureBars}>
                {watchlistExposure.slice(0, 5).map(item => (
                  <div key={item.sectorZh} className={styles.exposureRow}>
                    <span>{item.sectorZh}</span>
                    <div><i style={{ width: `${item.count / watchlistCount * 100}%` }} /></div>
                    <strong>{item.count}</strong>
                    <small>排名 #{item.sectorRank}</small>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      <h2 className={styles.heading}>板塊強弱</h2>
      <p className={styles.sub}>綜合看漲廣度、有效訊號數與 RS 排序 · 點板塊展開成份股</p>

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
              <div className={styles.sectorInfo}>
                <span className={styles.sectorName}>{sec.sectorZh}</span>
                <span className={styles.sectorCount}>
                  {sec.bullish} 看漲 · {sec.bearish} 偏弱 · {sec.count} 檔
                </span>
                <span className={styles.sectorLeader}>領先：{sec.leaders.map(s => s.ticker).join(' · ')}</span>
              </div>
              <div className={styles.bars}>
                <BullBar ratio={bullRatio} />
              </div>
              <span className={`${styles.pct} ${bullRatio >= 0.5 ? styles.bull : styles.bear}`}>
                {Math.round(bullRatio * 100)}%
              </span>
              <span className={`${styles.dayPct} ${(sec.avgDayPct ?? 0) >= 0 ? styles.bull : styles.bear}`}>
                {sec.avgDayPct === null ? '今日 —' : `今日 ${sec.avgDayPct >= 0 ? '+' : ''}${sec.avgDayPct.toFixed(1)}%`}
              </span>
              <span className={styles.rs}>RS {sec.avgRs.toFixed(0)}</span>
              <span className={styles.chevron}>{isExpanded ? '▲' : '▼'}</span>
            </button>

            {isExpanded && (
              <div className={styles.stocks}>
                {sec.stocks
                  .sort((a, b) => (b.rsRank ?? 0) - (a.rsRank ?? 0))
                  .map(s => {
                    const meta = getStockMeta(s.ticker, s.name)
                    const dayPct = getStockDayPct(s)
                    return (
                      <button
                        key={s.ticker}
                        className={styles.stockRow}
                        onClick={() => openDetail({ ticker: s.ticker, name: meta.nameZh })}
                      >
                        <span className={styles.sticker}>{s.ticker}</span>
                        <span className={styles.sname}>{meta.nameZh}</span>
                        <span className={styles.stockPrice}>${s.indicators.close.toFixed(2)}</span>
                        <span className={`${styles.stockDay} ${(dayPct ?? 0) >= 0 ? styles.bull : styles.bear}`}>
                          {dayPct === null ? '—' : `${dayPct >= 0 ? '+' : ''}${dayPct.toFixed(1)}%`}
                        </span>
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

function RotationQuadrant({
  sectors,
  selected,
  focusSector,
  onSelect,
}: {
  sectors: SectorLeadership[]
  selected: string | null
  focusSector: SectorLeadership | undefined
  onSelect: (sector: string) => void
}) {
  const rsValues = sectors.map(s => s.trajectory20d.at(-1)?.rs ?? s.avgRs)
  const thrustValues = sectors.map(s => s.trajectory20d.at(-1)?.thrust ?? getCurrentThrust(s))
  const maxAbsThrust = Math.max(4, ...thrustValues.map(value => Math.abs(value)))
  const thrustScale = Math.max(6, Math.ceil(maxAbsThrust / 2) * 2)

  // Use semantic anchors instead of sample min/max:
  // RS 50 = center line, thrust 0% = center line.
  const getLeft = (value: number) => 6 + ((Math.max(0, Math.min(100, value)) / 100) * 88)
  const getTop = (value: number) => {
    const clamped = Math.max(-thrustScale, Math.min(thrustScale, value))
    return 50 - ((clamped / thrustScale) * 42)
  }
  const focusHistory = focusSector?.trajectory20d ?? []
  const laidOutPoints = useMemo(
    () => layoutQuadrantPoints(sectors, getLeft, getTop, selected),
    [sectors, selected, thrustScale]
  )

  return (
    <div className={styles.rotationPanel}>
      <div className={styles.rotationHeader}>
        <div>
          <span className={styles.sectionEyebrow}>板塊輪動象限</span>
          <h2>強度 × 近期推進速度</h2>
        </div>
        <p>右邊代表 RS &gt; 50，左邊代表 RS &lt; 50；上面代表近 5 日推進為正，下面代表為負。</p>
      </div>
      <div className={styles.rotationWorkspace}>
        <div className={styles.quadrant}>
          <span className={`${styles.quadrantLabel} ${styles.qTopLeft}`}>轉強候選</span>
          <span className={`${styles.quadrantLabel} ${styles.qTopRight}`}>領先區</span>
          <span className={`${styles.quadrantLabel} ${styles.qBottomLeft}`}>觀察 / 避開</span>
          <span className={`${styles.quadrantLabel} ${styles.qBottomRight}`}>熱度回落</span>
          {laidOutPoints.map(point => {
            const sector = point.sector
            const currentPoint = sector.trajectory20d.at(-1)
            return (
              <button
                key={sector.sectorZh}
                className={`${styles.rotationPoint} ${selected === sector.sectorZh ? styles.rotationSelected : ''}`}
                style={{ left: `${point.left}%`, top: `${point.top}%` }}
                title={`${sector.sectorZh}：RS ${Math.round(currentPoint?.rs ?? sector.avgRs)}，近 5 日推進 ${formatSigned(currentPoint?.thrust ?? getCurrentThrust(sector))}%`}
                onClick={() => onSelect(sector.sectorZh)}
              >
                {sector.sectorZh.slice(0, 2)}
              </button>
            )
          })}
        </div>
        {focusSector && (
          <div className={styles.rotationDetail}>
            <div className={styles.rotationDetailTop}>
              <div>
                <span className={styles.rotationDetailEyebrow}>目前焦點</span>
                <h3>{focusSector.sectorZh}</h3>
              </div>
              <span className={`${styles.rotationState} ${(focusHistory.at(-1)?.thrust ?? getCurrentThrust(focusSector)) >= 0 ? styles.stateUp : styles.stateDown}`}>
                {(focusHistory.at(-1)?.thrust ?? getCurrentThrust(focusSector)) >= 0 ? '資金回流' : '熱度回落'}
              </span>
            </div>

            <div className={styles.rotationMetrics}>
              <Metric label="覆蓋股票" value={`${focusSector.count} 檔`} />
              <Metric label="相對強度" value={`RS ${Math.round(focusHistory.at(-1)?.rs ?? focusSector.avgRs)}`} />
              <Metric label="近 5 日推進" value={`${formatSigned(focusHistory.at(-1)?.thrust ?? getCurrentThrust(focusSector))}%`} tone={(focusHistory.at(-1)?.thrust ?? getCurrentThrust(focusSector)) >= 0 ? 'gain' : 'loss'} />
              <Metric label="代表股" value={focusSector.leaders.map(stock => stock.ticker).join(' · ')} />
            </div>

          </div>
        )}
      </div>
      <div className={styles.rotationFooter}>
        <p className={styles.rotationNote}>右上角通常是第一優先；左上角則是第二優先觀察名單。</p>
      </div>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'gain' | 'loss' }) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong className={tone ? styles[tone] : undefined}>{value}</strong>
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


function getCurrentThrust(sector: SectorLeadership) {
  return sector.trajectory20d.at(-1)?.thrust ?? sector.improvementScore
}

function formatSigned(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`
}

type LaidOutQuadrantPoint = {
  sector: SectorLeadership
  desiredLeft: number
  desiredTop: number
  left: number
  top: number
}

function layoutQuadrantPoints(
  sectors: SectorLeadership[],
  getLeft: (value: number) => number,
  getTop: (value: number) => number,
  selected: string | null
): LaidOutQuadrantPoint[] {
  const points = sectors
    .map(sector => {
      const currentPoint = sector.trajectory20d.at(-1)
      const desiredLeft = getLeft(currentPoint?.rs ?? sector.avgRs)
      const desiredTop = getTop(currentPoint?.thrust ?? getCurrentThrust(sector))
      return {
        sector,
        desiredLeft,
        desiredTop,
        left: desiredLeft,
        top: desiredTop,
      }
    })
    .sort((a, b) => {
      const aSelected = a.sector.sectorZh === selected ? 1 : 0
      const bSelected = b.sector.sectorZh === selected ? 1 : 0
      if (aSelected !== bSelected) return bSelected - aSelected
      return b.sector.leadershipScore - a.sector.leadershipScore
    })

  const minDistance = 8.8
  const leftMin = 7
  const leftMax = 93
  const topMin = 11
  const topMax = 89

  for (let iter = 0; iter < 90; iter += 1) {
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const a = points[i]
        const b = points[j]
        let dx = b.left - a.left
        let dy = b.top - a.top
        let dist = Math.hypot(dx, dy)

        if (dist === 0) {
          dx = ((j - i) % 2 === 0 ? 1 : -1) * 0.01
          dy = ((j - i) % 3 === 0 ? 1 : -1) * 0.01
          dist = Math.hypot(dx, dy)
        }

        if (dist >= minDistance) continue

        const push = (minDistance - dist) / 2
        const ux = dx / dist
        const uy = dy / dist

        a.left -= ux * push
        a.top -= uy * push
        b.left += ux * push
        b.top += uy * push
      }
    }

    for (const point of points) {
      point.left += (point.desiredLeft - point.left) * 0.08
      point.top += (point.desiredTop - point.top) * 0.08
      point.left = Math.max(leftMin, Math.min(leftMax, point.left))
      point.top = Math.max(topMin, Math.min(topMax, point.top))
    }
  }

  return points
}
