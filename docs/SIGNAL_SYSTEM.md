# Signal System Overview

完整描述 App 的信號分類邏輯、Regime 系統、及 ETF 評級體系。

---

## 一、市場 Regime

所有股票信號均受 Regime 過濾。Regime 由以下五個輸入每日計算：

| 輸入 | 來源 |
| --- | --- |
| SPY / QQQ > EMA50 | 大市結構 |
| VIX 水平 | 恐慌指數 |
| RSP > EMA50 | 等權重 S&P 500（breadth proxy） |
| 2800.HK > EMA200 | 港股結構（全球風險偏好） |
| GLD > EMA200 | 黃金趨勢 |

**輸出三態：**

| Regime | 條件 | 對股票信號的影響 |
| --- | --- | --- |
| `long_friendly` | VIX < 22，SPY + QQQ 均 > EMA50 | Long 信號正常觸發 |
| `short_friendly` | VIX > 28，或 SPY / QQQ / 港股 有 ≥ 2 個跌破 EMA | 屏蔽所有 Long 信號；Short 信號啟用 |
| `neutral` | 介乎兩者 | Long 信號謹慎觸發（部分條件仍要求 long_friendly） |

**額外 flag：`proxyWeakBreadth`**
— SPY > EMA50 但 RSP < EMA50（大市漲但廣度弱），作為 warning overlay，不改變 Regime 狀態。

---

## 二、股票信號（StockSignalLabel）

### 信號架構

信號分兩層：

- **Entry Triggers**：今日可考慮進場
- **Universe Filters**：候選池，等待 trigger 出現

```text
Entry Triggers   →  LONG_BREAK · LONG_VCP · LONG_BOUNCE
                     SHORT_BREAK
Universe Filters →  LONG_BASE · WATCH
                     SHORT_BASE · SHORT_WATCH
Neutral/Review   →  NEUTRAL · AVOID_CHOP · REVIEW_DATA · REVIEW_EVENT
```

---

### Long Entry Triggers

#### LONG_BREAK — 突破進場

量價突破，需要先有 base 鋪墊。

| 條件 | 說明 |
| --- | --- |
| `breakout20d` | 收盤突破 20 日高位（加 0.5 ATR 緩衝） |
| RVOL > 1.6 | 成交量放大（相對 20 日均量） |
| CMF > 0.1 | 資金流入確認 |
| CLV > 0.65 | 收盤位置偏高（非虛假突破） |
| EMA20 > EMA50 | 短期趨勢向上 |
| EMA50 > EMA150 | 中期趨勢對齊（null-safe） |
| RSI 14 > 55 | 動量夠強 |
| 近 52 周高位 | 突破有意義 |
| Above EMA200 | 長期趨勢正確 |
| `priorBaseStreak >= 2` | 過去 5 日有 ≥ 2 日低量（base 積累） |
| `extendedFromPivot != true` | 未從樞紐超漲 >5%（非追高） |
| Regime ≠ short_friendly | 大市環境許可 |
| previousLabel 在 Long 梯形內 | 防止單日脈衝突破（需先有 WATCH/BASE/BOUNCE 等背景） |

#### LONG_VCP — 波動收縮形態

Minervini VCP：趨勢中的遞減收縮，breakout 當日確認。

| 關鍵條件 | 說明 |
| --- | --- |
| `atrSlope50 < 0` | ATR 過去 50 日呈下降（收縮結構） |
| `rvolRecentAvg10 < 1.0` | 近 10 日均量低（安靜蓄勢） |
| `breakout20d` + RVOL > 1.5 | 今日突破放量 |
| CLV > 0.6 | 收盤質量佳 |
| RSI > 50，EMA20 > EMA50，近高位，Above EMA200 | 趨勢背景完整 |

#### LONG_BOUNCE — EMA20 回踩反彈

回調至 EMA20 後今日收復，適合趨勢中段的 add-on 進場。

| 關鍵條件 | 說明 |
| --- | --- |
| Regime = `long_friendly` | 嚴格要求牛市環境 |
| `recentPullbackNearEma20` | 過去 5 日有近 EMA20 的回踩 |
| `close > EMA20` | 今日收復 EMA20 |
| RSI 42–58（T1: 46–58） | 回調不過深，未超買 |
| CLV > 0.6 | 收盤質量 |
| `pullbackRvolAvg < 1.2`（T1: < 0.9） | 回調過程低量（健康回調，非派發） |
| RS vs SPY > 0（T1: > 2%） | 相對強度正面 |

**Tier 差異：** T1 成長股條件更嚴（更高 RSI 下限、更低 RVOL 容忍），因為 T1 股票波動較大，假訊號更多。

---

### Short Entry Triggers（凍結觀察中）

> 2024–2026 牛市樣本不足以驗證 Short 信號效力，條件已設計但暫不主動使用。

| 信號 | 觸發條件概述 |
| --- | --- |
| SHORT_BREAK | 跌破 20 日低位，RVOL > 1.5，CMF < -0.05，CLV < 0.35，EMA20 < EMA50，RSI < 45，前一日在 Short 梯形內，Regime ≠ long_friendly |

---

### Universe Filters

#### LONG_BASE — 高質候選池

結構完整 + 壓縮形成，等待 trigger。**不是進場信號。**

- Above EMA200，EMA20 > EMA50，EMA50 slope > 0
- RS vs SPY > 0，RSI 45–65
- ATR 下降 或 近期均量 < 0.8（壓縮跡象）
- Regime ≠ short_friendly

#### WATCH — 動量觀察

動量建立中，方向正面，未達 LONG_BASE 標準。**不是進場信號。**

- RSI > 50，MACD histogram > 0，CMF > 0，OBV slope > 0
- RS vs SPY > -2%
- `rsiSlope3 > 0`（RSI 近 3 日向上，null-safe）
- Regime ≠ short_friendly

#### SHORT_BASE / SHORT_WATCH

Short 的候選池，邏輯對應 LONG_BASE / WATCH 的空方版本。

---

### 特殊標籤

| 標籤 | 含義 |
| --- | --- |
| AVOID_CHOP | RSI 45–55 + 極低 RVOL + EMA20 slope 接近零，無方向震盪 |
| NEUTRAL | 以上條件均不滿足的預設狀態 |
| REVIEW_DATA | 缺少必要 indicators（資料不足） |
| REVIEW_EVENT | 財報窗口內（避免事件風險） |

---

### 關鍵 Indicators 一覽

| Indicator | 用途 |
| --- | --- |
| EMA20 / EMA50 / EMA150 / EMA200 | 趨勢結構 |
| RSI 14 | 動量強弱 |
| RVOL | 當日量比（相對 20 日均量） |
| CMF20 | 資金流向（Chaikin Money Flow） |
| CLV | 收盤位置值（0=低位，1=高位） |
| OBV slope | 累積成交量趨勢 |
| MACD histogram | 動量方向 |
| ATR | 波動性（止損參考） |
| RS vs SPY（63d） | 相對強度 vs 大市 |
| EMA20 slope | 短期加速度 |
| atrSlope50 | ATR 趨勢（VCP 收縮判斷） |
| rvolRecentAvg10 | 近 10 日均量（低量壓縮判斷） |
| recentPullbackNearEma20 | 近 5 日有無貼近 EMA20 的回踩 |
| pullbackRvolAvg | 回踩期間的平均量比 |
| priorBaseStreak | 過去 5 日中低量日數（base 積累深度） |
| extendedFromPivot | 是否已從樞紐超漲 > 5% |
| nearHigh52w | 是否靠近 52 周高位 |
| aboveEma200 | 是否在長期趨勢之上 |
| rsiSlope3 | RSI 近 3 日斜率 |
| breakout20d / breakdown20d | 突破 / 跌破 20 日高低位 |

---

## 三、ETF 評級（ETFLabel）

ETF 使用**週線**邏輯，評級週期為每週。

### 評級輸出

| 評級 | 含義 |
| --- | --- |
| FAVOUR | 強勢，可優先配置 |
| WATCH | 結構正面，可觀察 |
| WAIT | 中性，暫時等待 |
| AVOID | 弱勢，避免 |

### 基本評級條件

**FAVOUR：**

- 收盤 > 10 周均線 且 > 40 周均線
- 13 周回報 > 0
- 10 周均線斜率 > 0 或 26 周回報 > 0
- RS vs SPY > 0 且 RS slope > 0

**AVOID：**

- 收盤 < 40 周均線
- 13 周 + 26 周回報均 ≤ 0
- RS vs SPY ≤ 0

**WATCH：** 收盤 ≥ 10 周均線的 99%，且動量指標有至少一個為正

**WAIT：** 以上均不滿足

### Regime 降級

在 `short_friendly` 環境下：

- FAVOUR → WAIT
- WATCH → WAIT

Safe Haven 類（GLD / SGOV / SHY / IEF / TLT 等）不受 Regime 降級影響。

### 排名 Score（FAVOUR / WATCH 內部排序）

```text
riskAdjustedMomentum = (return13w − SGOV return13w) / volatility13w
```

用於在同等評級內排序，優先顯示風險調整後動量更強的板塊。

---

## 四、信號質量基準（2026-06-19，299 stocks，2yr backtest）

| Signal | n | Avg5D | vs SPY | WinRate5D |
| --- | --- | --- | --- | --- |
| LONG_BOUNCE T1 | 86 | +1.57% | +1.09% | 64% |
| LONG_BOUNCE T2 | 366 | +0.67% | +0.48% | 53% |
| LONG_BOUNCE 整體 | 452 | +0.84% | +0.60% | 55% |
| LONG_VCP | 50 | +0.54% | +0.34% | 52% |
| LONG_BASE | 2886 | +0.42% | +0.15% | 53% |
| LONG_BREAK | ~17 | +2.5% | +2.3% | — |

**已知限制：**

- LONG_BREAK n 不足（~17）：需要 S&P 500 universe（B1 架構）才能解決，非條件問題
- LONG_BOUNCE MAE ~3.0%：mean-reversion trade 的結構性特徵，entry filter 無法消除，以 position sizing 控制

---

## 五、架構說明

```text
signalClassifier.ts     — 純函數，inputs → label，無副作用
stockScreenerEngine.ts  — 計算所有 indicators，呼叫 classifier
marketRegime.ts         — 計算 Regime 和 proxyWeakBreadth
etfWeeklyEngine.ts      — ETF 週線評級和 risk-adjusted score
```

**資料流（B1+B2 完成後，2026-06-19）：**

```text
Yahoo Finance（每日）
  → GitHub Actions snapshot.yml（21:30 UTC Mon-Fri；Worker cron 已移除）
      → 計算 indicators + RS rank（stockScreenerEngine）
      → 呼叫 signalClassifier → 寫入 KV（daily snapshot，含 label）
      → 寫入 D1 signals 表（label + indicators）
      → settleForwardReturns：回填過去 15 天的 ret5d/ret10d
      → writeGateSnapshotsToD1：寫 gate aggregate 行

Stocks tab（瀏覽器）
  → GET /api/snapshot/latest → KV → StockSnapshotEntry[]
  → 純 renderer，直接顯示 label（不做 client-side 分類）

Verify tab（瀏覽器）
  → GET /api/d1/signals?days=365 → D1 → ForwardReturnRecord[]
  → gate evaluation + robustness → 顯示

ETF tab（瀏覽器，仍為 live fetch）
  → GET /api/yahoo/... → etfWeeklyEngine → 顯示
```
