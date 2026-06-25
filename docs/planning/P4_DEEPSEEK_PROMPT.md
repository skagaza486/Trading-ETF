# DeepSeek P4 建設 Prompt

> 複製以下全文貼入 DeepSeek。

---

## 任務概要

你是接手一個進行中 TypeScript monorepo 的工程師。前幾個 Phase（P1–P3）已由 Claude 完成並測試通過。你的任務是完成 **P4 — Capital Worker + capital-db + 前端接線**。

**環境：** Windows PC · Node v24（系統 PATH）· Cloudflare Workers + D1 + Wrangler。

---

## Repo 現況（你進場前的狀態）

### 已完成（P1–P3）

| 檔案 | 說明 |
|---|---|
| `schema/capital-r1-core.sql` | capital-db schema（5 張表：positions/cash_ledger/realized_pnl/risk_state/trade_log）|
| `src/types/capital.ts` | TypeScript 類型（Position, RiskState, GateResult, ExitSignal, RuleViolation 等）|
| `src/engine/riskEngine.ts` | 純函數：checkEntryGate / checkExitRules / recordTradeResult / isPaused / cashFloorForRegime |
| `src/engine/exitEngine.ts` | 純函數：runEodExit（批次 EOD：硬止損/移動止損/板塊超限）→ ExitCard[] |
| `src/engine/sizingEngine.ts` | 純函數：computePositionSize（單股10%/板塊25%/現金底三重限制）→ SizingResult |
| `src/capital-web/features/stocks/StocksView.tsx` | 完整股票 UI（**目前用 localStorage**）|
| `src/capital-web/features/etf/EtfView.tsx` | 完整 ETF UI（**目前用 localStorage**）|
| `.github/workflows/capital-daily.yml` | EOD workflow stub（待你啟用 curl 步驟）|

### 現有 Workers（對照參考）

已有兩個 Worker 作為模式參考：
- `trading-etf`（主 app）：`wrangler.toml` + `worker.ts`
- `signalpilot`（已 undeploy 但 code 留 repo）：`wrangler.signalpilot.toml` + `signalpilot/worker.ts`

**你要新建第三個 Worker `capital`，鏡像 signalpilot 的結構。**

---

## 現有代碼（你需要了解的關鍵部分）

### `wrangler.signalpilot.toml`（你要仿照的模式）

```toml
name = "signalpilot"
compatibility_date = "2025-01-01"
main = "signalpilot/worker.ts"

[observability]
enabled = true

[[kv_namespaces]]
binding = "SP_CONTROL_KV"
id = "feedaa9ce2864b66a85334f2835534a2"

[[d1_databases]]
binding = "SIGNALPILOT_DB"
database_name = "signalpilot-db"
database_id = "095a9cf7-b05e-4e3d-9150-7cb480485d23"

[[d1_databases]]
binding = "TRADING_ETF_DB_RO"
database_name = "trading-etf-db"
database_id = "7a5b3490-d69f-457d-9f3a-64c7b9139a62"
# Secrets (set via wrangler secret put --config wrangler.signalpilot.toml):
#   SP_AUTH_TOKEN
```

### `src/types/capital.ts`（關鍵類型）

```typescript
import type { RegimeClass } from './market'  // RegimeClass = 'long_friendly' | 'neutral' | 'short_friendly'

export type TradeResult = 'win' | 'loss'
export type Sleeve = 'etf' | 'stock'

export type Position = {
  id: number
  ticker: string
  qty: number
  avgCostCents: number      // integer cents per share
  peakPriceCents: number    // highest close since entry, per share
  sleeve: Sleeve
  sector: string
  openedAt: string          // ISO date YYYY-MM-DD
  earningsDate?: string
}

export type RiskState = {
  capitalBaseCents: number
  currency: 'USD'
  regime: RegimeClass
  pauseUntil: string | null
  last3Results: TradeResult[]
}

export type EntryProposal = {
  ticker: string
  proposedCostCents: number
  proposedQty: number
  sector: string
  sleeve: Sleeve
  earningsWithin7d: boolean
}

export type RuleViolation = {
  rule: string
  description: string
  detail: string
}

export type GateResult = {
  approved: boolean
  violations: RuleViolation[]
}

export type ExitSignal = {
  shouldExit: boolean
  violations: RuleViolation[]
}
```

### `schema/capital-r1-core.sql`（D1 schema，已寫好）

```sql
-- All monetary columns are INTEGER cents. Never use REAL for money.

CREATE TABLE IF NOT EXISTS positions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker           TEXT    NOT NULL,
  qty              INTEGER NOT NULL CHECK (qty > 0),
  avg_cost_cents   INTEGER NOT NULL CHECK (avg_cost_cents > 0),
  peak_price_cents INTEGER NOT NULL CHECK (peak_price_cents > 0),
  sleeve           TEXT    NOT NULL CHECK (sleeve IN ('etf', 'stock')),
  sector           TEXT    NOT NULL,
  opened_at        TEXT    NOT NULL,
  earnings_date    TEXT,
  UNIQUE (ticker, sleeve)
);

CREATE TABLE IF NOT EXISTS cash_ledger (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  type         TEXT    NOT NULL CHECK (type IN ('buy', 'sell', 'dividend', 'deposit', 'withdrawal')),
  ticker       TEXT,
  amount_cents INTEGER NOT NULL,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  memo         TEXT
);

CREATE TABLE IF NOT EXISTS realized_pnl (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker     TEXT    NOT NULL,
  pnl_cents  INTEGER NOT NULL,
  closed_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS risk_state (
  id                  INTEGER PRIMARY KEY CHECK (id = 1),
  capital_base_cents  INTEGER NOT NULL,
  currency            TEXT    NOT NULL DEFAULT 'USD',
  regime              TEXT    NOT NULL CHECK (regime IN ('long_friendly', 'neutral', 'short_friendly')),
  pause_until         TEXT,
  last_3_results      TEXT    NOT NULL DEFAULT '[]'
);

-- Seeded with one row; always UPDATE, never INSERT additional rows
INSERT OR IGNORE INTO risk_state (id, capital_base_cents, currency, regime, pause_until, last_3_results)
VALUES (1, 0, 'USD', 'neutral', NULL, '[]');

CREATE TABLE IF NOT EXISTS trade_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  action         TEXT    NOT NULL CHECK (action IN ('entry', 'exit', 'rebalance', 'pause')),
  ticker         TEXT,
  sleeve         TEXT    CHECK (sleeve IN ('etf', 'stock', NULL)),
  approved       INTEGER NOT NULL CHECK (approved IN (0, 1)),
  rule_triggers  TEXT    NOT NULL DEFAULT '[]',
  detail         TEXT,
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
```

### `src/engine/riskEngine.ts`（引擎 API，你不用改這個檔案）

```typescript
export function checkEntryGate(
  proposal: EntryProposal,
  positions: Position[],
  riskState: RiskState,
  todayIso: string,
): GateResult

export function checkExitRules(
  position: Position,
  currentPriceCents: number,
): ExitSignal

export function recordTradeResult(
  riskState: RiskState,
  result: TradeResult,
  todayIso: string,
): RiskState

export function isPaused(riskState: RiskState, todayIso: string): boolean
export function cashFloorForRegime(regime: RegimeClass): number
```

### `src/engine/exitEngine.ts`（引擎 API，你不用改這個檔案）

```typescript
export type ExitCard = {
  ticker: string
  positionId: number
  action: 'SELL' | 'REDUCE'
  qtyToClose: number
  currentPriceCents: number
  ruleDescription: string
  ruleDetail: string
  pnlCents: number
  returnPct: number
}
export type PeakUpdate = { positionId: number; newPeakCents: number }
export type SectorRow = { sector: string; totalValueCents: number; pct: number }
export type EodResult = { exitCards: ExitCard[]; peakUpdates: PeakUpdate[]; sectors: SectorRow[] }

export function runEodExit(
  positions: Position[],
  priceMap: Record<string, number>,  // ticker → current price in cents
  capitalBaseCents: number,
): EodResult
```

### 前端目前的 localStorage 結構（`StocksView.tsx`）

```typescript
// StocksView.tsx 現在從 localStorage 讀寫
const POSITIONS_KEY = 'capital-stock-positions'  // Position[]
const STATE_KEY     = 'capital-stock-state'       // { capitalBaseCents, pauseUntil, last3Results }

// EtfView.tsx 現在從 localStorage 讀寫
const STORAGE_KEY = 'capital-etf-holdings'  // Partial<Record<EtfTicker, string>> (dollar strings)
```

### `.github/workflows/capital-daily.yml`（stub，待啟用）

```yaml
# 目前的 stub：
- name: EOD exit evaluation (stub — worker not yet provisioned)
  run: echo "stub mode."

# 待啟用（取消注釋）：
# - name: Run EOD evaluation
#   env:
#     CAPITAL_AUTH_TOKEN: ${{ secrets.CAPITAL_AUTH_TOKEN }}
#   run: |
#     curl -fsSL -X POST \
#       -H "Authorization: Bearer $CAPITAL_AUTH_TOKEN" \
#       -H "Content-Type: application/json" \
#       https://capital.skagaza486.workers.dev/api/capital/eod-eval
```

---

## 你的任務（P4）

### 步驟 0 — 人工操作（你無法執行，需提示用戶）

在開始寫代碼之前，告訴用戶執行：

```bash
# Windows
node_modules/.bin/wrangler d1 create capital-db
```

這會輸出一個 `database_id`（UUID 格式）。用戶需要把它填入你寫的 `wrangler.capital.toml`。在你的 toml 裡先用佔位符 `"REPLACE_WITH_CAPITAL_DB_ID"`，並在顯眼位置加注釋提示。

### 步驟 1 — `wrangler.capital.toml`

仿照 `wrangler.signalpilot.toml` 模式，建立：

```toml
name = "capital"
compatibility_date = "2025-01-01"
main = "capital/worker.ts"

[observability]
enabled = true

# Write side: positions / cash / risk state
[[d1_databases]]
binding = "CAPITAL_DB"
database_name = "capital-db"
database_id = "REPLACE_WITH_CAPITAL_DB_ID"  # <-- 運行 `wrangler d1 create capital-db` 取得

# Read-only: signals / regime (code discipline — never write to this binding)
[[d1_databases]]
binding = "TRADING_ETF_DB_RO"
database_name = "trading-etf-db"
database_id = "7a5b3490-d69f-457d-9f3a-64c7b9139a62"

# Secret (set via: wrangler secret put CAPITAL_AUTH_TOKEN --config wrangler.capital.toml)
# NEVER hardcode the token. It must be constant-time compared and never logged.
```

### 步驟 2 — `capital/env.d.ts`（Worker 類型）

```typescript
interface Env {
  CAPITAL_DB:          D1Database
  TRADING_ETF_DB_RO:   D1Database
  CAPITAL_AUTH_TOKEN:  string       // bearer token secret
}
```

### 步驟 3 — `capital/lib/auth.ts`

實作 Bearer token 驗證。必須 **constant-time compare**（防止 timing attack），**永不 log token**：

```typescript
// constant-time string compare — never use === for secrets
export function verifyToken(request: Request, env: Env): boolean

// Helper: return 401 if token invalid
export function requireAuth(request: Request, env: Env): Response | null
// Returns null if authenticated, Response(401) if not
```

用 `crypto.subtle.timingSafeEqual` 或等效方法。

### 步驟 4 — `capital/worker.ts`（API 端點）

實作以下端點，**全部需要 Bearer token 驗證**（除 `/health`）：

#### `GET /health`（公開，無需 auth）
```json
{ "service": "capital", "status": "ok" }
```

#### `GET /api/capital/risk-state`
從 `risk_state` 表（id=1 那一行）讀取，返回：
```json
{
  "capitalBaseCents": 6400000,
  "currency": "USD",
  "regime": "long_friendly",
  "pauseUntil": null,
  "last3Results": ["win", "loss"]
}
```
注意：`last_3_results` 在 D1 存為 JSON 字串，需 `JSON.parse`。

#### `PATCH /api/capital/risk-state`
更新 `capital_base_cents` 和/或 `regime`（其他欄位如 `pause_until` / `last_3_results` 由其他端點管理）。
Body: `{ capitalBaseCents?: number, regime?: string }`

#### `GET /api/capital/positions?sleeve=stock|etf`
從 `positions` 表讀取，可按 sleeve 過濾。返回：
```json
{
  "positions": [
    {
      "id": 1,
      "ticker": "AAPL",
      "qty": 100,
      "avgCostCents": 18500,
      "peakPriceCents": 20000,
      "sleeve": "stock",
      "sector": "Technology",
      "openedAt": "2026-06-01",
      "earningsDate": null
    }
  ],
  "count": 1
}
```
把 D1 snake_case 欄位（`avg_cost_cents` 等）轉換為 camelCase 返回。

#### `POST /api/capital/positions`
新增持倉。Body:
```json
{
  "ticker": "AAPL",
  "qty": 100,
  "avgCostCents": 18500,
  "sleeve": "stock",
  "sector": "Technology",
  "openedAt": "2026-06-25",
  "earningsDate": null
}
```
`peakPriceCents` 初始值 = `avgCostCents`（用戶不傳，由 worker 填入）。
寫入 `cash_ledger`（type='buy', amount_cents = 負數的 qty×avgCostCents）。
返回插入後的完整 position（含 id）。

#### `PATCH /api/capital/positions/:id`
更新 `peak_price_cents`（EOD 峰值更新用）或 `qty`（減倉用）。
Body: `{ peakPriceCents?: number, qty?: number }`
只允許更新這兩個欄位，其他欄位忽略。

#### `DELETE /api/capital/positions/:id`
關閉持倉（全倉賣出）。
需要 body: `{ currentPriceCents: number, result: 'win' | 'loss' }`
執行：
1. 計算 pnl_cents = (currentPriceCents - avgCostCents) × qty
2. INSERT into `realized_pnl`
3. INSERT into `cash_ledger`（type='sell', amount_cents = 正數的 qty×currentPriceCents）
4. DELETE from `positions`
5. 呼叫 `recordTradeResult()`（pure function import from `../src/engine/riskEngine`）更新 risk_state，然後 UPDATE `risk_state`
6. 返回 `{ pnlCents, result, newRiskState }`

#### `POST /api/capital/eod-eval`
核心 EOD 評估端點（由 `capital-daily.yml` 呼叫）。
Body: `{ priceMap: Record<string, number> }` — ticker → 當前收市價（cents）
執行：
1. 讀取 `positions`（所有 sleeve=stock 的持倉）
2. 讀取 `risk_state`（取 `capital_base_cents`）
3. 呼叫 `runEodExit(positions, priceMap, capitalBaseCents)` — pure function，import 自 `../src/engine/exitEngine`
4. 對每個 `peakUpdate`：執行 `PATCH positions SET peak_price_cents=? WHERE id=?`
5. 把 `exitCards` 寫入 `trade_log`（action='exit', approved=1, rule_triggers=JSON array of rule names）
6. 返回完整 `EodResult`（exitCards + peakUpdates + sectors）

注意：**此端點不自動平倉**。它只產出 exitCards 供人工審閱，peak 更新是 EOD 自動執行的唯一寫入。

#### `POST /api/capital/record-result`
記錄一筆交易結果（win/loss），更新三連敗狀態。
Body: `{ result: 'win' | 'loss' }`
執行：
1. 讀取 `risk_state`
2. 呼叫 `recordTradeResult(riskState, result, today)` — pure function
3. UPDATE `risk_state` SET `last_3_results=?`, `pause_until=?`
4. 返回新的 `riskState`

#### `GET /api/capital/cash-ledger?limit=50`
返回最近 N 筆現金流水。

### 步驟 5 — 更新 `.github/workflows/capital-daily.yml`

取消注釋 curl 步驟，讓夜更能真正呼叫 EOD 端點：

```yaml
- name: Run EOD evaluation
  env:
    CAPITAL_AUTH_TOKEN: ${{ secrets.CAPITAL_AUTH_TOKEN }}
  run: |
    curl -fsSL -X POST \
      -H "Authorization: Bearer $CAPITAL_AUTH_TOKEN" \
      -H "Content-Type: application/json" \
      --data '{}' \
      https://capital.skagaza486.workers.dev/api/capital/eod-eval
```

注意：`priceMap` 為空 `{}` 表示 EOD 只做 peak 更新、不觸發止損（因為沒有收市價）。**真實使用時**，GH Actions 可以先從 D1 讀昨日的 `close` 價格，或由用戶在 UI 手動觸發並傳入 priceMap。現在先傳空 `{}`，讓 workflow 能跑通即可。

### 步驟 6 — 前端接線（StocksView.tsx + EtfView.tsx）

建立一個共用的 API hook：`src/capital-web/shared/hooks/useCapitalApi.ts`

```typescript
// API base URL（production）
const API_BASE = 'https://capital.skagaza486.workers.dev'

// Token 從 sessionStorage 讀（用戶登入時存入）
// Key: 'capital-auth-token'

export function useCapitalApi() {
  // Returns functions:
  // fetchPositions(sleeve?: 'stock' | 'etf'): Promise<Position[]>
  // fetchRiskState(): Promise<RiskState>
  // addPosition(data): Promise<Position>
  // closePosition(id, currentPriceCents, result): Promise<{pnlCents, newRiskState}>
  // updatePeak(id, newPeakCents): Promise<void>
  // runEodEval(priceMap): Promise<EodResult>
  // recordResult(result): Promise<RiskState>
  // patchRiskState(data): Promise<RiskState>
}
```

**認証 UI**：在 App.tsx 或 BottomNav 加一個簡單的 token 輸入（`<input type="password">`），用戶填入後存入 `sessionStorage['capital-auth-token']`。如果 token 未設定，顯示「請輸入 Capital API Token」提示。不需要複雜的 auth flow，一個 input + button 即可。

**更新 StocksView.tsx**：
- 把 `loadPositions()` / `savePositions()` 替換為 `useCapitalApi().fetchPositions('stock')`
- 把 `loadSaved()` / `saveSaved()` 替換為 `fetchRiskState()` + `patchRiskState()`
- 加入 `addPosition` 呼叫（替換 localStorage push）
- 加入 `closePosition` 呼叫
- `runEodEval` 呼叫替換本地的 `runEodExit`
- 保留 `useSnapshot()` 讀取 regime（這不變）
- 加入 loading state + error state（API 呼叫可能失敗）

**更新 EtfView.tsx**：
- ETF holdings 目前只存 dollar string inputs，不是真正的持倉。
- **EtfView 暫時保留 localStorage**（ETF sleeve 的 positions API 已建好，但 UI 遷移較複雜，P4 先讓 stocks 接線，ETF 在 P5 再做）。
- 只需要從 `fetchRiskState()` 讀取 `capitalBaseCents` 和 `regime`（替換掉 ETF 側的 hardcoded 資本基數），其餘維持 localStorage。

---

## 安全規則（必須嚴格遵守）

1. **CAPITAL_AUTH_TOKEN 永不 hardcode、永不 log、永不出現在任何 response body。**
2. `TRADING_ETF_DB_RO` binding：只允許 SELECT，**絕不** INSERT/UPDATE/DELETE。
3. 所有金額用 integer cents，禁止 float（`REAL` 類型）。
4. `risk_state` 表只有一行（id=1），只 UPDATE，不 INSERT。
5. `cash_ledger` 和 `trade_log` 是 append-only，不刪不改。
6. constant-time token compare，用 `crypto.subtle.timingSafeEqual`。

---

## 完成定義（DoD）

全部以下條件達到，P4 才算完成：

- [ ] `wrangler.capital.toml` 建好（database_id 佔位符已標記）
- [ ] `capital/worker.ts` 包含全部 8 個端點
- [ ] `capital/lib/auth.ts` constant-time token compare
- [ ] `capital/env.d.ts` Env 類型
- [ ] `.github/workflows/capital-daily.yml` curl 步驟已取消注釋
- [ ] `src/capital-web/shared/hooks/useCapitalApi.ts` 建好
- [ ] `StocksView.tsx` 從 localStorage 遷移到 API（含 loading/error state）
- [ ] `EtfView.tsx` 只把 `capitalBaseCents` + `regime` 改為從 API 讀取，其餘維持 localStorage
- [ ] `node_modules/.bin/tsc --noEmit` 零 TypeScript errors

---

## TypeScript 驗證命令（每次修改後跑）

```bash
# Windows
node_modules/.bin/tsc --noEmit
```

---

## 部署順序（供用戶參考，不是你的任務，但要在你的說明裡列出）

1. `node_modules/.bin/wrangler d1 create capital-db` → 取得 database_id
2. 填入 `wrangler.capital.toml`
3. `node_modules/.bin/wrangler d1 execute capital-db --remote --file=schema/capital-r1-core.sql`（建表）
4. `node_modules/.bin/wrangler secret put CAPITAL_AUTH_TOKEN --config wrangler.capital.toml`（設 token）
5. `node_modules/.bin/vite build && node_modules/.bin/wrangler deploy --config wrangler.capital.toml`
6. 在 GitHub repo settings 加入 `CAPITAL_AUTH_TOKEN` secret（供 capital-daily.yml 使用）

---

## 額外注意

- `capital/worker.ts` 的 import 路徑：引擎在 `../src/engine/`，類型在 `../src/types/`。確認 `tsconfig` 能解析這些路徑（參考 signalpilot 的 tsconfig 結構，如果有的話，否則在 `wrangler.capital.toml` 加 `[build]` 或確認根 tsconfig 包含 `capital/` 目錄）。
- 前端 `useCapitalApi` hook 的 API_BASE 在 production 是 `https://capital.skagaza486.workers.dev`，在 local dev 可以是 `http://localhost:8788`（wrangler dev port）。用 `import.meta.env.VITE_CAPITAL_API_URL ?? 'https://capital.skagaza486.workers.dev'` 讓它可配置。
- `StocksView.tsx` 的 EOD 評估之前是在前端用 pure function 跑（`runEodExit`）。遷移後改為 `POST /api/capital/eod-eval`，priceMap 從用戶的 price inputs 取得。peak updates 由 worker 寫入 D1，前端收到 response 後重新 fetch positions。
