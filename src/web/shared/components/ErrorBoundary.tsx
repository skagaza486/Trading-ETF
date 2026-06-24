import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

// App-level error boundary — a single component throwing should never blank the
// whole app. Shows a recoverable fallback with a reload button instead.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep a console trail for debugging; never crash silently.
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: 24,
          textAlign: 'center',
          background: 'var(--bg-base, #0b0f14)',
          color: 'var(--text-primary, #e8edf2)',
          fontFamily: 'inherit',
        }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>呢頁載入出錯</h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary, #9fb0bf)', margin: 0, maxWidth: 360 }}>
            個別組件出咗問題，但唔影響其他頁面。可以重新載入再試。
          </p>
          <pre style={{
            fontSize: 11,
            color: 'var(--text-muted, #6b7a88)',
            maxWidth: 360,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            margin: 0,
          }}>{this.state.error.message}</pre>
          <button
            onClick={() => { this.setState({ error: null }); location.reload() }}
            style={{
              marginTop: 8,
              padding: '10px 20px',
              borderRadius: 999,
              border: '1px solid var(--accent, #4cc2ff)',
              background: 'var(--accent-dim, rgba(76,194,255,0.12))',
              color: 'var(--text-primary, #e8edf2)',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            重新載入
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
