import type { MacroSnapshot } from '../../types/macro'

type FredSeries = 'BAMLH0A0HYM2' | 'T5YIE'

function parseFredCsv(csv: string, series: FredSeries): number[] {
  return csv
    .split(/\r?\n/)
    .slice(1)
    .map(row => row.split(','))
    .map(([, value]) => value)
    .filter(value => value && value !== '.')
    .map(value => Number(value))
    .filter(Number.isFinite)
}

async function fetchSeries(series: FredSeries): Promise<number[]> {
  const response = await fetch(`/api/fred/graph/fredgraph.csv?id=${series}`)
  if (!response.ok) throw new Error(`FRED returned ${response.status} for ${series}`)
  return parseFredCsv(await response.text(), series)
}

function latest(values: number[]): number | null {
  return values.length > 0 ? values[values.length - 1] : null
}

function prior(values: number[], periodsBack: number): number | null {
  return values.length > periodsBack ? values[values.length - 1 - periodsBack] : null
}

export class FredMacroProvider {
  async getMacroSnapshot(): Promise<MacroSnapshot> {
    const [creditValues, inflationValues] = await Promise.all([
      fetchSeries('BAMLH0A0HYM2'),
      fetchSeries('T5YIE')
    ])

    const creditSpread = latest(creditValues)
    const creditSpreadPrior = prior(creditValues, 63)
    const inflationExpectation = latest(inflationValues)
    const inflationPrior = prior(inflationValues, 63)

    return {
      creditSpread,
      inflationExpectation,
      creditSpreadWidening:
        creditSpread !== null && creditSpreadPrior !== null ? creditSpread > creditSpreadPrior + 0.25 : false,
      inflationRising:
        inflationExpectation !== null && inflationPrior !== null
          ? inflationExpectation > inflationPrior + 0.15
          : false,
      fetchedAt: new Date().toISOString()
    }
  }
}
