import type { EtfSignalLabel } from '../hooks/useEtfSignals'
import styles from './SignalBadge.module.css'

type BadgeConfig = { label: string; cls: 'green' | 'yellow' | 'grey' | 'red' }

const MAP: Record<EtfSignalLabel, BadgeConfig> = {
  FAVOUR: { label: '建議持有', cls: 'green'  },
  WATCH:  { label: '觀察留意', cls: 'yellow' },
  WAIT:   { label: '等待時機', cls: 'grey'   },
  AVOID:  { label: '建議迴避', cls: 'red'    },
}

type Props = { label: EtfSignalLabel; showCode?: boolean }

export function EtfSignalBadge({ label, showCode }: Props) {
  const cfg = MAP[label] ?? { label: label, cls: 'grey' as const }
  return (
    <span className={`${styles.badge} ${styles[cfg.cls]}`}>
      {cfg.label}
      {showCode && <span className={styles.code}> · {label}</span>}
    </span>
  )
}
