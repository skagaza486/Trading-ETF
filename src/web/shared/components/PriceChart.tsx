import { useEffect, useRef } from 'react'
import { createChart, ColorType, type IChartApi, type ISeriesApi, type CandlestickData, type Time, type HistogramData } from 'lightweight-charts'
import type { OHLCVBar } from '../../../types/indicator'
import styles from './PriceChart.module.css'

type Props = {
  bars: OHLCVBar[]
  height?: number
  showVolume?: boolean
}

export function PriceChart({ bars, height = 280, showVolume = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volRef = useRef<ISeriesApi<'Histogram'> | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current

    const chart = createChart(el, {
      width: el.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#96b4a7',
        fontFamily: 'IBM Plex Sans, system-ui, sans-serif',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: {
        vertLine: { color: 'rgba(39,227,141,0.3)', labelBackgroundColor: '#27e38d' },
        horzLine: { color: 'rgba(39,227,141,0.3)', labelBackgroundColor: '#27e38d' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        scaleMargins: showVolume ? { top: 0.05, bottom: 0.2 } : { top: 0.05, bottom: 0.05 },
      },
      timeScale: { borderColor: 'rgba(255,255,255,0.06)', timeVisible: true },
      handleScroll: true,
      handleScale: true,
    })

    const candle = chart.addCandlestickSeries({
      upColor:   '#38f19d',
      downColor: '#ff7b7b',
      borderUpColor:   '#38f19d',
      borderDownColor: '#ff7b7b',
      wickUpColor:   '#38f19d',
      wickDownColor: '#ff7b7b',
    })

    let vol: ISeriesApi<'Histogram'> | null = null
    if (showVolume) {
      vol = chart.addHistogramSeries({
        color: 'rgba(39,227,141,0.25)',
        priceFormat: { type: 'volume' },
        priceScaleId: 'vol',
      })
      chart.priceScale('vol').applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
      })
    }

    chartRef.current = chart
    candleRef.current = candle
    volRef.current = vol

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth })
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      candleRef.current = null
      volRef.current = null
    }
  }, [height, showVolume])

  useEffect(() => {
    if (!candleRef.current || !bars.length) return

    const candleData: CandlestickData<Time>[] = bars.map(b => ({
      time: b.date as Time,
      open: b.open,
      high: b.high,
      low:  b.low,
      close: b.close,
    }))
    candleRef.current.setData(candleData)

    if (volRef.current) {
      const volData: HistogramData<Time>[] = bars.map(b => ({
        time: b.date as Time,
        value: b.volume,
        color: b.close >= b.open ? 'rgba(56,241,157,0.3)' : 'rgba(255,123,123,0.3)',
      }))
      volRef.current.setData(volData)
    }

    chartRef.current?.timeScale().fitContent()
  }, [bars])

  return <div ref={containerRef} className={styles.chart} style={{ height }} />
}
