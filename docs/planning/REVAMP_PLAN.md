# REVAMP PLAN — Capital Manager（新 app · 同一 repo · 保留現狀）

> **版本：** 1.1 · **建立：** 2026-06-25 · **作者：** Tony + Claude
> **取代：** 無（與 `EXECUTION_PLAN.md` 並存；EXECUTION_PLAN 是舊「pivot」計劃，本文件是「重新架構 + 新 app」計劃）
> **狀態：** 進行中 — P0–P4 ✅ 完成 · 當前 Phase = **P5**

---

## 0. 方向（一句話）

> **保留現有所有現狀**（`trading-etf` 與 `signalpilot` 兩個 worker 繼續 live、不刪一行），
> **重新架構 repo 成清晰分區**，在同一 repo 內**起一個全新 app「Capital Manager」**，
> 把已驗證有用的引擎當 library 重用，把未證實/已凍結的部分原地封存、不再投工程。

三個關鍵更正(相對於上一版「大膽刪除」計劃)：

1. **不刪 SignalPilot / ML / GATE_EDGE 的 code。** 全部原地保留喺 repo,被動運行,不阻塞、不維護。
2. **但要瘦身 live surface — 用「un-live」而非「刪除」。** 唔需要嘅 live 服務(deployed worker / 夜更 job)**undeploy / disable**,但 code + config + D1 留喺 repo 做封存。減少維護、成本、心智負擔,而唔燒掉成果。
3. **新 app 是「新增」,不是「改寫」。** 現有數據脊樑完全不受影響;新 app 走自己的 worker + 自己的 D1,失敗也不會拖垮舊系統。

### Live surface 瘦身決定（2026-06-25）

| 物件 | 用途 | 決定 |
|---|---|---|
| `trading-etf` worker | 舊 web app + **D1 ingest 端點** | 🟢 **LIVE-KEEP** — capital app 讀其 D1,snapshot 靠其入數 |
| `snapshot.yml`(夜更) | 寫 signals/regime 入 D1 | 🟢 **LIVE-KEEP** — 數據脊樑 |
| `signalpilot` worker | SP-0→8 交易管線 | 🔵 **UN-LIVE** — `wrangler delete`,code/config/D1 留 repo |
| `signalpilot-daily.yml` | SP-2 batch + SP-4 shadow | 🔵 **UN-LIVE** — `on:` 改 `workflow_dispatch` only(休眠,不自動跑) |
| `scripts/ml/`, `models/`, GATE_EDGE | 研究腳本(從來唔係常駐服務) | 📦 **ARCHIVE** — 本來就唔 live,留 code 即可 |

---

## 1. 新 app 要做什麼（產品定義）

兩個產品,共用一條風險骨幹。**研究訊號源負責「提議」,風險核心負責「裁決」——裁決路徑零 ML。**

```
                 ┌─────────────────────────────┐
                 │   RISK + STATE 核心（capital-db）  │  ← 唯一觸碰真錢真相
                 │  positions · cash · rules        │
                 └──────────────┬──────────────┘
                  寫入 │              │ 寫入
          ┌─────────────▼──┐       ┌───▼──────────────────┐
          │ 產品 A          │       │ 產品 B               │
          │ ETF 自動配置     │       │ 股票買賣策略          │
          │ （低風險）       │       │ （中風險）            │
          └─────────────────┘       └──────────▲───────────┘
                                                │ 提議（永不決定）
                                     ┌──────────┴───────────┐
                                     │ 研究訊號源（唯讀）     │
                                     │ signalClassifier +    │
                                     │ marketRegime +        │
                                     │ stockScreenerEngine   │
                                     └───────────────────────┘
```

### 產品 A — ETF 自動配置（低風險,無 edge 主張）
- 目標配置 SPY40/QQQ25/IWM15/GLD10/SGOV10 + regime 調整現金底(ON 5% / NEUTRAL 15% / OFF 30%)。
- 偏移帶(drift band)觸發再平衡,非按時間表。
- 輸出 = 月度再平衡行動卡。純算術,無回測、無 ML、無訊號。

### 產品 B — 股票買賣全週期（中風險,規則化）
- **完整生命週期,不是候選名單:** 候選 → 進場閘 → sizing → 持倉(D1) → **出場引擎** → 暫停機制。
- 出場 = EOD 評估 + Futu 掛 GTC 硬止損(工具追蹤,Futu 執行)。
- 篩選漏斗明確標示「酌情啟發法,非回測 edge」。出場 + 風險規則對真錢第一天生效。

---

## 2. Repo 重新架構（三分區 + 共用 library）

**原則:不物理搬移會破壞 deploy 的檔案(保留現狀)。重新架構靠(a)新增清晰分區、(b)抽出 `shared` library 邊界、(c)一份 ZONE 地圖文件作為唯一真相。**

### ZONE 地圖（四態）

| Zone | 內容 | 規則 |
|---|---|---|
| **🟢 LIVE-KEEP（數據脊樑）** | `worker.ts` + `src/worker/`(trading-etf D1 ingest)<br>`snapshot.yml` + `scripts/build-snapshot.ts` | **必須留 live** — 新 app 唯讀讀其 D1。不投新工程,但唔可停。 |
| **🔵 UN-LIVE（停運,code 留封存）** | `signalpilot/` + `wrangler.signalpilot.toml`(undeploy worker)<br>`signalpilot-daily.yml`(改 dispatch-only)<br>`src/web/`(舊 web UI — 隨 worker 留 live,但凍結不改) | deployed 服務停運;code/config/D1 留 repo。隨時可由 tag 復活。 |
| **📦 ARCHIVE（純 code,本來唔 live）** | `scripts/ml/`, `models/`, `GATE_EDGE*.md`, `SIGNALPILOT_*.md` | 本來就唔係常駐服務。留 code 作 ML 復活種子(見 §6)。 |
| **♻️ SHARED LIBRARY** | `src/engine/`(signalClassifier, marketRegime, stockScreenerEngine, indicatorEngine)<br>`src/types/` | 新 app **唯讀重用**。視為穩定 library,改動需謹慎(會影響 LIVE-KEEP)。 |
| **🚀 ACTIVE — 新 app** | `capital/`(新 worker,mirror `signalpilot/` 結構)<br>`src/capital-web/`(新前端)<br>`schema/capital-*.sql`<br>`wrangler.capital.toml` | 全新建設,所有 revamp 工程在此。 |

### 新 app 的 worker / 資料邊界（mirror SignalPilot 既有 pattern）

| 維度 | 決定 |
|---|---|
| Worker | **新 worker `capital`**(獨立 `wrangler.capital.toml`、獨立 tsconfig、獨立 typecheck) |
| 前端 | **新 Vite 入口** `src/capital-web/`(獨立 bundle,不碰 `src/web/`) |
| D1 — 讀訊號 | 唯讀綁定現有 `trading-etf-db`(signals / regime / screener-candidates) |
| D1 — 真錢狀態 | **新 `capital-db`**(positions / cash_ledger / realized_pnl / risk_state / trade_log) |
| 每日批次 | 新 GH Actions `capital-daily.yml`(EOD 出場評估 + regime 更新),不碰現有 workflow |
| 引擎 | import `src/engine/*` 作 library;不複製、不分叉 |

> **為何新 worker 而非擴充 trading-etf worker:** ① 保留現狀 — 舊 app 一行不動;② 真錢 mutation 端點不應與公開唯讀 app 同 worker(與 SignalPilot 同一安全理由);③ 失敗隔離。這與 repo 既有的 SignalPilot ADR-SP-000 一致。

---

## 3. RISK + STATE 核心（新 app 心臟）

### `capital-db` schema（`schema/capital-r1-core.sql`）

| 表 | 用途 |
|---|---|
| `positions` | 持倉真相(ticker, qty, avg_cost, peak_price, sleeve, sector, opened_at) |
| `cash_ledger` | 現金流水(每筆 buy/sell/dividend,integer cents,禁浮點) |
| `realized_pnl` | 已實現損益(供三連敗偵測) |
| `risk_state` | 單列狀態(capital_base, currency, regime, pause_until, last_3_results) |
| `trade_log` | 每張行動卡的決策 + 觸發規則 + 理由(append-only,審計) |

### `riskEngine.ts`(純函數,零 ML)

把 `EXECUTION_PLAN.md` §2 那張表變成程式化的閘:

- 單股 ≤10% capital base · 單板塊 ≤25% · 總持倉 ≤15
- regime 現金底(ON 5 / NEUTRAL 15 / OFF 30)
- 7 日內業績 → 減 50% · 三連敗 → `pause_until` 兩週
- 硬止損 −10%(自進場)· 移動止損 −20%(自 peak)

輸入 = `positions` + `risk_state` + `regime`;輸出 = 閘結果 + 觸發的規則清單。**狀態可由 `cash_ledger` 完整重建。**

---

## 4. 執行階段（增量,每階段獨立可交付、可回退）

| Phase | 內容 | DoD（完成定義） | 狀態 |
|---|---|---|---|
| **P0 — 架構與瘦身** | 寫本計劃 · `git tag baseline/pre-revamp` · **un-live signalpilot**(下方步驟)· 在凍結區 code 頂部加封存註記 | tag 存在;`signalpilot` worker 已 undeploy;`signalpilot-daily.yml` 休眠;`trading-etf` + `snapshot.yml` 仍 live | ✅ **完成（2026-06-25）** |
| **P1 — 風險核心** | `capital-db` schema · `riskEngine.ts` · 狀態重建 · 單元測試 | 給定持倉能正確列出踩線規則;狀態由 ledger 可重建 | ✅ **完成（2026-06-25）** — `schema/capital-r1-core.sql` · `src/engine/riskEngine.ts` · `src/types/capital.ts` · 38 tests |
| **P2 — 產品 A ETF** | ETF 自動配置引擎 + 再平衡行動卡 · regime 現金底 | 輸入 ETF 持倉 → 產出可執行再平衡清單;OFF 時叫高 SGOV | ✅ **完成（2026-06-25）** — `src/capital-web/features/etf/EtfView.tsx` · ETF_REFERENCE sleeve 分組 · drift band 再平衡卡 · regime 現金底 |
| **P3 — 產品 B 股票** | 進場閘 + sizing + `exitEngine.ts`(EOD) + 暫停機制 · `capital-daily.yml` | 移動止損觸發 → 產出註明規則的賣出卡;板塊超限 → 減持卡;三連敗 → 進場被擋 | ✅ **完成（2026-06-25）** — `exitEngine.ts` · `sizingEngine.ts` · `StocksView.tsx` · `capital-daily.yml` · 82 tests |
| **P4 — 新前端** | `src/capital-web/` 雙分頁(ETF 配置 / 股票策略),從 capital-db 渲染行動卡;capital worker + `wrangler.capital.toml` + `capital-db` 正式 D1 | 兩分頁可用、手機 responsive;worker 有 GET positions / GET risk-state / POST eod-eval / POST record-result 端點 | ✅ **完成（2026-06-25）** — `capital/worker.ts` · `wrangler.capital.toml` · `capital/lib/auth.ts` · `useCapitalApi.ts` · StocksView 接線 · EtfView 局部接線 · capital-daily.yml 啟用 |
| **P5 — 上線爬升** | ETF 即時動真錢 · 股票兩週 paper 牆 → 通過 → Futu 真錢 + GTC 止損 | 見 §6 上線準則 | ⬜ 待 P4 |

---

### P0 un-live 具體步驟（全部可回退）

```bash
# 1. 封存基線(隨時可復活整個 signalpilot)
git tag baseline/pre-revamp

# 2. Undeploy signalpilot worker(刪 deployed 服務,D1 / KV / code 全留)
node_modules/.bin/wrangler delete --name signalpilot
#    ↑ signalpilot-db / SP_CONTROL_KV / signalpilot/ 目錄一律保留

# 3. 休眠夜更 job:signalpilot-daily.yml 的 on: 改成只剩 workflow_dispatch
#    (移除 workflow_run trigger → 唔再跟 snapshot 自動跑;要時仍可手動 dispatch)
```

> **唔掂嘅嘢:** `snapshot.yml`、`trading-etf` worker、`trading-etf-db`、`SNAPSHOT_KV`。呢啲係新 app 嘅數據脊樑,un-live 任何一樣都會切斷 capital app 嘅 signal/regime 來源。
>
> **復活路徑:** `git checkout baseline/pre-revamp -- signalpilot/ wrangler.signalpilot.toml` → `npm run sp:deploy`,即可把 SignalPilot 重新 live。

---

## 5. 重用 / 凍結 / 新建 清單

| 處理 | 對象 |
|---|---|
| **♻️ 重用(library)** | `signalClassifier.ts` · `marketRegime.ts` · `stockScreenerEngine.ts` · `indicatorEngine.ts` · `src/types/` · snapshot→D1 管線 · `portfolioConfig.ts`(ETF_REFERENCE / 風險限制 as % of capital) |
| **🔵 Un-live(停運,code 留)** | `signalpilot/` worker(undeploy)· `signalpilot-daily.yml`(休眠) |
| **📦 凍結封存(本來唔 live)** | `scripts/ml/` · `models/` · shadow inference · GATE_EDGE 機制 · `src/web/`(舊 UI,隨 trading-etf worker 留 live 但不改) |
| **🚀 新建** | `capital/` worker · `src/capital-web/` 前端 · `riskEngine.ts` · `exitEngine.ts`(產品 B) · ETF 配置引擎 · `capital-db` schema · `capital-daily.yml` |

---

## 6. 上線準則 / 止損線

### 股票 paper 牆 → 真錢（沿用 EXECUTION_PLAN §6）
- 候選流:≥4 連續週、每週 ≥3 候選
- Paper P&L:期間為正
- Paper 回撤:無單一模擬倉 > −15%
- 流程遵守:每週 SOP 全做齊
- **新增:至少捱過一個非 RISK_ON 週**

### ML 復活線（寫死,在那之前 ML 凍結不碰）
- 樣本 ≥1,500 **且** 新 holdout OOF AUC ≥0.60 **且** precision@take ≥ always-take +5pp

---

## 7. 已拍板預設（可推翻）

1. **出場 = EOD + Futu GTC 硬止損**(CF/GH Actions 做唔到可靠 intraday,與 SignalPilot 同因)。
2. **股票進場先設兩週 paper 牆**;出場/風險規則對真錢即時生效。
3. **ETF 完成 P2 即可動真錢**(無 edge 主張,無需驗證)。
4. **新 app 走新 worker `capital` + 新 D1 `capital-db`**(保留現狀、安全隔離)。

---

## 8. 待 Tony 確認後開工

P0 第一步 = 本計劃 checked-in + ZONE 地圖 + `git tag baseline/pre-revamp`(全部非破壞性)。
確認後我由 P0 開始,逐 Phase 交付。

---

_本文件是新 app 的唯一規劃真相。任何機器 / 接班 AI 開工前先讀此 + ZONE 地圖。_
