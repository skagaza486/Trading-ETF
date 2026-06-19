import styles from './LoadingScreen.module.css'

export function LoadingScreen({ message = '載入中…' }: { message?: string }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.spinner} />
      <p className={styles.text}>{message}</p>
    </div>
  )
}

export function ErrorScreen({ message }: { message: string }) {
  return (
    <div className={styles.wrap}>
      <p className={styles.error}>⚠️ {message}</p>
    </div>
  )
}
