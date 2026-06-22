// Versioned SP-2 policy. All trading behaviour is driven from here.
// Bump `version` whenever any value changes so strategy_daily_snapshots and
// candidate_decisions remain traceable to the exact policy that produced them.
export const SP2_POLICY = {
  version: '1.0.0',
  eligibleLabels: new Set(['LONG_BREAK', 'LONG_VCP', 'LONG_BOUNCE']),
  targetNotionalCents: 100_000,      // $1,000 per position
  maxOpenPositions: 20,              // never hold more than 20 concurrent names
  maxNewPositionsPerDay: 5,          // rate-limit daily entries
  maxSectorExposurePct: 0.25,        // 25% of cost-basis NAV per sector
  stopLossAtrMultiplier: 2.0,        // exit if price drops 2× ATR below entry
  maxHoldingTradingDays: 10,         // time-based exit
  signalFreshnessDays: 1,            // only trade signals dated today (±0 calendar days)
} as const

export type Sp2Policy = typeof SP2_POLICY
