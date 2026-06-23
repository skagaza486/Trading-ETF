# Trading ETF — 工作簡報（給 keitaAI）

> **更新：** 2026-06-23（前版建立於 2026-06-23，本次大幅修正）
> **對象：** 接手 `trading-etf` web app + SignalPilot 部分工作的 AI agent
> **Claude 負責：** ML 研究線（LOWER label 分析、ML v1.0.2 retrain、GATE_EDGE_v2.md）— **請勿觸碰**

---

## 0. 當前狀態（必讀）

> ⚠️ **本節不維護狀態數字。`CLAUDE.md` §Current sprint 是唯一真相來源。**  
> 開工前請先讀 `CLAUDE.md`，本文件只提供**任務範圍、環境指令、禁區**。

### 角色分工（固定）

| 工作線 | 負責方 |
| --- | --- |
| ML pipeline（`scripts/ml/`）、GATE_EDGE、EXPERIMENT_LOG | **Claude** |
| SignalPilot 架構設計、schema 定義、`CLAUDE.md` 維護 | **Claude** |
| Web App UI（`src/web/`）、GH Actions 告警 | **你（接班 AI）** |
| SignalPilot 端點實作（§4 可即做項）、WORKLIST.md 更新 | **你（接班 AI）** |

### 狀態同步協定

1. **你開工前**：讀 `CLAUDE.md` → `WORKLIST.md` → 本文件禁區（§5）
2. **你完成任何工作後**：在 `WORKLIST.md` 打勾 `[x]`，加完成日期
3. **任何 schema 改動前**：在本文件 §2 開頭加一行 `⚠️ SCHEMA CHANGE PENDING: [描述] — [日期]`，等 Claude 確認再執行

### 當前 sprint 快速索引（點進去看真實數字）

- 閘狀態 → [`CLAUDE.md`](../CLAUDE.md) §Current sprint
- 完整 backlog → [`WORKLIST.md`](../WORKLIST.md)
- ML 訓練記錄 → [`models/EXPERIMENT_LOG.md`](../models/EXPERIMENT_LOG.md)
- GATE-EDGE 結果 → [`GATE_EDGE.md`](../GATE_EDGE.md) §12

---

## 1. 執行環境（必讀，否則指令失敗）

`node` / `npm` / `npx` **不在 PATH**。一律用 bundled binary：

```bash
.tools/node-v22.22.3-darwin-arm64/bin/node node_modules/.bin/<tool>
```

**TypeScript 檢查（部署前必過、零錯誤）：**
```bash
.tools/node-v22.22.3-darwin-arm64/bin/node node_modules/.bin/tsc --noEmit
```

**`trading-etf` Build + Deploy（永遠一起跑）：**
```bash
.tools/node-v22.22.3-darwin-arm64/bin/node node_modules/.bin/vite build && \
.tools/node-v22.22.3-darwin-arm64/bin/node node_modules/.bin/wrangler deploy
```
Worker 把 `dist/` 當靜態資源；跳過 `vite build` 會部署到 stale 前端。  
**Target worker：`trading-etf`（有 hyphen）。舊 worker `tradingetf`（無 hyphen）絕不 deploy。**

**SignalPilot Deploy：**
```bash
.tools/node-v22.22.3-darwin-arm64/bin/node node_modules/.bin/wrangler deploy --config wrangler.signalpilot.toml
```
（先跑 tsc --noEmit 確認零錯誤）

**D1 查詢：**
```bash
.tools/node-v22.22.3-darwin-arm64/bin/node node_modules/.bin/wrangler d1 execute trading-etf-db --remote --command "SELECT ..."
```

---

## 2. 架構邊界（別違反）

- **trading-etf worker 無狀態、無 cron。** 每日 snapshot 由 GH Actions `snapshot.yml`（21:30 UTC Mon–Fri）跑。
- **單次 Worker invocation ~43 股上限**（Yahoo 限流）。全宇宙靠 GH Actions 或 chunk。
- **SignalPilot 唯讀消費 `trading-etf-db`。** 你對 `signals` schema 的破壞式改動，先通知；migration 一律向前追加。
- **`signalpilot-db` 交易表由 Claude 負責架構設計。** 你可做讀取/端點工作，但不要改 schema 定義。
- **SP_AUTH_TOKEN** secret：不可 log / commit / print。呼叫 SignalPilot 端點前確認 token 已更新（原 token 已暴露於 chat，需 rotate）。

---

## 3. Web App 工作（trading-etf）

### 3A — UI 完工 ✅ 2026-06-24

以下檔案有未 commit 改動，需 review + QA + 提交：

| 檔案 | 改動性質 |
| --- | --- |
| `src/web/features/detail/DetailView.tsx` | Enhanced 6-tab analysis view（上個 commit `c025fe8`） |
| `src/web/features/detail/DetailView.module.css` | 對應樣式 |
| `src/web/features/discover/DiscoverView.tsx` | Discover view 改動 |
| `src/web/features/discover/DiscoverView.module.css` | 對應樣式 |
| `src/web/features/lab/LabView.tsx` | Lab view 改動 |
| `src/web/features/onboarding/Onboarding.tsx` | Onboarding 改動 |
| `src/web/shared/components/EtfCard.tsx` | EtfCard 改動 |
| `src/web/app/providers/AppContext.tsx` | Context 改動 |
| `src/web/shared/hooks/useEtfMeta.ts` | 新增（untracked） |

**做法：** 先讀每個檔案，確認改動符合設計系統（`DESIGN_SYSTEM.md`），QA 通過後一起 commit。不要盲目 `git add -A`。

**驗收：** `tsc --noEmit` 零錯誤 → `vite build && wrangler deploy` → 開瀏覽器驗 UI。

### 3B — GH Actions snapshot 失敗告警

現況：`snapshot.yml`（21:30 UTC 每日）失敗時靜默。需加告警。

**做法（選一）：**
- 在 `snapshot.yml` 加 `on: failure` step，用 GitHub `actions/github-script` 開 issue 或 call webhook
- 或在 workflow 末尾加 `notify` job（`if: failure()`）

**驗收：** 人工觸發失敗情境（例如改壞 token），確認有告警產出。

### 3C — WORKLIST §3A sector/industry 解鎖

`WORKLIST.md` §3A：SP-3 sector/industry 欄位標記 `⛔ 依賴 P1`。P1 現在 ✅ A-lite，可解鎖。  
**做法：** 把 `⛔` 改為 `⬜`，表示可開工但尚未開始。不要自行實作（SP-3 contract 需 Claude 同步確認）。

---

## 4. SignalPilot 工作（可即做，不與 Claude 衝突）

### 4A — SP-1 邊界情境測試

SP-1 主路徑（APPROVED / POSITION_TOO_SMALL / chain.ok）已通過 smoke test。  
以下情境**尚未有測試覆蓋**：

| 情境 | 期望行為 |
| --- | --- |
| signal 存在但 `next_open` 缺失 | fallback to `close_at_signal`，`price_source = close_at_signal`，仍 APPROVED |
| `close_at_signal` 也缺 → qty=0 | REJECTED / POSITION_TOO_SMALL |
| 餘額不足（cash < gross_cents） | REJECTED / INSUFFICIENT_CASH |
| 重複提交同一 (ticker, signal_date) | idempotency guard 回傳原 intent，order/fill=null，無重複寫入 |
| SIGNAL_NOT_FOUND | 404-style REJECTED + reason SIGNAL_NOT_FOUND |

**做法：** 用 curl 或 script 直接 POST `/api/sp1/intent`，逐一驗證 `eligibility_status` + `rejection_reason`。記錄結果。不要改 Worker 程式碼（除非發現 bug）。

### 4B — SP-2 三層 attribution 端點

現況：`strategy_daily_snapshots` 每日累積 NAV，但只有一個 `GET /api/sp2/portfolio`（raw snapshots）。  
缺：分解到 strategy / execution / portfolio 三層的 attribution summary。

**做法：**

1. 在 `signalpilot/worker.ts` 加 `GET /api/sp2/attribution`（token-gated read）
2. 從 `strategy_daily_snapshots` + `fills` + `candidate_decisions` 計算：
   - strategy layer：approved vs rejected 候選比例、sector 分布
   - execution layer：fill price vs close_at_signal 滑點
   - portfolio layer：NAV curve，open positions P&L
3. 回 JSON，不改 DB schema
4. `tsc --noEmit` 零錯誤 → deploy

### 4C — SP-3 資料契約凍結

SP-3 exit gate 需「next-bar open / spread / slippage / fees 假設定版」。  
**做法：** 建立 `data/sp3_contract_v1.json`，記錄：

```json
{
  "version": "v1.0.0",
  "frozen_at": "2026-06-23",
  "fill_price": "next_open fallback close_at_signal",
  "slippage_bps": 10,
  "commission_cents": 0,
  "spread_assumption": "none (paper)",
  "target_notional_cents": 100000,
  "hold_period_days": 5,
  "cost_assumption_bps": 20
}
```

不需要 Claude 批准；這是把現有 `signalpilot/lib/brokers/paper.ts` + `sp1/types.ts` 的假設**文件化**，不是改設計。

### 4D — 模型版本文檔對齊

各文件對「當前 promoted 模型」描述不一致：

| 文件 | 當前描述 |
| --- | --- |
| `CLAUDE.md` | `model_v1.0.1_ef58f809`（threshold=0.48）✅ 正確 |
| `SIGNALPILOT_ROADMAP.md` §SP-4 | 提到 `model_v1.0.0_8aa032a3`（舊版，已被 superseded） |
| `EXPERIMENT_LOG.md` | 需確認 |
| `sp4_model_registry` D1 | 需確認實際 promoted record |

**做法：**

1. 查 D1（注意：sp4 表在 signalpilot-db）：

   ```bash
   .tools/node-v22.22.3-darwin-arm64/bin/node node_modules/.bin/wrangler d1 execute signalpilot-db --remote --command "SELECT * FROM sp4_model_registry WHERE is_promoted = 1"
   ```

2. 用 D1 真相對齊 `SIGNALPILOT_ROADMAP.md` §SP-4 裡的模型版本描述
3. 不要改 `CLAUDE.md`（Claude 負責維護）

---

## 5. 不要做的事

- **不要動 ML pipeline**（`scripts/ml/`）— Claude 正在那裡工作
- **不要動 `models/EXPERIMENT_LOG.md`**，除非你跑了新 training（你沒有被授權跑）
- **不要改 `data/holdout_freeze_v1.json`** — holdout 凍結，不可碰
- **不要改 GATE-EDGE 相關文件**（`GATE_EDGE.md`、`models/gate_edge_result.json`）
- **不要解鎖 SP-5+** — GATE-EDGE 未 PASS 前全部 BLOCKED
- **不要讓任何 secret 落入檔案、commit、KV snapshot 或日誌**

---

## 6. 安全注意

- `SP_AUTH_TOKEN`：Bearer token，constant-time compare，**不得 log / commit / print**。原 token `c530...` 已暴露，**必須 rotate**：

  ```bash
  openssl rand -hex 20
  echo "<new-token>" | .tools/node-v22.22.3-darwin-arm64/bin/node node_modules/.bin/wrangler secret put SP_AUTH_TOKEN --config wrangler.signalpilot.toml
  ```

- `INGEST_TOKEN`：admin endpoints (`/api/admin/*`) 的 Bearer，只放 Worker secrets + GH Secrets。

---

## 7. 關鍵文件索引

| 文件 | 用途 |
| --- | --- |
| `ROADMAP.md` | 治理閘 P0–P5 + web app roadmap |
| `SIGNALPILOT_ROADMAP.md` | SP-0→SP-8 里程碑 |
| `WORKLIST.md` | 跨線單一 backlog（排序、阻塞、依賴） |
| `GATE_EDGE.md` | GATE-EDGE 框架 + v1 結果（§12） |
| `CLAUDE.md` | 環境、build/deploy 指令、sprint 狀態 |
| `models/EXPERIMENT_LOG.md` | 每次 ML 訓練記錄（Claude 維護） |
| `TECHNICAL_OVERVIEW.md` | 架構總覽 |
| `DESIGN_SYSTEM.md` | UI 設計規範 |
| `signalpilot/` | SignalPilot Worker 程式碼 |
| `schema/signalpilot-*.sql` | SignalPilot DB schema |
