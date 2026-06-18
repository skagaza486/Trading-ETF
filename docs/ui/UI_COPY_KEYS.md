# UI Copy And Key Map

本文件整理目前 UI 的中英對照、建議 key 命名，以及未來改名時可沿用的命名規則。

用途：

- 溝通時有統一術語
- 之後改文案時可先改 key 再改展示文字
- 未來若接正式 i18n，可以直接把這份文檔轉成字典結構

## 1. 使用原則

### 1.1 Key 命名原則

建議採用：

- 全小寫
- `.` 分層
- 名稱先講區域，再講用途，再講欄位

格式：

```txt
{area}.{section}.{field}
```

例子：

```txt
dashboard.action_radar.title
stocks.live_signals.title
quant.stock_research.gate_summary.title
signal.stock.long_break.label_zh
```

### 1.2 文案欄位建議

每個 key 最常用的欄位類型：

- `title`
- `subtitle`
- `description`
- `label`
- `note`
- `empty`
- `cta`
- `badge`

### 1.3 命名分層建議

建議分成以下 namespace：

- `nav`
- `page`
- `dashboard`
- `stocks`
- `etfs`
- `quant`
- `signal.stock`
- `signal.etf`
- `research.flag`
- `status`
- `help`
- `onboarding`

## 2. UI 1.0 Canonical Naming

以下命名視為 `UI 1.0` 正式用字：

- `Pulse`
- `Home / 總覽`
- `Stocks / 股票`
- `ETF`
- `Verify / 驗證`

## 3. 全域導航與頁面級文案

| Key | English | 中文 |
| --- | --- | --- |
| `brand.name` | Pulse | Pulse |
| `nav.home` | Home | 總覽 |
| `nav.stocks` | Stocks | 股票 |
| `nav.etf` | ETF | ETF |
| `nav.verify` | Verify | 驗證 |
| `page.home.title` | Home / 總覽 | Home / 總覽 |
| `page.home.helper` | Market overview, top signals, sector leaders. | 市場總覽、今日焦點與板塊快覽。 |
| `page.stocks.title` | Stocks / 股票 | Stocks / 股票 |
| `page.stocks.helper` | Live stock signals and tactical scanning. | 即時股票信號與戰術掃描。 |
| `page.etf.title` | ETF | ETF |
| `page.etf.helper` | ETF rotation and sector strength. | 板塊與 ETF 強弱輪動。 |
| `page.verify.title` | Verify / 驗證 | Verify / 驗證 |
| `page.verify.helper` | Replay, validation, and rule proof. | 回看、驗證與規則證明。 |

註：

- `page.*.title` 是產品級命名，未來如果想把整體語氣由 `App` 改成 `Command Centre`，優先改這組。

## 4. Home 區塊文案

| Key | English | 中文 |
| --- | --- | --- |
| `dashboard.hero.metric.favour_etfs` | Favour ETFs | 值得留意 ETF |
| `dashboard.hero.metric.active_long` | Active Long | 今日升勢焦點 |
| `dashboard.hero.metric.avoid_etfs` | Avoid ETFs | 走勢偏弱 ETF |
| `dashboard.regime.title` | Regime Hero | 大市基調 |
| `dashboard.regime.long` | Long-friendly Regime | 大市穩健 |
| `dashboard.regime.neutral` | Neutral Regime | 中性觀望 |
| `dashboard.regime.short` | Short-friendly Regime | 市況偏弱 |
| `dashboard.regime.breadth_warning` | Breadth Warning | 廣度偏弱警示 |
| `dashboard.action_radar.title` | Action Radar | 今日焦點信號 |
| `dashboard.action_radar.description` | Strongest and weakest signals from Stock Screener | 從 Stock Screener 過濾最強及最弱信號 |
| `dashboard.action_radar.attack` | Attack | 攻擊 |
| `dashboard.action_radar.defend` | Defend | 防禦 |
| `dashboard.action_radar.attack_note` | Long confirmations | 升勢確認 |
| `dashboard.action_radar.defend_note` | Weakness to avoid | 弱勢迴避 |
| `dashboard.action_radar.empty_attack` | No strong confirmations today | 今日暫無強確認信號 |
| `dashboard.action_radar.empty_defend` | No confirmed weakness today | 今日暫無弱勢確認信號 |
| `dashboard.action_radar.load_cta` | Load Stock Signals | 載入股票信號 |
| `dashboard.sector_snapshot.title` | Sector Snapshot | 板塊快覽 |
| `dashboard.sector_snapshot.description` | Top favour and bottom avoid ETFs | 從 ETF Weekly 提取 FAVOUR top 3 / AVOID bottom 3 |
| `dashboard.sector_snapshot.favour` | Favour | 強勢板塊 |
| `dashboard.sector_snapshot.avoid` | Avoid | 弱勢板塊 |

## 5. Stocks 區塊文案

| Key | English | 中文 |
| --- | --- | --- |
| `stocks.status.title` | Stock Screener | 股票信號 |
| `stocks.status.universe` | Universe | 股票池 |
| `stocks.status.long_bias` | Long Bias | 升勢偏向 |
| `stocks.status.short_bias` | Short Bias | 跌勢偏向 |
| `stocks.status.earnings` | Earnings | 財報風險 |
| `stocks.status.updated` | Updated | 更新時間 |
| `stocks.summary.long_labels` | Long Labels | 升勢 |
| `stocks.summary.short_labels` | Short Labels | 跌勢 |
| `stocks.summary.neutral` | Neutral | 中性 |
| `stocks.summary.review` | Review | 待確認 |
| `stocks.live_signals.title` | Live Signals | 即時信號 |
| `stocks.live_signals.description` | First-pass tactical labels from daily OHLCV | 由日線 OHLCV 計算的第一層戰術信號 |
| `stocks.live_signals.view.cards` | Cards | 卡片 |
| `stocks.live_signals.view.table` | Table | 列表 |
| `stocks.live_signals.refresh_cta` | Refresh Screener | 重新整理 Screener |
| `stocks.card.featured` | Featured Focus | 今日焦點 |
| `stocks.card.earnings_prefix` | Earnings | 財報 |
| `stocks.metric.rsi` | RSI | RSI |
| `stocks.metric.rvol` | RVOL | RVOL |
| `stocks.metric.rs_vs_spy` | RS vs SPY | 相對 SPY 強弱 |

## 6. ETF 區塊文案

| Key | English | 中文 |
| --- | --- | --- |
| `etfs.summary.favour` | Favour | 值得留意 |
| `etfs.summary.watch` | Watch | 留意觀望 |
| `etfs.summary.avoid` | Avoid | 避開 |
| `etfs.summary.review` | Review | 資料不足 |
| `etfs.weekly.title` | ETF Weekly | ETF 週度觀察 |
| `etfs.weekly.description` | Latest completed-history classification | 以最新完整歷史資料計算的 ETF 分類 |
| `etfs.weekly.view.cards` | Cards | 卡片 |
| `etfs.weekly.view.table` | Table | 列表 |
| `etfs.weekly.refresh_cta` | Refresh Live Data | 重新整理即時資料 |
| `etfs.weekly.metric.return_13w` | 13W Return | 13 週回報 |
| `etfs.weekly.metric.price_vs_40w` | Price / 40W MA | 價格 / 40 週均線 |
| `etfs.weekly.metric.rank_score` | Rank Score | 排名分數 |

## 7. Verify 區塊文案

### 6.1 Sub-tabs

| Key | English | 中文 |
| --- | --- | --- |
| `quant.nav.etf_replay` | ETF Replay | ETF 回放 |
| `quant.nav.stock_replay` | Stock Replay | 個股回放 |
| `quant.nav.stock_research` | Stock Research | 信號驗證 |

### 6.2 ETF Replay

| Key | English | 中文 |
| --- | --- | --- |
| `quant.etf_replay.title` | ETF Replay | ETF 回放 |
| `quant.etf_replay.selector` | Replay Ticker | 回放標的 |
| `quant.etf_replay.refresh_cta` | Refresh Live Data | 重新整理即時資料 |
| `quant.etf_replay.metric.favour_beat_spy_1w` | Favour Beat SPY 1W | Favour 跑贏 SPY 1 週 |
| `quant.etf_replay.metric.favour_beat_spy_4w` | Favour Beat SPY 4W | Favour 跑贏 SPY 4 週 |
| `quant.etf_replay.metric.favour_vs_avoid_1w` | Favour vs Avoid 1W | Favour 對 Avoid 1 週 |
| `quant.etf_replay.metric.favour_vs_avoid_4w` | Favour vs Avoid 4W | Favour 對 Avoid 4 週 |

### 6.3 Stock Replay

| Key | English | 中文 |
| --- | --- | --- |
| `quant.stock_replay.title` | Signal History | 個股信號歷史 |
| `quant.stock_replay.selector` | Stock Ticker | 股票代號 |
| `quant.stock_replay.refresh_cta` | Refresh | 重新整理 |
| `quant.stock_replay.summary.long` | Long Signals | 升勢信號 |
| `quant.stock_replay.summary.short` | Short Signals | 跌勢信號 |
| `quant.stock_replay.summary.long_avg` | Long Average Return | Long 平均回報 |
| `quant.stock_replay.summary.short_avg` | Short Average Return | Short 平均回報 |
| `quant.stock_replay.table.title` | All Signals | 歷史記錄 |
| `quant.stock_replay.expand` | Expand | 展開 |
| `quant.stock_replay.collapse` | Collapse | 收起 |

### 6.4 Stock Research

| Key | English | 中文 |
| --- | --- | --- |
| `quant.stock_research.title` | Stock Research | 信號驗證 |
| `quant.stock_research.metric.records` | Records | 研究樣本 |
| `quant.stock_research.metric.long_signals` | Long Signals | 升勢信號 |
| `quant.stock_research.metric.short_signals` | Short Signals | 跌勢信號 |
| `quant.stock_research.metric.long_excess_5d` | Long Excess 5D | 升幅超大市 |
| `quant.stock_research.metric.short_excess_5d` | Short Excess 5D | 跌幅超大市 |
| `quant.stock_research.metric.dataset_window` | Dataset Window | 樣本窗口 |
| `quant.stock_research.metric.universe` | Universe | 樣本池 |
| `quant.stock_research.gate_summary.title` | Gate Summary | 七關卡驗證 |
| `quant.stock_research.gate_summary.copy_cta` | Copy MD | 複製 Markdown |
| `quant.stock_research.gate_summary.legend_cta` | Gate Help | Gate 說明 |
| `quant.stock_research.gate_summary.refresh_cta` | Refresh Research | 重新整理研究資料 |
| `quant.stock_research.flags_snapshot.title` | Research Flags Snapshot | 研究旗標快照 |
| `quant.stock_research.robustness.title` | Rolling Robustness Walk-forward | 滾動穩定性 |
| `quant.stock_research.regime_split.title` | Regime Split | 大市環境分拆 |
| `quant.stock_research.record_explorer.title` | Record Explorer | 記錄探查 |
| `quant.stock_research.filter.label` | Label | 信號 |
| `quant.stock_research.filter.flag` | Research Flag | 研究旗標 |

## 8. Signal 對照與建議 Key

### 7.1 Stock Signals

| Key Prefix | Enum | English Concept | 中文展示 |
| --- | --- | --- | --- |
| `signal.stock.long_break` | `LONG_BREAK` | Breakout Confirmation | 放量突破，入場信號 |
| `signal.stock.long_vcp` | `LONG_VCP` | Volatility Contraction Breakout | 縮量突破，值得留意 |
| `signal.stock.long_bounce` | `LONG_BOUNCE` | Pullback Bounce | 回調後反彈，買入機會 |
| `signal.stock.long_base` | `LONG_BASE` | Constructive Base | 盤整候選，等待觸發 |
| `signal.stock.watch` | `WATCH` | Watchlist Candidate | 動量聚集，列入候選 |
| `signal.stock.neutral` | `NEUTRAL` | Neutral | 方向未明 |
| `signal.stock.avoid_chop` | `AVOID_CHOP` | Choppy / Avoid | 上落市，避開 |
| `signal.stock.short_watch` | `SHORT_WATCH` | Weakening Watch | 走勢轉弱 |
| `signal.stock.short_base` | `SHORT_BASE` | Short Base | 跌勢成形 |
| `signal.stock.short_break` | `SHORT_BREAK` | Breakdown Confirmation | 放量跌破，跌勢確認 |
| `signal.stock.review_data` | `REVIEW_DATA` | Review Data | 暫時無法判斷 |
| `signal.stock.review_event` | `REVIEW_EVENT` | Review Event | 快出財報 |

每個 prefix 建議至少保留以下欄位：

```txt
signal.stock.long_break.label_zh
signal.stock.long_break.label_en
signal.stock.long_break.reason_zh
signal.stock.long_break.action_zh
```

### 7.2 ETF Signals

| Key Prefix | Enum | English Concept | 中文展示 |
| --- | --- | --- | --- |
| `signal.etf.favour` | `FAVOUR` | Favour | 值得留意 |
| `signal.etf.watch` | `WATCH` | Watch | 留意觀望 |
| `signal.etf.wait` | `WAIT` | Wait | 靜候信號 |
| `signal.etf.avoid` | `AVOID` | Avoid | 避開 |
| `signal.etf.review` | `REVIEW` | Review | 資料不足 |

### 7.3 Research Flags

| Key Prefix | Enum | English Concept | 中文展示 |
| --- | --- | --- | --- |
| `research.flag.base_break` | `BASE_BREAK` | Base Break | 長底突破 |
| `research.flag.distribution_warning` | `DISTRIBUTION_WARNING` | Distribution Warning | 派發預警 |

## 9. 狀態與操作文案

| Key | English | 中文 |
| --- | --- | --- |
| `status.regime` | Regime | 市場狀態 |
| `status.loaded` | Loaded | 已載入 |
| `status.failed` | Failed | 失敗 |
| `status.updated` | Updated | 更新時間 |
| `status.pending` | Pending | 等待中 |
| `status.on` | ON | 已啟用 |
| `status.off` | OFF | 未啟用 |
| `status.active` | Active | 啟用中 |
| `status.not_configured` | Not Configured | 未設定 |
| `cta.refresh` | Refresh | 重新整理 |
| `cta.load` | Load | 載入 |
| `cta.copy_markdown` | Copy Markdown | 複製 Markdown |
| `cta.expand` | Expand | 展開 |
| `cta.collapse` | Collapse | 收起 |

## 10. Help 與 Onboarding

| Key | English | 中文 |
| --- | --- | --- |
| `help.title` | Help | 使用說明 |
| `help.dashboard` | Market overview: regime, breadth warning, top signals, sector snapshot. | 市場基調一覽：Regime + 廣度警示 + 今日焦點信號 + 板塊快覽。 |
| `help.stocks` | Live stock signals | 即時個股信號 |
| `help.etfs` | Weekly ETF signals | 每週 ETF 信號 |
| `help.quant` | Research workspace | 深度研究工作區 |
| `onboarding.welcome.title` | Welcome to Global ETF Command Centre | 歡迎使用 Global ETF 指揮中心 |
| `onboarding.ladder.title` | Signal Ladder | 信號梯形 |
| `onboarding.research.title` | Research Phase Notice | 研究階段聲明 |
| `onboarding.next_cta` | Next | 下一步 |
| `onboarding.finish_cta` | Start Using App | 開始使用 |
| `onboarding.skip_cta` | Skip | 跳過 |

## 11. 建議的改名工作流

當之後要改名稱，例如：

- `ETF Weekly Advisor` 改成 `ETF Rotation Monitor`
- `Action Radar` 改成 `Trade Radar`
- `Stock Research` 改成 `Signal Validation Lab`

建議流程：

1. 先改本文件中的 key 對照與 canonical wording。
2. 再改 [`UI_DESIGN.md`](./UI_DESIGN.md) 的描述名詞。
3. 最後才改 `src/App.tsx` 與 `src/ui/labelDisplay.ts` 實際展示文案。

這樣可避免：

- 同一概念在不同地方叫不同名字
- 改了畫面標題，但 help / onboarding / docs 沒同步

## 12. 建議的後續落地方向

這份文檔目前是 naming reference，不是程式字典。

如果之後要正式落地，可按這個順序：

1. 建 `src/copy/uiCopy.ts` 或 `src/i18n/zh-HK.ts`
2. 先把 page title、section title、CTA 抽成 constants
3. 再把 signal / research labels 一併抽離
4. 最後視需要補 `en` / `zh-HK` 多語字典

## 13. 一句話原則

先固定 key，再改顯示字；先統一術語，再談文案風格。這樣之後不論是中英溝通、命名重構，還是正式導入 i18n，都會順很多。

## 14. Verify 子導航建議 Key

| Key | English | 中文 |
| --- | --- | --- |
| `verify.nav.etf_check` | ETF Check | ETF 回看 |
| `verify.nav.stock_check` | Stock Check | 個股回看 |
| `verify.nav.signal_proof` | Signal Proof | 信號驗證 |
