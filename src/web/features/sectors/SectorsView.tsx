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
              <span className={styles.heroTotal}>{hero.count} 檔</span>
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
                        {mode === 'pro' && <span className={styles.stockRs}>RS {s.rsRank ?? '—'}</span>}
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
  const rsValues = sectors.map(sector => sector.avgRs)
  const improveValues = sectors.map(sector => getCurrentThrust(sector))
  const countValues = sectors.map(sector => sector.count)
  const rsMin = Math.min(...rsValues)
  const rsMax = Math.max(...rsValues)
  const improveMin = Math.min(...improveValues)
  const improveMax = Math.max(...improveValues)
  const countMin = Math.min(...countValues)
  const countMax = Math.max(...countValues)
  const rsRange = Math.max(12, rsMax - rsMin)
  const improveRange = Math.max(8, improveMax - improveMin)
  const countRange = Math.max(1, countMax - countMin)

  const getLeft = (value: number) => 14 + (((value - rsMin) / rsRange) * 72)
  const getTop = (value: number) => 16 + ((1 - ((value - improveMin) / improveRange)) * 64)
  const getSize = (count: number) => 34 + (((count - countMin) / countRange) * 22)
  const focusHistory = focusSector?.trajectory20d ?? []

  return (
    <div className={styles.rotationPanel}>
      <div className={styles.rotationHeader}>
        <div>
          <span className={styles.sectionEyebrow}>板塊輪動象限</span>
          <h2>強度 × 近期推進速度</h2>
        </div>
        <p>橫軸：相對強度 RS，由弱到強　縱軸：近 5 日推進率，由走弱到回暖</p>
      </div>
      <div className={styles.rotationWorkspace}>
        <div className={styles.quadrant}>
          <span className={`${styles.quadrantLabel} ${styles.qTopLeft}`}>弱勢但轉強</span>
          <span className={`${styles.quadrantLabel} ${styles.qTopRight}`}>強勢續強</span>
          <span className={`${styles.quadrantLabel} ${styles.qBottomLeft}`}>弱勢轉弱</span>
          <span className={`${styles.quadrantLabel} ${styles.qBottomRight}`}>強勢降溫</span>
          <span className={`${styles.axisEdge} ${styles.axisTop}`}>推進加快</span>
          <span className={`${styles.axisEdge} ${styles.axisBottom}`}>回撤增加</span>
          <span className={`${styles.axisEdge} ${styles.axisLeft}`}>RS 較弱</span>
          <span className={`${styles.axisEdge} ${styles.axisRight}`}>RS 較強</span>
          {focusHistory.length >= 2 && (
            <svg viewBox="0 0 100 100" className={styles.rotationTrail}>
              <path
                d={buildTrajectoryPath(focusHistory, rsMin, rsRange, improveMin, improveRange)}
                className={styles.rotationTrailPath}
              />
            </svg>
          )}
          {sectors.map(sector => {
            const currentPoint = sector.trajectory20d.at(-1)
            const left = getLeft(currentPoint?.rs ?? sector.avgRs)
            const top = getTop(currentPoint?.thrust ?? getCurrentThrust(sector))
            const size = getSize(sector.count)
            return (
              <button
                key={sector.sectorZh}
                className={`${styles.rotationPoint} ${selected === sector.sectorZh ? styles.rotationSelected : ''}`}
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  minWidth: `${size}px`,
                  height: `${Math.max(28, size - 8)}px`,
                }}
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
                {(focusHistory.at(-1)?.thrust ?? getCurrentThrust(focusSector)) >= 0 ? '轉強中' : '降溫中'}
              </span>
            </div>

            <div className={styles.rotationMetrics}>
              <Metric label="板塊規模" value={`${focusSector.count} 檔`} />
              <Metric label="強度" value={`RS ${Math.round(focusHistory.at(-1)?.rs ?? focusSector.avgRs)}`} />
              <Metric label="推進" value={`${formatSigned(focusHistory.at(-1)?.thrust ?? getCurrentThrust(focusSector))}%`} tone={(focusHistory.at(-1)?.thrust ?? getCurrentThrust(focusSector)) >= 0 ? 'gain' : 'loss'} />
              <Metric label="代表股" value={focusSector.leaders.map(stock => stock.ticker).join(' · ')} />
            </div>

            <div className={styles.rotationTrendCard}>
              <div>
                <strong>近 20 日板塊軌跡</strong>
                <span>取板塊內可用收盤資料的平均變化</span>
              </div>
              <SectorTrendSparkline sector={focusSector} />
            </div>
          </div>
        )}
      </div>
      <p className={styles.rotationNote}>桌面會固定顯示右側研究面板；圖上的淡線代表目前焦點板塊近 20 日在象限中的移動路徑。縱軸使用價格推進率，所以更接近「資金有沒有往上推」。</p>
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

function SectorTrendSparkline({ sector }: { sector: SectorLeadership }) {
  const values = sector.trend20d.length > 1 ? sector.trend20d : buildSectorTrendValues(sector)
  if (values.length < 2) return <span className={styles.rotationTrendEmpty}>資料不足</span>

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(1, max - min)
  const width = 132
  const height = 42
  const step = width / Math.max(1, values.length - 1)
  const points = values.map((value, index) => {
    const x = index * step
    const y = height - (((value - min) / range) * height)
    return [x, y] as const
  })
  const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const area = `${line} L ${width} ${height} L 0 ${height} Z`
  const change = values.at(-1)! - values[0]!

  return (
    <div className={styles.rotationTrend}>
      <svg viewBox={`0 0 ${width} ${height}`} className={styles.rotationSpark}>
        <path d={area} className={styles.rotationArea} />
        <path d={line} className={styles.rotationLine} />
      </svg>
      <span className={`${styles.rotationTrendValue} ${change >= 0 ? styles.bull : styles.bear}`}>
        {change >= 0 ? '+' : ''}{change.toFixed(1)}%
      </span>
    </div>
  )
}

function buildSectorTrendValues(sector: SectorLeadership) {
  const buckets = new Map<number, number[]>()

  for (const stock of sector.stocks) {
    const series = [...(stock.recentClose ?? [])].reverse()
    if (series.length < 2) continue
    const base = series[0]
    if (!base || !Number.isFinite(base)) continue
    series.forEach((close, index) => {
      const pct = ((close - base) / base) * 100
      const existing = buckets.get(index) ?? []
      existing.push(pct)
      buckets.set(index, existing)
    })
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, samples]) => samples.reduce((sum, value) => sum + value, 0) / samples.length)
}

function getCurrentThrust(sector: SectorLeadership) {
  return sector.trajectory20d.at(-1)?.thrust ?? sector.improvementScore
}

function formatSigned(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`
}

function buildTrajectoryPath(
  points: SectorLeadership['trajectory20d'],
  rsMin: number,
  rsRange: number,
  thrustMin: number,
  thrustRange: number
) {
  return points
    .map((point, index) => {
      const x = 14 + (((point.rs - rsMin) / rsRange) * 72)
      const y = 16 + ((1 - ((point.thrust - thrustMin) / thrustRange)) * 64)
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}
