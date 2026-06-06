import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  editorThemeOptions,
  getEditorThemeLabel,
  getEditorThemePreviewVars,
  type EditorThemeId,
} from '../constants/editorTheme'
import { useSettingsStore } from '../stores/settings'
import { normalizeShortcut } from '../utils/shortcuts'
import { getAllPlugins } from '../plugins'
import { MarkdownLite } from '../components/MarkdownLite'

interface SettingsScreenProps {
  onClose: () => void
}

type SettingsSection = 'general' | 'xml-editor' | 'batch-validator' | 'extensions'

interface ShortcutHelpItem {
  action: string
  shortcut: string
  isCustomizable?: boolean
}

interface SectionMeta {
  id: SettingsSection
  label: string
  glyph: string
  desc: string
  title: string
  sub: string
}

const SECTIONS: SectionMeta[] = [
  {
    id: 'general',
    label: '기본',
    glyph: '◐',
    desc: '앱 동작 · 시작 옵션',
    title: '기본 설정',
    sub: '앱이 시작되고 동작하는 방식을 설정합니다.',
  },
  {
    id: 'xml-editor',
    label: 'XML Editor',
    glyph: '⌘',
    desc: '에디터 테마 · 단축키',
    title: 'XML Editor',
    sub: '에디터 테마와 단축키, 개발 중인 검증 옵션을 설정합니다.',
  },
  {
    id: 'batch-validator',
    label: 'Batch Validator',
    glyph: '✓',
    desc: '일괄 검증 옵션',
    title: 'Batch Validator',
    sub: '일괄 검증 화면의 동작을 설정합니다.',
  },
  {
    id: 'extensions',
    label: 'Extensions',
    glyph: '⎔',
    desc: '확장 · 플러그인 관리',
    title: 'Extensions',
    sub: 'XML Editor에서 동작하는 보조 기능을 켜고 끌 수 있습니다.',
  },
]

function getPluginInitials(name: string): string {
  const words = name
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z0-9가-힣]/g, ''))
    .filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) {
    const w = words[0] ?? ''
    return w.slice(0, 2).toUpperCase()
  }
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase()
}

const PLUGIN_ACCENT_PALETTE: Array<{ gradient: string; fg: string }> = [
  { gradient: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', fg: '#ffffff' },
  { gradient: 'linear-gradient(135deg, #0ea5e9 0%, #22d3ee 100%)', fg: '#ffffff' },
  { gradient: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)', fg: '#ffffff' },
  { gradient: 'linear-gradient(135deg, #f97316 0%, #fbbf24 100%)', fg: '#ffffff' },
  { gradient: 'linear-gradient(135deg, #ec4899 0%, #f472b6 100%)', fg: '#ffffff' },
]

function getPluginAccent(id: string): { gradient: string; fg: string } {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  const idx = Math.abs(hash) % PLUGIN_ACCENT_PALETTE.length
  return PLUGIN_ACCENT_PALETTE[idx] ?? PLUGIN_ACCENT_PALETTE[0]!
}

const xmlEditorShortcutHelp: ShortcutHelpItem[] = [
  {
    action: '현재 파일 재검증',
    shortcut: 'CmdOrCtrl+Shift+V (기본값)',
    isCustomizable: true,
  },
  {
    action: '명령 팔레트 열기',
    shortcut: 'F1 또는 Shift+CmdOrCtrl+P',
  },
  {
    action: '빠른 파일 찾기',
    shortcut: 'CmdOrCtrl+P',
  },
  {
    action: '현재 라인 이동',
    shortcut: 'CmdOrCtrl+G',
  },
  {
    action: '찾기 / 치환',
    shortcut: 'CmdOrCtrl+F / CmdOrCtrl+H',
  },
  {
    action: '접기 / 펼치기',
    shortcut: 'CmdOrCtrl+Shift+[ / CmdOrCtrl+Shift+]',
  },
]

function Row({
  label,
  hint,
  align = 'center',
  children,
}: {
  label: string
  hint?: string
  align?: 'center' | 'start'
  children: ReactNode
}) {
  return (
    <div className={`settings-row align-${align}`}>
      <div className="settings-row-label">
        <div className="settings-row-label-text">{label}</div>
        {hint && <div className="settings-row-label-hint">{hint}</div>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  )
}

function Toggle({
  value,
  onChange,
  ariaLabel,
  disabled = false,
}: {
  value: boolean
  onChange: (next: boolean) => void
  ariaLabel?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className={`settings-toggle ${value ? 'on' : 'off'}`}
      disabled={disabled}
      onClick={() => onChange(!value)}
      aria-pressed={value}
      aria-label={ariaLabel}
    >
      <span className="settings-toggle-knob" />
    </button>
  )
}

export function SettingsScreen({ onClose }: SettingsScreenProps) {
  const {
    general,
    xmlEditor,
    previewEditorTheme,
    plugins,
    updateGeneralSettings,
    updateXmlEditorSettings,
    setPreviewEditorTheme,
    clearPreviewEditorTheme,
    updatePluginEnabled,
  } = useSettingsStore()
  const allPlugins = useMemo(() => getAllPlugins(), [])
  const [activeSection, setActiveSection] = useState<SettingsSection>('general')
  const [shortcutInput, setShortcutInput] = useState(xmlEditor.revalidateShortcut)
  const [shortcutError, setShortcutError] = useState<string | null>(null)
  const [expandedPluginIds, setExpandedPluginIds] = useState<Set<string>>(new Set())
  const themeListRef = useRef<HTMLDivElement>(null)

  const togglePluginExpanded = (id: string) => {
    setExpandedPluginIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  useEffect(() => {
    setShortcutInput(xmlEditor.revalidateShortcut)
  }, [xmlEditor.revalidateShortcut])

  useEffect(() => {
    return () => {
      clearPreviewEditorTheme()
    }
  }, [clearPreviewEditorTheme])

  const handleShortcutInputChange = (value: string) => {
    setShortcutInput(value)

    const normalized = normalizeShortcut(value)
    if (!normalized) {
      setShortcutError('유효한 형식이 아닙니다. 예: CmdOrCtrl+Shift+V, CmdOrCtrl+R, Shift+F8')
      return
    }

    setShortcutError(null)
    updateXmlEditorSettings({ revalidateShortcut: normalized })
  }

  const handleThemePreview = (themeId: EditorThemeId) => {
    setPreviewEditorTheme(themeId)
  }

  const handleThemeSelect = (themeId: EditorThemeId) => {
    updateXmlEditorSettings({ editorTheme: themeId })
    setPreviewEditorTheme(themeId)
  }

  const displayedTheme = previewEditorTheme ?? xmlEditor.editorTheme
  const activeSectionMeta = SECTIONS.find((s) => s.id === activeSection) ?? SECTIONS[0]!

  return (
    <div
      className="settings-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <header className="settings-topbar">
        <div className="settings-topbar-title" id="settings-title">
          OOXML Validator — Settings
        </div>
        <button
          type="button"
          className="settings-topbar-close"
          onClick={onClose}
          aria-label="설정 닫기"
        >
          ← Close
        </button>
      </header>

      <div className="settings-shell">
        <aside className="settings-sidebar" aria-label="Settings sections">
          <div className="settings-sidebar-eyebrow">
            <span className="dot" />
            <span>SETTINGS</span>
          </div>
          <h2 className="settings-sidebar-title">
            Configure
            <br />
            <em>your engine.</em>
          </h2>
          <p className="settings-sidebar-tagline">
            에디터 테마, 검증 옵션과 확장을
            <br />한 화면에서 관리하세요.
          </p>

          <nav className="settings-nav">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`settings-nav-item${activeSection === s.id ? ' is-active' : ''}`}
                onClick={() => setActiveSection(s.id)}
                aria-current={activeSection === s.id ? 'page' : undefined}
              >
                <span className="settings-nav-glyph">{s.glyph}</span>
                <span className="settings-nav-text">
                  <span className="settings-nav-label">{s.label}</span>
                  <span className="settings-nav-desc">{s.desc}</span>
                </span>
                <span className="settings-nav-caret">›</span>
              </button>
            ))}
          </nav>
        </aside>

        <main className="settings-main" aria-live="polite">
          <div className="settings-section-wrap">
            <header className="settings-section-header">
              <div className="settings-section-eyebrow">
                <span>{activeSectionMeta.glyph}</span>
                <span>SECTION · {activeSectionMeta.label.toUpperCase()}</span>
              </div>
              <h1 className="settings-section-title">{activeSectionMeta.title}</h1>
              <p className="settings-section-sub">{activeSectionMeta.sub}</p>
            </header>

            <div className="settings-section-body">
              {activeSection === 'general' && (
                <div className="settings-form">
                  <Row
                    label="다운로드 폴더 경로"
                    hint="등록된 폴더의 파일을 Quick Open(CmdOrCtrl+Shift+O)에서 통합 검색해 열 수 있습니다. 여러 폴더를 등록할 수 있습니다."
                    align="start"
                  >
                    <div className="settings-folder-picker">
                      {general.downloadFolders.length === 0 ? (
                        <div className="settings-folder-current">
                          <span className="settings-folder-empty">등록된 폴더가 없습니다.</span>
                        </div>
                      ) : (
                        <ul className="settings-folder-list">
                          {general.downloadFolders.map((path) => {
                            const segments = path.split(/[\\/]/).filter(Boolean)
                            const label = segments[segments.length - 1] ?? path
                            return (
                              <li key={path} className="settings-folder-item">
                                <div className="settings-folder-item-text">
                                  <span className="settings-folder-item-label">{label}</span>
                                  <code className="settings-folder-path" title={path}>
                                    {path}
                                  </code>
                                </div>
                                <button
                                  type="button"
                                  className="settings-folder-btn settings-folder-btn--ghost"
                                  onClick={() =>
                                    updateGeneralSettings({
                                      downloadFolders: general.downloadFolders.filter(
                                        (item) => item !== path
                                      ),
                                    })
                                  }
                                  aria-label={`${label} 폴더 등록 해제`}
                                >
                                  제거
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      )}

                      <div className="settings-folder-actions">
                        <button
                          type="button"
                          className="settings-folder-btn"
                          onClick={async () => {
                            const picked = await window.electronAPI.pickFolder()
                            if (!picked) return
                            if (general.downloadFolders.includes(picked)) return
                            updateGeneralSettings({
                              downloadFolders: [...general.downloadFolders, picked],
                            })
                          }}
                        >
                          폴더 추가
                        </button>
                        {general.downloadFolders.length > 0 && (
                          <button
                            type="button"
                            className="settings-folder-btn settings-folder-btn--ghost"
                            onClick={() => updateGeneralSettings({ downloadFolders: [] })}
                          >
                            전체 해제
                          </button>
                        )}
                      </div>
                    </div>
                  </Row>
                </div>
              )}

              {activeSection === 'xml-editor' && (
                <div className="settings-form">
                  <Row
                    label="검증 기능 사용"
                    hint="문서 검증은 아직 개발 중인 Pre 기능입니다. 켜면 XML Editor에 검증 버튼과 결과 패널이 표시됩니다."
                  >
                    <div className="settings-control-with-badge">
                      <span className="settings-pre-badge">Pre</span>
                      <Toggle
                        value={xmlEditor.validationFeatureEnabled}
                        onChange={(next) =>
                          updateXmlEditorSettings({ validationFeatureEnabled: next })
                        }
                        ariaLabel="검증 기능 사용"
                      />
                    </div>
                  </Row>

                  <Row
                    label="파일 오픈 시 즉시 검증"
                    hint={
                      xmlEditor.validationFeatureEnabled
                        ? '파일을 열자마자 문서 검증을 자동으로 실행합니다.'
                        : '검증 기능을 켜야 사용할 수 있습니다.'
                    }
                  >
                    <Toggle
                      value={xmlEditor.validateOnOpen}
                      onChange={(next) => updateXmlEditorSettings({ validateOnOpen: next })}
                      ariaLabel="파일 오픈 시 즉시 검증"
                      disabled={!xmlEditor.validationFeatureEnabled}
                    />
                  </Row>

                  <Row
                    label="LSP 마커 표시"
                    hint="LSP 서버가 보고한 오류·경고를 에디터 본문에 밑줄·글리프로 표시합니다. '검증 기능 사용'과 독립적으로 동작하며, 끄면 검증 결과 패널과 무관하게 에디터 마커만 사라집니다."
                  >
                    <Toggle
                      value={xmlEditor.lspMarkersEnabled}
                      onChange={(next) => updateXmlEditorSettings({ lspMarkersEnabled: next })}
                      ariaLabel="LSP 마커 표시"
                    />
                  </Row>

                  <Row
                    label="스키마 hover 도움말"
                    hint="OOXML 문서에서 요소·속성에 마우스를 올리면 스키마 기준 타입, 허용 자식 요소, 허용 값을 툴팁으로 보여줍니다. 끄면 우측 '요소 스키마 정보' 패널은 그대로 두고 hover 툴팁만 비활성화됩니다."
                  >
                    <Toggle
                      value={xmlEditor.schemaHoverEnabled}
                      onChange={(next) => updateXmlEditorSettings({ schemaHoverEnabled: next })}
                      ariaLabel="스키마 hover 도움말"
                    />
                  </Row>

                  <Row
                    label="에디터 테마"
                    hint="Monaco Editor가 제공하는 모든 테마를 선택할 수 있습니다. 항목에 마우스를 올리면 즉시 미리보기됩니다."
                    align="start"
                  >
                    <div className="settings-theme-picker">
                      <div className="settings-theme-current">
                        <div className="settings-theme-current-text">
                          <span className="settings-theme-current-label">현재 선택</span>
                          <span className="settings-theme-current-value">
                            {getEditorThemeLabel(xmlEditor.editorTheme)}
                          </span>
                        </div>
                        <span
                          className="editor-theme-preview editor-theme-preview--lg"
                          style={getEditorThemePreviewVars(displayedTheme)}
                          aria-hidden="true"
                        >
                          <span className="editor-theme-preview__gutter" />
                          <span className="editor-theme-preview__line editor-theme-preview__line--accent" />
                          <span className="editor-theme-preview__line" />
                          <span className="editor-theme-preview__line editor-theme-preview__line--soft" />
                        </span>
                      </div>

                      <div
                        className="settings-theme-list"
                        role="listbox"
                        aria-label="Editor theme"
                        ref={themeListRef}
                        onMouseLeave={() => clearPreviewEditorTheme()}
                      >
                        {editorThemeOptions.map((theme) => {
                          const selected = xmlEditor.editorTheme === theme.id
                          return (
                            <button
                              key={theme.id}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              className={`settings-theme-card${selected ? ' is-selected' : ''}`}
                              onMouseEnter={() => handleThemePreview(theme.id)}
                              onFocus={() => handleThemePreview(theme.id)}
                              onClick={() => handleThemeSelect(theme.id)}
                            >
                              <span
                                className="editor-theme-preview editor-theme-preview--md"
                                style={getEditorThemePreviewVars(theme.id)}
                                aria-hidden="true"
                              >
                                <span className="editor-theme-preview__gutter" />
                                <span className="editor-theme-preview__line editor-theme-preview__line--accent" />
                                <span className="editor-theme-preview__line" />
                                <span className="editor-theme-preview__line editor-theme-preview__line--soft" />
                              </span>
                              <span className="settings-theme-card-text">
                                <span className="settings-theme-card-title">
                                  <span>{theme.label}</span>
                                  <span className="settings-theme-card-family">{theme.family}</span>
                                </span>
                                <span className="settings-theme-card-desc">
                                  {theme.description}
                                </span>
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </Row>

                  <Row
                    label="현재 파일 재검증 단축키"
                    hint={
                      xmlEditor.validationFeatureEnabled
                        ? 'XML Editor 화면에서만 동작합니다. 입력 즉시 유효성 검사를 수행합니다.'
                        : '검증 기능을 켜면 XML Editor 화면에서 동작합니다.'
                    }
                    align="start"
                  >
                    <div className="settings-shortcut-input-wrap">
                      <input
                        id="revalidate-shortcut"
                        className={`settings-input${shortcutError ? ' settings-input--error' : ''}`}
                        type="text"
                        value={shortcutInput}
                        onChange={(event) => handleShortcutInputChange(event.target.value)}
                        placeholder="CmdOrCtrl+Shift+V"
                        spellCheck={false}
                        autoComplete="off"
                        disabled={!xmlEditor.validationFeatureEnabled}
                      />
                      {shortcutError && <p className="settings-error-text">{shortcutError}</p>}
                    </div>
                  </Row>

                  <Row
                    label="XML Editor 단축키 도움말"
                    hint="아래는 Monaco Editor에서 기본으로 제공되는 주요 단축키입니다."
                    align="start"
                  >
                    <ul className="settings-shortcut-list">
                      {xmlEditorShortcutHelp.map((item) => (
                        <li key={item.action} className="settings-shortcut-item">
                          <div>
                            <p className="settings-shortcut-action">{item.action}</p>
                            {item.isCustomizable ? (
                              <p className="settings-shortcut-customizable">설정에서 커스텀 가능</p>
                            ) : (
                              <p className="settings-shortcut-fixed">
                                현재 버전에서는 기본 단축키만 지원
                              </p>
                            )}
                          </div>
                          <code className="settings-shortcut-code">{item.shortcut}</code>
                        </li>
                      ))}
                    </ul>
                  </Row>
                </div>
              )}

              {activeSection === 'batch-validator' && (
                <div className="settings-form">
                  <p className="settings-placeholder">
                    Batch Validator 설정 항목은 추후 추가될 예정입니다.
                  </p>
                </div>
              )}

              {activeSection === 'extensions' && (
                <div className="settings-form">
                  <div className="ext-section-header">
                    <h2 className="ext-section-title">
                      Extensions
                      <span className="ext-section-count">{allPlugins.length}</span>
                    </h2>
                    <p className="ext-section-subtitle">
                      각 확장은 적용 가능한 문서 컨텍스트에서만 동작합니다.
                    </p>
                  </div>

                  {allPlugins.length === 0 ? (
                    <p className="settings-placeholder">등록된 확장이 없습니다.</p>
                  ) : (
                    <ul className="ext-list">
                      {allPlugins.map((plugin) => {
                        const enabled = plugins.enabled[plugin.id] !== false
                        const expanded = expandedPluginIds.has(plugin.id)
                        const detailsId = `plugin-details-${plugin.id}`
                        const initials = getPluginInitials(plugin.name)
                        const accent = getPluginAccent(plugin.id)

                        return (
                          <li
                            key={plugin.id}
                            className={`ext-row${expanded ? ' is-expanded' : ''}${enabled ? '' : ' is-disabled'}`}
                          >
                            <div
                              role="button"
                              tabIndex={0}
                              className="ext-row-summary"
                              aria-expanded={expanded}
                              aria-controls={detailsId}
                              onClick={() => togglePluginExpanded(plugin.id)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  togglePluginExpanded(plugin.id)
                                }
                              }}
                            >
                              <span
                                className="ext-row-icon"
                                style={{ background: accent.gradient, color: accent.fg }}
                                aria-hidden="true"
                              >
                                {initials}
                              </span>

                              <div className="ext-row-body">
                                <div className="ext-row-title">
                                  <span className="ext-row-name">{plugin.name}</span>
                                  <span className="ext-row-version">v{plugin.version}</span>
                                </div>
                                <p className="ext-row-description">{plugin.description}</p>
                                <div className="ext-row-meta">
                                  <span className="ext-row-publisher">{plugin.author}</span>
                                  <span className="ext-row-meta-sep">·</span>
                                  <code className="ext-row-id">{plugin.id}</code>
                                </div>
                              </div>

                              <div
                                className="ext-row-actions"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  className={`ext-action-btn${enabled ? '' : ' is-primary'}`}
                                  onClick={() => updatePluginEnabled(plugin.id, !enabled)}
                                  aria-pressed={enabled}
                                >
                                  {enabled ? 'Disable' : 'Enable'}
                                </button>
                              </div>
                            </div>

                            {expanded && (
                              <div id={detailsId} className="ext-detail">
                                <div className="ext-detail-header">
                                  <span className="ext-detail-tab is-active">Details</span>
                                </div>

                                <div className="ext-detail-body">
                                  {plugin.detailedDescription && (
                                    <article className="ext-detail-section">
                                      <h3 className="ext-detail-section-title">Description</h3>
                                      <MarkdownLite
                                        className="ext-detail-prose"
                                        source={plugin.detailedDescription}
                                      />
                                    </article>
                                  )}

                                  {plugin.preview && (
                                    <article className="ext-detail-section">
                                      <h3 className="ext-detail-section-title">Preview</h3>
                                      <div className="ext-preview-grid">
                                        <div className="ext-preview-cell">
                                          <header className="ext-preview-header">
                                            <span className="ext-preview-kind">
                                              {plugin.preview.inputLabel ?? 'Input'}
                                            </span>
                                            {plugin.preview.input.label ? (
                                              <span className="ext-preview-source">
                                                {plugin.preview.input.label}
                                              </span>
                                            ) : null}
                                          </header>
                                          <pre className="ext-preview-block">
                                            <code>{plugin.preview.input.body}</code>
                                          </pre>
                                        </div>
                                        <div className="ext-preview-cell">
                                          <header className="ext-preview-header">
                                            <span className="ext-preview-kind">
                                              {plugin.preview.outputLabel ?? 'Output'}
                                            </span>
                                            {plugin.preview.output.label ? (
                                              <span className="ext-preview-source">
                                                {plugin.preview.output.label}
                                              </span>
                                            ) : null}
                                          </header>
                                          <pre className="ext-preview-block">
                                            <code>{plugin.preview.output.body}</code>
                                          </pre>
                                        </div>
                                      </div>
                                    </article>
                                  )}

                                  <article className="ext-detail-section">
                                    <h3 className="ext-detail-section-title">More info</h3>
                                    <dl className="ext-meta-grid">
                                      <div>
                                        <dt>Identifier</dt>
                                        <dd>
                                          <code>{plugin.id}</code>
                                        </dd>
                                      </div>
                                      <div>
                                        <dt>Version</dt>
                                        <dd>{plugin.version}</dd>
                                      </div>
                                      <div>
                                        <dt>Publisher</dt>
                                        <dd>{plugin.author}</dd>
                                      </div>
                                      <div>
                                        <dt>Status</dt>
                                        <dd>
                                          <span
                                            className={`ext-status-badge${enabled ? ' is-on' : ' is-off'}`}
                                          >
                                            {enabled ? 'Enabled' : 'Disabled'}
                                          </span>
                                        </dd>
                                      </div>
                                    </dl>
                                  </article>
                                </div>
                              </div>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
