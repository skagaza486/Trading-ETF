import type { ETFCategory } from './etf'

export type SignalAction = 'ADD' | 'HOLD' | 'WAIT' | 'WATCH' | 'TRIM' | 'REDUCE' | 'REVIEW'

export type SignalPriority = 'HIGH' | 'MEDIUM' | 'LOW'

export type Signal = {
  id: string
  ticker: string
  action: SignalAction
  priority: SignalPriority
  reason: string
  ruleId: string
  category: ETFCategory
  currentWeight: number
  targetWeight: number
  weightGap: number
  suggestedAmountHkd?: number
  suggestedPostTradeWeight?: number
  blockedBy?: string[]
  createdAt: string
}
