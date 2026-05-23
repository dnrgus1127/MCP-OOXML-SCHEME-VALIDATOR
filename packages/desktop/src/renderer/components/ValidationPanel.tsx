import { useState } from 'react'

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
  onClose: () => void
  onNavigate: (partPath: string) => void
  onRevalidate: () => void
}

function formatIssueCount(errorCount: number, warningCount: number): string {
  const parts: string[] = []

  if (errorCount > 0) {
    parts.push(`${errorCount} error${errorCount !== 1 ? 's' : ''}`)
  }

  if (warningCount > 0) {
    parts.push(`${warningCount} warning${warningCount !== 1 ? 's' : ''}`)
  }

  return parts.join(', ')
}

export function ValidationPanel({
  results,
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
        <div className="validation-header">
          <h3>
            Validation Results <span className="validation-pre-badge">Pre</span>
          </h3>
          <button onClick={onRevalidate} className="revalidate-btn">
            Re-validate
          </button>
          <button onClick={onClose} className="close-btn" aria-label="Close validation results">
            x
          </button>
        </div>
        <div className="validation-empty">
          No validation results. Click "Validate" to check the document.
        </div>
      </div>
    )
  }

  if (results.supportStatus === 'unsupported') {
    return (
      <div className="validation-results">
        <div className="validation-header">
          <h3>
            Validation Results <span className="validation-pre-badge">Pre</span>
          </h3>
          <button onClick={onRevalidate} className="revalidate-btn">
            Re-validate
          </button>
          <button onClick={onClose} className="close-btn" aria-label="Close validation results">
            x
          </button>
        </div>

        <div className="validation-summary warning">
          <span className="status-icon">INFO</span>
          <span className="status-text">Validation unsupported</span>
          <span className="counts">
            This document can be viewed and edited, but validation is skipped.
          </span>
        </div>

        <div className="validation-empty">
          {results.message ?? 'Validation is not available for this document format.'}
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
    detailCounts.push(`${totalErrors} errors`)
  }

  if (totalWarnings > 0) {
    detailCounts.push(`${totalWarnings} warnings`)
  }

  const summaryTone = totalErrors > 0 ? 'invalid' : totalWarnings > 0 ? 'warning' : 'valid'
  const summaryIcon = summaryTone === 'invalid' ? 'ERR' : summaryTone === 'warning' ? 'WARN' : 'OK'
  const summaryText =
    summaryTone === 'invalid'
      ? 'Document has errors'
      : summaryTone === 'warning'
        ? 'Document has warnings'
        : 'Document is valid'

  return (
    <div className="validation-results">
      <div className="validation-header">
        <h3>
          Validation Results <span className="validation-pre-badge">Pre</span>
        </h3>
        <button onClick={onRevalidate} className="revalidate-btn">
          Re-validate
        </button>
        <button onClick={onClose} className="close-btn" aria-label="Close validation results">
          x
        </button>
      </div>

      <div className={`validation-summary ${summaryTone}`}>
        <span className="status-icon">{summaryIcon}</span>
        <span className="status-text">{summaryText}</span>
        <span className="counts">
          {validCount} valid, {invalidCount} invalid
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
              <div
                className="validation-item"
                onClick={() => {
                  if (hasIssues) {
                    toggleExpanded(result.path)
                  } else {
                    onNavigate(result.path)
                  }
                }}
              >
                <span className="item-icon">
                  {tone === 'invalid' ? 'ERR' : tone === 'warning' ? 'WARN' : 'OK'}
                </span>
                <span className="item-path">{result.path}</span>
                {hasIssues && (
                  <span
                    className={`item-issue-count${errorCount === 0 && warningCount > 0 ? ' warning-only' : ''}`}
                  >
                    {formatIssueCount(errorCount, warningCount)}
                    <span className="expand-icon">{isExpanded ? '-' : '+'}</span>
                  </span>
                )}
                <button
                  className="navigate-btn"
                  onClick={(event) => {
                    event.stopPropagation()
                    onNavigate(result.path)
                  }}
                  title="Go to part"
                >
                  Go
                </button>
              </div>

              {isExpanded && hasIssues && (
                <div className="validation-errors">
                  {result.error && !result.errors && (
                    <div className="validation-error">
                      <span className="error-code">XML_PARSE_ERROR</span>
                      <span className="error-message">{result.error}</span>
                    </div>
                  )}

                  {result.errors?.map((error, index) => (
                    <div key={`error-${index}`} className="validation-error">
                      <div className="error-header">
                        <span className="error-code">{error.code}</span>
                        {error.line !== undefined && (
                          <span className="error-location">
                            Line {error.line}
                            {error.column !== undefined && `:${error.column}`}
                          </span>
                        )}
                      </div>
                      <div className="error-message">{error.message}</div>
                      <div className="error-path">{error.path}</div>
                      {error.value && (
                        <div className="error-value">
                          Value: <code>{error.value}</code>
                        </div>
                      )}
                    </div>
                  ))}

                  {result.warnings?.map((warning, index) => (
                    <div key={`warning-${index}`} className="validation-warning">
                      <div className="error-header">
                        <span className="warning-code">{warning.code}</span>
                        {warning.line !== undefined && (
                          <span className="error-location">
                            Line {warning.line}
                            {warning.column !== undefined && `:${warning.column}`}
                          </span>
                        )}
                      </div>
                      <div className="error-message">{warning.message}</div>
                      <div className="error-path">{warning.path}</div>
                      {warning.value && (
                        <div className="error-value">
                          Value: <code>{warning.value}</code>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
