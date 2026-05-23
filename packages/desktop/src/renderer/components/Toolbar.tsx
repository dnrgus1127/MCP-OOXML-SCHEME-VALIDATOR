import { HomeNavigationButton } from './HomeNavigationButton'
import { WindowTopBar } from './layout/WindowTopBar'

interface ToolbarProps {
  onOpenFile: () => void
  onSave: () => void
  onSaveAs: () => void
  onValidate: () => void
  validationEnabled?: boolean
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
}

export function Toolbar({
  onOpenFile,
  onSave,
  onSaveAs,
  onValidate,
  validationEnabled = false,
  onOpenSettings,
  openLabel = 'Open',
  hasDocument,
  filePath,
  isDirty,
  onNavigateHome,
  isCompareMode = false,
  onToggleCompare,
  isSearchOpen = false,
  onToggleSearch,
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
              ⚙ Settings
            </button>
          )}
          <button
            onClick={onSave}
            className={`toolbar-btn${isDirty ? ' toolbar-btn--dirty' : ''}`}
            disabled={writeDisabled}
          >
            💾 Save
          </button>
          <button onClick={onSaveAs} className="toolbar-btn" disabled={writeDisabled}>
            💾 Save As
          </button>
          {validationEnabled && (
            <button
              onClick={onValidate}
              className="toolbar-btn toolbar-btn--pre"
              disabled={writeDisabled}
              title="개발 중인 Pre 검증 기능"
            >
              ✓ Validate <span className="toolbar-pre-badge">Pre</span>
            </button>
          )}
          {onToggleCompare && (
            <button
              onClick={onToggleCompare}
              className={`toolbar-btn${isCompareMode ? ' toolbar-btn--active' : ''}`}
              disabled={!hasDocument}
              title={isCompareMode ? '비교 모드 종료' : '다른 파일과 비교'}
            >
              🔀 {isCompareMode ? 'Exit Compare' : 'Compare with…'}
            </button>
          )}
          {onToggleSearch && (
            <button
              onClick={onToggleSearch}
              className={`toolbar-btn${isSearchOpen ? ' toolbar-btn--active' : ''}`}
              disabled={!hasDocument}
              title="문서 전체 XML 검색"
            >
              🔍 Search
            </button>
          )}
        </>
      }
      center={
        fileName && (
          <span className={`file-name${isDirty ? ' file-name--dirty' : ''}`}>
            {isDirty && '● '}
            {fileName}
            {isCompareMode && <span className="compare-mode-badge"> · Compare</span>}
          </span>
        )
      }
      trailing={<span className="app-title">OOXML Validator</span>}
    />
  )
}
