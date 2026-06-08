import { useEffect, useState } from 'react'
import type { LspServerState, LspStatus } from '../lsp/types'

const STATE_META: Record<LspServerState, { label: string; symbol: string; cls: string }> = {
  running: { label: 'LSP 실행 중', symbol: '●', cls: 'lsp-status-bar--running' },
  starting: { label: 'LSP 시작 중…', symbol: '◐', cls: 'lsp-status-bar--starting' },
  stopped: { label: 'LSP 중지됨', symbol: '○', cls: 'lsp-status-bar--stopped' },
  crashed: { label: 'LSP 오류', symbol: '▲', cls: 'lsp-status-bar--crashed' },
}

/** main 프로세스의 LSP 서버 상태를 구독한다. preload(lsp.getStatus/onStatus)가 없으면 null. */
function useLspStatus(): LspStatus | null {
  const [status, setStatus] = useState<LspStatus | null>(null)

  useEffect(() => {
    const lsp = window.electronAPI?.lsp
    if (!lsp?.getStatus || !lsp.onStatus) return undefined

    let active = true
    void lsp
      .getStatus()
      .then((initial) => {
        if (active) setStatus(initial)
      })
      .catch(() => {
        /* 조회 실패 시 구독 이벤트로 갱신 */
      })

    const unsubscribe = lsp.onStatus((next) => setStatus(next))
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return status
}

export function LspStatusBar(): JSX.Element | null {
  const status = useLspStatus()
  if (!status) return null

  const meta = STATE_META[status.state]
  const deepLabel =
    status.state === 'running'
      ? status.msValidator
        ? '심층 검증 ON'
        : '심층 검증 OFF · XSD만'
      : null

  return (
    <footer
      className={`lsp-status-bar ${meta.cls}`}
      role="status"
      aria-live="polite"
      title={status.detail ?? meta.label}
    >
      <span className="lsp-status-bar__dot" aria-hidden="true">
        {meta.symbol}
      </span>
      <span className="lsp-status-bar__label">{meta.label}</span>
      {deepLabel && (
        <>
          <span className="lsp-status-bar__sep" aria-hidden="true">
            ·
          </span>
          <span className="lsp-status-bar__deep">{deepLabel}</span>
        </>
      )}
      {status.state === 'crashed' && status.detail && (
        <span className="lsp-status-bar__detail">{status.detail}</span>
      )}
    </footer>
  )
}
