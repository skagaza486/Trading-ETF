import type { OHLCVBar } from '../types/indicator'

export function computeEMA(bars: OHLCVBar[], period: number): (number | null)[] {
  const output: (number | null)[] = new Array(bars.length).fill(null)
  if (period <= 0 || bars.length < period) return output

  const multiplier = 2 / (period + 1)
  const closes = bars.map(bar => bar.close)
  const seed = closes.slice(0, period).reduce((sum, value) => sum + value, 0) / period

  output[period - 1] = seed

  for (let index = period; index < closes.length; index += 1) {
    const previous = output[index - 1]
    if (previous === null) continue
    output[index] = (closes[index] - previous) * multiplier + previous
  }

  return output
}

export function computeRSI(bars: OHLCVBar[], period: number): (number | null)[] {
  const output: (number | null)[] = new Array(bars.length).fill(null)
  if (period <= 0 || bars.length <= period) return output

  let gainSum = 0
  let lossSum = 0

  for (let index = 1; index <= period; index += 1) {
    const change = bars[index].close - bars[index - 1].close
    gainSum += Math.max(change, 0)
    lossSum += Math.max(-change, 0)
  }

  let averageGain = gainSum / period
  let averageLoss = lossSum / period

  const toRsi = (gain: number, loss: number): number => {
    if (gain === 0 && loss === 0) return 50
    if (loss === 0) return 100
    const relativeStrength = gain / loss
    return 100 - 100 / (1 + relativeStrength)
  }

  output[period] = toRsi(averageGain, averageLoss)

  for (let index = period + 1; index < bars.length; index += 1) {
    const change = bars[index].close - bars[index - 1].close
    const gain = Math.max(change, 0)
    const loss = Math.max(-change, 0)

    averageGain = (averageGain * (period - 1) + gain) / period
    averageLoss = (averageLoss * (period - 1) + loss) / period
    output[index] = toRsi(averageGain, averageLoss)
  }

  return output
}

export function computeMACD(
  bars: OHLCVBar[]
): { line: number | null; signal: number | null; histogram: number | null }[] {
  const ema12 = computeEMA(bars, 12)
  const ema26 = computeEMA(bars, 26)
  const line = bars.map((_, index) => {
    const fast = ema12[index]
    const slow = ema26[index]
    return fast !== null && slow !== null ? fast - slow : null
  })

  const signal: (number | null)[] = new Array(bars.length).fill(null)
  const validIndexes = line
    .map((value, index) => ({ value, index }))
    .filter((entry): entry is { value: number; index: number } => entry.value !== null)

  if (validIndexes.length >= 9) {
    const seed = validIndexes.slice(0, 9).reduce((sum, entry) => sum + entry.value, 0) / 9
    signal[validIndexes[8].index] = seed
    const multiplier = 2 / (9 + 1)

    for (let index = 9; index < validIndexes.length; index += 1) {
      const previous = signal[validIndexes[index - 1].index]
      if (previous === null) continue
      signal[validIndexes[index].index] = (validIndexes[index].value - previous) * multiplier + previous
    }
  }

  return bars.map((_, index) => {
    const currentLine = line[index]
    const currentSignal = signal[index]

    return {
      line: currentLine,
      signal: currentSignal,
      histogram: currentLine !== null && currentSignal !== null ? currentLine - currentSignal : null
    }
  })
}

export function computeCMF(bars: OHLCVBar[], period: number): (number | null)[] {
  const output: (number | null)[] = new Array(bars.length).fill(null)
  if (period <= 0 || bars.length < period) return output

  const mfv = bars.map(bar => {
    const range = bar.high - bar.low
    if (range === 0) return 0
    const multiplier = ((bar.close - bar.low) - (bar.high - bar.close)) / range
    return multiplier * bar.volume
  })

  let mfvSum = 0
  let volumeSum = 0

  for (let index = 0; index < bars.length; index += 1) {
    mfvSum += mfv[index]
    volumeSum += bars[index].volume

    if (index >= period) {
      mfvSum -= mfv[index - period]
      volumeSum -= bars[index - period].volume
    }

    if (index >= period - 1 && volumeSum !== 0) {
      output[index] = mfvSum / volumeSum
    }
  }

  return output
}

export function computeOBV(bars: OHLCVBar[]): number[] {
  if (bars.length === 0) return []

  const output: number[] = [0]

  for (let index = 1; index < bars.length; index += 1) {
    const previous = output[index - 1]

    if (bars[index].close > bars[index - 1].close) {
      output.push(previous + bars[index].volume)
    } else if (bars[index].close < bars[index - 1].close) {
      output.push(previous - bars[index].volume)
    } else {
      output.push(previous)
    }
  }

  return output
}

export function computeRVOL(bars: OHLCVBar[], period: number): (number | null)[] {
  const output: (number | null)[] = new Array(bars.length).fill(null)
  if (period <= 0 || bars.length <= period) return output

  let windowSum = bars.slice(0, period).reduce((sum, bar) => sum + bar.volume, 0)

  for (let index = period; index < bars.length; index += 1) {
    const baseline = windowSum / period
    output[index] = baseline === 0 ? null : bars[index].volume / baseline
    windowSum += bars[index].volume - bars[index - period].volume
  }

  return output
}

export function computeCLV(bars: OHLCVBar[]): number[] {
  return bars.map(bar => {
    const range = bar.high - bar.low
    if (range === 0) return 0.5
    return (bar.close - bar.low) / range
  })
}

export function computeATR(bars: OHLCVBar[], period: number): (number | null)[] {
  const output: (number | null)[] = new Array(bars.length).fill(null)
  if (period <= 0 || bars.length < period) return output

  const trueRanges = bars.map((bar, index) => {
    if (index === 0) return bar.high - bar.low

    const previousClose = bars[index - 1].close
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - previousClose),
      Math.abs(bar.low - previousClose)
    )
  })

  let atr = trueRanges.slice(0, period).reduce((sum, value) => sum + value, 0) / period
  output[period - 1] = atr

  for (let index = period; index < trueRanges.length; index += 1) {
    atr = (atr * (period - 1) + trueRanges[index]) / period
    output[index] = atr
  }

  return output
}

export function computeEMASlope(ema: (number | null)[], lookback: number): (number | null)[] {
  const output: (number | null)[] = new Array(ema.length).fill(null)
  if (lookback <= 0) return output

  for (let index = lookback; index < ema.length; index += 1) {
    const current = ema[index]
    const previous = ema[index - lookback]

    if (current === null || previous === null || previous === 0) continue

    output[index] = (current - previous) / previous
  }

  return output
}
