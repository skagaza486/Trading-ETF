// SP-1 eligibility stub. SP-2 replaces this with the full risk/sizing engine.
import type { SignalRow, EligibilityResult } from './types'
import { ELIGIBLE_LABELS } from './types'

export function checkEligibility(signal: SignalRow): EligibilityResult {
  if (!ELIGIBLE_LABELS.has(signal.label)) {
    return { eligible: false, reason: `LABEL_NOT_ELIGIBLE:${signal.label}` }
  }
  if (signal.earnings_in_window === 1) {
    return { eligible: false, reason: 'EARNINGS_IN_WINDOW' }
  }
  if (signal.close_at_signal == null) {
    return { eligible: false, reason: 'NO_PRICE_DATA' }
  }
  return { eligible: true }
}
