import type { SizingDecision } from './types'
import type { Sp2Policy } from './policy'

export function sizePosition(fillPriceCents: number, policy: Sp2Policy): SizingDecision {
  const qty = Math.floor(policy.targetNotionalCents / fillPriceCents)
  if (qty === 0) return { qty: 0, approved: false, code: 'POSITION_TOO_SMALL' }
  return { qty, approved: true }
}
