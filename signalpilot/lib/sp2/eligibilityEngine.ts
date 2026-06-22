import type { CandidateSignal, EligibilityDecision } from './types'
import type { Sp2Policy } from './policy'

export function checkEligibility(
  signal: CandidateSignal,
  openTickers: Set<string>,
  batchDate: string,
  policy: Sp2Policy,
): EligibilityDecision {
  if (!policy.eligibleLabels.has(signal.label)) {
    return { eligible: false, layer: 'ELIGIBILITY', code: `LABEL_NOT_ELIGIBLE:${signal.label}` }
  }
  if (signal.earnings_in_window === 1) {
    return { eligible: false, layer: 'ELIGIBILITY', code: 'EARNINGS_IN_WINDOW' }
  }
  if (signal.close_at_signal == null) {
    return { eligible: false, layer: 'ELIGIBILITY', code: 'NO_PRICE_DATA' }
  }
  const signalAgeMs = new Date(batchDate).getTime() - new Date(signal.signal_date).getTime()
  if (signalAgeMs > policy.signalFreshnessDays * 86_400_000) {
    return { eligible: false, layer: 'ELIGIBILITY', code: 'SIGNAL_STALE' }
  }
  if (openTickers.has(signal.ticker)) {
    return { eligible: false, layer: 'ELIGIBILITY', code: 'ALREADY_IN_POSITION' }
  }
  return { eligible: true }
}
