import { useState } from 'react'
import { useApp, type MarketScope } from '../../app/providers/AppContext'
import styles from './Onboarding.module.css'

type TabIntro = { icon: string; name: string; desc: string }

const TAB_MAP: TabIntro[] = [
  { icon: '📊', name: '大市', desc: '今日市場結論同信心指標' },
  { icon: '🗺️', name: '板塊', desc: '邊個方向最強、邊個轉弱' },
  { icon: '🎯', name: '機會', desc: '符合形態的股票同 ETF' },
  { icon: '💼', name: '組合', desc: '你的持倉、止損同風險限額' },
  { icon: '📈', name: '驗證', desc: '看漲訊號的實際結算戰績' },
]

export function Onboarding() {
  const { completeOnboarding } = useApp()
  const [screen, setScreen] = useState<1 | 2 | 3>(1)
  const [scope, setScope] = useState<MarketScope>('US')

  const finish = () => completeOnboarding(scope, 'pro')

  return (
    <div className={styles.bg}>
      <div className={styles.card}>
        <Progress step={screen} />

        {screen === 1 && (
          <Step
            title="你想先看？"
            subtitle="現階段先支援美股；港股目前未有足夠真實覆蓋，暫未開放"
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
                <small>目前未有足夠真實覆蓋，暫未開放</small>
              </Choice>
            </ChoiceGrid>
            <button className={styles.next} onClick={() => setScreen(2)}>下一步 →</button>
          </Step>
        )}

        {screen === 2 && (
          <Step
            title="App 有咩？"
            subtitle="底部 5 個頁面，由「大市」今日結論出發，再去其他頁面深入"
          >
            <div className={styles.mapList}>
              {TAB_MAP.map(tab => (
                <div key={tab.name} className={styles.mapRow}>
                  <span className={styles.mapIcon}>{tab.icon}</span>
                  <div className={styles.mapBody}>
                    <strong>{tab.name}</strong>
                    <small>{tab.desc}</small>
                  </div>
                </div>
              ))}
            </div>
            <div className={styles.btnRow}>
              <button className={styles.back} onClick={() => setScreen(1)}>← 返回</button>
              <button className={styles.next} onClick={() => setScreen(3)}>下一步 →</button>
            </div>
          </Step>
        )}

        {screen === 3 && (
          <Step
            title="準備好了！"
            subtitle="打開市場羅盤，由大市開始了解今日市況；所有內容屬研究輔助，edge 仍在驗證中"
          >
            <div className={styles.summary}>
              <SummaryRow icon="🌍" label="市場" value={scope === 'US' ? '🇺🇸 美股' : '🇭🇰 港股'} />
            </div>
            <p className={styles.disclaimer}>
              此 App 為研究工具，所有資訊僅供參考，不構成投資建議；現有信號與統計屬研究結果展示，edge 尚未證實。
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
