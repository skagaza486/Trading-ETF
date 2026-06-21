import styles from './RedesignShowcase.module.css'

const todayItems = [
  {
    title: '市場仍偏強',
    tone: 'positive',
    note: '大市仍站穩主要均線之上，回吐後仍有承接。',
    points: '8, 13 18, 11 28, 14 38, 10 48, 17 58, 16 68, 22 78, 19 88, 24 98, 21',
  },
  {
    title: '科技板塊領先',
    tone: 'neutral',
    note: '資金仍集中大型科技股，強勢股較易守住升勢。',
    points: '8, 22 18, 18 28, 20 38, 15 48, 16 58, 12 68, 10 78, 13 88, 9 98, 11',
  },
  {
    title: '波幅開始上升',
    tone: 'warn',
    note: '市場未轉弱，但日內震幅放大，宜分注觀察。',
    points: '8, 24 18, 23 28, 22 38, 20 48, 18 58, 17 68, 14 78, 12 88, 10 98, 7',
  },
] as const

const changeList = [
  {
    ticker: 'NVDA',
    name: '輝達',
    status: '突破',
    tone: 'positive',
    reason: '今日由整固轉為突破，短線仍有延續空間。',
    points: '0,33 14,31 28,28 42,25 56,18 70,14 84,12 98,8 112,10 126,6',
  },
  {
    ticker: 'MSFT',
    name: '微軟',
    status: '觀察',
    tone: 'neutral',
    reason: '趨勢仍穩，但暫未見新觸發，較適合先觀察。',
    points: '0,28 14,27 28,24 42,22 56,21 70,23 84,22 98,20 112,19 126,18',
  },
  {
    ticker: 'SPY',
    name: '標普 500 ETF',
    status: '震盪',
    tone: 'risk',
    reason: '波幅回升兼領漲面收窄，短線容易出現假突破。',
    points: '0,18 14,17 28,18 42,20 56,19 70,24 84,28 98,26 112,31 126,29',
  },
] as const

const discoverList = [
  { ticker: 'AVGO', text: '相對強弱仍高，若回調後守住 EMA20 可再看。' },
  { ticker: 'TSM', text: '等待第二日能否守住突破區，再決定是否值得深看。' },
  { ticker: 'XLK', text: '科技板塊仍領先，可作為大市風向參考。' },
] as const

function MiniSpark({ points, tone = 'mint' }: { points: string; tone?: 'mint' | 'amber' | 'soft' }) {
  return (
    <svg viewBox="0 0 126 36" className={`${styles.spark} ${styles[`spark${tone[0].toUpperCase()}${tone.slice(1)}`]}`}>
      <polyline points={points} />
    </svg>
  )
}

export function RedesignShowcase() {
  return (
    <div className={styles.page}>
      <div className={styles.stage}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>市場羅盤 UI Redesign</p>
            <h1>同一張 16:9 畫布呈現 Mobile + Desktop 高保真版本</h1>
          </div>
          <div className={styles.headerMeta}>
            <span>香港繁體中文</span>
            <span>3 秒知道今日市況</span>
            <span>3 分鐘完成掃描</span>
          </div>
        </header>

        <div className={styles.canvas} data-testid="redesign-canvas">
          <section className={styles.mobileWrap}>
            <div className={styles.phone}>
              <div className={styles.phoneStatus}>
                <span>9:41</span>
                <span>5G</span>
              </div>

              <div className={styles.mobileTop}>
                <div>
                  <p className={styles.brandEyebrow}>市場羅盤</p>
                  <h2>今日市場</h2>
                </div>
                <div className={styles.mobileControls}>
                  <span className={styles.scopeChip}>美股</span>
                  <span className={styles.modeChip}>簡易</span>
                </div>
              </div>

              <section className={styles.heroCard}>
                <div className={styles.heroTitleRow}>
                  <span className={styles.heroTag}>今日市場</span>
                  <span className={styles.update}>資料更新 16:30 ET</span>
                </div>
                <h3>震盪偏多</h3>
                <p className={styles.heroSummary}>可小注觀察，暫勿追高</p>
                <div className={styles.confidenceRow}>
                  <div>
                    <p className={styles.confLabel}>信心指標</p>
                    <p className={styles.confValue}>68 / 100</p>
                  </div>
                  <div className={styles.confBars} aria-hidden="true">
                    <span className={styles.confBarOn} />
                    <span className={styles.confBarOn} />
                    <span className={styles.confBarOn} />
                    <span className={styles.confBarMid} />
                    <span className={styles.confBarOff} />
                  </div>
                </div>
              </section>

              <section className={styles.mobileSection}>
                <div className={styles.sectionHeader}>
                  <h3>今日三件事</h3>
                  <span>先看這三點</span>
                </div>
                <div className={styles.threeThings}>
                  {todayItems.map((item) => (
                    <article key={item.title} className={`${styles.thingRow} ${styles[`thing${item.tone[0].toUpperCase()}${item.tone.slice(1)}`]}`}>
                      <div className={styles.thingCopy}>
                        <h4>{item.title}</h4>
                        <p>{item.note}</p>
                      </div>
                      <MiniSpark points={item.points} tone={item.tone === 'warn' ? 'amber' : item.tone === 'neutral' ? 'soft' : 'mint'} />
                    </article>
                  ))}
                </div>
              </section>

              <section className={styles.mobileSection}>
                <div className={styles.sectionHeader}>
                  <h3>今日動向</h3>
                  <span>信號有變</span>
                </div>
                <div className={styles.watchBlock}>
                  {changeList.map((item) => (
                    <article key={item.ticker} className={styles.watchRow}>
                      <div className={styles.watchMain}>
                        <div className={styles.tickerBadge}>{item.ticker.slice(0, 1)}</div>
                        <div>
                          <div className={styles.watchTitle}>
                            <strong>{item.ticker}</strong>
                            <span>{item.name}</span>
                          </div>
                          <p className={styles.watchReason}>{item.reason}</p>
                        </div>
                      </div>
                      <div className={styles.watchSide}>
                        <MiniSpark points={item.points} tone={item.tone === 'risk' ? 'amber' : item.tone === 'neutral' ? 'soft' : 'mint'} />
                        <span className={`${styles.statusPill} ${styles[`status${item.tone[0].toUpperCase()}${item.tone.slice(1)}`]}`}>{item.status}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <nav className={styles.mobileNav}>
                <span className={styles.navActive}>大市</span>
                <span>板塊</span>
                <span>發現</span>
              </nav>
            </div>
          </section>

          <section className={styles.desktopWrap}>
            <div className={styles.desktopShell}>
              <aside className={styles.sidebar}>
                <div className={styles.sidebarBrand}>
                  <div className={styles.brandMark} />
                  <div>
                    <p>市場羅盤</p>
                    <span>Daily Compass</span>
                  </div>
                </div>

                <nav className={styles.sidebarNav}>
                  <a className={styles.sidebarItemActive}>大市</a>
                  <a className={styles.sidebarItem}>板塊</a>
                  <a className={styles.sidebarItem}>發現</a>
                </nav>

                <div className={styles.sidebarFootnote}>
                  <p>先看大市，再看今日動向與值得留意的標的。</p>
                </div>
              </aside>

              <div className={styles.desktopMain}>
                <div className={styles.desktopTopbar}>
                  <div>
                    <p className={styles.desktopOverline}>今日市場</p>
                    <h2>震盪偏多</h2>
                  </div>
                  <div className={styles.desktopMeta}>
                    <span>可小注觀察，暫勿追高</span>
                    <span>資料更新 16:30 ET</span>
                  </div>
                </div>

                <div className={styles.desktopGrid}>
                  <section className={styles.desktopHero}>
                    <div className={styles.desktopHeroCopy}>
                      <span className={styles.heroTag}>今日市場</span>
                      <h3>震盪偏多</h3>
                      <p>可小注觀察，暫勿追高</p>
                    </div>

                    <div className={styles.desktopConfidence}>
                      <div className={styles.desktopConfidenceHeader}>
                        <span>信心指標</span>
                        <strong>68 / 100</strong>
                      </div>
                      <div className={styles.desktopProgress}>
                        <span />
                      </div>
                      <div className={styles.desktopScales}>
                        <span>保守</span>
                        <span>中性</span>
                        <span>偏多</span>
                      </div>
                    </div>

                    <div className={styles.weekStrip}>
                      <div>
                        <span>一週市場走勢</span>
                        <strong className={styles.num}>+1.8%</strong>
                      </div>
                      <MiniSpark points="0,34 24,28 48,29 72,21 96,17 120,12 126,13" tone="mint" />
                    </div>
                  </section>

                  <section className={styles.desktopThings}>
                    <div className={styles.sectionHeader}>
                      <h3>今日三件事</h3>
                      <span>重要變化</span>
                    </div>
                    <div className={styles.desktopThingsList}>
                      {todayItems.map((item) => (
                        <article key={item.title} className={`${styles.desktopThing} ${styles[`thing${item.tone[0].toUpperCase()}${item.tone.slice(1)}`]}`}>
                          <div>
                            <h4>{item.title}</h4>
                            <p>{item.note}</p>
                          </div>
                          <MiniSpark points={item.points} tone={item.tone === 'warn' ? 'amber' : item.tone === 'neutral' ? 'soft' : 'mint'} />
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className={styles.desktopResearch}>
                    <div className={styles.sectionHeader}>
                      <h3>今日值得研究</h3>
                      <div className={styles.researchHeaderMeta}>
                        <span>詳情頁語氣</span>
                        <button className={styles.primaryButtonInline}>查看原因</button>
                      </div>
                    </div>

                    <div className={styles.researchTop}>
                      <div>
                        <p className={styles.researchTicker}>NVDA</p>
                        <h4>輝達</h4>
                      </div>
                      <span className={`${styles.statusPill} ${styles.statusPositive}`}>突破</span>
                    </div>

                    <div className={styles.researchGrid}>
                      <article className={styles.researchCard}>
                        <h5>機會</h5>
                        <p>重返高位區，若量能保持，短線仍可延續強勢。</p>
                      </article>
                      <article className={`${styles.researchCard} ${styles.researchWarn}`}>
                        <h5>主要風險</h5>
                        <p>若市場波幅再升，強勢股亦可能出現快速回吐。</p>
                      </article>
                      <article className={styles.researchCard}>
                        <h5>失效條件</h5>
                        <p>若兩日內失守前高附近，這次上破可信度會明顯下降。</p>
                      </article>
                    </div>

                  </section>

                  <aside className={styles.desktopRail}>
                    <section className={styles.railCard}>
                      <div className={styles.sectionHeader}>
                        <h3>今日動向</h3>
                        <span>今日更新</span>
                      </div>
                      <div className={styles.railWatchlist}>
                        {changeList.map((item) => (
                          <article key={item.ticker} className={styles.railWatchRow}>
                            <div>
                              <div className={styles.watchTitle}>
                                <strong>{item.ticker}</strong>
                                <span>{item.name}</span>
                              </div>
                              <p className={styles.watchReason}>{item.reason}</p>
                            </div>
                            <div className={styles.railRight}>
                              <MiniSpark points={item.points} tone={item.tone === 'risk' ? 'amber' : item.tone === 'neutral' ? 'soft' : 'mint'} />
                              <span className={`${styles.statusPill} ${styles[`status${item.tone[0].toUpperCase()}${item.tone.slice(1)}`]}`}>{item.status}</span>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>

                    <section className={styles.railCard}>
                      <div className={styles.sectionHeader}>
                        <h3>發現清單</h3>
                        <span>值得留意</span>
                      </div>
                      <div className={styles.tomorrowList}>
                        {discoverList.map((item) => (
                          <article key={item.ticker} className={styles.tomorrowRow}>
                            <strong>{item.ticker}</strong>
                            <p>{item.text}</p>
                          </article>
                        ))}
                      </div>
                    </section>
                  </aside>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
