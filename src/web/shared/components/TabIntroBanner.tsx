import { useState } from 'react'
import styles from './TabIntroBanner.module.css'

// 各 tab 首訪頂部介紹條:用 localStorage 記住已關閉,之後唔再出現。
// 通用 component —— 每個 view 頂部放一條,tabId 唯一。
export function TabIntroBanner({ tabId, message }: { tabId: string; message: string }) {
  const storageKey = `web:tab-intro-seen:${tabId}`
  const [seen, setSeen] = useState<boolean>(() => {
    try { return localStorage.getItem(storageKey) === '1' } catch { return false }
  })

  if (seen) return null

  const dismiss = () => {
    try { localStorage.setItem(storageKey, '1') } catch { /* ignore */ }
    setSeen(true)
  }

  return (
    <div className={styles.banner}>
      <span className={styles.icon}>💡</span>
      <p className={styles.text}>{message}</p>
      <button className={styles.close} onClick={dismiss}>知道了</button>
    </div>
  )
}
