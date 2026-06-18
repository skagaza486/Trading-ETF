# UI QA Flow

本文件定義 `UI 1.0` 的自動化 UI screening flow。

## 1. 目標

這套 flow 用來自動抓出：

- 主頁 render failure
- 主 tab / Verify sub-tab 切換失效
- onboarding / help dialog 阻擋
- horizontal overflow
- 主要 card / table 結構失效

它是 smoke-level UI QA，不是完整 E2E。

## 2. 技術棧

- `@playwright/test`
- mocked `/api/yahoo` route
- mocked `/api/finnhub` route
- `vite preview` 作為待測 app server

## 3. 固定覆蓋範圍

主導航：

- `Home / 總覽`
- `Stocks / 股票`
- `ETF`
- `Verify / 驗證`

Verify 子導航：

- `ETF Check`
- `Stock Check`
- `Signal Proof`

## 4. 現有測試檔

- `tests/ui/navigation.smoke.spec.ts`
- `tests/ui/verify.smoke.spec.ts`
- `tests/ui/layout.smoke.spec.ts`

## 5. 執行方式

標準 headless smoke：

```bash
export PATH="$PWD/.tools/node-v22.22.3-darwin-arm64/bin:$PATH"
npm run ui:qa
```

需要有 browser 視窗時：

```bash
export PATH="$PWD/.tools/node-v22.22.3-darwin-arm64/bin:$PATH"
npm run ui:qa:headed
```

## 6. 流程

每次 QA flow 會：

1. build app
2. 啟動 `vite preview`
3. 以 mocked market data 載入 UI
4. 跑 desktop / mobile 兩組 Playwright project
5. 在 failure 時保留 trace 與 screenshot

## 7. Mock 策略

為了讓 smoke 穩定，UI QA 不直接依賴即時 Yahoo / Finnhub 成功率。

mock 來源：

- `tests/ui/helpers/mockMarketData.ts`

這樣做的原因：

- 避免 rate limit 令 UI QA 失真
- 避免真實 API 延遲把 layout smoke 變成 flaky test
- 讓 render 結果更可重現

## 8. 後續擴充

下一步可以加：

- screenshot baseline
- visual diff
- CI workflow
- failure artifact upload
- live data sanity smoke
