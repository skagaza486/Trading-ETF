import type { ETFLabel, RegimeClass, ResearchFlag, StockSignalLabel } from '../types/signal'

export type StockLabelDisplay = {
  lightEmoji: string
  zhText: string
  enCode: StockSignalLabel
  plainReason: string
  action: string
  actionGroup: 'consider' | 'watch' | 'avoid'
}

export type ETFLabelDisplay = {
  lightEmoji: string
  zhText: string
  enCode: ETFLabel
  plainReason: string
  action: string
  actionGroup: 'consider' | 'watch' | 'avoid'
}

export type ResearchFlagDisplay = {
  shortCode: string
  zhText: string
  tone: 'violet' | 'warn'
}

const STOCK_LABEL_MAP: Record<StockSignalLabel, Omit<StockLabelDisplay, 'enCode'>> = {
  UP_PROMOTION: {
    lightEmoji: '🟢',
    zhText: '升勢確認＋加強',
    plainReason: '連續轉強，升得有力',
    action: '值得研究',
    actionGroup: 'consider'
  },
  LONG_CONFIRM: {
    lightEmoji: '🟢',
    zhText: '升勢已確認',
    plainReason: '升得有力，成交配合',
    action: '值得研究',
    actionGroup: 'consider'
  },
  LONG_VCP: {
    lightEmoji: '🟢',
    zhText: '縮量突破，值得留意',
    plainReason: '量縮至極後放量突破，強勢信號',
    action: '值得研究',
    actionGroup: 'consider'
  },
  LONG_SETUP: {
    lightEmoji: '🟢',
    zhText: '接近買入點',
    plainReason: '升勢成形，留意入場',
    action: '值得研究',
    actionGroup: 'consider'
  },
  LONG_PULLBACK: {
    lightEmoji: '🟢',
    zhText: '升勢回調，趁低吸納',
    plainReason: '升勢完好，回調至支撐，收市反彈',
    action: '值得研究',
    actionGroup: 'consider'
  },
  LONG_WATCH: {
    lightEmoji: '🟡',
    zhText: '初現上升跡象',
    plainReason: '啱啱轉好，未到位，先睇住',
    action: '先觀察',
    actionGroup: 'watch'
  },
  NEUTRAL: {
    lightEmoji: '⚪',
    zhText: '方向未明',
    plainReason: '冇明顯方向，暫時觀望',
    action: '先觀察',
    actionGroup: 'watch'
  },
  AVOID_CHOP: {
    lightEmoji: '🟠',
    zhText: '上落市，避開',
    plainReason: '上上落落冇方向，唔好掂',
    action: '避開',
    actionGroup: 'avoid'
  },
  SHORT_WATCH: {
    lightEmoji: '🟠',
    zhText: '走勢轉弱',
    plainReason: '開始偏弱，小心',
    action: '避開',
    actionGroup: 'avoid'
  },
  SHORT_SETUP: {
    lightEmoji: '🔴',
    zhText: '跌勢成形',
    plainReason: '跌緊，唔好接',
    action: '避開',
    actionGroup: 'avoid'
  },
  SHORT_CONFIRM: {
    lightEmoji: '🔴',
    zhText: '跌勢已確認',
    plainReason: '明顯下跌，遠離',
    action: '避開',
    actionGroup: 'avoid'
  },
  DOWN_PROMOTION: {
    lightEmoji: '🔴',
    zhText: '跌勢確認＋加強',
    plainReason: '連續轉弱，跌得急',
    action: '避開',
    actionGroup: 'avoid'
  },
  REVIEW_DATA: {
    lightEmoji: '⚫',
    zhText: '暫時無法判斷',
    plainReason: '資料不足，避開',
    action: '避開',
    actionGroup: 'avoid'
  },
  REVIEW_EVENT: {
    lightEmoji: '⚫',
    zhText: '快出財報',
    plainReason: '臨近財報波動大，避開',
    action: '避開',
    actionGroup: 'avoid'
  }
}

export function getStockLabelDisplay(label: StockSignalLabel): StockLabelDisplay {
  return { ...STOCK_LABEL_MAP[label], enCode: label }
}

const ETF_LABEL_MAP: Record<ETFLabel, Omit<ETFLabelDisplay, 'enCode'>> = {
  FAVOUR: {
    lightEmoji: '🟢',
    zhText: '值得留意',
    plainReason: '走勢及動力均偏強',
    action: '值得研究',
    actionGroup: 'consider'
  },
  WATCH: {
    lightEmoji: '🟡',
    zhText: '留意觀望',
    plainReason: '有改善跡象，但未到位',
    action: '先觀察',
    actionGroup: 'watch'
  },
  WAIT: {
    lightEmoji: '⚪',
    zhText: '靜候信號',
    plainReason: '走勢平穩，方向不明',
    action: '先觀察',
    actionGroup: 'watch'
  },
  AVOID: {
    lightEmoji: '🔴',
    zhText: '避開',
    plainReason: '走勢偏弱，避免持倉',
    action: '避開',
    actionGroup: 'avoid'
  },
  REVIEW: {
    lightEmoji: '⚫',
    zhText: '資料不足',
    plainReason: '暫時無法評估，謹慎對待',
    action: '避開',
    actionGroup: 'avoid'
  }
}

export function getETFLabelDisplay(label: ETFLabel): ETFLabelDisplay {
  return { ...ETF_LABEL_MAP[label], enCode: label }
}

const RESEARCH_FLAG_MAP: Record<ResearchFlag, ResearchFlagDisplay> = {
  BASE_BREAK: {
    shortCode: 'BASE_BREAK',
    zhText: '長底突破',
    tone: 'violet'
  },
  DISTRIBUTION_WARNING: {
    shortCode: 'DISTRIBUTION',
    zhText: '派發預警',
    tone: 'warn'
  }
}

export function getResearchFlagDisplay(flag: ResearchFlag): ResearchFlagDisplay {
  return RESEARCH_FLAG_MAP[flag]
}

export function getRegimeBanner(regime: RegimeClass): {
  emoji: string
  zhText: string
  enText: string
  colorClass: string
} {
  switch (regime) {
    case 'long_friendly':
      return {
        emoji: '🟢',
        zhText: '今日大市偏好 — 可以積極啲',
        enText: 'Long-friendly',
        colorClass: 'regime-banner--long'
      }
    case 'short_friendly':
      return {
        emoji: '🔴',
        zhText: '今日大市偏弱 — 建議避險',
        enText: 'Short-friendly',
        colorClass: 'regime-banner--short'
      }
    default:
      return {
        emoji: '🟡',
        zhText: '今日大市普通 — 小心揀',
        enText: 'Neutral',
        colorClass: 'regime-banner--neutral'
      }
  }
}
