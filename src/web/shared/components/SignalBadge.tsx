import type { StockSignalLabel } from '../../../types/signal'
import styles from './SignalBadge.module.css'

type BadgeConfig = { label: string; cls: 'green' | 'yellow' | 'grey' | 'red' }

const MAP: Record<StockSignalLabel, BadgeConfig> = {
  LONG_BREAK:  { label: '強勢突破',  cls: 'green'  },
  LONG_VCP:    { label: '突破整理',  cls: 'green'  },
  LONG_BOUNCE: { label: '回升反彈',  cls: 'green'  },
  LONG_BASE:   { label: '打底築底',  cls: 'yellow' },
  WATCH:       { label: '觀察中',    cls: 'yellow' },
  NEUTRAL:     { label: '中性',      cls: 'grey'   },
  AVOID_CHOP:  { label: '震盪勿追',  cls: 'red'    },
  SHORT_WATCH: { label: '走勢轉弱',  cls: 'red'    },
  SHORT_BASE:  { label: '跌勢成形',  cls: 'red'    },
  SHORT_BREAK: { label: '放量跌破',  cls: 'red'    },
  REVIEW_DATA: { label: '資料不足',  cls: 'grey'   },
  REVIEW_EVENT:{ label: '臨近財報',  cls: 'grey'   },
}

type Props = { label: StockSignalLabel; showCode?: boolean }

export function SignalBadge({ label, showCode }: Props) {
  const cfg = MAP[label]
  return (
    <span className={`${styles.badge} ${styles[cfg.cls]}`}>
      {cfg.label}
      {showCode && <span className={styles.code}> · {label}</span>}
    </span>
  )
}
