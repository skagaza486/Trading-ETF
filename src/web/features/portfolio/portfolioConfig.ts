// ── Portfolio configuration & presets ────────────────────────────────
//
// Separates the *tool* (generic, user-configurable) from *a plan* (a named
// preset of numbers). The personal HK$5M 3-phase plan is just one preset.
//
// Key design rule: every risk limit is expressed as a FRACTION of the
// capital base, never an absolute currency amount. That makes the same
// rules valid across users, currencies, and the three capital phases.

export type RegimeRiskKey = 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF'

export type RiskConfig = {
  maxSingleStockPct: number // fraction of capitalBase (0.10 = 10%)
  maxSingleSectorPct: number // fraction of invested book value
  maxPositions: number
  hardStopPct: number // negative, e.g. -0.10 (from entry)
  trailingStopPct: number // negative, e.g. -0.20 (from peak)
  minCashPct: Record<RegimeRiskKey, number>
  maxNewPerMonth: number
  consecutiveLossPause: number // # consecutive losing closes that triggers a pause
}

export type PortfolioConfig = {
  presetId: string // 'custom' for user-edited
  presetName: string
  currency: string // display only — 'HKD' | 'USD'
  capitalBase: number // total deployable capital for the active phase
  etfBasePct: number // 0.60 → ETF base target = capitalBase * etfBasePct
  risk: RiskConfig
}

// ── Derived helpers ──────────────────────────────────────────────────

export function maxSingleStockValue(cfg: PortfolioConfig): number {
  return cfg.capitalBase * cfg.risk.maxSingleStockPct
}

export function etfBaseValue(cfg: PortfolioConfig): number {
  return cfg.capitalBase * cfg.etfBasePct
}

export function regimeRiskKey(regime: string): RegimeRiskKey {
  return regime === 'long_friendly' ? 'RISK_ON'
    : regime === 'short_friendly' ? 'RISK_OFF'
    : 'NEUTRAL'
}

// ── Presets ──────────────────────────────────────────────────────────
// EXECUTION_PLAN §1–§2. The 3-phase personal plan lives here as DATA, not
// as logic baked into components.

const PERSONAL_RISK: RiskConfig = {
  maxSingleStockPct: 0.10, // HK$50K @ Phase 1 HK$500K
  maxSingleSectorPct: 0.25,
  maxPositions: 15,
  hardStopPct: -0.10,
  trailingStopPct: -0.20,
  minCashPct: { RISK_ON: 0.05, NEUTRAL: 0.15, RISK_OFF: 0.30 },
  maxNewPerMonth: 4,
  consecutiveLossPause: 3,
}

// Personal plan is denominated in HKD (HK$500K / 1.5M / 5M) but executed in
// USD instruments via Futu, so the tool runs all-USD to keep cost basis and
// live prices in one currency. Capital bases converted @ ~7.8 HKD/USD.
export const BUILTIN_PRESETS: PortfolioConfig[] = [
  {
    presetId: 'personal-phase1',
    presetName: "Tony · Phase 1 (US$64K)",
    currency: 'USD',
    capitalBase: 64_000, // HK$500K
    etfBasePct: 0.60,
    risk: PERSONAL_RISK,
  },
  {
    presetId: 'personal-phase2',
    presetName: "Tony · Phase 2 (US$192K)",
    currency: 'USD',
    capitalBase: 192_000, // HK$1.5M
    etfBasePct: 0.50,
    risk: PERSONAL_RISK,
  },
  {
    presetId: 'personal-phase3',
    presetName: "Tony · Phase 3 (US$640K)",
    currency: 'USD',
    capitalBase: 640_000, // HK$5M
    etfBasePct: 0.40,
    risk: PERSONAL_RISK,
  },
  {
    presetId: 'blank',
    presetName: 'Blank / Custom',
    currency: 'USD',
    capitalBase: 100_000,
    etfBasePct: 0.50,
    risk: {
      maxSingleStockPct: 0.10,
      maxSingleSectorPct: 0.30,
      maxPositions: 20,
      hardStopPct: -0.10,
      trailingStopPct: -0.20,
      minCashPct: { RISK_ON: 0.05, NEUTRAL: 0.15, RISK_OFF: 0.30 },
      maxNewPerMonth: 6,
      consecutiveLossPause: 3,
    },
  },
]

export const DEFAULT_CONFIG: PortfolioConfig = BUILTIN_PRESETS[0]

// ── ETF reference / sleeve classification ────────────────────────────
// Transparent, rules-based allocation aid — NOT a predictive signal.
// Each ETF maps to an asset-class "sleeve". Real diversification comes
// from holding LOW-correlation sleeves, not from holding more tickers in
// the same sleeve. This is what makes the basket explainable.

export type EtfSleeve =
  | 'US Equity Beta'
  | 'Growth'
  | 'Small/Mid Cap'
  | 'Intl Equity'
  | 'Gold / Real Assets'
  | 'Bonds / Cash'
  | 'Other'

export type EtfReference = {
  sleeve: EtfSleeve
  role: string // one-line "why hold this"
  // Approximate, illustrative correlation to broad US equity (SPY).
  // Reference figures for education — not computed live.
  corrToSpy: number
}

export const ETF_REFERENCE: Record<string, EtfReference> = {
  SPY:  { sleeve: 'US Equity Beta', role: 'S&P 500 core — broad US large-cap beta', corrToSpy: 1.00 },
  VOO:  { sleeve: 'US Equity Beta', role: 'S&P 500 core (low fee)', corrToSpy: 1.00 },
  VTI:  { sleeve: 'US Equity Beta', role: 'Total US market', corrToSpy: 0.99 },
  QQQ:  { sleeve: 'Growth', role: 'Nasdaq-100 growth/tech tilt', corrToSpy: 0.90 },
  IWM:  { sleeve: 'Small/Mid Cap', role: 'Russell 2000 small-cap', corrToSpy: 0.85 },
  MDY:  { sleeve: 'Small/Mid Cap', role: 'S&P MidCap 400', corrToSpy: 0.92 },
  EFA:  { sleeve: 'Intl Equity', role: 'Developed ex-US equity', corrToSpy: 0.85 },
  VEA:  { sleeve: 'Intl Equity', role: 'Developed ex-US equity', corrToSpy: 0.85 },
  VWO:  { sleeve: 'Intl Equity', role: 'Emerging markets equity', corrToSpy: 0.75 },
  GLD:  { sleeve: 'Gold / Real Assets', role: 'Gold — inflation / crisis hedge', corrToSpy: 0.10 },
  IAU:  { sleeve: 'Gold / Real Assets', role: 'Gold (low fee)', corrToSpy: 0.10 },
  JEPQ: { sleeve: 'Growth', role: 'Nasdaq covered-call ETF — monthly income, capped upside', corrToSpy: 0.85 },
  SGOV: { sleeve: 'Bonds / Cash', role: '0–3M T-Bills — cash equivalent', corrToSpy: 0.00 },
  BIL:  { sleeve: 'Bonds / Cash', role: '1–3M T-Bills — cash equivalent', corrToSpy: 0.00 },
  TLT:  { sleeve: 'Bonds / Cash', role: '20Y+ Treasuries — duration/deflation hedge', corrToSpy: -0.30 },
  IEF:  { sleeve: 'Bonds / Cash', role: '7–10Y Treasuries', corrToSpy: -0.20 },
}

export function etfRef(ticker: string): EtfReference {
  return ETF_REFERENCE[ticker.toUpperCase()]
    ?? { sleeve: 'Other', role: 'Unclassified — add to ETF_REFERENCE', corrToSpy: 0.5 }
}

export const SLEEVE_ORDER: EtfSleeve[] = [
  'US Equity Beta', 'Growth', 'Small/Mid Cap', 'Intl Equity', 'Gold / Real Assets', 'Bonds / Cash', 'Other',
]
