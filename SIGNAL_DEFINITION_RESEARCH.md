# Signal Definition Research

> **狀態（2026-06-18）：** 第一輪重設計已完成。舊 LONG_WATCH / LONG_SETUP / LONG_CONFIRM / LONG_PULLBACK / UP_PROMOTION / DOWN_PROMOTION 已廢棄，取而代之為 structure+trigger 兩層架構：WATCH / LONG_BASE / LONG_BREAK / LONG_BOUNCE / LONG_VCP。以下 Signal Matrix 為 v1 歷史分析，保留為改動理由記錄。新 label 的研究問題見文末 Backlog。

---

## 目的

這份文件專門研究「每個 signal 的定義本身是否合理」。

它和 [SIGNAL_IMPROVEMENT.md](/Users/tony/COde/Trading%20ETF/SIGNAL_IMPROVEMENT.md:1) 分工如下：

- `SIGNAL_DEFINITION_RESEARCH.md`：研究 label 定義、概念邊界、是否應拆分 / 合併 / 重寫
- `SIGNAL_IMPROVEMENT.md`：研究既有定義下的 gate 表現、假設實驗、保留或回滾

核心原則：

- 先確認 signal 在概念上是對的，再優化 threshold
- 不把「樣本太少」和「定義錯了」混為一談
- 不把「pooled sample 好看」誤判為 signal 已成熟

---

## 目前研究問題

1. 每個 directional signal 是否真的代表一個清楚、可解釋、可重複的市場狀態？
2. 哪些 signal 是「定義合理但閾值未調好」？
3. 哪些 signal 是「概念本身含混」，應該重寫而不是微調？
4. 哪些 signal 只適合做 research tag / overlay，不應升成主 label？
5. 哪些 signal 在當前資料窗（2024-2026 偏牛市）天然失真，不能直接下結論？

---

## 當前 Gate 參考

最新 gate summary 以 [.cache/research-agent/latest/gate-summary.md](/Users/tony/COde/Trading%20ETF/.cache/research-agent/latest/gate-summary.md:1) 為準。

Gate 的含義：

- `G1`：樣本量 `n >= 100`
- `G2`：方向正確
- `G3`：5D `vs SPY` 有超額
- `G4`：前後半樣本方向一致
- `G5`：neutral regime 仍方向一致
- `G6`：`MAE 5D < 3%`
- `G7`：止損命中率 `< 30%`

注意：

- Gate 是驗證工具，不是 signal 定義本身
- 一個 signal `G1` fail，可能只是樣本太少，不代表概念錯
- 一個 signal `G2/G3/G6` 長期 fail，才更像定義本身有問題

---

## Signal Matrix

### Tier A — 值得保留並優先優化

#### LONG_SETUP

當前定義：

- `close > EMA20`
- `EMA20 slope > 0`
- `RSI > 55`
- `RVOL > 1.2`
- `CMF > 0`
- `relStrengthVsSpy > 0`
- `regime != short_friendly`
- `aboveEma200 != false`

當前 gate 表現：

- `n = 791`
- `G1 PASS`
- `G2 PASS`
- `G3 FAIL`
- `G4 PASS`
- `G5 PASS`
- `G6 FAIL`
- `G7 PASS`

初步判斷：

- 這不像「概念完全錯誤」，比較像「太寬、太早、太容易納入雜訊」
- 最可能的問題不是方向，而是 alpha 不夠強、entry 風險偏高

研究問題：

1. `LONG_SETUP` 應該代表「準備突破」，還是「已出現高質量推進」？
2. `RVOL > 1.2` 是否太寬？
3. `CMF > 0` 是否太弱，無法區分真正主動買盤？
4. 應否加入 trend quality / squeeze / base quality，而不只看單日動量？

下一輪優先方向：

- 先用白名單 knob 收緊，不急著重寫 label

#### LONG_WATCH

當前定義：

- `RSI > 50`
- `MACD histogram > 0`
- `CMF > 0`
- `OBV slope > 0`
- `relStrengthVsSpy > -0.02`
- `regime != short_friendly`

當前 gate 表現：

- `n = 2766`
- `G1 PASS`
- `G2 PASS`
- `G3 FAIL`
- `G4 PASS`
- `G5 PASS`
- `G6 FAIL`
- `G7 PASS`

初步判斷：

- `LONG_WATCH` 像是一個「偏寬的候選池」，不是精準 signal
- 若維持主 label，定義可能過於靠近 `NEUTRAL`，容易吸入噪音

研究問題：

1. `LONG_WATCH` 是否應被重新定位為 ranking bucket，而不是 signal label？
2. `MACD histogram > 0` 是否太容易在震盪市反覆切換？
3. 是否應加 trend persistence / hysteresis，而不是再加更多單點閾值？

下一輪優先方向：

- 優先研究角色定位，而不只是調 threshold

### Tier B — 品質可能不差，但樣本不足

#### LONG_CONFIRM

當前定義：

- `breakout20d = true`
- `RVOL > 1.8`
- `CMF > 0.1`
- `CLV > 0.65`
- `EMA20 > EMA50`
- `RSI > 55`
- `regime != short_friendly`
- `aboveEma200 != false`
- `nearHigh52w != false`
- 且需承接前一日 long ladder

當前 gate 表現：

- `n = 10`
- `G2 PASS`
- `G3 PASS`
- `G6 PASS`
- `G1 FAIL`

初步判斷：

- 問題主要是稀有，不一定是錯
- 它可能比較像「高品質 breakout confirmation」，而不是高頻 label

研究問題：

1. 是否應接受它本來就是低頻高質量 signal？
2. 若要增加樣本，應先放寬哪一個條件，才不會破壞品質？

#### UP_PROMOTION

當前定義：

- `LONG_CONFIRM` 成立
- 且前一日為 `LONG_SETUP`

當前 gate 表現：

- `n = 16`
- `G2 PASS`
- `G3 PASS`
- `G6 FAIL`
- `G1 FAIL`

初步判斷：

- 更像狀態遞進標籤，不像獨立 signal

研究問題：

1. `UP_PROMOTION` 應否保留為研究 label，而非主展示 label？
2. 它是否應直接併入 `LONG_CONFIRM` 的 sub-state？

#### LONG_VCP

當前定義：

- `aboveEma200 = true`
- `atrSlope50 < 0`
- `rvolRecentAvg10 < 0.8`
- `breakout20d = true`
- `RVOL > 1.5`
- `regime != short_friendly`

當前 gate 表現：

- `n = 9`
- 目前樣本不足，無法下結論

初步判斷：

- 很像正確方向的 pattern research，但尚未成熟

研究問題：

1. 它是否應維持 `research variant`，不要急著升 production？
2. 是否需擴 universe / 拉長歷史才有評估價值？

### Tier C — 優先重想定義，而不是微調

#### LONG_PULLBACK

當前定義：

- `regime = long_friendly`
- `EMA50 slope > 0`
- `low <= EMA20 * 1.02`
- `RSI 40-50`
- `CLV > 0.8`
- `aboveEma200 != false`

當前 gate 表現：

- `n = 82`
- `G2 FAIL`
- `G3 FAIL`
- `G4 FAIL`
- `G6 FAIL`

初步判斷：

- 這不像純閾值問題，更像「pullback 概念沒有被正確抓到」
- 目前定義可能把太多弱反彈、脆弱承接、非趨勢回踩都混進來

研究問題：

1. Pullback 應否要求更強的 trend context？
2. 只看 `low` 靠近 `EMA20` 是否過於粗糙？
3. 是否應加入 prior thrust、drawdown depth、bounce quality、volume dry-up？
4. 這個 label 是否應拆成 `shallow pullback` / `deep pullback`？

下一輪優先方向：

- 先重寫概念草圖，再談 gate 修復

### Tier D — 暫不優先，避免在牛市樣本上過度優化

#### SHORT_WATCH / SHORT_SETUP / SHORT_CONFIRM / DOWN_PROMOTION

當前定義：

- 都屬於 short ladder
- 主要由 `close < EMA20`、`RSI 弱`、`MACD 弱`、`CMF 弱`、`breakdown20d` 等條件構成

當前 gate 表現：

- 整體 `G2/G3/G6` 普遍失敗
- 現有資料窗偏牛市，short side 結果天然扭曲

初步判斷：

- 目前不適合投入大量微調時間
- 應先當作 regime-sensitive module，而不是全面優化主線

研究問題：

1. short ladder 是否應只在 `short_friendly` regime 下研究？
2. 是否需要獨立資料窗或熊市樣本再評估？

---

## 跨 Signal 問題

### 1. Label 是否混合了「狀態」與「動作」

目前部分 label 更像：

- `LONG_WATCH`：狀態 / 候選池
- `LONG_SETUP`：接近行動
- `LONG_CONFIRM`：確認
- `UP_PROMOTION`：狀態遞進

研究問題：

- 應否把「狀態 label」與「交易 signal」拆開？

### 2. Label 是否過度依賴單日條件？

很多規則仍偏單日 snapshot。

研究問題：

- 是否應引入更明確的 multi-bar context？
- 是否應加入 hysteresis / persistence，避免 label 抖動？

### 3. 主 label 與 research flag 的邊界

目前已有：

- `BASE_BREAK`
- `DISTRIBUTION_WARNING`

研究問題：

- 哪些概念應該永遠先做 flag，而不是直接升為主 signal？

---

## 研究方法

每次研究 signal 定義，先回答四個問題：

1. 它想捕捉的市場現象是什麼？
2. 現有條件是否真的對應那個現象？
3. 它與相鄰 labels 的邊界是否清楚？
4. 它失敗時，像是 threshold 太鬆，還是概念本身錯了？

建議流程：

1. 先看 signal 定義
2. 再看 pooled gate
3. 再看 rolling robustness
4. 再決定是：
   - 微調 threshold
   - 拆 label
   - 合併 label
   - 降級成 research flag
   - 暫時凍結

---

## 下一步 Backlog（v2 新設計研究問題）

**v1 任務已完成（2026-06-18）**：LONG_WATCH/LONG_SETUP/LONG_PULLBACK 角色問題已通過重新設計解決。

**v2 新 label 待研究**：

- [ ] **LONG_BASE**：`atrSlope50 < 0 OR rvolRecentAvg10 < 0.8` 應改為 AND 嗎？RSI 45-65 bound 是否合適？
- [ ] **LONG_BOUNCE**：`recentPullbackNearEma20`（5 日回看）是否有效捕捉真實回調？應否加 volume 萎縮條件？
- [ ] **LONG_BREAK**：RVOL > 1.8 在新設計下樣本會否太少？是否調至 1.5？
- [ ] **WATCH**：作為 universe filter，方向性是否應有更低的 noise floor（例如要求 ema20 > ema50）？
- [ ] **Short ladder**：研究條件是否應限制在 `short_friendly` regime 才有意義？
- [ ] **LONG_VCP**：與 LONG_BASE + LONG_BREAK 的重疊程度如何？是否仍需獨立 label？
