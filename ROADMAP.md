# 後續執行計劃（Roadmap）

 統籌兩份詳細文檔：[SIGNAL_IMPROVEMENT.md](SIGNAL_IMPROVEMENT.md)（信號品質）、[UIUX_IMPROVEMENT.md](UIUX_IMPROVEMENT.md)（介面體驗）。

 本文件只講「先做什麼、後做什麼、何時可以對用戶說『可考慮買入』」，細節看上面兩份。

---

## 現況（2026-06-18 更新）

**已完成：**

- Repo 清理（刪 portfolio-era 死代碼）、dark theme
- 信號引擎落地：VIX<22、AVOID_CHOP slope<0.001、previousLabel 用前一日 regime
- maxSignalBars 90→180（解 G1 樣本結構封死）
- HYP-012 ✅：forward return entry 改 next-bar open（執行真實性）
- HYP-007 ✅：breakout/breakdown 改 ATR-normalized（0.5×ATR14，取代固定 0.3%）
- HYP-008 ✅：LONG_SETUP/LONG_CONFIRM 加 EMA200 filter + H52（aboveEma200/nearHigh52w）
- HYP-002 ✅：LONG_CONFIRM regime 放寬至 `!== short_friendly`，RVOL 升至 1.8，CMF 升至 0.1
- HYP-009 ✅：LONG_CONFIRM + SHORT_CONFIRM 加 hysteresis（prior bar 必須在 ladder 內）
- SHORT_SETUP 加 RVOL > 1.5（減少超賣反彈誤觸）
- SHORT_CONFIRM regime 改 `!== long_friendly`（放寬觸發）
- A1 ✅：全部 EXP 從 Stock Research UI 回填 Gate Summary 數據（v2 snapshot 記錄在 SIGNAL_IMPROVEMENT.md）
- A4 ✅：earningsProvider 新增 `fetchHistoricalEarningsMap`；`buildHistoricalSignals` 接入歷史財報日期；replay 信號的 `earningsWithinWindow` 不再一律 null
- A5 ✅：G5 policy 決定維持現況（INSUFFICIENT 容許 PASS）
- Stock Replay tab：完整信號歷史回放（5D/10D win rate、進退場紀錄）
- scripts/signal-winrate.mjs：完整離線勝率驗證腳本（20隻股 2yr 數據）
- 6-gate 統計驗證系統 + Stock Research UI
- 完整研究文檔（SIGNAL_IMPROVEMENT.md 含學術 + Minervini/Weinstein + ML 替代架構）
- B1 ✅：labelDisplay.ts 翻譯層 + 中英雙語 label pills + reason cells + 免責聲明
- B3 ✅：Stock Screener 卡片/列表 toggle（預設卡片模式，顯示 signal pill + RSI/RVOL/RS + reason）
- B5 ✅：Accessibility CSS（font 1.05rem、觸控 44px、形狀編碼、對比度）
- B6 ✅：「? 點睇」Gate 說明面板 + 右下角常駐 help FAB + 3 步入門導覽（localStorage 控制）

**尚未完成（關鍵缺口）：**

- A7（後續）：RS-sector filter（HYP-011）、ATR squeeze（HYP-010）— hysteresis（HYP-009）已落地
- A8：ML 遷移（長期）
- B4：ETF Weekly 卡片化（延後）
- EXP-008：LONG_SETUP 條件收緊（avg5D=-1.0% G2 FAIL，見 KI-009）

---

## 核心整合原則（最重要的一條）

> **UI 的承諾力，不能超過信號的驗證程度。**

兩條軌道可以並行，但有一個硬性的交匯點：

- Simple Mode 把信號翻譯成「🟢 可考慮 / 🟡 先觀察 / 🔴 避開」，對新手和長者來說，「可考慮」近乎一個買入暗示。
- 但目前**沒有任何 label 通過 6-gate 驗證**。在這個階段對 70 歲長者顯示「可考慮買入」是不負責任的。

**解法 = 用 disclaimer 作橋樑，分階段解鎖措辭：**

| 信號驗證程度 | Simple Mode 可以用的措辭 |
| --- | --- |
| 未通過 gate（現況） | 全程掛「研究階段・參考用，非投資建議」橫額；🟢 用「**值得研究**」而非「可考慮買入」 |
| 部分 label 通過 gate | 只有通過的 label 才升級成「可考慮」；未通過的維持「值得研究」 |
| 多數 label 穩定通過 + walk-forward | 才可以正式對用戶說「可考慮買入」 |

這條原則讓 UIUX 可以馬上開工，又不會在信號還沒驗證時誤導用戶。

---

## 兩條軌道

### Track A — 信號品質（引擎 / 研究）

目標：先讓研究結果**可信**，再讓信號**變好**。順序不能反。

| 階段 | 內容 | 對應 | 為何這個順序 |
| --- | --- | --- | --- |
| A1 | 回填全部 EXP 的現況 Gate Summary，含每個 label 的 neutral regimeSplit n | EXP-001/003/004/005、KI-008 | 連 baseline 都沒有，談不上改善 |
| A2 | 修執行真實性：entry 改 next-open、記錄成本前/後 return | HYP-012 | 否則高估所有 confirm label |
| A3 | 解樣本量封死：加長 `maxSignalBars` / 歷史窗口 | KI-007 | G1 的機械性根因，比調鬆條件更直接 |
| A4 | replay 帶入歷史 earnings，而非一律 null | HYP-013 | 讓 research 與 live 行為一致 |
| A5 | 決定 G5 policy：INSUFFICIENT 是否容許 PASS | KI-008、研究 §6 | gate 設計收尾 |
| A6 | 加 trend-quality filter：H52 / 長均線脈絡 | HYP-008 | 最明顯的設計缺口，對齊 Minervini |
| A7（後） | hysteresis、RS-sector、ATR squeeze | HYP-007/009/010/011 | 研究真實性穩定後才做 |
| A8（長期） | ML 遷移 Stage A→E（先 Qlib baseline + meta-labeling） | 替代架構章節 | 資料層乾淨前不要碰 |

### Track B — 介面體驗（Simple Mode）

目標：讓新手 / 長者「睇得明 + 唔被研究表格嚇親」。可與 Track A 並行。

| 階段 | 內容 | 工程量 |
| --- | --- | --- |
| B1 | `labelDisplay.ts` 翻譯層（代碼→紅綠燈+中文+點解）+ 大市橫額 + disclaimer | 低 |
| B2 | Simple / Advanced 切掣 + localStorage，預設 Simple | 低 |
| B3 | Stock Screener 卡片化（燈號+點解+摺疊技術細節） | 中 |
| B4 | ETF Weekly 卡片化 | 中 |
| B5 | 無障礙規格（字體/對比/觸控/形狀編碼） | 中 |
| B6 | 首次導覽 + 「? 點睇」常駐 | 低 |

---

## 建議時間線

### 第 1-2 週：信號真實性 + UI 地基（並行）

- **Track A：** A1 → A2 →（時間夠就 A3）
  - 必做：回填 Gate Summary（含 neutral n）、entry 改 next-open、記錄成本
- **Track B：** B1 + B2
  - 翻譯層 + 模式切掣，**🟢 一律顯示「值得研究」+ 全程 disclaimer**
- **里程碑：** 有了第一份可信的 baseline 數據；普通人打開 App 不再見到英文代碼和 Gate 表

### 第 3-4 週：研究收尾 + 核心體驗

- **Track A：** A3 → A4 → A5（樣本量、earnings archive、G5 policy）
- **Track B：** B3 + B4（兩個 tab 卡片化）
- **里程碑：** Gate Summary 在較真實的執行假設下成立；Simple Mode 卡片體驗完整

### 第 5 週起：信號變好 + 無障礙打磨

- **Track A：** A6（H52 / 長均線），有通過 gate 的 label 才解鎖「可考慮」措辭
- **Track B：** B5 + B6（無障礙 + 導覽）
- **里程碑：** 首批通過驗證的 label 可正式對用戶說「可考慮」；長者可用

### 長期（資料層穩定後）

- Track A7 / A8：hysteresis、ML 遷移（Qlib baseline → meta-labeling）

---

## 里程碑與「完成」定義

| 里程碑 | Definition of Done |
| --- | --- |
| M1 可信 baseline | 每個 directional label 都有回填的 Gate Summary（含 neutral n、成本前後 return）；缺數據處明確標「缺失」不補猜測 |
| M2 研究真實 | entry=next-open、replay 帶 earnings、樣本量不再被結構封死、G5 policy 已決定 |
| M3 Simple 可用 | 普通人全程看不到英文代碼 / Gate；長者測試能在 3 分鐘內講出「邊隻值得睇、點解」 |
| M4 可負責任地推薦 | 至少數個 label 在 walk-forward 多 window 通過 gate，UI 才解鎖「可考慮買入」 |

---

## 風險與約束

- **單人開發 + 免費 API 限額**（Alpha Vantage 25/day、Polygon 5/min）：擴 universe（A3）受限，要在「加長歷史」與「加股票數」之間權衡；優先加長歷史（不耗額外 API 配額頻次）。
- **不要跳級上 ML**：A8 永遠排在 A1-A6 之後。資料層未乾淨前的 ML 只會放大偏差。
- **UI 不能跑在信號前面**：B 軌可並行，但措辭受核心整合原則約束，未驗證前只准「值得研究」。
- **紀律風險**：本專案最大的隱性風險不是技術，而是「改了 code 卻不回填數據」。每個 EXP 沒有 Gate Summary 就不算完成。

---

## 下一步（立即可做）

1. 開 Stock Research，回填 EXP-001 的現況 Gate Summary（含每個 label 的 neutral n）→ 完成 A1 的第一塊、同時驗證 KI-008
2. 出一個 Codex prompt 做 **B1 + B2**（翻譯層 + 模式切掣 + disclaimer）→ 最低成本讓 UI 立刻變友善
3. A2（entry 改 next-open）可緊接 A1 之後，工程量小、影響大
