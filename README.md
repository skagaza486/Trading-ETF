# Trading ETF

研究階段的 ETF 與股票 signal app。核心方向是 `real-data-first`、`explainable rule-based signals`、以及「研究驗證先於 UI 承諾」。

## Repo Map

根目錄保留三份主文檔：

- `ROADMAP.md`
  產品與研究優先級，作為目前階段的規劃主入口。
- `SIGNAL_IMPROVEMENT.md`
  signal 研究、gate 驗證、假設與實驗紀錄的唯一主文件。
- `TECHNICAL_OVERVIEW.md`
  現行系統架構、資料流、engine 分工與執行方式。

輔助文檔集中於 `docs/`：

- `docs/ui/UI_DESIGN.md`
  UI 1.0 設計說明與結構原則。
- `docs/ui/UI_COPY_KEYS.md`
  UI 文案 key 與中英命名對照。
- `docs/ui/FUTU_NAV_REFERENCE.md`
  富途 app 的資訊架構參考，偏結構與導航，不是視覺照抄。
- `docs/ui/UI_QA_FLOW.md`
  UI smoke / screening 流程。
- `docs/ui/HEADLESS_UI_SMOKE_TEST_PLAN.md`
  UI 自動化煙霧測試的原始規劃稿。

主要程式碼：

- `src/`
  React UI、純計算 engine、型別、樣式與資料定義。
- `scripts/`
  研究同步、研究 agent、plateau runner 等離線工具。
- `tests/ui/`
  Playwright UI smoke tests。
- `worker.ts`
  Cloudflare Worker proxy 與產線入口。

## Common Commands

```bash
npm run dev
npm run build
npm run ui:qa
npm run research:sync-exp009
npm run research:agent
```

## Working Rules

- 研究與產品方向先看 `ROADMAP.md`
- signal / gate 問題先看 `SIGNAL_IMPROVEMENT.md`
- UI 命名與結構先看 `docs/ui/`
- 若文檔與實作不一致，以當前 code 為準，再回寫文檔
