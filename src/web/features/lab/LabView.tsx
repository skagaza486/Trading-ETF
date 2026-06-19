import styles from './LabView.module.css'

export function LabView() {
  return (
    <div className={styles.view}>
      <div className={styles.icon}>🔬</div>
      <h2 className={styles.title}>研究室</h2>
      <p className={styles.desc}>
        信號回測、Gate 驗證、ETF Replay 等進階研究功能，
        目前仍在舊版介面。
      </p>

      <a
        href="/legacy.html"
        target="_blank"
        rel="noopener noreferrer"
        className={styles.btn}
      >
        開啟研究室（舊版）↗
      </a>

      <div className={styles.featureList}>
        <div className={styles.featureItem}>
          <span className={styles.tag}>🧪</span>
          <span>ETF Replay — 週訊號回測</span>
        </div>
        <div className={styles.featureItem}>
          <span className={styles.tag}>📊</span>
          <span>Stock Replay — 個股信號歷史</span>
        </div>
        <div className={styles.featureItem}>
          <span className={styles.tag}>🔍</span>
          <span>Stock Research — Gate 驗證 &amp; Winrate</span>
        </div>
        <div className={styles.featureItem}>
          <span className={styles.tag}>🚧</span>
          <span>新版研究室正在開發中</span>
        </div>
      </div>
    </div>
  )
}
