# 上線部署步驟 (Cloudflare Pages — $0)

## 已完成的代碼修改

兩個文件已準備好，不需要改動現有代碼：

| 文件 | 作用 |
| --- | --- |
| `functions/api/yahoo/[[path]].js` | 替代 Vite proxy，在 Cloudflare 上轉發 Yahoo Finance 請求 |
| `.gitignore` | 排除 node_modules、dist、.tools |

現有的 `src/` 代碼和 `vite.config.ts` **不需要任何修改**：
- 本地開發繼續用 Vite proxy（`/api/yahoo/...` → Yahoo Finance）
- 生產環境自動用 Cloudflare Pages Function（相同路徑，不同底層）

---

## 為什麼不需要改現有代碼

```
本地：
  瀏覽器 → /api/yahoo/v8/finance/chart/VOO
         → Vite dev server proxy
         → query1.finance.yahoo.com ✓

生產：
  瀏覽器 → /api/yahoo/v8/finance/chart/VOO
         → Cloudflare Pages Function (functions/api/yahoo/[[path]].js)
         → query1.finance.yahoo.com ✓
```

路徑相同，代碼不知道背後是哪個 proxy。

---

## 部署步驟

### Step 1：建立 GitHub repo（5 分鐘）

```bash
# 在 Trading ETF 目錄
git init
git add .
git commit -m "Initial: ETF Command Centre"
```

然後：
1. 打開 github.com → New repository
2. 名稱：`global-etf-command-centre`
3. Private（個人工具，不需要公開）
4. 不要勾選 README（本地已有文件）
5. 複製 GitHub 給你的兩行指令：

```bash
git remote add origin https://github.com/你的用戶名/global-etf-command-centre.git
git push -u origin main
```

---

### Step 2：連接 Cloudflare Pages（10 分鐘）

1. 打開 [dash.cloudflare.com](https://dash.cloudflare.com) → 登入或建立免費帳號
2. 左側選 **Workers & Pages** → **Create application** → **Pages**
3. 選 **Connect to Git** → 授權 GitHub → 選 `global-etf-command-centre`
4. 填寫 Build settings：

   | 欄位 | 值 |
   | --- | --- |
   | Framework preset | None |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | （留空） |

5. 按 **Save and Deploy**

Cloudflare 會自動：
- 安裝 `node_modules`
- 執行 `npm run build`
- 部署 `dist/` 靜態文件
- 部署 `functions/` 為 Pages Functions

---

### Step 3：確認 Pages Function 生效（2 分鐘）

部署完成後，Cloudflare 給你一個 URL，例如：
`https://global-etf-command-centre.pages.dev`

打開這個 URL，按 **Refresh prices** 按鈕。如果看到 ETF 價格出現，代表 Yahoo Finance proxy 正常運作。

如果看到 `DATA REVIEW`（價格抓取失敗），查看 Cloudflare Dashboard → Pages → 你的項目 → Functions → 查看 invocation logs。

---

### Step 4：之後每次更新（30 秒）

```bash
git add .
git commit -m "說明改了什麼"
git push
```

Cloudflare 會自動偵測 push，重新 build 和部署。

---

## 已知限制

| 限制 | 影響 | 處理方式 |
| --- | --- | --- |
| localStorage 只在單一瀏覽器 | 換設備後持倉、journal 不見 | 用 JSON export 備份；Phase 5 加 KV sync |
| Yahoo Finance 非官方 API | 偶爾被擋，返回 429/403 | Function 已加 query2 fallback；失敗時用 cache |
| HK 市場非交易時段 | 價格顯示前一日收市價 | isStale 標記已處理，屬正常行為 |
| Cloudflare Pages Function 冷啟動 | 首次 fetch 慢 0.5-1 秒 | 影響極小，週回顧工具可接受 |

---

## 費用

| 項目 | 費用 |
| --- | --- |
| Cloudflare Pages 託管 | $0 |
| Pages Functions（Yahoo Finance proxy） | $0（免費 100,000 次/天） |
| 自訂域名（可選，例如 etf.yourname.com） | ~$10-12/年 |

預計每日用量：30 個 ETF ticker × 每次刷新 = 30 次 Function calls。
即使每天刷新 10 次 = 300 calls/day，遠低於 100,000 上限。

---

## 如果之後需要跨設備同步（Cloudflare KV）

這是 Phase 5 的事，現在不需要。

步驟簡述：
1. Cloudflare Dashboard → KV → 建立 namespace `etf-data`
2. 在 Pages 項目 → Settings → Functions → 綁定 KV namespace
3. 在 `functions/api/data/[[path]].js` 加 CRUD endpoints
4. 改 `src/utils/localStorage.ts` 加 KV sync 層

---

## 總結

**現在需要你做的只有兩件事：**

1. 把代碼 push 到 GitHub（需要 GitHub 帳號）
2. 在 Cloudflare Pages 連接這個 repo（需要 Cloudflare 帳號）

兩個都免費，大概 15 分鐘完成。
