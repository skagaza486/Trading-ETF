import type { LabelGateResult } from './researchGate'
import { getStockLabelDisplay } from '../ui/labelDisplay'

function gateMarkdownValue(result: boolean | null): string {
  if (result === true) return 'PASS'
  if (result === false) return 'FAIL'
  return 'NA'
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim()
}

export function formatGateSummaryTable(gateResults: LabelGateResult[]): string {
  const header = [
    '| Label | n | Avg 5D | Median 5D | vs SPY | MAE 5D | Neutral n | Neutral Avg 5D | G1 | G2 | G3 | G4 | G5 | G6 | G7 | Status |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- | --- | --- |'
  ]

  const rows = gateResults.map(item => {
    const labelDisplay = getStockLabelDisplay(item.label)

    return [
      `${labelDisplay.lightEmoji} ${escapeMarkdownCell(item.label)}`,
      String(item.count),
      formatPercent(item.avgRet5d),
      formatPercent(item.medianRet5d),
      formatPercent(item.avgRet5dVsSpy),
      formatPercent(item.avgMae5d),
      String(item.regimeSplit.neutral.count),
      formatPercent(item.regimeSplit.neutral.avgRet5d),
      gateMarkdownValue(item.gate1SampleSize),
      gateMarkdownValue(item.gate2Direction),
      gateMarkdownValue(item.gate3VsSpy),
      gateMarkdownValue(item.gate4Consistent),
      gateMarkdownValue(item.gate5NeutralRegime),
      gateMarkdownValue(item.gate6Mae),
      gateMarkdownValue(item.gate7StopLossHitRate),
      item.status
    ].join(' | ')
  }).map(row => `| ${row} |`)

  return [...header, ...rows].join('\n')
}

export function buildGateSummaryMarkdown(gateResults: LabelGateResult[], lastUpdated: string | null): string {
  const generatedAt = lastUpdated
    ? new Date(lastUpdated).toLocaleString('en-HK', { hour12: false })
    : 'pending'

  return [
    '### Gate Summary Export',
    '',
    `Generated: ${generatedAt}`,
    '',
    formatGateSummaryTable(gateResults)
  ].join('\n')
}

function formatPercent(value: number | null): string {
  if (value === null) return 'n/a'
  return `${(value * 100).toFixed(1)}%`
}
