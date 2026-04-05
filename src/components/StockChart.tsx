'use client'
import { useEffect, useRef, useState } from 'react'
import {
  createChart,
  CrosshairMode,
  IChartApi,
  CandlestickSeries,
  HistogramSeries,
  Time,
} from 'lightweight-charts'

interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}
interface Props {
  symbol: string
  resolution: string
}

export default function StockChart({ symbol, resolution }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ReturnType<IChartApi['addSeries']> | null>(null)
  const volRef = useRef<ReturnType<IChartApi['addSeries']> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<{
    o: number
    h: number
    l: number
    c: number
    v: number
  } | null>(null)

  // ── Create chart once on mount ───────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || chartRef.current) return

    const chart = createChart(containerRef.current, {
      layout: { background: { color: '#080f14' }, textColor: '#c8e6f0' },
      grid: {
        vertLines: { color: '#0e2a35' },
        horzLines: { color: '#0e2a35' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#0e2a35' },
      timeScale: {
        borderColor: '#0e2a35',
        timeVisible: true,
        secondsVisible: false,
      },
      width: containerRef.current.clientWidth,
      height: 380,
    })
    chartRef.current = chart

    // v5 API: addSeries(SeriesType, options)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#00e676',
      downColor: '#ff1744',
      borderUpColor: '#00e676',
      borderDownColor: '#ff1744',
      wickUpColor: '#00e676',
      wickDownColor: '#ff1744',
    })
    candleRef.current = candleSeries

    const volSeries = chart.addSeries(HistogramSeries, {
      color: 'rgba(0,255,231,0.3)',
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    })
    // scaleMargins moved to priceScale in v5
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } })
    volRef.current = volSeries

    chart.subscribeCrosshairMove((param: any) => {
      if (!param?.seriesData) return
      const d = param.seriesData.get(candleSeries)
      const v = param.seriesData.get(volSeries)
      if (d)
        setInfo({
          o: d.open,
          h: d.high,
          l: d.low,
          c: d.close,
          v: v?.value ?? 0,
        })
    })

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth })
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      candleRef.current = null
      volRef.current = null
    }
  }, [])

  // ── Fetch candles whenever symbol or resolution changes ──────────────────
  useEffect(() => {
    if (!candleRef.current) return
    setLoading(true)
    setError(null)

    const days =
      resolution === 'D'
        ? 365
        : ['60', '120', '240'].includes(resolution)
          ? 30
          : ['15', '30'].includes(resolution)
            ? 7
            : 2

    fetch(
      `/api/fyers/history?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&days=${days}`
    )
      .then(r => r.json())
      .then(json => {
        if (json.error) {
          setError(json.error)
          return
        }
        const seen = new Set<number>()
        const candles: Candle[] = (json.candles || [])
          .sort((a: Candle, b: Candle) => a.time - b.time)
          .filter((c: Candle) => {
            if (seen.has(c.time)) return false
            seen.add(c.time)
            return true
          })
        if (!candles.length) {
          setError('No candle data returned')
          return
        }

        candleRef.current!.setData(
          candles.map(c => ({
            time: c.time as Time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }))
        )
        volRef.current?.setData(
          candles.map(c => ({
            time: c.time as Time,
            value: c.volume,
            color: c.close >= c.open ? 'rgba(0,230,118,0.4)' : 'rgba(255,23,68,0.4)',
          }))
        )
        chartRef.current?.timeScale().fitContent()
        const last = candles[candles.length - 1]
        if (last)
          setInfo({
            o: last.open,
            h: last.high,
            l: last.low,
            c: last.close,
            v: last.volume,
          })
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [symbol, resolution])

  const fmt = (n: number) =>
    n.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  const fv = (n: number) =>
    n >= 1e7
      ? (n / 1e7).toFixed(1) + 'Cr'
      : n >= 1e5
        ? (n / 1e5).toFixed(1) + 'L'
        : n >= 1e3
          ? (n / 1e3).toFixed(1) + 'K'
          : String(n)

  return (
    <div className="chart-wrap">
      {info && (
        <div className="chart-ohlcv">
          <span>
            O <b style={{ color: '#c8e6f0' }}>₹{fmt(info.o)}</b>
          </span>
          <span>
            H <b style={{ color: 'var(--green)' }}>₹{fmt(info.h)}</b>
          </span>
          <span>
            L <b style={{ color: 'var(--red)' }}>₹{fmt(info.l)}</b>
          </span>
          <span>
            C{' '}
            <b
              style={{
                color: info.c >= info.o ? 'var(--green)' : 'var(--red)',
              }}
            >
              ₹{fmt(info.c)}
            </b>
          </span>
          <span>
            V <b style={{ color: 'var(--accent)' }}>{fv(info.v)}</b>
          </span>
        </div>
      )}
      {loading && (
        <div className="chart-loading">
          <div className="spinner" /> Loading candles…
        </div>
      )}
      {error && <div className="chart-error">⚠ {error}</div>}
      <div ref={containerRef} style={{ width: '100%' }} />
    </div>
  )
}
