import { useState, useRef, useEffect } from 'react'
import styles from './InfoDot.module.css'

/**
 * 可點擊的「?」說明點。手機友好（點擊開合，點外面或再點一次關閉）。
 * 取代過往純裝飾的 ❓ 字元，讓每個專業詞都有實際出口。
 */
export function InfoDot({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [open])

  return (
    <span className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={styles.dot}
        aria-label="說明"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(o => !o) }}
      >
        ?
      </button>
      {open && <span className={styles.pop} role="tooltip">{text}</span>}
    </span>
  )
}
