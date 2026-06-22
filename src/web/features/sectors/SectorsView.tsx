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
    return buildSectorLeadership(snap.snapshot.stocks)
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
          selected={expanded}
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
  onSelect,
}: {
  sectors: SectorLeadership[]
  selected: string | null
  onSelect: (sector: string) => void
}) {
  return (
    <div className={styles.rotationPanel}>
      <div className={styles.rotationHeader}>
        <div>
          <span className={styles.sectionEyebrow}>板塊輪動象限</span>
          <h2>強度 × 訊號改善速度</h2>
        </div>
        <p>橫軸：平均 RS　縱軸：今日升降級淨比例</p>
      </div>
      <div className={styles.quadrant}>
        <span className={`${styles.quadrantLabel} ${styles.qTopLeft}`}>落後改善</span>
        <span className={`${styles.quadrantLabel} ${styles.qTopRight}`}>領先加速</span>
        <span className={`${styles.quadrantLabel} ${styles.qBottomLeft}`}>落後偏弱</span>
        <span className={`${styles.quadrantLabel} ${styles.qBottomRight}`}>領先降溫</span>
        <span className={styles.axisX}>RS 強 →</span>
        <span className={styles.axisY}>改善快 →</span>
        {sectors.map(sector => {
          const left = Math.min(94, Math.max(6, sector.avgRs))
          const bottom = 50 + Math.min(20, Math.max(-20, sector.improvementScore)) * 2.2
          return (
            <button
              key={sector.sectorZh}
              className={`${styles.rotationPoint} ${selected === sector.sectorZh ? styles.rotationSelected : ''}`}
              style={{ left: `${left}%`, bottom: `${bottom}%` }}
              title={`${sector.sectorZh}：RS ${sector.avgRs.toFixed(0)}，改善 ${sector.improvementScore >= 0 ? '+' : ''}${sector.improvementScore.toFixed(1)}%`}
              onClick={() => onSelect(sector.sectorZh)}
            >
              {sector.sectorZh.slice(0, 2)}
            </button>
          )
        })}
      </div>
      <p className={styles.rotationNote}>點選板塊圓點後，可在下方展開成份股。改善速度只反映最新一次訊號變化，不等同價格動能。</p>
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
