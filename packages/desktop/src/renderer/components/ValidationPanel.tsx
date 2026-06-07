import { useState } from 'react'
import { explainValidationCode } from '../utils/validation-error-explainer'

interface ValidationError {
  code: string
  message: string
  path: string
  value?: string
  line?: number
  column?: number
}

interface ValidationWarning {
  code: string
  message: string
  path: string
  value?: string
  line?: number
  column?: number
}

interface PartValidationResult {
  path: string
  valid: boolean
  error?: string
  errors?: ValidationError[]
  warnings?: ValidationWarning[]
}

interface ValidationSummary {
  totalParts: number
  validParts: number
  invalidParts: number
  totalErrors: number
  totalWarnings: number
}

interface ValidationResult {
  supportStatus?: 'supported' | 'unsupported'
  message?: string
  valid: boolean
  results: PartValidationResult[]
  summary?: ValidationSummary
}

interface ValidationPanelProps {
  results: ValidationResult | null
  isValidating?: boolean
  onClose: () => void
  onNavigate: (partPath: string) => void
  onRevalidate: () => void
}

function formatIssueCount(errorCount: number, warningCount: number): string {
  const parts: string[] = []

  if (errorCount > 0) {
    parts.push(`오류 ${errorCount}개`)
  }

  if (warningCount > 0) {
    parts.push(`경고 ${warningCount}개`)
  }

  return parts.join(', ')
}

function toneLabel(tone: 'invalid' | 'warning' | 'valid' | 'info'): string {
  switch (tone) {
    case 'invalid':
      return '오류'
    case 'warning':
      return '경고'
    case 'valid':
      return '정상'
    case 'info':
      return '정보'
  }
}

interface ValidationHeaderProps {
  isValidating: boolean
  onRevalidate: () => void
  onClose: () => void
}

function ValidationHeader({ isValidating, onRevalidate, onClose }: ValidationHeaderProps) {
  return (
    <div className="validation-header">
      <h3>
        검증 결과 <span className="validation-pre-badge">Pre</span>
      </h3>
      <button onClick={onRevalidate} className="revalidate-btn" disabled={isValidating}>
        {isValidating ? (
          <>
            <span className="spinner" aria-hidden /> 검증 중…
          </>
        ) : (
          '다시 검증'
        )}
      </button>
      <button onClick={onClose} className="close-btn" aria-label="검증 결과 닫기">
        ×
      </button>
    </div>
  )
}

export function ValidationPanel({
  results,
  isValidating = false,
  onClose,
  onNavigate,
  onRevalidate,
}: ValidationPanelProps) {
  const [expandedParts, setExpandedParts] = useState<Set<string>>(new Set())

  const toggleExpanded = (path: string) => {
    setExpandedParts((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  if (!results) {
    return (
      <div className="validation-results">
        <ValidationHeader
          isValidating={isValidating}
          onRevalidate={onRevalidate}
          onClose={onClose}
        />
        <div className="validation-empty" role="status" aria-live="polite">
          {isValidating
            ? '문서를 검증하는 중입니다…'
            : "검증 결과가 없습니다. '검증'을 눌러 문서를 확인하세요."}
        </div>
      </div>
    )
  }

  if (results.supportStatus === 'unsupported') {
    return (
      <div className="validation-results">
        <ValidationHeader
          isValidating={isValidating}
          onRevalidate={onRevalidate}
          onClose={onClose}
        />

        <div className="validation-summary warning">
          <span className="status-icon">{toneLabel('info')}</span>
          <span className="status-text">검증 미지원</span>
          <span className="counts">이 문서는 보기·편집은 가능하지만 검증은 건너뜁니다.</span>
        </div>

        <div className="validation-empty">
          {results.message ?? '이 문서 형식은 검증을 지원하지 않습니다.'}
        </div>
      </div>
    )
  }

  const validCount =
    results.summary?.validParts ?? results.results.filter((result) => result.valid).length
  const invalidCount =
    results.summary?.invalidParts ?? results.results.filter((result) => !result.valid).length
  const totalErrors =
    results.summary?.totalErrors ??
    results.results.reduce(
      (sum, result) => sum + (result.errors?.length || (result.error ? 1 : 0)),
      0
    )
  const totalWarnings =
    results.summary?.totalWarnings ??
    results.results.reduce((sum, result) => sum + (result.warnings?.length ?? 0), 0)
  const detailCounts: string[] = []

  if (totalErrors > 0) {
    detailCounts.push(`오류 ${totalErrors}개`)
  }

  if (totalWarnings > 0) {
    detailCounts.push(`경고 ${totalWarnings}개`)
  }

  const summaryTone = totalErrors > 0 ? 'invalid' : totalWarnings > 0 ? 'warning' : 'valid'
  const summaryText =
    summaryTone === 'invalid'
      ? '문서에 오류가 있습니다'
      : summaryTone === 'warning'
        ? '문서에 경고가 있습니다'
        : '문서가 유효합니다'

  return (
    <div className="validation-results">
      <ValidationHeader isValidating={isValidating} onRevalidate={onRevalidate} onClose={onClose} />

      <div className={`validation-summary ${summaryTone}`}>
        <span className="status-icon">{toneLabel(summaryTone)}</span>
        <span className="status-text">{summaryText}</span>
        <span className="counts">
          {validCount}개 유효, {invalidCount}개 무효
          {detailCounts.length > 0 && ` (${detailCounts.join(', ')})`}
        </span>
      </div>

      <div className="validation-list">
        {results.results.map((result) => {
          const errorCount = result.errors?.length || (result.error ? 1 : 0)
          const warningCount = result.warnings?.length ?? 0
          const hasIssues = errorCount > 0 || warningCount > 0
          const isExpanded = expandedParts.has(result.path)
          const tone = result.valid ? (warningCount > 0 ? 'warning' : 'valid') : 'invalid'

          return (
            <div key={result.path} className={`validation-item-container ${tone}`}>
              <div className="validation-item">
                <button
                  type="button"
                  className="validation-item-main"
                  aria-expanded={hasIssues ? isExpanded : undefined}
                  title={hasIssues ? (isExpanded ? '오류 접기' : '오류 펼치기') : '파트로 이동'}
                  onClick={() => {
                    if (hasIssues) {
                      toggleExpanded(result.path)
                    } else {
                      onNavigate(result.path)
                    }
                  }}
                >
                  <span className="item-icon">{toneLabel(tone)}</span>
                  <span className="item-path">{result.path}</span>
                  {hasIssues && (
                    <span
                      className={`item-issue-count${errorCount === 0 && warningCount > 0 ? ' warning-only' : ''}`}
                    >
                      {formatIssueCount(errorCount, warningCount)}
                      <span className="expand-icon" aria-hidden>
                        {isExpanded ? '-' : '+'}
                      </span>
                    </span>
                  )}
                </button>
                <button
                  className="navigate-btn"
                  onClick={() => onNavigate(result.path)}
                  title="파트로 이동"
                >
                  이동
                </button>
              </div>

              {isExpanded && hasIssues && (
                <div className="validation-errors">
                  {result.error && !result.errors && (
                    <div className="validation-error">
                      <div className="error-header">
                        <span className="error-code">XML_PARSE_ERROR</span>
                        <span className="error-code-label">
                          {explainValidationCode('XML_PARSE_ERROR').title}
                        </span>
                      </div>
                      <div className="error-message">{result.error}</div>
                      <div className="error-action">
                        → {explainValidationCode('XML_PARSE_ERROR').action}
                      </div>
                    </div>
                  )}

                  {result.errors?.map((error, index) => {
                    const explain = explainValidationCode(error.code)
                    return (
                      <div key={`error-${index}`} className="validation-error">
                        <div className="error-header">
                          <span className="error-code">{error.code}</span>
                          <span className="error-code-label">{explain.title}</span>
                          {error.line !== undefined && (
                            <span className="error-location">
                              줄 {error.line}
                              {error.column !== undefined && `:${error.column}`}
                            </span>
                          )}
                        </div>
                        <div className="error-message">{error.message}</div>
                        <div className="error-path">{error.path}</div>
                        {error.value && (
                          <div className="error-value">
                            값: <code>{error.value}</code>
                          </div>
                        )}
                        {explain.action && <div className="error-action">→ {explain.action}</div>}
                      </div>
                    )
                  })}

                  {result.warnings?.map((warning, index) => {
                    const explain = explainValidationCode(warning.code)
                    return (
                      <div key={`warning-${index}`} className="validation-warning">
                        <div className="error-header">
                          <span className="warning-code">{warning.code}</span>
                          <span className="error-code-label">{explain.title}</span>
                          {warning.line !== undefined && (
                            <span className="error-location">
                              줄 {warning.line}
                              {warning.column !== undefined && `:${warning.column}`}
                            </span>
                          )}
                        </div>
                        <div className="error-message">{warning.message}</div>
                        <div className="error-path">{warning.path}</div>
                        {warning.value && (
                          <div className="error-value">
                            값: <code>{warning.value}</code>
                          </div>
                        )}
                        {explain.action && <div className="error-action">→ {explain.action}</div>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
