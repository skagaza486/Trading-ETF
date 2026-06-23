# ROADMAP

**產品定位：** 每日戰術信號工具，服務零售投資者（含 70+ 長者）。Explainable rule-based signals，real-data-first，研究驗證先於 UI 承諾。

---

## 北極星與決策閘（2026-06-23 設立）

> 本節係專案治理層。喺呢度之上嘅一切進度，都要受呢幾道閘約束。閘未過，唔好把資源倒落下游。

**主軸（單一脊骨）：** **研究／驗證引擎**先係專案心臟；web app 係佢嘅 UI；SignalPilot 係下游、受 `GATE-EDGE` 閘控。一個 solo operator **唔三線全速**——資源優先序永遠係：數據真相 → edge 驗證 → 下游執行。

**最根本嘅未答問題：** 修正各偏差後，rule-based + ML 信號到底有冇可重複嘅 risk-adjusted edge？喺呢條問題答到之前，SignalPilot 嘅真錢階梯（SP-5→SP-8）係**凍結**狀態。

### P0–P5 治理閘

| 閘 | 問題 | 阻塞咩 | 通過條件 | 狀態 |
| --- | --- | --- | --- | --- |
| **P0 數據真相** | earnings 污染（HYP-013）解咗未？ | 所有 gate / AUC 數字嘅可信度 | production `earnings_in_window` 覆蓋率反映真實、單一真相來源（research-health 端點） | ✅ **已達**（3.12%，74,043 settled / 2,308 flagged，2026-06-23 實測；非 0.02%） |
| **P1 倖存者偏差** | point-in-time universe（HYP-015）真嗎？ | 所有 Avg5D / backtest 數字（survivorship + inclusion 高估） | universe 反映歷史**真實成員**，無後見之明 | ✅ **A-lite 完成（2026-06-23）** — S&P 500 Wikipedia PIT 503 現成員 + 28 個範圍內異動；Steps 1–5 完成（D1 注入 + ~530 tickers 2y backfill）。⚠️ **殘存 delisting bias**（SPLK/ATVI 等退市股無法取價）；PASS 須附此 caveat |

> ⚠️ **P1 provenance 死結（2026-06-23 查證）：** 信號史 = 2025-04-25→2026-06-05（280 交易日），但 **repo 最早 commit 僅 2026-06-17**。即 15 個月信號全部係用一個**2026-06 先存在嘅手揀 watchlist** 一次性倒填。`backfillUniverseSnapshotsFromGit.mjs` 讀 git history，**結構上去唔到 repo 出生之前**，所以只可能複製返今日 299 隻。更甚者 watchlist 係**手揀贏家名單**（PLTR/APP/SMCI/ARM/CRDO 等到 2026-06 已跑出先 curate）→ 唔止 survivorship（漏退市股），仲有 **inclusion bias（後見之明選股）**。**呢個偏差無法由內部資料修復**，out-of-time holdout 都除唔到（選股已用咗到 2026-06 嘅資訊）。**待你戰略決策**：① 取外部 point-in-time 成份（如 S&P500 歷史成員）重跑全部信號；② 用中性規則 universe 做敏感度 bound；③ 明確重訂為研究/學習工作台，永久凍結真錢線。
| **P2 GATE-EDGE** | 修正 earnings + 倖存者 + 多重檢定後，excess return 仍正且**顯著**嗎？ | SignalPilot SP-5→SP-8（不得越過 SP-4） | pre-registered writeup（[`GATE_EDGE.md`](GATE_EDGE.md)）：事前定門檻，明確判「繼續 vs 轉向」 | 🟡 **ITERATE（2026-06-23 執行）** — mean=+1.38%（after 20bps cost），p=0.085（未達 α=0.05）。方向正確但 n=75 統計力不足。UPPER-only BH-sig ✅（+7.76%）。下一次：GATE_EDGE_v2.md，等 2026-08+ n≥100 |
| **P3 凍結下游** | SignalPilot 應否推進真錢階梯？ | 工程資源誤投 SP-5+ | GATE-EDGE 通過先解凍；工程完成不自動晉級 | 🔒 **生效中**（SP-5→SP-8 BLOCKED） |
| **P4 holdout 紀律** | HYP-009→028 重疊細樣本嘅 p-hacking 點防？ | GATE-EDGE 嘅可信度 | 設一個**永不觸碰**嘅 holdout，最終測試前唔睇 | ✅ **已鎖定** — `data/holdout_freeze_v1.json`（n=75，2026-02-01→2026-06-05，20bps 成本凍結）。v1 holdout 已用於 GATE-EDGE v1；v2 須另開新段 |
| **P5 主軸聚焦** | 三線全速會唔會三樣都半桶水？ | 整體交付深度 | 研究引擎=脊骨；web/SignalPilot 受其節奏與閘約束 | 🟡 **本節即為落實** |

**依賴鏈：** `P0 ✅ + P1 ✅(A-lite) + P4 ✅ ──► GATE-EDGE v1（P2，🟡 ITERATE）──► 解凍 SP-5+（P3，仍 BLOCKED）`。
**即係話：** GATE-EDGE v1 已跑，結果 ITERATE（p=0.085，方向正確但未達顯著）。下一個阻塞點係**等待更多樣本（2026-08+）+ 開 GATE_EDGE_v2.md**，唔係數據完整性問題。

> 📋 跨兩條線嘅完整 backlog（排序 / 阻塞 / 依賴）見 [`WORKLIST.md`](WORKLIST.md)。

---

## 現況快照（2026-06-23）

| 層級 | 狀態 |
| --- | --- |
| Signal engine | 穩定。LONG_BOUNCE T1 avg5D +1.57%，LONG_BREAK avg5D +2.5% vs SPY +2.3%。**⚠️ 上述 Avg5D 全部喺 survivorship-biased universe（P1 未達）+ 2024–26 牛市計出，數字偏樂觀，edge 未證（見 GATE-EDGE）**。HYP-013 earnings 污染**已解**（3.12%，非舊文檔講嘅 0.02%） |
| 資料管線 | GitHub Actions `snapshot.yml` off-peak 21:30 UTC；299 隻 KV snapshot 正常寫入；FRED 流動性指標每日附加；Yahoo 市值批次抓取（Track C）；`signals.next_open` 欄位已上 schema + API；**HYP-013 earnings backfill ✅（production 3.12%）；⚠️ HYP-015 `watchlist_universe_snapshots` 有 15 個月（2025-04→2026-06）但每月都係今日 299 隻倒蓋（成員零變動）= 假覆蓋，真 point-in-time 成員歷史仍未重建** |
| Watchlist | 299 stocks（T1=123 growth，T2=176 defensive） |
| UI | **UI 2.0** 完成並部署。5-tab 新架構（大市/板塊/發現/詳情/研究室）+ Trust-First P0 全落實；板塊 Pro Treemap（Track C）已上線。**港股 onboarding 仍維持 locked；未有真實 coverage 前，只可顯示「即將推出 / 暫未開放」，不得暗示已支援。** |
| ML 基建 | **Track A 已落地**（2026-06-22）：`scripts/ml/` Python pipeline；Triple-Barrier labeling。**⚠️ SP-4 首個模型 OOF AUC=0.579 ≈ noise floor（0.5=隨機）；precision 淨贏 always-take ~3.7pp**——呢個係 **pipeline 腳手架里程碑，唔係 edge 證據**。edge 待 GATE-EDGE 驗證（P1 倖存者 + P4 holdout 為前置） |
| **SignalPilot** | **SP-0 ✅ + SP-1 🟡 + SP-2 ✅ + SP-4 🟡**（2026-06-23）：獨立 Worker 上線；Auth/AuditSpine 完成；Paper Ledger MVP 待 E2E smoke；Rule-Only Shadow ✅ 夜跑中；SP-4 首模型 promote（**pipeline 可重現 ≠ 加到 alpha**）。**🔒 SP-5→SP-8 真錢階梯 BLOCKED until GATE-EDGE passes**。見 [`SIGNALPILOT_ROADMAP.md`](SIGNALPILOT_ROADMAP.md) |

---

## ✅ 完成：UI 2.0 Trust-First 重設計（2026-06-22）

### P0　止血信任　✅ 完成

- [x] 港股 onboarding 鎖定（禁選 HK，顯示「即將推出」）
- [ ] 港股 onboarding 解鎖條件文件化：只有當 HK coverage 定義、research-health 指標、關鍵頁面可用性與限制文案齊備，先可由「即將推出」改為 beta / 可選
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
- [x] Worker cron 已移除（`wrangler.toml` 無 `[triggers]`）；`worker.ts` 的 `scheduled()` handler 仍在但不會觸發。GitHub Actions 為唯一每日管線

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
| Track A　Python ML 基建 ✅ | `scripts/ml/` 已建立：`fetch_signals.py`（D1 API→CSV）、`label.py`（Triple-Barrier Method k=1.5）、`requirements.txt`；**樣本充足（~74k 條／15 個月，2025-04 起）**——樣本數從來唔係瓶頸，**真瓶頸係 P1 倖存者偏差 + P4 holdout** | Track A 基建 ✅ |
| HYP-013　D1 earnings 缺口 ✅ **已解** | 缺參數 bug 與 resume bug 都已修；SEC Edgar 8-K 替換 Finnhub。**2026-06-23 實測 production = 3.12%（74,043 settled / 2,308 flagged）**，非舊文檔講嘅 0.02%（已過時）。低於 ~11% 理論目標但**足以訓練**，污染已解除 | P0 ✅ |
| HYP-015　point-in-time universe ❌ **未解（假覆蓋）** | `watchlist_universe_snapshots` 有 15 個月（2025-04→2026-06）**但每月都係今日 299 隻倒蓋**——2025-04 vs 2026-06 成員**零差異** = survivorship bias 完全未除。有 row ≠ 有 point-in-time 成員歷史。**所有 Avg5D / backtest 數字都受此高估**，係 GATE-EDGE 嘅 P1 前置 | P1 ⛔ 阻 GATE-EDGE |
| B3 + L8　ML / Meta-labeling 實際執行 | Track A 基建已落地；SP-4 首模型 promote。**⚠️ OOF AUC=0.579 ≈ noise floor，precision 淨贏 always-take ~3.7pp——係 pipeline 腳手架里程碑，唔係 edge 證據**。下一步唔係調 threshold/feature importance，而係先過 GATE-EDGE（P1 + P4） | Track A ✅，HYP-013 ✅，**HYP-015 ❌ + holdout ❌** |
| P4　holdout discipline ✅ **已鎖定** | `data/holdout_freeze_v1.json`（n=75，2026-02→06-05，20bps 凍結）；已用於 GATE-EDGE v1。v2 須另開新段（唔可重用 v1 holdout） | GATE-EDGE v1 ✅ 已跑 |

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
| L8　ML / Meta-labeling | 見研究待驗證 — 樣本充足（~74k 條／15 個月）；HYP-013 ✅，但前置剩 HYP-015 真 point-in-time（P1）+ holdout（P4）+ GATE-EDGE（P2） |
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
- `worker.ts` — scheduled()（已停用、不觸發）+ /api/snapshot/latest + /api/d1/signals
- `wrangler.toml` — KV + D1 binding（無 cron trigger；每日 snapshot 由 GitHub Actions 跑）
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
- **樣本充足（~74k 條／15 個月，2025-04 起）**——樣本數非瓶頸。HYP-013 ✅（3.12%）；真前置剩 HYP-015 真 point-in-time（P1）+ holdout（P4），全部匯入 GATE-EDGE（P2）
