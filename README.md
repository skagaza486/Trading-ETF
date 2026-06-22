# Trading ETF

研究階段的 ETF 與股票 signal app。核心方向是 `real-data-first`、`explainable rule-based signals`、以及「研究驗證先於 UI 承諾」。

## Setup

```bash
# node/npm 不在系統 PATH — 使用 repo 內附帶的 binary：
alias node='.tools/node-v22.22.3-darwin-arm64/bin/node'

cp .env.local.example .env.local   # 填入 FINNHUB_API_KEY（可選，只影響 earnings 資料）
node node_modules/.bin/vite         # dev server at localhost:5173
```

**注意：** `FINNHUB_API_KEY` 不填則 earnings 欄位為空，其他功能正常。`.env.local` 不應 commit 至 git（已列入 `.gitignore`）。KV/D1 路由（`/api/snapshot/latest`、`/api/d1/signals`）只在 production Worker 生效，dev 環境無法測試這些路由。

## Repo Map

根目錄保留三份主文檔：

- `ROADMAP.md` — 產品與研究優先級，作為目前階段的規劃主入口。
- `SIGNAL_IMPROVEMENT.md` — signal 研究、gate 驗證、假設與實驗紀錄的唯一主文件。
- `TECHNICAL_OVERVIEW.md` — 現行系統架構、資料流、engine 分工與執行方式。

輔助文檔集中於 `docs/`：

- `docs/ui/UI_DESIGN.md` — UI 1.0 設計說明與結構原則。
- `docs/ui/UI_1_1_VISUAL_PLAN.md` — UI 1.1 視覺升級方案與資產系統規劃。
- `docs/ui/UI_1_1_300_STOCK_UX_ADDENDUM.md` — 299-stock universe 下的 Stocks / Verify UX 補充方案（UI-A / UI-B 規格）。
- `docs/ui/UI_COPY_KEYS.md` — UI 文案 key 與中英命名對照。
- `docs/ui/UI_QA_FLOW.md` — 人手 QA screening 流程（每次 UI 改動後參考）。
- `docs/ui/FUTU_NAV_REFERENCE.md` — 富途 app 的資訊架構參考，偏結構與導航。
- `docs/ui/HEADLESS_UI_SMOKE_TEST_PLAN.md` — Playwright 煙霧測試規劃稿。

主要程式碼：

- `src/` — React UI、純計算 engine、型別、樣式與資料定義。
- `src/worker/cronSnapshot.ts` — 每日 snapshot 邏輯：fetch 299 stocks，分類，寫 KV + D1（production 由 GitHub Actions 跑，非 Worker cron）。
- `schema/` — D1 schema 及 migration SQL。
- `scripts/` — 研究 agent、同步工具等離線工具。
- `tests/ui/` — Playwright UI smoke tests（layout / navigation / Quant Lab）。
- `worker.ts` — Cloudflare Worker 入口：API routes + static assets（含一個已停用、不會觸發的 `scheduled()` handler）。

## Common Commands

```bash
# node/npm 不在系統 PATH — 先設 alias：
alias node='.tools/node-v22.22.3-darwin-arm64/bin/node'
alias vite='node node_modules/.bin/vite'
alias wrangler='node node_modules/.bin/wrangler'
alias tsc='node node_modules/.bin/tsc'

# 開發
vite                                        # Vite dev server（含 Yahoo/Finnhub proxy）
tsc --noEmit                                # TypeScript type check（zero errors required）
vite build                                  # Production build → dist/

# 部署（必須先 build）
vite build && wrangler deploy               # Build + deploy to trading-etf worker

# D1 查詢
wrangler d1 execute trading-etf-db --remote --command "SELECT COUNT(*) FROM signals"

# UI QA（Playwright smoke tests）
node node_modules/.bin/playwright test      # headless，CI 用
```

## Gate Data Source

自 B2 完成（2026-06-19）起，gate 數字的**主要來源是 D1**（由每日 GitHub Actions pipeline 更新）。瀏覽器的 Verify tab 直接從 `/api/d1/signals` 讀取 `ForwardReturnRecord[]`，不再做 client-side replay。

離線 research agent (`scripts/researchAgent.ts`) 仍可用於本地實驗，但 production gate 以 D1 為準。

## UI QA

UI 改動後的驗證分兩層：

1. **Playwright smoke tests**（`npm run ui:qa`）：自動化，驗證 layout 安全、tab 切換、Quant Lab 基本流程。CI 用 headless，debug 用 `ui:qa:headed`。
2. **人手 QA 流程**（`docs/ui/UI_QA_FLOW.md`）：涵蓋視覺細節、ETF ranking 顯示、signal card 內容等 Playwright 無法機械驗證的部分。每次 UI 大改後應對照執行。

## Deployment

```bash
# 必須 build + deploy 一起執行，不能只跑 wrangler deploy：
vite build && wrangler deploy
```

- Target worker: `trading-etf`（有 hyphen）。舊 worker `tradingetf`（無 hyphen）不要 deploy。
- `wrangler.toml` 在根目錄，KV binding: `SNAPSHOT_KV`，D1 binding: `trading_etf_db`。無 cron trigger — 每日 snapshot 由 GitHub Actions（`.github/workflows/snapshot.yml`，21:30 UTC Mon–Fri）跑。

## Working Rules

- 研究與產品方向先看 `ROADMAP.md`
- signal / gate 問題先看 `SIGNAL_IMPROVEMENT.md`
- 架構與資料流先看 `TECHNICAL_OVERVIEW.md`
- UI 命名與結構先看 `docs/ui/`
- Production gate 數字從 Verify tab（D1）讀取；local 實驗用 `scripts/researchAgent.ts`
- UI 改動後對照 `docs/ui/UI_QA_FLOW.md` 驗證視覺細節
- 若文檔與實作不一致，以當前 code 為準，再回寫文檔
- **Deploy 必須先 build：** `vite build && wrangler deploy`（見 `CLAUDE.md`）
