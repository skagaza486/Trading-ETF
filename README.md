# Trading ETF

研究階段的 ETF 與股票 signal app。核心方向是 `real-data-first`、`explainable rule-based signals`、以及「研究驗證先於 UI 承諾」。

## Setup

```bash
npm install
cp .env.local.example .env.local   # 填入 FINNHUB_API_KEY（可選，只影響 earnings 資料）
npm run dev
```

**注意：** 所有 `research:*` 指令使用 `.tools/node-v22.22.3-darwin-arm64/bin/node`（repo 內附帶），不依賴系統 Node 版本。`FINNHUB_API_KEY` 不填則 earnings 欄位為空，其他功能正常。`.env.local` 不應 commit 至 git（已列入 `.gitignore`）。

## Repo Map

根目錄保留三份主文檔：

- `ROADMAP.md` — 產品與研究優先級，作為目前階段的規劃主入口。
- `SIGNAL_IMPROVEMENT.md` — signal 研究、gate 驗證、假設與實驗紀錄的唯一主文件。
- `TECHNICAL_OVERVIEW.md` — 現行系統架構、資料流、engine 分工與執行方式。

輔助文檔集中於 `docs/`：

- `docs/ui/UI_DESIGN.md` — UI 1.0 設計說明與結構原則。
- `docs/ui/UI_COPY_KEYS.md` — UI 文案 key 與中英命名對照。
- `docs/ui/UI_QA_FLOW.md` — 人手 QA screening 流程（每次 UI 改動後參考）。
- `docs/ui/FUTU_NAV_REFERENCE.md` — 富途 app 的資訊架構參考，偏結構與導航。
- `docs/ui/HEADLESS_UI_SMOKE_TEST_PLAN.md` — Playwright 煙霧測試規劃稿。

主要程式碼：

- `src/` — React UI、純計算 engine、型別、樣式與資料定義。
- `scripts/` — 研究 agent、同步工具、plateau runner 等離線工具。
- `tests/ui/` — Playwright UI smoke tests（layout / navigation / Quant Lab）。
- `worker.ts` — Cloudflare Worker proxy 與產線入口。
- `functions/api/` — Cloudflare Pages Functions stub（Yahoo / Finnhub proxy，待 B1 架構啟用）。

## Common Commands

```bash
# 開發
npm run dev                                 # Vite dev server（含 Yahoo/Finnhub proxy）
npm run build                               # TypeScript type-check + Vite prod build
npm run typecheck                           # 只跑 tsc，不 build

# UI QA（Playwright smoke tests）
npm run ui:qa                               # headless，CI 用
npm run ui:qa:headed                        # 有 browser，debug 用

# Research Agent（gate 驗證 + 自動回填 SIGNAL_IMPROVEMENT.md）
npm run research:agent                      # 標準執行：sync + 回填文檔
npm run research:agent -- --no-sync-docs    # dry-run：只寫 artifacts，不改文檔
npm run research:agent -- --mode diagnose   # 額外打印 per-label 診斷建議
npm run research:sync-exp009                # 舊版單次同步（已被 research:agent 取代）
```

## Research Agent（自動 Gate Summary 回填）

`scripts/researchAgent.ts` 是離線研究工具，負責：

1. 從 Yahoo Finance 拉取全 watchlist + benchmark（SPY/QQQ/IWM/VIX/GLD）最新 2 年歷史
2. 執行 `buildHistoricalSignals` → 產生過去 250 bars 的 signal 序列
3. 執行 `evaluateAllGates` → 計算各 label 的 gate 數字（n、avg 5D、vs SPY、MAE、G1~G7）
4. 執行 `evaluateRollingWindowRobustness` → 滾動視窗穩健性驗證
5. **自動回填 `SIGNAL_IMPROVEMENT.md`** 中對應 EXP section 的 Gate Summary 表格、結論、下一步
6. 將所有 artifacts 寫入 `.cache/research-agent/latest/`，並存入 `.cache/research-agent/history/<runId>/`

### 輸出 Artifacts

| 檔案 | 內容 |
| --- | --- |
| `.cache/research-agent/latest/gate-summary.md` | 所有 label 的 gate table（最新 run） |
| `.cache/research-agent/latest/rolling-robustness.md` | 滾動視窗 G2/G3/G6/full-pass 統計 |
| `.cache/research-agent/latest/diagnosis.md` | per-label 診斷建議（diagnose mode） |
| `.cache/research-agent/latest/research-report.json` | 完整 gate + robustness 結構化資料 |

### 指令參數

| 參數 | 說明 |
| --- | --- |
| `--mode observe` | 預設；執行 gate 計算 + 寫 artifacts + 回填文檔 |
| `--mode diagnose` | 同上，額外在 stdout 打印 per-label 診斷建議 |
| `--exp EXP-009` | 指定 experiment（目前只支援 EXP-009） |
| `--no-sync-docs` | 跳過回填 SIGNAL_IMPROVEMENT.md（dry-run） |

### AI 工作流程說明

每次假設改動（新 HYP 落地）後，執行 `npm run research:agent` 即可取得最新 gate 數字，結果自動寫入 `SIGNAL_IMPROVEMENT.md` 對應 EXP section。不需要人手填寫表格。診斷時用 `--mode diagnose` 查看 per-label 問題分析。實作在 `scripts/researchAgent.ts`，engine 邏輯在 `src/engine/researchGate.ts`。

## UI QA

UI 改動後的驗證分兩層：

1. **Playwright smoke tests**（`npm run ui:qa`）：自動化，驗證 layout 安全、tab 切換、Quant Lab 基本流程。CI 用 headless，debug 用 `ui:qa:headed`。
2. **人手 QA 流程**（`docs/ui/UI_QA_FLOW.md`）：涵蓋視覺細節、ETF ranking 顯示、signal card 內容等 Playwright 無法機械驗證的部分。每次 UI 大改後應對照執行。

## Deployment

```bash
npx wrangler deploy   # 部署至 Cloudflare Worker（需 wrangler login）
npm run build         # 先確認 build 無錯再 deploy
```

`wrangler.toml` 設定在根目錄，指向 `worker.ts` 作為 Worker 入口，`dist/` 作為 static assets。

## Working Rules

- 研究與產品方向先看 `ROADMAP.md`
- signal / gate 問題先看 `SIGNAL_IMPROVEMENT.md`
- UI 命名與結構先看 `docs/ui/`
- gate 數字驗證跑 `npm run research:agent`，不要人手回填
- UI 改動後跑 `npm run ui:qa`，視覺細節對照 `docs/ui/UI_QA_FLOW.md`
- 若文檔與實作不一致，以當前 code 為準，再回寫文檔
