# Global ETF Command Centre — Deployment Plan

## The Core Problem

The app works locally because the Vite dev server acts as a reverse proxy for Yahoo Finance.
In production, there is no Vite server. The browser cannot call Yahoo Finance directly due to CORS.

Two things must be solved:

1. **Yahoo Finance proxy**: replace Vite proxy with a production proxy
2. **Data persistence**: `localStorage` is device-local; decide whether cross-device sync is needed

---

## Decision: Single Device or Multi-Device?

| Scenario | What changes | Extra cost |
| --- | --- | --- |
| Single device only | Nothing; `localStorage` works fine when hosted | $0 |
| Multi-device (phone + laptop) | Must replace `localStorage` with a remote store | $0 with Cloudflare KV |

Choose one before building the production data layer.

---

## Recommended Stack: Cloudflare (Total cost: $0)

| Layer | Service | Free tier |
| --- | --- | --- |
| Frontend hosting | Cloudflare Pages | Unlimited bandwidth, unlimited sites |
| Yahoo Finance proxy | Cloudflare Workers | 100,000 requests/day |
| Cross-device storage (optional) | Cloudflare KV | 100,000 reads/day, 1,000 writes/day |
| DNS / HTTPS | Cloudflare (included) | Free |

All on one platform. One account. No credit card required for the free tier.

### Why not Vercel?

Vercel is simpler to set up and also $0, but:

- Vercel Edge Functions: 100,000 requests/month (vs Cloudflare's 100,000/day)
- For a weekly review tool with ~30 ETF tickers, Cloudflare's limit is more than enough
- Vercel is the fallback option if Cloudflare setup feels complex

---

## Architecture: Production vs Local

```
LOCAL (development)
  Browser
    → Vite dev server (/api/yahoo/*)
      → query1.finance.yahoo.com

PRODUCTION (Cloudflare)
  Browser
    → Cloudflare Pages (static React app)
      → /api/yahoo/* hits Cloudflare Worker
        → query1.finance.yahoo.com
```

The app code needs one change: replace the Vite proxy path with the Worker URL.
Use an environment variable so dev and prod use different proxy targets automatically.

```typescript
// src/services/marketData/config.ts
export const PRICE_PROXY_BASE =
  import.meta.env.VITE_PRICE_PROXY ?? '/api/yahoo'
```

In development: Vite proxy handles `/api/yahoo`.
In production: Cloudflare Worker handles `/api/yahoo` at the same path via Pages routing.

---

## Cloudflare Worker: Yahoo Finance Proxy

```typescript
// functions/api/yahoo/[[path]].ts  (Cloudflare Pages Function)
export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url)
  const yahooPath = url.pathname.replace('/api/yahoo', '')
  const yahooUrl = `https://query1.finance.yahoo.com${yahooPath}${url.search}`

  const response = await fetch(yahooUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  })

  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600'
    }
  })
}
```

This is a **Cloudflare Pages Function** (not a standalone Worker), so it deploys alongside the frontend automatically. No separate Worker dashboard needed.

---

## Option A: Single-Device Deployment (Simplest)

Keep `localStorage`. Host on Cloudflare Pages. Add the Pages Function proxy above.

```
Cost:     $0
Setup:    ~30 minutes
Data:     Stays in the browser you use
Tradeoff: No sync between devices
```

Steps:

1. Push code to GitHub
2. Connect repo to Cloudflare Pages
3. Set build command: `npm run build`
4. Set output directory: `dist`
5. Add `functions/api/yahoo/[[path]].ts` (the proxy above)
6. Deploy — done

---

## Option B: Multi-Device Deployment (Recommended)

Replace `localStorage` with Cloudflare KV for journal and holdings. Keep `localStorage` as a fast local cache that syncs to KV on save.

```
Cost:     $0 (KV free tier is enough for personal use)
Setup:    ~2 hours
Data:     Synced across all devices
Tradeoff: Slightly more code; KV has eventual consistency (fine for weekly use)
```

### What goes in KV vs localStorage

| Data | Storage | Reason |
| --- | --- | --- |
| Holdings (ticker, shares, cost) | KV | Changes per trade, needs to sync |
| Journal entries | KV | Decision history must survive device change |
| Last reviewed date | KV | Needs to sync |
| Price cache | localStorage only | Device-local cache; re-fetch on each device |
| FX rate override | KV | User preference, should sync |
| Selected preset | KV | User preference, should sync |

### KV key schema

```
etf:holdings          → JSON array of Holding
etf:journal           → JSON array of JournalEntry
etf:settings          → JSON object (preset, fxOverride, startValue, etc.)
etf:lastReviewed      → ISO date string
```

### Sync pattern

```typescript
// On app load: fetch from KV, populate local state
// On save: write to KV + update localStorage cache
// On page focus: check KV version timestamp; re-fetch if stale

async function loadHoldings(): Promise<Holding[]> {
  const remote = await kv.get('etf:holdings', 'json')
  if (remote) {
    localStorage.setItem('etf:holdings:cache', JSON.stringify(remote))
    return remote
  }
  // fallback to localStorage cache if KV unreachable
  const cached = localStorage.getItem('etf:holdings:cache')
  return cached ? JSON.parse(cached) : []
}
```

---

## Authentication (Optional but Recommended for Multi-Device)

KV is public by default if accessed from the client. For a personal tool, two options:

**Option 1: Shared secret in URL (simplest)**
Add a token to the Worker that must match an environment variable:

```typescript
// functions/api/data/[[path]].ts
const TOKEN = context.env.APP_TOKEN
if (context.request.headers.get('X-App-Token') !== TOKEN) {
  return new Response('Unauthorized', { status: 401 })
}
```

Set `APP_TOKEN` as a Cloudflare Pages environment variable (never committed to git).
The frontend reads `import.meta.env.VITE_APP_TOKEN` and sends it in headers.

**Option 2: Cloudflare Access (zero-config auth)**
Enable Cloudflare Access on the Pages domain. Protect it with a one-time email PIN or Google login. Free for up to 50 users. No code changes needed.

---

## File Changes Required vs Local Version

| File | Change |
| --- | --- |
| `vite.config.ts` | Keep Vite proxy for dev; no change needed |
| `src/services/marketData/config.ts` | Add `VITE_PRICE_PROXY` env var |
| `functions/api/yahoo/[[path]].ts` | New file — Cloudflare Pages Function proxy |
| `functions/api/data/[[path]].ts` | New file — KV read/write proxy (Option B only) |
| `src/utils/localStorage.ts` | Add KV sync layer (Option B only) |

---

## Cost Summary

| Item | Option A | Option B |
| --- | --- | --- |
| Cloudflare Pages hosting | $0 | $0 |
| Yahoo Finance proxy (Worker) | $0 | $0 |
| Cross-device data (KV) | — | $0 |
| Custom domain (optional) | $10–12/year | $10–12/year |
| Everything else | $0 | $0 |

Running cost without a custom domain: **$0/month forever** on the free tier.

---

## Deployment Phases

### Deploy Phase 1: Static hosting + proxy (do this first)

1. Add `functions/api/yahoo/[[path]].ts`
2. Add `VITE_PRICE_PROXY` env var pattern
3. Push to GitHub, connect Cloudflare Pages
4. Verify price fetch works in production
5. Verify `localStorage` journal and holdings persist on the same browser

### Deploy Phase 2: Cross-device sync (do this if needed)

1. Create KV namespace in Cloudflare dashboard
2. Add `functions/api/data/[[path]].ts` with auth token
3. Replace `localStorage` writes with KV sync in `src/utils/localStorage.ts`
4. Set `APP_TOKEN` as Pages environment secret
5. Test: edit holdings on phone, refresh on laptop, verify sync

---

## Fallback Option: Vercel

If Cloudflare setup feels complex, Vercel works with minimal configuration.

```
vercel.json:
{
  "rewrites": [
    { "source": "/api/yahoo/(.*)", "destination": "/api/yahoo/[...path].ts" }
  ]
}

api/yahoo/[...path].ts:  (same proxy logic as above, Vercel syntax)
```

Free tier limit is 100k Edge Function invocations/month. For personal use (~30 tickers, weekly refresh), this is approximately 30 × 4 refreshes/week × 52 weeks = ~6,240 calls/year. Well within the free tier.

---

## Disclaimer

Yahoo Finance data is retrieved via an unofficial API endpoint. This endpoint has no documented rate limits or availability guarantees. If Yahoo Finance changes their API structure, the price fetch will fail and the app will fall back to cached prices with a stale warning. This does not affect the Signal Engine logic, only the freshness of market data.
