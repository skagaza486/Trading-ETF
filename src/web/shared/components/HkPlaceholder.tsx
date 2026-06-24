import { useApp } from '../../app/providers/AppContext'
import styles from './HkPlaceholder.module.css'

export function HkPlaceholder() {
  const { setScope } = useApp()
  return (
    <div className={styles.wrap}>
      <div className={styles.flag}>🇭🇰</div>
      <h2 className={styles.title}>港股功能即將推出</h2>
      <p className={styles.desc}>
        我們正在建立港股觀察名單及信號引擎。<br />
        敬請期待，可先切換回美股查看。
      </p>
      <button className={styles.backBtn} onClick={() => setScope('US')}>
        ← 切回美股
      </button>
    </div>
  )
}
