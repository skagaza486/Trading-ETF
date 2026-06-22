# `trading-etf` Web App — 開發交接指引（給 GPT）

> **狀態：** 2026-06-23 建立
> **對象：** 接手 `trading-etf` 現有 web app 後續開發的 AI agent（GPT）
> **範圍邊界：** 你負責 **`trading-etf` 現有 app**（UI + signal 引擎 + 資料管線）。你 **不** 負責 SignalPilot 交易/執行系統（那是獨立 Worker `signalpilot`，見 [`SIGNALPILOT_ROADMAP.md`](../SIGNALPILOT_ROADMAP.md)）。

---

## 0. 你最重要的一個跨線責任

SignalPilot 的 ML 階段被你 block。**請把 HYP-013 + HYP-015 當第一優先**（見下方工作隊列 P0）。在你交付前，SignalPilot SP-4 無法開始。

---

## 1. 執行環境（必讀，否則指令會失敗）

`node` / `npm` / `npx` **不在 PATH**。一律用 bundled binary：

```bash
NODE=.tools/node-v22.22.3-darwin-arm64/bin/node
$NODE node_modules/.bin/<tool>
```

**TypeScript 檢查（部署前必過、零錯誤）：**
```bash
.tools/node-v22.22.3-darwin-arm64/bin/node node_modules/.bin/tsc --noEmit
```

**Build + Deploy（永遠一起跑，絕不單獨 `wrangler deploy`）：**
```bash
.tools/node-v22.22.3-darwin-arm64/bin/node node_modules/.bin/vite build && \
.tools/node-v22.22.3-darwin-arm64/bin/node node_modules/.bin/wrangler deploy
```
Worker 把 `dist/` 當靜態資源；跳過 `vite build` 會部署到 stale 前端。

**Target worker：** `trading-etf`（有 hyphen）。舊 worker `tradingetf`（無 hyphen）**不要 deploy**（可考慮刪除）。

---

## 2. 架構約束（別違反）

- **Worker 無狀態、無 cron。** `wrangler.toml` 無 `[triggers]`；`worker.ts` 的 `scheduled()` handler 仍在但**永不觸發**。每日 snapshot 由 **GitHub Actions `.github/workflows/snapshot.yml`**（21:30 UTC Mon–Fri）跑。
- **單次 Worker invocation 只能抓 ~43 隻股**（Yahoo 限流 Worker egress IP，不是 subrequest 上限）。全宇宙（299 隻）一律靠 GH Actions，或 chunk（`runBackfillChunk`）。
- **資料讀寫路徑：**
  - Stocks tab → KV snapshot（`/api/snapshot/latest`），純 renderer，瀏覽器不抓 Yahoo。
  - Verify/Quant Lab → D1（`/api/d1/signals`），無 client-side replay。
  - 每日管線：GH Actions → `scripts/build-snapshot.ts` → `POST /api/admin/ingest-snapshot`（Bearer `INGEST_TOKEN`）→ KV put + `writeSignalsToD1` + settle forward returns。
- **signal 引擎與 UI 乾淨分離。** `src/ui/labelDisplay.ts` 是唯一 label→中文翻譯邊界。
- **D1 操作** 一律 `--remote` 對生產：
  ```bash
  .tools/node-v22.22.3-darwin-arm64/bin/node node_modules/.bin/wrangler d1 execute trading-etf-db --remote --command "SELECT ..."
  ```

---

## 3. 剩餘工作隊列（按優先序）

### P0 — 資料品質修復（block SignalPilot ML，最高優先）

**HYP-013 — D1 earnings contamination（已確認 bug）**
- 症狀：`cronSnapshot.ts:523` 呼叫 `buildHistoricalSignals(allHistories, tickers, 250)` **缺第 4 參數** `historicalEarningsMap`（`researchAgent.ts:478-482` 有正確傳）。結果 D1 全部 historical signal 的 `earnings_in_window` 永遠 `false`，~11% earnings-adjacent 訊號未標記，Gate Summary 有系統性樂觀偏差。
- 修復：① 建立 `earnings_calendar` D1 表；② 把歷史 earnings calendar 納入 GH Actions build 或 backfill；③ **重新 backfill 全歷史**（不只修往後——這是 data migration）。
- 驗收：D1 `earnings_in_window` 比例合理（~11%）；Gate Summary 數字下修並穩定。
- 細節見 `SIGNAL_IMPROVEMENT.md` HYP-013。

**HYP-015 — frozen universe snapshot（survivorship bias）**
- 現狀：研究 replay 只對「現在的」watchlist 回放 → survivorship bias。
- 修復：每月記錄 universe snapshot，按 `signalDate` 對應當時正確的 universe。
- 驗收：訓練資料能按歷史月份還原當時宇宙，不混入後來才加入的股票。

### P1 — 港股接入（HK stocks）
- `.HK` watchlist + 第二條 GH Actions cron（約 `30 8 * * 1-5` UTC，港股 16:00 HKT 收盤後）+ D1 `market` 維度。
- 解除 `Onboarding.tsx` 的港股鎖定（目前禁選 + 「即將推出」）。
- 注意：signal 引擎維持純 EOD，不為港股做盤中重算。

### P2 — 研究待驗證（有樣本/前提才動）
- **ADX HYP-022**：在非牛市或更長跨度重評估區分力（需更多樣本/非牛市 regime）。
- **R1 Breadth regime 升級**：把 `proxyWeakBreadth` 升為正式 regime enum（需 live observation 證明有用後）。
- **R2 ETF conditional routing**：不同 regime 走不同 scoring（R1 驗證後）。
- **R6 FRED 簡化濾網**：liquidity slope/warning 作 regime note。

### P3 — 長期延後（先別投入大量工程）
L1 FRED 完整流動性矩陣 / L2 SEC Form 4 / L3 Fundamentals overlay / L4 Options IV-HV / L5 Social sentiment / L6 Macro blackout calendar。理由見 `ROADMAP.md`「長期延後」。

---

## 4. 驗證方法

- **Signal 改動後**：跑 `scripts/signal-winrate.mjs`，比較 LONG_BOUNCE avg5D vs SPY 作主要品質指標。改 threshold 前**先確認 HYP-013 已修**，否則結果混入 earnings 偏差。
- **UI 改動後**：`npm run ui:qa`（Playwright smoke：navigation/layout/lab）+ 對照 `docs/ui/UI_QA_FLOW.md` 人手 QA。
- **部署前**：`tsc --noEmit` 零錯誤 → `vite build && wrangler deploy`。

---

## 5. Guardrails（ROADMAP「不建議做的事」）

- 不新增大量 regime enum（先用 flag/warning overlay 驗證）。
- 不把 ETF engine 改成完整多因子黑盒 scoring。
- 不把 `LONG_BASE_BREAK` 直接升成 UI 主推訊號。
- 不先做 options/social sentiment 才回頭補 research discipline。
- 不把多源資料全部放前端即時抓取。
- 不在 plateau/walk-forward 未建立前跳去 ML。
- **產品語氣：** 研究階段，Simple Mode 顯示「值得研究」而非「可考慮買入」;樣本 n<20 不顯示回報數字（最高 liability）。

---

## 6. 安全注意

- **不要把任何 secret 寫進 repo、前端 bundle、KV snapshot、日誌或 commit。** `INGEST_TOKEN` 是生產 secret，只放 Worker secrets store + GitHub repo Secrets（已於 2026-06-23 輪換過一次——舊值曾外洩；切勿再讓任何 secret 落入文字檔）。

---

## 7. 關鍵檔案與文件

| 檔案 | 用途 |
| --- | --- |
| `src/engine/signalClassifier.ts` | label 規則（LONG_BREAK/VCP/BOUNCE/BASE/WATCH + SHORT/NEUTRAL/REVIEW_EVENT） |
| `src/engine/stockScreenerEngine.ts` | per-ticker 分類 |
| `src/engine/marketRegime.ts` | VIX<22 long_friendly；VIX>28 或雙線下 EMA50 short_friendly |
| `src/worker/cronSnapshot.ts` | 每日 snapshot 邏輯（production 由 GH Actions 跑） |
| `worker.ts` | Worker 入口：API routes + assets（死 `scheduled()`） |
| `scripts/build-snapshot.ts` | GH Actions 跑的 snapshot builder |
| `scripts/signal-winrate.mjs` | signal 品質回測 |
| `ROADMAP.md` | 產品 roadmap + 已完成記錄 |
| `SIGNAL_IMPROVEMENT.md` | hypothesis backlog（HYP-013/015 細節在此） |
| `TECHNICAL_OVERVIEW.md` | 架構總覽（英文） |
| `CLAUDE.md` | 環境 + build/deploy 指令 |

---

## 8. 與 SignalPilot 的介面

- SignalPilot（獨立 Worker `signalpilot`）會**唯讀消費**你產出的 `trading-etf-db` signals + KV snapshot。
- 你**不要**動 SignalPilot 的交易表 / `signalpilot-db` / auth。
- 你對 `signals` 表 schema 的任何破壞式改動，都要先通知 SignalPilot 線（它的 feature builder 依賴此 schema）。Migration 一律向前追加，不破壞式重建。
