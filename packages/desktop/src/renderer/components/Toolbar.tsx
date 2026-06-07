import { HomeNavigationButton } from './HomeNavigationButton'
import { WindowTopBar } from './layout/WindowTopBar'

interface ToolbarProps {
  onOpenFile: () => void
  onSave: () => void
  onSaveAs: () => void
  onValidate: () => void
  validationEnabled?: boolean
  /** 재검증 단축키 힌트 (정규화된 표기) */
  validateShortcut?: string
  onOpenSettings?: () => void
  openLabel?: string
  hasDocument: boolean
  filePath: string | null
  isDirty: boolean
  onNavigateHome?: () => void
  // Compare 모드
  isCompareMode?: boolean
  onToggleCompare?: () => void
  // Search
  isSearchOpen?: boolean
  onToggleSearch?: () => void
  // Schema inspector
  isInspectorOpen?: boolean
  onToggleInspector?: () => void
}

export function Toolbar({
  onOpenFile,
  onSave,
  onSaveAs,
  onValidate,
  validationEnabled = false,
  validateShortcut,
  onOpenSettings,
  openLabel = '열기',
  hasDocument,
  filePath,
  isDirty,
  onNavigateHome,
  isCompareMode = false,
  onToggleCompare,
  isSearchOpen = false,
  onToggleSearch,
  isInspectorOpen = false,
  onToggleInspector,
}: ToolbarProps) {
  const fileName = filePath ? filePath.split(/[\\/]/).pop() : null
  const writeDisabled = !hasDocument || isCompareMode

  return (
    <WindowTopBar
      className="toolbar"
      leading={
        <>
          {onNavigateHome && <HomeNavigationButton onNavigateHome={onNavigateHome} />}
          <button onClick={onOpenFile} className="toolbar-btn" disabled={isCompareMode}>
            📂 {openLabel}
          </button>
          {onOpenSettings && (
            <button onClick={onOpenSettings} className="toolbar-btn">
              ⚙ 설정
            </button>
          )}
          <button
            onClick={onSave}
            className={`toolbar-btn${isDirty ? ' toolbar-btn--dirty' : ''}`}
            disabled={writeDisabled}
          >
            💾 저장
          </button>
          <button onClick={onSaveAs} className="toolbar-btn" disabled={writeDisabled}>
            💾 다른 이름으로 저장
          </button>
          {validationEnabled && (
            <button
              onClick={onValidate}
              className="toolbar-btn toolbar-btn--pre"
              disabled={writeDisabled}
              title={
                validateShortcut
                  ? `개발 중인 Pre 검증 기능 (${validateShortcut})`
                  : '개발 중인 Pre 검증 기능'
              }
            >
              ✓ 검증 <span className="toolbar-pre-badge">Pre</span>
            </button>
          )}
          {onToggleCompare && (
            <button
              onClick={onToggleCompare}
              className={`toolbar-btn${isCompareMode ? ' toolbar-btn--active' : ''}`}
              disabled={!hasDocument}
              title={isCompareMode ? '비교 모드 종료' : '다른 파일과 비교'}
            >
              🔀 {isCompareMode ? '비교 종료' : '파일 비교…'}
            </button>
          )}
          {onToggleSearch && (
            <button
              onClick={onToggleSearch}
              className={`toolbar-btn${isSearchOpen ? ' toolbar-btn--active' : ''}`}
              disabled={!hasDocument}
              title="문서 전체 XML 검색"
            >
              🔍 검색
            </button>
          )}
          {onToggleInspector && (
            <button
              onClick={onToggleInspector}
              className={`toolbar-btn${isInspectorOpen ? ' toolbar-btn--active' : ''}`}
              disabled={!hasDocument || isCompareMode}
              title="커서 위치의 요소 스키마 정보 패널"
            >
              📖 스키마
            </button>
          )}
        </>
      }
      center={
        fileName && (
          <span className={`file-name${isDirty ? ' file-name--dirty' : ''}`}>
            {isDirty && '● '}
            {fileName}
            {isCompareMode && <span className="compare-mode-badge"> · 비교</span>}
          </span>
        )
      }
      trailing={<span className="app-title">OOXML Validator</span>}
    />
  )
}
