import { useEffect, useRef, useState } from 'react'
import { getEditorThemeLabel, registerEditorThemes } from '../constants/editorTheme'
import { useSettingsStore } from '../stores/settings'
import { getActivePlugins, type PluginContext } from '../plugins'
import { lspClient, lspLog } from '../lsp/client'
import { diagnosticsToMarkers, LSP_MARKER_OWNER } from '../lsp/markers'
import {
  buildSchemaPath,
  collectXmlnsBindings,
  resolveCursorContext,
  resolveNamespaceUri,
  type SchemaPathStep,
} from '../schema/cursor-context'
import { lookupSchemaElementByPath } from '../schema/schemaInspector'
import { formatSchemaHoverMarkdown } from '../schema/describe-format'

type PluginContextProvider = () => PluginContext | null

export interface SchemaCursorContext {
  rawName: string
  localName: string
  attributeName?: string
  namespaceUri: string | null
  path: SchemaPathStep[]
}

interface XmlEditorProps {
  content: string
  partPath: string
  onChange: (content: string) => void
  getPluginContext?: PluginContextProvider
  compareMode?: boolean
  comparisonContent?: string | null
  primaryLabel?: string
  comparisonLabel?: string
  /** OOXML 문서 타입 (스키마 레지스트리 선택용) */
  documentType?: string
  /** 스키마 기반 hover 활성화 */
  schemaHoverEnabled?: boolean
  /** 커서 위치의 요소/속성 컨텍스트 변경 알림 */
  onSchemaContextChange?: (context: SchemaCursorContext | null) => void
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
  documentType,
  schemaHoverEnabled = false,
  onSchemaContextChange,
}: XmlEditorProps) {
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<any>(null)
  const diffEditorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const hoverProviderRef = useRef<{ dispose: () => void } | null>(null)
  const pluginCtxProviderRef = useRef<PluginContextProvider | undefined>(getPluginContext)
  const documentTypeRef = useRef<string | undefined>(documentType)
  const schemaHoverEnabledRef = useRef<boolean>(schemaHoverEnabled)
  const onSchemaContextChangeRef =
    useRef<XmlEditorProps['onSchemaContextChange']>(onSchemaContextChange)
  const cursorContextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [localContent, setLocalContent] = useState(() => formatXml(content))
  const [isMonacoReady, setIsMonacoReady] = useState(false)
  const [monacoLoadError, setMonacoLoadError] = useState(false)
  const [hasLspPackage, setHasLspPackage] = useState(() => lspClient.hasPackage())
  const editorTheme = useSettingsStore((state) => state.effectiveEditorTheme)
  const lspMarkersEnabled = useSettingsStore((state) => state.xmlEditor.lspMarkersEnabled)

  useEffect(() => {
    return lspClient.onPackageReady(() => setHasLspPackage(true))
  }, [])

  useEffect(() => {
    pluginCtxProviderRef.current = getPluginContext
  }, [getPluginContext])

  useEffect(() => {
    documentTypeRef.current = documentType
  }, [documentType])

  useEffect(() => {
    schemaHoverEnabledRef.current = schemaHoverEnabled
  }, [schemaHoverEnabled])

  useEffect(() => {
    onSchemaContextChangeRef.current = onSchemaContextChange
  }, [onSchemaContextChange])

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

        const emitCursorContext = () => {
          const notify = onSchemaContextChangeRef.current
          if (!notify) return
          if (cursorContextTimerRef.current) clearTimeout(cursorContextTimerRef.current)
          cursorContextTimerRef.current = setTimeout(() => {
            const editor = editorRef.current
            const model = editor?.getModel?.()
            const position = editor?.getPosition?.()
            if (!model || !position) {
              notify(null)
              return
            }
            const text = model.getValue()
            const offset = model.getOffsetAt(position)
            const cursorContext = resolveCursorContext(text, offset)
            if (!cursorContext) {
              notify(null)
              return
            }
            const bindings = collectXmlnsBindings(text)
            const namespaceUri = resolveNamespaceUri(cursorContext, bindings)
            const path = buildSchemaPath(cursorContext, bindings) ?? []
            notify({
              rawName: cursorContext.rawName,
              localName: cursorContext.localName,
              attributeName: cursorContext.attributeName,
              namespaceUri,
              path,
            })
          }, 150)
        }

        editorRef.current.onDidChangeModelContent(() => {
          const value = editorRef.current?.getValue() ?? ''
          setLocalContent(value)
          onChange(value)
          emitCursorContext()
        })

        editorRef.current.onDidChangeCursorPosition(() => {
          emitCursorContext()
        })

        emitCursorContext()

        hoverProviderRef.current = monaco.languages.registerHoverProvider('xml', {
          provideHover: async (model, position, token) => {
            if (model.uri.toString() !== editorRef.current?.getModel()?.uri.toString()) {
              return null
            }

            // 1) 플러그인 hover (플러그인 컨텍스트가 있을 때만)
            const provider = pluginCtxProviderRef.current
            const ctx = provider?.() ?? null
            if (ctx) {
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
            }

            // 2) 스키마 기반 hover
            if (!schemaHoverEnabledRef.current) return null
            const text = model.getValue()
            const offset = model.getOffsetAt(position)
            const cursorContext = resolveCursorContext(text, offset)
            if (!cursorContext) return null
            const bindings = collectXmlnsBindings(text)
            const path = buildSchemaPath(cursorContext, bindings)
            if (!path) return null

            const description = await lookupSchemaElementByPath(
              documentTypeRef.current ?? 'unknown',
              path
            )
            if (token.isCancellationRequested || !description) return null
            const markdown = formatSchemaHoverMarkdown(description, cursorContext.attributeName)
            if (markdown.length === 0) return null
            return { contents: markdown.map((value) => ({ value })) }
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

      if (cursorContextTimerRef.current) {
        clearTimeout(cursorContextTimerRef.current)
        cursorContextTimerRef.current = null
      }

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
      `[xml-editor effect] monacoReady=${isMonacoReady} compare=${compareMode} hasPkg=${hasLspPackage} lspMarkers=${lspMarkersEnabled} partPath=${partPath}`
    )
    if (!isMonacoReady || compareMode || !hasLspPackage || !lspMarkersEnabled) return
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
  }, [isMonacoReady, compareMode, partPath, hasLspPackage, lspMarkersEnabled])

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
