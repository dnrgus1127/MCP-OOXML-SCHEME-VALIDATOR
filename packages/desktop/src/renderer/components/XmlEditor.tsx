import { useEffect, useRef, useState } from 'react'
import { getEditorThemeLabel, registerEditorThemes } from '../constants/editorTheme'
import { useSettingsStore } from '../stores/settings'
import { getActivePlugins, type PluginContext } from '../plugins'
import { lspClient, lspLog } from '../lsp/client'
import { diagnosticsToMarkers, LSP_MARKER_OWNER } from '../lsp/markers'

type PluginContextProvider = () => PluginContext | null

interface XmlEditorProps {
  content: string
  partPath: string
  onChange: (content: string) => void
  getPluginContext?: PluginContextProvider
  compareMode?: boolean
  comparisonContent?: string | null
  primaryLabel?: string
  comparisonLabel?: string
}

// Format XML with proper indentation
function formatXml(xml: string): string {
  try {
    let formatted = xml
      // Remove existing whitespace between tags
      .replace(/>\s+</g, '><')
      // Add newlines
      .replace(/></g, '>\n<')

    // Indent
    const lines = formatted.split('\n')
    let indent = 0
    const indentedLines = lines.map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return ''

      const isClosingTag = trimmed.startsWith('</')
      const isOpeningTag =
        trimmed.startsWith('<') &&
        !isClosingTag &&
        !trimmed.startsWith('<?') &&
        !trimmed.startsWith('<!')
      const isSelfClosingTag = trimmed.endsWith('/>')
      const isInlineTag = isOpeningTag && trimmed.includes('</')

      // Decrease indent for closing tags
      if (isClosingTag) {
        indent = Math.max(0, indent - 1)
      }

      const indentedLine = '  '.repeat(indent) + trimmed

      // Increase indent only for true container opening tags.
      // Inline tags like <AppVersion>1.0</AppVersion> should stay on the same level.
      if (isOpeningTag && !isSelfClosingTag && !isInlineTag) {
        indent++
      }

      return indentedLine
    })

    return indentedLines.join('\n')
  } catch {
    return xml
  }
}

export function XmlEditor({
  content,
  partPath,
  onChange,
  getPluginContext,
  compareMode = false,
  comparisonContent = null,
  primaryLabel,
  comparisonLabel,
}: XmlEditorProps) {
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<any>(null)
  const diffEditorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const hoverProviderRef = useRef<{ dispose: () => void } | null>(null)
  const pluginCtxProviderRef = useRef<PluginContextProvider | undefined>(getPluginContext)

  const [localContent, setLocalContent] = useState(() => formatXml(content))
  const [isMonacoReady, setIsMonacoReady] = useState(false)
  const [monacoLoadError, setMonacoLoadError] = useState(false)
  const [hasLspPackage, setHasLspPackage] = useState(() => lspClient.hasPackage())
  const editorTheme = useSettingsStore((state) => state.effectiveEditorTheme)

  useEffect(() => {
    return lspClient.onPackageReady(() => setHasLspPackage(true))
  }, [])

  useEffect(() => {
    pluginCtxProviderRef.current = getPluginContext
  }, [getPluginContext])

  useEffect(() => {
    let disposed = false

    async function initMonaco() {
      if (!editorContainerRef.current) return
      if (editorRef.current || diffEditorRef.current) return

      try {
        const monaco = await import('monaco-editor')
        if (disposed || !editorContainerRef.current) return

        registerEditorThemes(monaco)
        monacoRef.current = monaco

        if (compareMode) {
          const formattedPrimary = formatXml(content)
          const formattedComparison = formatXml(comparisonContent ?? '')
          const originalModel = monaco.editor.createModel(formattedPrimary, 'xml')
          const modifiedModel = monaco.editor.createModel(formattedComparison, 'xml')

          diffEditorRef.current = monaco.editor.createDiffEditor(editorContainerRef.current, {
            theme: editorTheme,
            automaticLayout: true,
            readOnly: true,
            originalEditable: false,
            renderSideBySide: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 12,
            lineHeight: 18,
            ignoreTrimWhitespace: false,
          })
          diffEditorRef.current.setModel({ original: originalModel, modified: modifiedModel })
          setIsMonacoReady(true)
          return
        }

        editorRef.current = monaco.editor.create(editorContainerRef.current, {
          value: localContent,
          language: 'xml',
          theme: editorTheme,
          automaticLayout: true,
          minimap: { enabled: false },
          // Monaco 기본 gutter/folding 사용 (라인 번호/접기 영역 자동 동기화)
          folding: true,
          showFoldingControls: 'mouseover',
          scrollBeyondLastLine: false,
          fontSize: 12,
          lineHeight: 18,
          tabSize: 2,
          insertSpaces: true,
          glyphMargin: true,
          renderValidationDecorations: 'on',
        })

        editorRef.current.onDidChangeModelContent(() => {
          const value = editorRef.current?.getValue() ?? ''
          setLocalContent(value)
          onChange(value)
        })

        hoverProviderRef.current = monaco.languages.registerHoverProvider('xml', {
          provideHover: async (model, position, token) => {
            const provider = pluginCtxProviderRef.current
            if (!provider) return null
            const ctx = provider()
            if (!ctx) return null
            if (model.uri.toString() !== editorRef.current?.getModel()?.uri.toString()) {
              return null
            }

            const enabled = useSettingsStore.getState().plugins.enabled
            const active = getActivePlugins(ctx, enabled)

            for (const plugin of active) {
              if (!plugin.hooks.provideMonacoHover) continue
              try {
                const result = await plugin.hooks.provideMonacoHover(ctx, {
                  monaco,
                  model,
                  position,
                  token,
                })
                if (token.isCancellationRequested) return null
                if (result) {
                  return {
                    contents: result.contents.map((value) => ({ value })),
                    range: result.range,
                  }
                }
              } catch {
                continue
              }
            }
            return null
          },
        })

        setIsMonacoReady(true)
      } catch {
        setMonacoLoadError(true)
      }
    }

    initMonaco()

    return () => {
      disposed = true
      hoverProviderRef.current?.dispose()
      hoverProviderRef.current = null

      const diffModel = diffEditorRef.current?.getModel?.()
      diffEditorRef.current?.dispose?.()
      diffEditorRef.current = null
      diffModel?.original?.dispose?.()
      diffModel?.modified?.dispose?.()

      editorRef.current?.dispose?.()
      editorRef.current = null
      monacoRef.current = null
      setIsMonacoReady(false)
    }
  }, [compareMode])

  useEffect(() => {
    if (!monacoRef.current) return
    monacoRef.current.editor.setTheme(editorTheme)
  }, [editorTheme])

  useEffect(() => {
    lspLog(
      `[xml-editor effect] monacoReady=${isMonacoReady} compare=${compareMode} hasPkg=${hasLspPackage} partPath=${partPath}`
    )
    if (!isMonacoReady || compareMode || !hasLspPackage) return
    const monaco = monacoRef.current
    const editor = editorRef.current
    if (!monaco || !editor) {
      lspLog('[xml-editor effect] monaco/editor ref missing')
      return
    }
    const model = editor.getModel?.()
    if (!model) {
      lspLog('[xml-editor effect] model missing')
      return
    }
    const uri = lspClient.virtualUriFor(partPath)
    if (!uri) {
      lspLog(`[lsp] no virtual URI yet (package not loaded). partPath=${partPath}`)
      return
    }
    lspLog(`[lsp] subscribe diagnostics for ${uri}`)

    const decorations = editor.createDecorationsCollection([])

    const cleanup = lspClient.onDiagnostics(uri, (diagnostics) => {
      const markers = diagnosticsToMarkers(monaco, diagnostics)
      monaco.editor.setModelMarkers(model, LSP_MARKER_OWNER, markers)

      decorations.set(
        markers.map((m) => {
          const safeStartLine = Math.max(1, Math.min(m.startLineNumber, model.getLineCount()))
          const lineMax = model.getLineMaxColumn(safeStartLine)
          const startCol = Math.max(1, Math.min(m.startColumn, lineMax))
          const endCol = Math.max(startCol, Math.min(m.endColumn, lineMax))
          const inlineClass =
            m.severity >= monaco.MarkerSeverity.Error
              ? 'ooxml-lsp-error-inline'
              : 'ooxml-lsp-warning-inline'
          const glyphClass =
            m.severity >= monaco.MarkerSeverity.Error
              ? 'ooxml-lsp-error-glyph'
              : 'ooxml-lsp-warning-glyph'
          return {
            range: new monaco.Range(safeStartLine, startCol, m.endLineNumber, endCol),
            options: {
              inlineClassName: inlineClass,
              glyphMarginClassName: glyphClass,
              hoverMessage: { value: `**${m.source ?? 'lsp'}** ${m.code ?? ''}\n\n${m.message}` },
              overviewRuler: {
                color:
                  m.severity >= monaco.MarkerSeverity.Error
                    ? 'rgba(244,71,71,0.9)'
                    : 'rgba(255,184,0,0.9)',
                position: monaco.editor.OverviewRulerLane.Right,
              },
            },
          }
        })
      )

      lspLog(
        `[lsp] applying ${markers.length} markers to ${uri} | decorations + setModelMarkers applied`
      )
    })

    return () => {
      cleanup()
      decorations.clear()
      monaco.editor.setModelMarkers(model, LSP_MARKER_OWNER, [])
    }
  }, [isMonacoReady, compareMode, partPath, hasLspPackage])

  useEffect(() => {
    if (compareMode) {
      if (!monacoRef.current || !diffEditorRef.current) return
      const monaco = monacoRef.current
      const formattedPrimary = formatXml(content)
      const formattedComparison = formatXml(comparisonContent ?? '')

      const oldModel = diffEditorRef.current.getModel?.()
      const originalModel = monaco.editor.createModel(formattedPrimary, 'xml')
      const modifiedModel = monaco.editor.createModel(formattedComparison, 'xml')
      diffEditorRef.current.setModel({ original: originalModel, modified: modifiedModel })
      oldModel?.original?.dispose?.()
      oldModel?.modified?.dispose?.()
      return
    }

    const formatted = formatXml(content)
    setLocalContent(formatted)

    if (editorRef.current && editorRef.current.getValue() !== formatted) {
      editorRef.current.setValue(formatted)
      editorRef.current.trigger('xml-editor', 'editor.unfoldAll', null)
    }
  }, [content, comparisonContent, partPath, compareMode])

  const handleFormat = () => {
    if (compareMode) return
    const result = formatXml(editorRef.current?.getValue() ?? localContent)
    setLocalContent(result)
    onChange(result)
    if (editorRef.current && editorRef.current.getValue() !== result) {
      editorRef.current.setValue(result)
    }
  }

  const handleCollapseAll = () => {
    if (compareMode) return
    editorRef.current?.trigger('xml-editor', 'editor.foldAll', null)
  }

  const handleExpandAll = () => {
    if (compareMode) return
    editorRef.current?.trigger('xml-editor', 'editor.unfoldAll', null)
  }

  return (
    <div
      className={`xml-editor${compareMode ? ' xml-editor--compare' : ''}`}
      data-editor-theme={editorTheme}
    >
      <div className="editor-header">
        <div className="editor-meta">
          <span className="part-path">{partPath}</span>
          {compareMode ? (
            <span className="compare-labels">
              <span className="compare-label compare-label--primary">
                ◀ {primaryLabel ?? 'Primary'}
              </span>
              <span className="compare-label compare-label--comparison">
                {comparisonLabel ?? 'Comparison'} ▶
              </span>
            </span>
          ) : null}
          <span className="editor-theme-badge" aria-label={`Current editor theme: ${editorTheme}`}>
            {getEditorThemeLabel(editorTheme)}
          </span>
        </div>
        <div className="editor-actions">
          <button
            onClick={handleCollapseAll}
            className="editor-btn"
            disabled={!isMonacoReady || compareMode}
          >
            전체 접기
          </button>
          <button
            onClick={handleExpandAll}
            className="editor-btn"
            disabled={!isMonacoReady || compareMode}
          >
            전체 펼치기
          </button>
          <button
            onClick={handleFormat}
            className="editor-btn"
            disabled={(!isMonacoReady && !monacoLoadError) || compareMode}
          >
            Format
          </button>
        </div>
      </div>

      <div className="editor-body monaco-mode">
        <div className="editor-content">
          <div ref={editorContainerRef} className="monaco-editor-host" />

          {monacoLoadError ? (
            <div className="editor-fallback-message">
              Monaco Editor를 로드하지 못했습니다. 의존성 설치 상태를 확인해주세요.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
