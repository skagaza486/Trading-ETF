# ROADMAP

**產品定位：** 每日戰術信號工具，服務零售投資者（含 70+ 長者）。Explainable rule-based signals，real-data-first，研究驗證先於 UI 承諾。

---

## 現況快照（2026-06-22）

| 層級 | 狀態 |
| --- | --- |
| Signal engine | 穩定。LONG_BOUNCE T1 avg5D +1.57%，LONG_BREAK avg5D +2.5% vs SPY +2.3%。**⚠️ HYP-013 已確認：D1 Gate Summary 有 ~11% earnings 偏差待修** |
| 資料管線 | GitHub Actions `snapshot.yml` off-peak 21:30 UTC；294 隻 KV snapshot 正常寫入；FRED 流動性指標每日附加；Yahoo 市值批次抓取（Track C） |
| Watchlist | 299 stocks（T1=123 growth，T2=176 defensive） |
| UI | **UI 2.0** 完成並部署。5-tab 新架構（大市/板塊/發現/詳情/研究室）+ Trust-First P0 全落實；板塊 Pro Treemap（Track C）已上線 |
| ML 基建 | **Track A 已落地**（2026-06-22）：`scripts/ml/` Python pipeline；Triple-Barrier labeling；unblock 2026-07-19 |

---

## ✅ 完成：UI 2.0 Trust-First 重設計（2026-06-22）

### P0　止血信任　✅ 完成

- [x] 港股 onboarding 鎖定（禁選 HK，顯示「即將推出」）
- [x] `DetailView` 移除寫死回報，改用 `/api/d1/signal-stats` 動態顯示真實樣本（n<20 不顯示）
- [x] `BreadthCard` 改名「偏強/偏弱訊號數」（原 advancers/decliners 語意不準）
- [x] `InfoDot` ❓ 元件上線，接入市寬 / VIX / RVOL 三卡

### P1　新手決策流程　✅ 完成

- [x] 大市首頁重組：Hero 天氣卡 + IndexStrip（3 指數 + 市寬/RVOL 小字）+ Story Grid（今日三件事 / 今日值得研究 / 今日動向）
- [x] 「今日值得研究」行動板：機會 / 主要風險 / 失效條件三行
- [x] 詳情頁「現在哪一步？」stage indicator（觀察名單 → 等待突破 → 入場時機）
- [x] TopBar 顯示資料最後更新時間
- [x] snapshot 補 `prevClose` + `recentClose[]`（5日收盤）→ 解鎖卡片日漲跌% + sparkline

### P2　留存閉環　✅ 完成

- [x] 真正的 ⭐ 自選（localStorage `trading-etf-watchlist`）
- [x] 「今日動向」上提到大市首頁，已starred 股票排序優先
- [x] BottomNav Discover tab badge：自選標的有 label 變動時自動亮起

### P3　深度功能　✅ 完成

- [x] 詳情頁接入 Finnhub 新聞（`useFinancialNews`）
- [x] 詳情頁財報日曆（`useEarningsDate`，30 日內財報警示）
- [x] 板塊頁：強度 × 近期推進速度 scatter chart、自選曝險面板
- [x] 發現頁：summary strip（今日 N 檔 · 轉強 · 板塊最多）

### 設計系統　✅ 完成

- [x] Calm Fintech 色彩系統（`--accent: #4C9DF7`，neutral dark 背景，清除所有硬編碼綠色）
- [x] 舊 App.tsx 保留為 `/legacy` 入口；新 `src/web/` greenfield 架構

### 資料管線遷移　✅ 完成

- [x] `buildDailySnapshot` + `fetchBatch` 加 `FetchTuning`（retry/backoff/batchDelay）
- [x] Worker `POST /api/admin/ingest-snapshot`（token 保護）
- [x] `scripts/build-snapshot.ts` + `.github/workflows/snapshot.yml`（21:30 UTC Mon–Fri + manual dispatch）
- [x] Worker cron 保留為 fallback（settle / gate / ETF）

---

## ✅ 完成：UI 1.1 + 雲端遷移（2026-06-19 封存）

### B1+　Signal classification 移入 cron　✅

- `cronSnapshot.ts` 加入 `signalClassifier` 呼叫，把 `label` 寫入 KV snapshot
- 瀏覽器變純 renderer，snapshot 不可用時顯示錯誤訊息

### B2+　Gate Summary 自動寫 D1　✅

- cron 把各 label 的 n / avg5D / vs SPY / gate pass/fail 寫入 `gate_snapshots` 表
- `signals` 表加入 forward-return 欄位；cron 執行 250 bars replay backfill
- `/api/d1/signals` 回傳 `ForwardReturnRecord[]`；Verify tab 直接讀 D1，無 client-side replay

---

## 研究待驗證

> 這層代表「值得做，但先當實驗，不直接寫死為產品承諾」。

| 項目 | 說明 | 前提 |
| --- | --- | --- |
| R1　Breadth regime 升級 | 把 `proxyWeakBreadth` 升為正式 regime enum | I1 live observation 證明有用後 |
| R2　ETF conditional routing | 不同 regime 走不同 scoring 邏輯 | R1 驗證後 |
| R6　FRED 簡化濾網 | liquidity slope / warning 作 regime note | B1+ cron 穩定後接入 |
| R7　Walk-forward 升級 ✅ | LabView 新增「走勢一致性（月度拆解）」：`/api/d1/signal-perf-by-period` SQL 切片取代瀏覽器記憶體 | B2+ ✅ 已完成 |
| ADX　HYP-022 | 在非牛市或更長時間跨度重新評估區分力 | 需要更多樣本 |
| EXP-013　LONG_BOUNCE MAE ✅ 關閉 | HYP-028a CLV 0.7 + HYP-028b ema20Slope 均已測試無效；MAE 3% 是結構性特徵，position sizing 是正確槓桿 | — |
| L9　Headless UI smoke test（Playwright）✅ | navigation / layout / lab 三個 spec 已更新至 UI 2.0 架構；mock snapshot + D1 routes | UI 2.0 完成後 ✅ |
| Track A　Python ML 基建 ✅ | `scripts/ml/` 已建立：`fetch_signals.py`（D1 API→CSV）、`label.py`（Triple-Barrier Method k=1.5）、`requirements.txt`；**實際訓練 unblock：2026-07-19**；注意：訓練前需先修 HYP-013 earnings contamination + HYP-015 survivorship bias | Track A 基建 ✅ |
| HYP-013　D1 earnings 缺口 P0 | `cronSnapshot.ts:523` 缺 earningsMap 參數，D1 所有 historical signal 的 `earnings_in_window` 永遠 false，Gate Summary 有 ~11% earnings 偏差；修復需建立 `earnings_calendar` D1 表 | 確認 bug，修復優先於調 threshold |
| B3 + L8　ML / Meta-labeling 實際執行 | Track A 基建已落地；等 D1 ≥ 30 天 + HYP-013/015 修復後可執行訓練 | Track A ✅，HYP-013/015 待修 |

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
| L8　ML / Meta-labeling | 見研究待驗證 — unblock 2026-07-19（D1 滿 30 天） |
| L9　Headless UI smoke test（Playwright） | 見研究待驗證 — UI 2.0 完成後可展開 |

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

### Phase 4 Track B + C + A（2026-06-22 完成）— 管線升級 + Pro Treemap + ML 基建

**Track B — FRED 流動性管道：**

- `scripts/fredLiquidity.ts` — 抓 WALCL/WTREGEN/RRPONTSYD，計算 4w slope
- `scripts/build-snapshot.ts` — FRED + snapshot 並行 build，liquidity note 附入 DailySnapshot
- `.github/workflows/snapshot.yml` — `FRED_API_KEY` secret；已驗證：`FRED liquidity: flat (-76B / 4w, asOf 2026-06-17)`

**Track C — 板塊 Pro Treemap：**

- `scripts/yahooMarketCap.ts` — Yahoo `/v8/finance/quote` 批次抓市值（80 tickers/req）
- `src/types/snapshot.ts` — `StockSnapshotEntry.marketCap?: number` 新增欄位
- `scripts/build-snapshot.ts` — snapshot build 後附加市值；Worker-cron snapshot 不含（降級為等寬）
- `src/web/features/sectors/SectorTreemap.tsx` + `SectorTreemap.module.css` — CSS flex tile，格子寬度 ∝ 市值；Pro mode 專屬
- `src/web/features/sectors/SectorsView.tsx` — Pro mode 插入 treemap section

**Track A — Python ML 基建：**

- `scripts/ml/requirements.txt` — pandas / numpy / scikit-learn / joblib
- `scripts/ml/fetch_signals.py` — 從 `/api/d1/signals` 抓 settled signals → `data/signals.csv`
- `scripts/ml/label.py` — Triple-Barrier Method（k=1.5，mfe5d/mae5d/atrAtSignal）→ `data/labeled.csv`
- **⚠️ 實際訓練 unblock：2026-07-19**；訓練前需先修 HYP-013 + HYP-015
