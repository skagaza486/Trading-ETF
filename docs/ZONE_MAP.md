# ZONE MAP — repo 分區快速參考

> **建立：** 2026-06-25 · **版本：** 1.1（更新：2026-06-25）
> **任何 AI 進場前先讀此文件。** 細節、phase 次序、DoD 見 [`docs/planning/REVAMP_PLAN.md`](planning/REVAMP_PLAN.md)。

---

## 一句話方向

保留所有現狀，在同一 repo 起新 app **Capital Manager**（兩個產品：ETF 自動配置 + 股票買賣策略，共用風險骨幹）。

---

## 四態分區

### 🟢 LIVE-KEEP（數據脊樑，必須留 live）

| 物件 | 說明 |
|---|---|
| `worker.ts` + `src/worker/` | `trading-etf` worker — D1 ingest 端點 |
| `.github/workflows/snapshot.yml` | 夜更 21:30 UTC Mon–Fri，寫 signals/regime 入 D1 |
| `scripts/build-snapshot.ts` | snapshot 管線入口 |
| `trading-etf-db`（D1）· `SNAPSHOT_KV` | 新 app 唯讀讀取的數據來源 |

> ⚠️ 這些東西**不可 undeploy / 停用**。新 app 的 signal、regime、screener 候選全部來自此 D1。

---

### 🔵 UN-LIVE（停運，code/D1 留 repo）

| 物件 | 狀態 |
|---|---|
| `signalpilot/` worker | **已 undeploy**（2026-06-25）|
| `wrangler.signalpilot.toml` | 留 repo，不部署 |
| `.github/workflows/signalpilot-daily.yml` | **已改 dispatch-only**（無自動觸發）|
| `signalpilot-db`（D1 id: `095a9cf7`）| 留 Cloudflare，不刪 |
| `SP_CONTROL_KV`（id: `feedaa9c`）| 留 Cloudflare，不刪 |
| `src/web/`（舊 trading-etf UI）| 隨 trading-etf worker 留 live，**凍結不改** |

**復活路徑：**
```bash
git checkout baseline/pre-revamp -- signalpilot/ wrangler.signalpilot.toml
npm run sp:deploy
```

---

### 📦 ARCHIVE（純 code，本來唔 live）

| 物件 | 說明 |
|---|---|
| `scripts/ml/` | ML 訓練/推理腳本（LightGBM pipeline）|
| `models/` | 訓練產物、promotion records、EXPERIMENT_LOG |
| `GATE_EDGE.md` / `GATE_EDGE_v2.md` | edge 驗證預登記（v1 ITERATE p=0.085；v2 待 2026-08+）|
| `SIGNALPILOT_AI_TRADING_PLAN.md` | SP 設計文件 |
| `data/holdout_freeze_v1.json` | v1 holdout（n=75，已用，不可重用）|

**ML 復活門檻（寫死）：** 樣本 ≥1,500 **且** 新 holdout OOF AUC ≥0.60 **且** precision@take ≥ always-take +5pp。在那之前不碰。

---

### ♻️ SHARED LIBRARY（新 app 唯讀重用）

| 物件 | 說明 |
|---|---|
| `src/engine/signalClassifier.ts` | LONG_BREAK / VCP / BOUNCE 訊號分類 |
| `src/engine/marketRegime.ts` | regime 分類（RISK_ON / NEUTRAL / RISK_OFF）|
| `src/engine/stockScreenerEngine.ts` | 選股漏斗（酌情啟發法，非回測 edge）|
| `src/engine/indicatorEngine.ts` | 技術指標計算 |
| `src/types/` | 共用 TypeScript 類型 |
| `src/web/features/portfolio/portfolioConfig.ts` | ETF_REFERENCE / 風險限制 % of capital |

> 改動這些檔案會同時影響 LIVE-KEEP 的舊 app — 謹慎處理。

---

### 🚀 ACTIVE — 新 app「Capital Manager」（全新建設）

| 物件 | 狀態 |
|---|---|
| `capital/` | ✅ **已建**（P4）— worker.ts + lib/auth.ts + env.d.ts + worker-configuration.d.ts |
| `wrangler.capital.toml` | ✅ **已建**（P4）— capital-db + TRADING_ETF_DB_RO（唯讀）|
| `src/capital-web/` | ✅ **已建** — App + BottomNav + MarketContextView + EtfView + StocksView |
| `schema/capital-r1-core.sql` | ✅ **已建**（P1）— positions / cash_ledger / realized_pnl / risk_state / trade_log |
| `src/types/capital.ts` | ✅ **已建**（P1）— Position, RiskState, GateResult, ExitSignal, RuleViolation 等 |
| `src/engine/riskEngine.ts` | ✅ **已建**（P1）— checkEntryGate, checkExitRules, recordTradeResult, isPaused, cashFloorForRegime |
| `src/engine/exitEngine.ts` | ✅ **已建**（P3）— runEodExit（batch EOD：止損 + 板塊超限）|
| `src/engine/sizingEngine.ts` | ✅ **已建**（P3）— computePositionSize（單股/板塊/現金底三重限制）|
| `.github/workflows/capital-daily.yml` | ✅ **已建**（P3）— 22:00 UTC Mon–Fri stub；worker live 後取消注釋啟用 |

**Capital worker 資訊（P4 建立後填入）：**
- Worker name: `capital`
- D1 讀（唯讀）: `trading-etf-db`（signals / regime）
- D1 寫: 新 `capital-db`（positions / cash / risk state）

**測試覆蓋：** 4 個測試檔，82 個測試，全部通過（P1–P3 引擎）

---

## 當前 Phase

**P0 ✅ 完成（2026-06-25）** — baseline tag、REVAMP_PLAN.md、文件全更新、signalpilot un-live

**P1 ✅ 完成（2026-06-25）** — `schema/capital-r1-core.sql` · `riskEngine.ts` · `src/types/capital.ts` · 38 tests

**P2 ✅ 完成（2026-06-25）** — `EtfView.tsx`（ETF 配置、sleeve 分組、drift band 再平衡卡、regime 現金底）

**P3 ✅ 完成（2026-06-25）** — `exitEngine.ts` · `sizingEngine.ts` · `StocksView.tsx` · `capital-daily.yml` · 82 tests

**P4 ✅ 完成（2026-06-25）** — capital worker · wrangler.capital.toml · useCapitalApi.ts · StocksView 接線 · capital-daily.yml 啟用

**P5 🚧 進行中（2026-06-25）— 上線爬升**

已完成：
- risk_state 清除測試數據（last_3_results 重置為 []）
- `schema/capital-p5-paper-trades.sql` — paper_trades 表建立並 migrate 到 capital-db
- `src/capital-web/features/paper-wall/PaperWallView.tsx` — Paper 牆 tracker（週分組、通過條件即時計算）
- capital worker 新增 4 個 paper-trades 端點
- 底部導航新增「Paper 牆」第四個 tab
- TypeScript zero errors · 兩個 worker 均已 redeploy

待完成：
→ ETF 動真錢：進入 ETF 配置 tab，輸入現有持倉，確認再平衡行動
→ 股票策略：每週 ≥3 個 paper 候選，連續 4 週 → 通過條件 → Futu 真錢
→ 設定 GitHub Secret `CAPITAL_AUTH_TOKEN` → `capital-daily.yml` EOD 評估自動啟動
→ 見 [REVAMP_PLAN.md §4,§6](planning/REVAMP_PLAN.md)

---

## 不可做清單（任何 AI 都要遵守）

- ❌ 不得改動 `snapshot.yml` 或停用 `trading-etf` worker
- ❌ 不得部署 `signalpilot`（UN-LIVE 狀態）
- ❌ 不得用 v1 holdout 數字選 ML threshold 然後宣稱 PASS
- ❌ 不得把 ML 輸出接進 capital app 的裁決路徑（研究訊號源只可「提議」）
- ❌ 不得在 SHARED LIBRARY 裡建 capital-specific 邏輯（放 `capital/` 裡）
