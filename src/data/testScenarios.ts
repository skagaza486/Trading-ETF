export type TestScenario = {
  id: string
  description: string
  expectedResult: string
}

export const testScenarios: TestScenario[] = [
  {
    id: 'underweight-ief-neutral',
    description: 'Underweight IEF in neutral regime',
    expectedResult: 'ADD IEF'
  },
  {
    id: 'underweight-qqq-vix-high',
    description: 'Underweight QQQ while VIX > 25',
    expectedResult: 'WAIT QQQ blocked by risk-off regime'
  },
  {
    id: 'missing-price',
    description: 'Missing current price',
    expectedResult: 'DATA_REVIEW'
  },
  {
    id: 'stale-cache',
    description: 'Stale cached price after failed refresh',
    expectedResult: 'Use stale value, show warning, and downgrade action confidence'
  }
]
