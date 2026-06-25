# ZONE MAP — repo 分區快速參考

> **建立：** 2026-06-25 · **版本：** 1.0
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
| `capital/` | 新 worker（待建）|
| `wrangler.capital.toml` | 新 worker config（待建）|
| `src/capital-web/` | 新前端（待建）|
| `schema/capital-r1-core.sql` | capital-db schema（待建）|
| `src/engine/riskEngine.ts` | 風險骨幹，純函數零 ML（待建）|
| `src/engine/exitEngine.ts` | EOD 出場引擎（待建）|
| `.github/workflows/capital-daily.yml` | EOD 評估夜更（待建）|

**Capital worker 資訊（待建後填入）：**
- Worker name: `capital`
- D1 讀（唯讀）: `trading-etf-db`（signals / regime）
- D1 寫: 新 `capital-db`（positions / cash / risk state）

---

## 當前 Phase

**P0 ✅ 完成（2026-06-25）**
- baseline tag、REVAMP_PLAN.md、文件全更新、signalpilot un-live

**下一步 = P1 — 風險核心**
→ `schema/capital-r1-core.sql` + `src/engine/riskEngine.ts` + 單元測試
→ 見 [REVAMP_PLAN.md §4](planning/REVAMP_PLAN.md)

---

## 不可做清單（任何 AI 都要遵守）

- ❌ 不得改動 `snapshot.yml` 或停用 `trading-etf` worker
- ❌ 不得部署 `signalpilot`（UN-LIVE 狀態）
- ❌ 不得用 v1 holdout 數字選 ML threshold 然後宣稱 PASS
- ❌ 不得把 ML 輸出接進 capital app 的裁決路徑（研究訊號源只可「提議」）
- ❌ 不得在 SHARED LIBRARY 裡建 capital-specific 邏輯（放 `capital/` 裡）
