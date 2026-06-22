import type { StockSnapshotEntry } from '../../types/snapshot'

const BULLISH = new Set(['LONG_BREAK', 'LONG_VCP', 'LONG_BOUNCE', 'LONG_BASE', 'WATCH'])
const BEARISH = new Set(['SHORT_BREAK', 'SHORT_BASE', 'SHORT_WATCH', 'AVOID_CHOP'])

const LABEL_ZH: Record<string, string> = {
  LONG_BREAK: '突破',
  LONG_VCP: 'VCP',
  LONG_BOUNCE: '反彈',
  LONG_BASE: '整固',
  WATCH: '觀察',
  NEUTRAL: '中性',
  AVOID_CHOP: '震盪',
  SHORT_BREAK: '空頭突破',
  SHORT_BASE: '空頭整固',
  SHORT_WATCH: '空頭轉弱',
  REVIEW_DATA: '資料待查',
  REVIEW_EVENT: '事件待查',
}

function labelZh(label?: string): string {
  if (!label) return '前一狀態'
  return LABEL_ZH[label] ?? label
}

export function hasMeaningfulChange(stock: StockSnapshotEntry): boolean {
  return stock.previousLabel !== undefined && stock.previousLabel !== stock.label
}

export function hasRaisedRisk(stock: StockSnapshotEntry): boolean {
  return stock.earningsWithinWindow || stock.researchFlags.length > 0 || BEARISH.has(stock.label)
}

export function buildWhyNow(stock: StockSnapshotEntry): string {
  if (hasMeaningfulChange(stock)) {
    return `今日由${labelZh(stock.previousLabel)}轉成${labelZh(stock.label)}，代表這檔剛出現新的研究理由。`
  }

  switch (stock.label) {
    case 'LONG_BREAK':
      return '剛突破近 20 日高位，屬最值得先確認延續性的進攻訊號。'
    case 'LONG_VCP':
      return '量縮整理後再嘗試突破，代表賣壓可能已收斂。'
    case 'LONG_BOUNCE':
      return '回踩趨勢均線後反彈，屬順勢重啟的候選。'
    case 'LONG_BASE':
      return '結構未差，但仍在整固區間，重點是等觸發。'
    case 'WATCH':
      return '方向開始轉好，但未到可以直接出手的階段。'
    case 'SHORT_BREAK':
    case 'SHORT_BASE':
    case 'SHORT_WATCH':
    case 'AVOID_CHOP':
      return '這檔浮上來主要是提醒風險，不是做多機會。'
    default:
      return '目前沒有明確優勢，較適合先觀察下一步變化。'
  }
}

export function buildWatchout(stock: StockSnapshotEntry): string {
  if (stock.earningsWithinWindow) {
    return '財報窗口內，波動可能被放大，倉位宜輕。'
  }

  if (stock.researchFlags.includes('DISTRIBUTION_WARNING')) {
    return '有派貨或分歧警號，避免把表面強勢誤讀成健康突破。'
  }

  if (stock.researchFlags.includes('BASE_BREAK')) {
    return '整固結構曾受破壞，需防止假動作或二次失敗。'
  }

  if (stock.indicators.extendedFromPivot) {
    return '價格可能已離理想入場區過遠，追價風險較高。'
  }

  if (stock.rsRank !== null && stock.rsRank >= 85 && BULLISH.has(stock.label)) {
    return '相對強度很高是優點，但也要提防短線過熱回吐。'
  }

  if (BEARISH.has(stock.label)) {
    return '現階段先把它當成風險提醒，不宜急著找做多理由。'
  }

  return '若量能或延續性不足，今日訊號很容易回到觀察階段。'
}

export function buildVerificationNote(stock: StockSnapshotEntry): string {
  if (stock.earningsWithinWindow) {
    return '先確認最近財報日期與市場反應，避免把事件波動誤當成結構改善。'
  }

  if (hasMeaningfulChange(stock)) {
    return '先看接下來 1 至 2 日能否延續，而不是只因今天變動就下結論。'
  }

  if (stock.label === 'LONG_BASE' || stock.label === 'WATCH') {
    return '先等突破或量能確認，現階段較像候選名單，不是已完成訊號。'
  }

  if (BEARISH.has(stock.label)) {
    return '先確認這是短線回吐還是結構轉差，再決定是否需要避開。'
  }

  return '先核對量價、財報與新聞是否支持目前訊號，再決定是否深入研究。'
}
