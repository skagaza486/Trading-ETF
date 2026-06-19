import styles from './HkPlaceholder.module.css'

export function HkPlaceholder() {
  return (
    <div className={styles.wrap}>
      <div className={styles.flag}>🇭🇰</div>
      <h2 className={styles.title}>港股功能即將推出</h2>
      <p className={styles.desc}>
        我們正在建立港股觀察名單及信號引擎。<br />
        敬請期待，請先切換至美股查看。
      </p>
    </div>
  )
}
