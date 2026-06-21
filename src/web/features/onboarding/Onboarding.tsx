import { useState } from 'react'
import { useApp, type MarketScope, type UiMode } from '../../app/providers/AppContext'
import styles from './Onboarding.module.css'

export function Onboarding() {
  const { completeOnboarding } = useApp()
  const [screen, setScreen] = useState<1 | 2 | 3>(1)
  const [scope, setScope] = useState<MarketScope>('US')
  const [mode, setMode] = useState<UiMode>('simple')

  const finish = () => completeOnboarding(scope, mode)

  return (
    <div className={styles.bg}>
      <div className={styles.card}>
        <Progress step={screen} />

        {screen === 1 && (
          <Step
            title="你想先看？"
            subtitle="現階段先支援美股，港股建設中"
          >
            <ChoiceGrid>
              <Choice selected={scope === 'US'} onClick={() => setScope('US')}>
                <span className={styles.flag}>🇺🇸</span>
                <strong>美股</strong>
                <small>S&P 500、Nasdaq</small>
              </Choice>
              <Choice selected={false} disabled onClick={() => {}}>
                <span className={styles.comingSoon}>即將推出</span>
                <span className={styles.flag}>🇭🇰</span>
                <strong>港股</strong>
                <small>建設中</small>
              </Choice>
            </ChoiceGrid>
            <button className={styles.next} onClick={() => setScreen(2)}>下一步 →</button>
          </Step>
        )}

        {screen === 2 && (
          <Step
            title="你的投資經驗？"
            subtitle="決定顯示深度，進階模式隨時可開"
          >
            <ChoiceGrid>
              <Choice selected={mode === 'simple'} onClick={() => setMode('simple')}>
                <span className={styles.flag}>🌱</span>
                <strong>新手 / 輕鬆看</strong>
                <small>白話解釋，重點展示</small>
              </Choice>
              <Choice selected={mode === 'pro'} onClick={() => setMode('pro')}>
                <span className={styles.flag}>📊</span>
                <strong>進階</strong>
                <small>完整技術指標與研究室</small>
              </Choice>
            </ChoiceGrid>
            <div className={styles.btnRow}>
              <button className={styles.back} onClick={() => setScreen(1)}>← 返回</button>
              <button className={styles.next} onClick={() => setScreen(3)}>下一步 →</button>
            </div>
          </Step>
        )}

        {screen === 3 && (
          <Step
            title="準備好了！"
            subtitle="打開市場羅盤，由大市開始了解今日市況"
          >
            <div className={styles.summary}>
              <SummaryRow icon="🌍" label="市場" value={scope === 'US' ? '🇺🇸 美股' : '🇭🇰 港股'} />
              <SummaryRow icon="👁️" label="模式" value={mode === 'simple' ? '簡易（推薦新手）' : '進階'} />
            </div>
            <p className={styles.disclaimer}>
              此 App 為研究工具，所有資訊僅供參考，不構成投資建議。
            </p>
            <div className={styles.btnRow}>
              <button className={styles.back} onClick={() => setScreen(2)}>← 返回</button>
              <button className={styles.start} onClick={finish}>開始使用 🚀</button>
            </div>
          </Step>
        )}
      </div>
    </div>
  )
}

function Progress({ step }: { step: number }) {
  return (
    <div className={styles.progress}>
      {[1, 2, 3].map(s => (
        <div key={s} className={s <= step ? styles.dotActive : styles.dot} />
      ))}
    </div>
  )
}

function Step({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className={styles.step}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.subtitle}>{subtitle}</p>
      {children}
    </div>
  )
}

function ChoiceGrid({ children }: { children: React.ReactNode }) {
  return <div className={styles.choiceGrid}>{children}</div>
}

function Choice({ selected, disabled, onClick, children }: { selected: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className={disabled ? styles.choiceDisabled : selected ? styles.choiceActive : styles.choice}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

function SummaryRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className={styles.summaryRow}>
      <span>{icon} {label}</span>
      <strong>{value}</strong>
    </div>
  )
}
