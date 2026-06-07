import { useRef, useState } from 'react'
import type { DocumentSearchResult } from '../stores/document'
import { CloseButton } from './layout/CloseButton'

interface SearchPanelProps {
  results: DocumentSearchResult | null
  isSearching: boolean
  onSearch: (query: string) => void
  onClear: () => void
  onNavigate: (partPath: string) => void
  onClose: () => void
}

export function SearchPanel({
  results,
  isSearching,
  onSearch,
  onClear,
  onNavigate,
  onClose,
}: SearchPanelProps) {
  const [query, setQuery] = useState('')
  const [expandedParts, setExpandedParts] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) onSearch(query.trim())
  }

  const handleClear = () => {
    setQuery('')
    setExpandedParts(new Set())
    onClear()
    inputRef.current?.focus()
  }

  const toggleExpanded = (partPath: string) => {
    setExpandedParts((prev) => {
      const next = new Set(prev)
      if (next.has(partPath)) next.delete(partPath)
      else next.add(partPath)
      return next
    })
  }

  return (
    <div className="search-panel">
      <div className="search-panel-header">
        <h3>문서 내 검색</h3>
        <CloseButton onClick={onClose} ariaLabel="검색 패널 닫기" />
      </div>

      <form onSubmit={handleSubmit} className="search-panel-form">
        <input
          ref={inputRef}
          className="search-panel-input"
          type="text"
          placeholder="검색어 입력…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <button type="submit" className="search-panel-btn" disabled={isSearching || !query.trim()}>
          {isSearching ? '…' : '검색'}
        </button>
        {results !== null && (
          <button type="button" className="search-panel-clear-btn" onClick={handleClear}>
            지우기
          </button>
        )}
      </form>

      {results !== null && (
        <div className="search-panel-results">
          <div className="search-panel-summary" role="status" aria-live="polite">
            {results.totalMatches === 0
              ? '일치 항목이 없습니다'
              : `${results.totalMatches}건 일치 · ${results.results.length}개 파트`}
          </div>

          <div className="search-panel-list">
            {results.results.map((partResult) => {
              const isExpanded = expandedParts.has(partResult.partPath)
              return (
                <div key={partResult.partPath} className="search-part-item">
                  <div
                    className="search-part-header"
                    onClick={() => toggleExpanded(partResult.partPath)}
                  >
                    <span className="search-part-expand">{isExpanded ? '▾' : '▸'}</span>
                    <span className="search-part-path">{partResult.partPath}</span>
                    <span className="search-part-count">{partResult.matches.length}</span>
                    <button
                      className="navigate-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        onNavigate(partResult.partPath)
                      }}
                      title="파트로 이동"
                    >
                      이동
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="search-matches">
                      {partResult.matches.map((match, idx) => (
                        <div
                          key={idx}
                          className="search-match-item"
                          onClick={() => onNavigate(partResult.partPath)}
                          title={`${match.line}줄`}
                        >
                          <span className="search-match-line">{match.line}줄</span>
                          <span className="search-match-content">{match.lineContent}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
