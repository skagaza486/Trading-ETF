# ROADMAP

**產品定位：** 每日戰術信號工具，服務零售投資者（含 70+ 長者）。Explainable rule-based signals，real-data-first，研究驗證先於 UI 承諾。

---

## 現況快照（2026-06-19）

| 層級 | 狀態 |
| --- | --- |
| Signal engine | 穩定。LONG_BOUNCE T1 avg5D +1.57%，LONG_BREAK avg5D +2.5% vs SPY +2.3% |
| 雲端架構 | B1 + B2 上線。KV daily snapshot + D1 signals，cron 21:30 UTC Mon–Fri |
| Watchlist | 299 stocks（T1=123 growth，T2=176 defensive） |
| UI | UI 1.1 完成並部署。Git → Cloudflare Workers 自動 build + deploy |

---

## ✅ 完成：UI 1.1 + 雲端遷移（2026-06-19）

### UI-A　Stocks 頁 → list-first screener　✅ 完成

### UI-B　Verify 頁 → overview-first workbench　✅ 完成

### UI-C　其他　✅ 完成

---

### B1+　Signal classification 移入 cron　✅ 完成

cron 已寫 label 進 KV snapshot；瀏覽器直接讀取，不再做 client-side classification。

- [x] `cronSnapshot.ts` 加入 `signalClassifier` 呼叫，把 `label` 寫入 KV snapshot
- [x] `snapshotProvider.ts` 直接讀 label，不再 client-side 分類
- [x] `App.tsx` 移除 client-side classify fallback（`buildStockRows` + `classifyStock` import 已刪）
- **結果：** 瀏覽器變純 renderer，snapshot 不可用時顯示錯誤訊息

### B2+　Gate Summary 自動寫 D1　✅ 完成

- [x] cron 完成分類後，把各 label 的 n / avg5D / vs SPY / gate pass/fail 寫入 `gate_snapshots` 表
- [x] `signals` 表加入 forward-return 欄位（ret1d…mae10d, stop_loss_hit 等）；migration: `schema/d1-migrate-b2.sql`
- [x] cron 執行 `writeHistoricalSignalsToD1`（250 bars replay）backfill forward returns
- [x] `/api/d1/signals` 回傳 `ForwardReturnRecord[]`（days=365, limit 5000）
- [x] `loadResearchData` 改為 fetch `/api/d1/signals`，移除 `buildHistoricalSignals` / `buildForwardReturnRecord` client-side 重算
- **結果：** Verify tab 直接讀 D1，無需 client-side replay；EXP gate 數據由 cron 統一維護

---

## 研究待驗證

> 這層代表「值得做，但先當實驗，不直接寫死為產品承諾」。

| 項目 | 說明 | 前提 |
| --- | --- | --- |
| R1　Breadth regime 升級 | 把 `proxyWeakBreadth` 升為正式 regime enum | I1 live observation 證明有用後 |
| R2　ETF conditional routing | 不同 regime 走不同 scoring 邏輯 | R1 驗證後 |
| R6　FRED 簡化濾網 | liquidity slope / warning 作 regime note | B1+ cron 穩定後接入 |
| R7　Walk-forward 升級 | 直接 SQL 查詢 D1 切片，取代瀏覽器記憶體計算 | B2+ 上線後 |
| ADX　HYP-022 | 在非牛市或更長時間跨度重新評估區分力 | 需要更多樣本 |
| EXP-013　LONG_BOUNCE MAE | CLV floor 0.6→0.7 或收窄 recentPullbackNearEma20 | 現有架構內可做 |
| B3 + L8　Python ML backend + Meta-labeling | B3 基建（Python 環境、data pipeline、schema 對齊）可現在準備；實際 ML 訓練等 D1 資料積累。**unblock：2026-07-19**（D1 上線滿 30 天） | R7 ✅，D1 上線 2026-06-19 |
| L9　Headless UI smoke test（Playwright） | Dashboard smoke test 可先試點；全面展開等 **UI-A + UI-B 完成後** | UI 1.1 完成後 |

---

## 長期延後（Phase 4+）

不是否定，是明確標記為「現時不應投入大量工程」。

| 項目 | 延後原因 |
| --- | --- |
| L1　FRED 完整流動性矩陣（WALCL/TGA/RRP） | 需要預計算架構成熟後才接入 |
| L2　SEC Form 4 Insider Cluster | 資料接入複雜度高，易成噪音 |
| L3　Fundamentals overlay（ROIC/margin） | 超出現有輕量邊界，需資料治理 |
| L4　Options / IV-HV 濾網 | 容易把 repo 拉向衍生品資料平台 |
| L5　Social sentiment | 噪音高，可驗證性弱 |
| L6　Macro blackout calendar | 輔助風險層，不應早於核心 signal quality |
| L8　ML / Meta-labeling | 見研究待驗證 — 已升級，2026-07-19 unblock |
| L9　Headless UI smoke test（Playwright） | 見研究待驗證 — 已升級，UI 1.1 完成後展開 |

---

## 不建議做的事

- 不要新增大量 regime enum（先用 flag/warning overlay 驗證）
- 不要把 ETF engine 改成完整多因子黑盒 scoring
- 不要把 `LONG_BASE_BREAK` 直接升成 UI 主推訊號
- 不要先做 options / social sentiment，再回頭補 research discipline
- 不要把多源資料全部放在前端即時抓取
- 不要在 plateau / walk-forward 未建立前跳去 ML

---

## 已完成記錄

### Phase 1（2026-06-18 封存）— I1–I7 全部完成

- I1　Regime proxy breadth（RSP + IWM/SPY ratio + proxyWeakBreadth flag）
- I2　ETF ranking 升級（riskAdjustedMomentum score，不改 label waterfall）
- I3　SGOV 作無風險基準
- I4　LONG_BASE_BREAK 研究版原型
- I5　Parameter plateau 離線版（ATR 止損模擬）
- I6　ETF Weekly 卡片化
- I7　Tab 架構重組（Dashboard / Stocks / ETFs / Quant Lab）

### Phase 2（2026-06-18 封存）— Signal research 窮盡

**Signal taxonomy 重設計：** 舊 LONG_SETUP/WATCH/CONFIRM/UP_PROMOTION → 新 LONG_BREAK/VCP/BOUNCE/BASE/WATCH

**Multi-bar signal 改版（HYP-016~019）：**

- LONG_BREAK：RVOL 1.8→1.6，加 `priorBaseStreak >= 2`
- LONG_BOUNCE：加 `pullbackRvolAvg < 1.2`；RSI 58→62 測試後回退（vs SPY +0.4%，worse）
- WATCH：加 `rsiSlope3 > 0`（null-safe）

**EXP-011 外部研究改版：**

- LONG_VCP：加 `CLV > 0.6` + `previousLabel` → avg5D -1.5%→+1.5%（方向修正）
- LONG_BREAK：加 `EMA50 > EMA150`（null-safe）+ `extendedFromPivot != true` → n=16→10
- ADX > 25：測試後不加入（排除 10/16 信號，牛市樣本無區分力）

**EXP-012/013 LONG_BOUNCE MAE 研究：**

- HYP-026 RS Line gate、HYP-028a CLV 0.7、HYP-028b ema20Slope 均無效
- 結論：MAE 3.0% 是 mean-reversion trade 的結構性特徵，接受此限制，position sizing 是正確控制手段

**LONG_BASE 降級：** 從 gate-evaluated signal 改為 universe filter，不再納入 Gate Summary

**Phase 2 signal 基準（299 stocks，2yr）：**

| Label | n | Avg5D | vs SPY | WinRate5D |
| --- | --- | --- | --- | --- |
| LONG_BOUNCE T1 | 86 | +1.57% | +1.09% | 64% |
| LONG_BOUNCE T2 | 366 | +0.67% | +0.48% | 53% |
| LONG_BOUNCE 整體 | 452 | +0.84% | +0.60% | 55% |
| LONG_VCP | 50 | +0.54% | +0.34% | 52% |
| LONG_BASE | 2886 | +0.42% | +0.15% | 53% |

**LONG_BREAK n 問題根本診斷：** 每隻股平均貢獻 0.15 LONG_BREAK/250 bars，達 n=100 需 ~800 隻。Watchlist 擴充無效（已 revert 至 101 精選）。根本解是 B1 架構（S&P 500 server-side）。

### Phase 3 B1 + B2（2026-06-19 完成）— 雲端架構上線

**B1 完成項目：**

- `src/types/snapshot.ts` — DailySnapshot / StockSnapshotEntry（含 tier）
- `src/worker/cronSnapshot.ts` — fetchBatch + rsRank + D1 write
- `worker.ts` — scheduled() + /api/snapshot/latest + /api/d1/signals
- `wrangler.toml` — KV + D1 binding + cron 21:30 UTC Mon–Fri
- `src/services/marketData/snapshotProvider.ts` — snapshot fetch + stale 判斷
- `App.tsx` — snapshot 優先，stale 時 fallback 至 live Yahoo
- Stocks tab 新增 RS% 欄
- Workers Paid plan 啟用（$5/月）

**Watchlist + Tier 系統：**

- 299 stocks（T1=123 growth，T2=176 defensive）
- watchlist.ts 加 `tier: 1|2`；排序 T1 優先；stock card 顯示「防禦」badge
- LONG_BOUNCE tier-aware 條件：T1 RSI≥46 / rvolThresh<0.9 / RS>2%

**B2 完成項目：**

- `trading_etf_db` D1 binding 部署
- signals 表寫入，/api/d1/signals 運作
- cron 以 129/130 成功率驗證（1 Yahoo timeout，正常）
