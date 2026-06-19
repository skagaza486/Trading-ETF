import type { BreadthDay } from '../../shared/hooks/useSignalBreadth'
import styles from './BreadthChart.module.css'

type Props = { rows: BreadthDay[]; width?: number; height?: number }

export function BreadthChart({ rows, width = 320, height = 80 }: Props) {
  if (rows.length < 2) return null

  const maxVal = Math.max(...rows.map(r => r.strongBull + r.base), 1)
  const pad = { top: 8, right: 8, bottom: 18, left: 24 }
  const w = width - pad.left - pad.right
  const h = height - pad.top - pad.bottom

  const x = (i: number) => pad.left + (i / (rows.length - 1)) * w
  const y = (v: number) => pad.top + h - (v / maxVal) * h

  // Stacked: base on bottom, strongBull on top
  const strongPts = rows.map((r, i) => `${x(i)},${y(r.strongBull + r.base)}`).join(' ')
  const basePts   = rows.map((r, i) => `${x(i)},${y(r.base)}`).join(' ')

  // Area fill for strongBull (top of base to top of strong+base)
  const strongAreaPts = [
    ...rows.map((r, i) => `${x(i)},${y(r.strongBull + r.base)}`),
    ...rows.map((r, i) => `${x(rows.length - 1 - i)},${y(rows[rows.length - 1 - i].base)}`),
  ].join(' ')

  // Area fill for base (zero line to base)
  const baseAreaPts = [
    ...rows.map((r, i) => `${x(i)},${y(r.base)}`),
    `${x(rows.length - 1)},${y(0)}`,
    `${x(0)},${y(0)}`,
  ].join(' ')

  // Y grid lines
  const gridVals = [0, Math.round(maxVal / 2), maxVal]

  // X labels: first, middle, last date (MM-DD)
  const labelIdxs = [0, Math.floor(rows.length / 2), rows.length - 1]

  return (
    <div className={styles.wrap}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} className={styles.svg}>
        {/* Grid lines */}
        {gridVals.map(v => (
          <g key={v}>
            <line
              x1={pad.left} y1={y(v)} x2={pad.left + w} y2={y(v)}
              stroke="rgba(255,255,255,0.06)" strokeWidth="1"
            />
            <text x={pad.left - 3} y={y(v) + 3.5} textAnchor="end" fontSize="8" fill="rgba(150,180,167,0.6)">{v}</text>
          </g>
        ))}

        {/* Base area (LONG_BASE — yellow) */}
        <polygon points={baseAreaPts} fill="rgba(255,191,60,0.15)" />
        <polyline points={basePts} fill="none" stroke="rgba(255,191,60,0.5)" strokeWidth="1" />

        {/* StrongBull area (LONG_BREAK/VCP/BOUNCE — green) */}
        <polygon points={strongAreaPts} fill="rgba(39,227,141,0.18)" />
        <polyline points={strongPts} fill="none" stroke="#27e38d" strokeWidth="1.5" strokeLinejoin="round" />

        {/* X labels */}
        {labelIdxs.map(i => (
          <text key={i} x={x(i)} y={height - 4} textAnchor="middle" fontSize="8" fill="rgba(150,180,167,0.55)">
            {rows[i].date.slice(5)} {/* MM-DD */}
          </text>
        ))}
      </svg>

      <div className={styles.legend}>
        <span className={styles.legendGreen}>■ 強勢突破/VCP/反彈</span>
        <span className={styles.legendYellow}>■ 整固等待</span>
      </div>
    </div>
  )
}
