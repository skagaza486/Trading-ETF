/**
 * signal-winrate.mjs
 * Fetches 2yr daily OHLCV from Yahoo Finance, runs the full signal engine,
 * and prints win rates (5D + 10D) for each label across all watchlist stocks.
 * Run: node scripts/signal-winrate.mjs
 */

const WATCHLIST = [
  'AAPL','MSFT','NVDA','AMZN','META','GOOGL','TSLA','AVGO','NFLX','AMD',
  'PLTR','JPM','GS','XOM','CVX','LLY','UNH','COST','WMT','BA'
]
const BENCHMARKS = ['SPY', 'QQQ', 'IWM', '^VIX']
const MAX_SIGNAL_BARS = 180

// ── Fetch ──────────────────────────────────────────────────────────────────
async function fetchHistory(ticker) {
  const bases = ['https://query1.finance.yahoo.com','https://query2.finance.yahoo.com']
  const path = `/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=2y`
  const headers = { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }
  for (const base of bases) {
    try {
      const res = await fetch(`${base}${path}`, { headers })
      if (!res.ok) continue
      const json = await res.json()
      const result = json.chart?.result?.[0]
      if (!result) continue
      const timestamps = result.timestamp ?? []
      const quote = result.indicators.quote?.[0]
      const bars = timestamps.flatMap((ts, i) => {
        const close = quote?.close?.[i]
        if (typeof close !== 'number' || !Number.isFinite(close)) return []
        const open  = quote?.open?.[i]
        const high  = quote?.high?.[i]
        const low   = quote?.low?.[i]
        const vol   = quote?.volume?.[i]
        return [{ date: new Date(ts*1000).toISOString().slice(0,10),
          open:  (typeof open  === 'number' && isFinite(open))  ? open  : close,
          high:  (typeof high  === 'number' && isFinite(high))  ? high  : close,
          low:   (typeof low   === 'number' && isFinite(low))   ? low   : close,
          close,
          volume:(typeof vol   === 'number' && isFinite(vol))   ? vol   : 0 }]
      })
      return { ticker, bars }
    } catch { /* try next */ }
  }
  return null
}

// ── Indicators ────────────────────────────────────────────────────────────
function computeEMA(bars, period) {
  const out = new Array(bars.length).fill(null)
  if (period <= 0 || bars.length < period) return out
  const k = 2 / (period + 1)
  let seed = 0
  for (let i = 0; i < period; i++) seed += bars[i].close
  out[period-1] = seed / period
  for (let i = period; i < bars.length; i++)
    out[i] = (bars[i].close - out[i-1]) * k + out[i-1]
  return out
}
function computeRSI(bars, period) {
  const out = new Array(bars.length).fill(null)
  if (bars.length <= period) return out
  let g = 0, l = 0
  for (let i = 1; i <= period; i++) {
    const d = bars[i].close - bars[i-1].close
    g += Math.max(d,0); l += Math.max(-d,0)
  }
  let ag = g/period, al = l/period
  const rsi = (ag,al) => al===0 ? 100 : 100 - 100/(1+ag/al)
  out[period] = rsi(ag,al)
  for (let i = period+1; i < bars.length; i++) {
    const d = bars[i].close - bars[i-1].close
    ag = (ag*(period-1)+Math.max(d,0))/period
    al = (al*(period-1)+Math.max(-d,0))/period
    out[i] = rsi(ag,al)
  }
  return out
}
function computeMACD(bars) {
  const ema12 = computeEMA(bars,12), ema26 = computeEMA(bars,26)
  const line = bars.map((_,i) => ema12[i]!==null&&ema26[i]!==null ? ema12[i]-ema26[i] : null)
  const sig = new Array(bars.length).fill(null)
  const valid = line.map((v,i)=>({v,i})).filter(x=>x.v!==null)
  if (valid.length >= 9) {
    const k = 2/10
    let s = valid.slice(0,9).reduce((a,x)=>a+x.v,0)/9
    sig[valid[8].i] = s
    for (let j=9; j<valid.length; j++) {
      s = (valid[j].v - s)*k + s
      sig[valid[j].i] = s
    }
  }
  return bars.map((_,i) => ({
    histogram: line[i]!==null&&sig[i]!==null ? line[i]-sig[i] : null
  }))
}
function computeCMF(bars, period) {
  const out = new Array(bars.length).fill(null)
  const mfv = bars.map(b => { const r=b.high-b.low; return r===0?0:((b.close-b.low)-(b.high-b.close))/r*b.volume })
  let ms=0, vs=0
  for (let i=0; i<bars.length; i++) {
    ms+=mfv[i]; vs+=bars[i].volume
    if (i>=period) { ms-=mfv[i-period]; vs-=bars[i-period].volume }
    if (i>=period-1 && vs!==0) out[i]=ms/vs
  }
  return out
}
function computeOBV(bars) {
  const out=[0]
  for (let i=1; i<bars.length; i++)
    out.push(bars[i].close>bars[i-1].close ? out[i-1]+bars[i].volume
           : bars[i].close<bars[i-1].close ? out[i-1]-bars[i].volume : out[i-1])
  return out
}
function computeRVOL(bars, period) {
  const out = new Array(bars.length).fill(null)
  if (bars.length <= period) return out
  let s = bars.slice(0,period).reduce((a,b)=>a+b.volume,0)
  for (let i=period; i<bars.length; i++) {
    const base = s/period
    out[i] = base===0 ? null : bars[i].volume/base
    s += bars[i].volume - bars[i-period].volume
  }
  return out
}
function computeCLV(bars) { return bars.map(b=>{ const r=b.high-b.low; return r===0?0.5:(b.close-b.low)/r }) }
function computeATR(bars, period) {
  const out = new Array(bars.length).fill(null)
  const tr = bars.map((b,i) => i===0 ? b.high-b.low : Math.max(b.high-b.low, Math.abs(b.high-bars[i-1].close), Math.abs(b.low-bars[i-1].close)))
  let atr = tr.slice(0,period).reduce((a,v)=>a+v,0)/period
  out[period-1] = atr
  for (let i=period; i<tr.length; i++) { atr=(atr*(period-1)+tr[i])/period; out[i]=atr }
  return out
}
function emaSlope(ema, lookback) {
  const out = new Array(ema.length).fill(null)
  for (let i=lookback; i<ema.length; i++)
    if (ema[i]!==null&&ema[i-lookback]!==null&&ema[i-lookback]!==0)
      out[i] = (ema[i]-ema[i-lookback])/ema[i-lookback]
  return out
}
function latestVal(arr) { for (let i=arr.length-1;i>=0;i--) if (arr[i]!==null) return arr[i]; return null }
function regressionSlope(vals) {
  if (vals.length<2) return null
  const xm=(vals.length-1)/2, ym=vals.reduce((a,v)=>a+v,0)/vals.length
  let num=0,den=0
  vals.forEach((v,i)=>{ const xd=i-xm; num+=xd*(v-ym); den+=xd*xd })
  return den===0?null:num/den
}
function pctChange(cur,prev) { if (!isFinite(cur)||!isFinite(prev)||prev===0) return null; return (cur-prev)/prev }

// ── Regime ────────────────────────────────────────────────────────────────
function classifyRegime(histories) {
  const spy = histories.SPY, qqq = histories.QQQ, vix = histories['^VIX']
  function aboveEma(h, p) {
    if (!h||h.bars.length<p) return null
    const ema=computeEMA(h.bars,p), e=latestVal(ema), c=h.bars.at(-1)?.close??null
    return e!==null&&c!==null ? c>=e : null
  }
  const spyOk=aboveEma(spy,50), qqqOk=aboveEma(qqq,50), vixLevel=vix?.bars.at(-1)?.close??null
  const bearish=[spyOk===false,qqqOk===false].filter(Boolean).length
  if ((vixLevel!==null&&vixLevel>28)||bearish>=2) return 'short_friendly'
  if (vixLevel!==null&&vixLevel<22&&spyOk===true&&qqqOk===true) return 'long_friendly'
  return 'neutral'
}

// ── Signal Classifier ─────────────────────────────────────────────────────
function resolveLabel(ind, regime, prevLabel, earningsWindow) {
  const req = [ind.ema20,ind.ema50,ind.ema20Slope,ind.rsi14,ind.macdHistogram,
               ind.rvol,ind.cmf20,ind.obvSlope,ind.clv,ind.relStrengthVsSpy,ind.atr]
  if (req.some(v=>v===null)) return 'REVIEW_DATA'
  if (earningsWindow) return 'REVIEW_EVENT'
  const {ema20,ema50,ema20Slope,rsi14,macdHistogram,rvol,cmf20,obvSlope,clv,relStrengthVsSpy,close,breakout20d,breakdown20d,aboveEma200,nearHigh52w} = ind
  const choppy = rsi14>=45&&rsi14<=55&&rvol<0.8&&Math.abs(ema20Slope)<0.001&&breakout20d!==true&&breakdown20d!==true
  if (choppy) return 'AVOID_CHOP'
  const lWatch = rsi14>50&&macdHistogram>0&&cmf20>0&&obvSlope>0&&regime!=='short_friendly'
  const lSetup = close>ema20&&ema20Slope>0&&rsi14>55&&rvol>1.2&&cmf20>0&&regime!=='short_friendly'&&aboveEma200!==false
  const lConfirm = breakout20d===true&&rvol>1.8&&cmf20>0.1&&clv>0.65&&ema20>ema50&&rsi14>55&&regime!=='short_friendly'&&aboveEma200!==false&&nearHigh52w!==false
  // HYP-009: require prior bar in ladder (prevents single-day impulse breakouts)
  if (lConfirm) {
    const priorLong=prevLabel==='LONG_WATCH'||prevLabel==='LONG_SETUP'||prevLabel==='LONG_CONFIRM'||prevLabel==='UP_PROMOTION'
    if (priorLong) return prevLabel==='LONG_SETUP'?'UP_PROMOTION':'LONG_CONFIRM'
  }
  if (lSetup) return 'LONG_SETUP'
  if (lWatch) return 'LONG_WATCH'
  const sWatch = close<ema20&&rsi14<50&&relStrengthVsSpy<0&&macdHistogram<0&&regime!=='long_friendly'
  const sSetup = close<ema20&&ema20Slope<0&&rsi14<45&&rvol>1.5&&cmf20<0&&regime!=='long_friendly'
  const sConfirm = breakdown20d===true&&rvol>1.5&&cmf20<-0.05&&clv<0.35&&ema20<ema50&&rsi14<45&&regime!=='long_friendly'
  // HYP-009: require prior bar in short ladder
  if (sConfirm) {
    const priorShort=prevLabel==='SHORT_WATCH'||prevLabel==='SHORT_SETUP'||prevLabel==='SHORT_CONFIRM'||prevLabel==='DOWN_PROMOTION'
    if (priorShort) return prevLabel==='SHORT_SETUP'?'DOWN_PROMOTION':'SHORT_CONFIRM'
  }
  if (sSetup) return 'SHORT_SETUP'
  if (sWatch) return 'SHORT_WATCH'
  return 'NEUTRAL'
}

function buildSnapshot(bars, benchmarks) {
  const ema20=computeEMA(bars,20), ema50=computeEMA(bars,50), ema200=computeEMA(bars,200)
  const ema20s=emaSlope(ema20,5), rsi=computeRSI(bars,14), macd=computeMACD(bars)
  const rvol=computeRVOL(bars,20), cmf=computeCMF(bars,20), clv=computeCLV(bars), atr=computeATR(bars,14)
  const obv=computeOBV(bars), obvSlp=regressionSlope(obv.slice(-10))
  const close=bars.at(-1)?.close??0
  const latEma200=latestVal(ema200)
  // 20d breakout/breakdown — ATR-normalized margin (0.5×ATR14)
  const atrVal=latestVal(atr)
  let breakout20d=null, breakdown20d=null
  if (bars.length>=21) {
    const cur=bars.at(-1), ph=Math.max(...bars.slice(-21,-1).map(b=>b.high)), pl=Math.min(...bars.slice(-21,-1).map(b=>b.low))
    const brkMargin=atrVal!==null?atrVal*0.5:ph*0.003
    const brkdwnMargin=atrVal!==null?atrVal*0.5:0
    breakout20d=cur?cur.close>ph+brkMargin:null
    breakdown20d=cur?cur.close<pl-brkdwnMargin:null
  }
  // RS vs SPY
  let relStrengthVsSpy=null
  const spy=benchmarks.SPY
  if (spy&&bars.length>20&&spy.bars.length>20) {
    const sr=pctChange(bars.at(-1)?.close??NaN, bars.at(-21)?.close??NaN)
    const spyr=pctChange(spy.bars.at(-1)?.close??NaN, spy.bars.at(-21)?.close??NaN)
    if (sr!==null&&spyr!==null) relStrengthVsSpy=sr-spyr
  }
  // 52w high
  const high52w=bars.length>0?Math.max(...bars.slice(-Math.min(252,bars.length)).map(b=>b.high)):null
  return {
    close, ema20:latestVal(ema20), ema50:latestVal(ema50), ema200:latEma200,
    ema20Slope:latestVal(ema20s), rsi14:latestVal(rsi), macdHistogram:macd.at(-1)?.histogram??null,
    rvol:latestVal(rvol), cmf20:latestVal(cmf), obvSlope:obvSlp, clv:clv.at(-1)??null,
    breakout20d, breakdown20d, relStrengthVsSpy, atr:latestVal(atr),
    aboveEma200:latEma200!==null?close>=latEma200:null,
    nearHigh52w:high52w!==null?close>=high52w*0.75:null
  }
}

function sliceThrough(bars, date) { return bars.filter(b=>b.date<=date) }

function buildSignals(histories, tickers) {
  const signals=[]
  for (const ticker of tickers) {
    const h=histories[ticker]
    if (!h||h.bars.length<70) continue
    const usableEnd=h.bars.length-10
    const start=Math.max(60, usableEnd-MAX_SIGNAL_BARS)
    let prevLabel=null
    for (let idx=start; idx<usableEnd; idx++) {
      const date=h.bars[idx]?.date; if(!date) continue
      const sliced={}
      for (const [t,hist] of Object.entries(histories)) sliced[t]={...hist,bars:sliceThrough(hist.bars,date)}
      const b=sliced[ticker]?.bars??[]
      if (b.length<60) continue
      const regime=classifyRegime(sliced)
      const ind=buildSnapshot(b, sliced)
      const label=resolveLabel(ind, regime, prevLabel, false)
      if (label!=='REVIEW_DATA') { signals.push({ticker,signalDate:date,label,regime}); }
      prevLabel=label
    }
  }
  return signals
}

function buildRecords(signals, histories) {
  const spy=histories.SPY
  return signals.flatMap(sig => {
    const h=histories[sig.ticker]
    if (!h) return []
    const idx=h.bars.findIndex(b=>b.date===sig.signalDate)
    if (idx===-1) return []
    const closeAtSignal=h.bars[idx]?.close??0
    const nextBar=h.bars[idx+1]
    const entry=nextBar?.open??closeAtSignal
    const ret=(days)=>{ const c=h.bars[idx+days]?.close??NaN; return pctChange(c,entry) }
    let spyEntry=null
    if (spy) { const si=spy.bars.findIndex(b=>b.date===sig.signalDate); if(si!==-1){ spyEntry=spy.bars[si+1]?.open??spy.bars[si]?.close } }
    const spyRet=(days)=>{ if(!spy||spyEntry===null) return null; const c=spy.bars[spy.bars.findIndex(b=>b.date===sig.signalDate)+days]?.close??NaN; return pctChange(c,spyEntry) }
    return [{ label:sig.label, regime:sig.regime, ticker:sig.ticker,
      ret5d:ret(5), ret10d:ret(10), ret5dVsSpy:ret(5)!==null&&spyRet(5)!==null?ret(5)-spyRet(5):null }]
  })
}

// ── Analysis ──────────────────────────────────────────────────────────────
const LONG_LABELS  = new Set(['LONG_WATCH','LONG_SETUP','LONG_CONFIRM','UP_PROMOTION'])
const SHORT_LABELS = new Set(['SHORT_WATCH','SHORT_SETUP','SHORT_CONFIRM','DOWN_PROMOTION'])
const ALL_LABELS   = ['UP_PROMOTION','LONG_CONFIRM','LONG_SETUP','LONG_WATCH','NEUTRAL','AVOID_CHOP',
                       'SHORT_WATCH','SHORT_SETUP','SHORT_CONFIRM','DOWN_PROMOTION','REVIEW_EVENT']

function avg(vals) { return vals.length===0?null:vals.reduce((a,v)=>a+v,0)/vals.length }

function analyzeLabel(records, label) {
  const recs=records.filter(r=>r.label===label)
  const isLong=LONG_LABELS.has(label), isShort=SHORT_LABELS.has(label)
  const with5d=recs.filter(r=>r.ret5d!==null), with10d=recs.filter(r=>r.ret10d!==null)
  const correct5d = isLong ? with5d.filter(r=>r.ret5d>0) : isShort ? with5d.filter(r=>r.ret5d<0) : []
  const correct10d = isLong ? with10d.filter(r=>r.ret10d>0) : isShort ? with10d.filter(r=>r.ret10d<0) : []
  return {
    n: recs.length,
    winRate5d:  with5d.length>0  ? (correct5d.length/with5d.length*100).toFixed(1)+'%' : 'n/a',
    winRate10d: with10d.length>0 ? (correct10d.length/with10d.length*100).toFixed(1)+'%' : 'n/a',
    avg5d:  avg(with5d.map(r=>r.ret5d))  !== null ? (avg(with5d.map(r=>r.ret5d))*100).toFixed(2)+'%'  : 'n/a',
    avg10d: avg(with10d.map(r=>r.ret10d)) !== null ? (avg(with10d.map(r=>r.ret10d))*100).toFixed(2)+'%' : 'n/a',
    avgVsSpy5d: avg(with5d.filter(r=>r.ret5dVsSpy!==null).map(r=>r.ret5dVsSpy)) !== null
      ? (avg(with5d.filter(r=>r.ret5dVsSpy!==null).map(r=>r.ret5dVsSpy))*100).toFixed(2)+'%' : 'n/a'
  }
}

// ── Main ──────────────────────────────────────────────────────────────────
const all = [...new Set([...WATCHLIST, ...BENCHMARKS])]
console.log(`\nFetching ${all.length} tickers from Yahoo Finance...`)
const results = await Promise.allSettled(all.map(t=>fetchHistory(t).then(h=>[t,h])))
const histories = {}
for (const r of results) {
  if (r.status==='fulfilled'&&r.value[1]) histories[r.value[0]]=r.value[1]
  else if (r.status==='fulfilled') console.warn(`  ✗ ${r.value[0]} — no data`)
  else console.warn(`  ✗ failed`)
}
console.log(`  Loaded ${Object.keys(histories).length} tickers\n`)

console.log('Building signals...')
const signals = buildSignals(histories, WATCHLIST)
console.log(`  ${signals.length} signals generated\n`)

const records = buildRecords(signals, histories)
console.log(`  ${records.length} forward-return records\n`)

// Per-label table
console.log('═'.repeat(90))
console.log(` LABEL              │   n   │ 5D WinRate │ 10D WinRate │ Avg 5D  │ Avg 10D │ vs SPY 5D`)
console.log('─'.repeat(90))
for (const label of ALL_LABELS) {
  const s=analyzeLabel(records, label)
  const isDir = LONG_LABELS.has(label)||SHORT_LABELS.has(label)
  const g1 = s.n>=100 ? '✓' : '✗'
  console.log(` ${label.padEnd(18)}│ ${String(s.n).padStart(5)} │ ${s.winRate5d.padStart(10)} │ ${s.winRate10d.padStart(11)} │ ${s.avg5d.padStart(7)} │ ${s.avg10d.padStart(7)} │ ${s.avgVsSpy5d}${isDir?' G1'+g1:''}`)
}
console.log('═'.repeat(90))

// Per-regime breakdown for LONG labels
console.log('\n── LONG signals by regime ──')
for (const label of ['LONG_CONFIRM','LONG_SETUP','UP_PROMOTION']) {
  for (const regime of ['long_friendly','neutral','short_friendly']) {
    const r=records.filter(x=>x.label===label&&x.regime===regime)
    const w=r.filter(x=>x.ret5d!==null&&x.ret5d>0)
    console.log(`  ${label} | ${regime} | n=${r.length} | 5D win=${r.length>0?(w.length/r.filter(x=>x.ret5d!==null).length*100).toFixed(0)+'%':'n/a'}`)
  }
}

console.log('\nDone.')
