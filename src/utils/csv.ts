import type { Holding } from '../types/portfolio'

function parseCsvRow(row: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < row.length; index += 1) {
    const char = row[index]
    const next = row[index + 1]

    if (char === '"' && next === '"') {
      current += '"'
      index += 1
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  values.push(current.trim())
  return values
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function getField(record: Record<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    const value = record[alias]
    if (value !== undefined && value !== '') return value
  }

  return ''
}

function toNumber(value: string): number {
  return Number(value.replace(/,/g, '')) || 0
}

export function parseHoldingsCsv(csv: string): Holding[] {
  const rows = csv
    .split(/\r?\n/)
    .map(row => row.trim())
    .filter(Boolean)

  if (rows.length < 2) return []

  const headers = parseCsvRow(rows[0]).map(normalizeHeader)

  return rows.slice(1).flatMap(row => {
    const values = parseCsvRow(row)
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
    const ticker = getField(record, ['ticker', 'symbol', 'contract', 'instrument']).toUpperCase()
    const shares = toNumber(getField(record, ['shares', 'quantity', 'position', 'qty']))
    const averageCost = toNumber(getField(record, ['averagecost', 'avgcost', 'costbasis', 'averageprice', 'avgprice']))
    const rawCurrency = getField(record, ['currency', 'ccy']).toUpperCase()
    const currency = rawCurrency === 'HKD' || ticker.endsWith('.HK') ? 'HKD' : 'USD'

    if (!ticker || shares === 0) return []

    return [
      {
        ticker,
        shares,
        averageCost,
        currency
      } satisfies Holding
    ]
  })
}

export function holdingsToCsv(holdings: Holding[]): string {
  const headers = ['ticker', 'shares', 'averageCost', 'currency']
  const rows = holdings.map(holding =>
    [holding.ticker, holding.shares, holding.averageCost, holding.currency]
      .map(value => `"${String(value).replace(/"/g, '""')}"`)
      .join(',')
  )

  return [headers.join(','), ...rows].join('\n')
}
