import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDocumentStore } from '../stores/document'
import { DocumentTree } from '../components/DocumentTree'
import { XmlEditor, type SchemaCursorContext } from '../components/XmlEditor'
import type { PluginContext } from '../plugins'
import { ValidationPanel } from '../components/ValidationPanel'
import {
  SchemaReferencePanel,
  type OoxmlSchemaReferenceSummary,
} from '../components/SchemaReferencePanel'
import { SchemaInspectorPanel, type SchemaInspectorQuery } from '../components/SchemaInspectorPanel'
import { SearchPanel } from '../components/SearchPanel'
import { Toolbar } from '../components/Toolbar'
import { ResizeHandle } from '../components/layout/ResizeHandle'
import { ResizablePanelStack, type StackPanel } from '../components/layout/ResizablePanelStack'
import { useSettingsStore } from '../stores/settings'
import { matchesShortcut } from '../utils/shortcuts'

const SIDEBAR_MIN = 200
const SIDEBAR_MAX = 480
const RIGHT_PANEL_MIN = 280
const RIGHT_PANEL_MAX = 640

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

interface XmlEditorScreenProps {
  onNavigateHome: () => void
  onOpenSettings: () => void
  isSettingsOpen: boolean
  onRecentRecord?: () => Promise<void> | void
}

function getFileName(filePath: string): string {
  const segments = filePath.split(/[\\/]/)
  return segments[segments.length - 1] || filePath
}

export function XmlEditorScreen({
  onNavigateHome,
  onOpenSettings,
  isSettingsOpen,
  onRecentRecord,
}: XmlEditorScreenProps) {
  const {
    filePath,
    fileData,
    documentData,
    selectedPart,
    partContent,
    validationResults,
    isLoading,
    isValidating,
    error,
    setFilePath,
    shouldWarnBeforeOverwrite,
    loadDocument,
    selectPart,
    updatePartContent,
    modifiedContent,
    saveDocument,
    saveDocumentAs,
    validate,
    clearError,
    isCompareMode,
    comparisonFilePath,
    comparisonDocumentData,
    comparisonPartContent,
    partDiffStatus,
    loadComparison,
    exitCompare,
    searchResults,
    isSearching,
    searchDocument,
    clearSearch,
  } = useDocumentStore()
  const validationFeatureEnabled = useSettingsStore(
    (state) => state.xmlEditor.validationFeatureEnabled
  )
  const validateOnOpen = useSettingsStore((state) => state.xmlEditor.validateOnOpen)
  const revalidateShortcut = useSettingsStore((state) => state.xmlEditor.revalidateShortcut)
  const schemaHoverEnabled = useSettingsStore((state) => state.xmlEditor.schemaHoverEnabled)

  const [showValidation, setShowValidation] = useState(true)
  const [showSearch, setShowSearch] = useState(false)
  const [showInspector, setShowInspector] = useState(true)
  const [cursorContext, setCursorContext] = useState<SchemaCursorContext | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const [rightPanelWidth, setRightPanelWidth] = useState(320)

  const [schemaReferenceSummary, setSchemaReferenceSummary] =
    useState<OoxmlSchemaReferenceSummary | null>(null)
  const [isSchemaReferenceLoading, setIsSchemaReferenceLoading] = useState(false)
  const [schemaReferenceError, setSchemaReferenceError] = useState<string | null>(null)

  const isDirty = !isCompareMode && modifiedContent !== null && modifiedContent !== partContent

  const isOoxml = documentData?.containerFormat === 'ooxml'

  const inspectorQuery = useMemo<SchemaInspectorQuery | null>(() => {
    if (!cursorContext) return null
    return {
      rawName: cursorContext.rawName,
      path: cursorContext.path,
      attributeName: cursorContext.attributeName,
    }
  }, [cursorContext])

  const handleToggleCompare = useCallback(async () => {
    if (isCompareMode) {
      exitCompare()
      return
    }
    const path = await window.electronAPI.openFile()
    if (!path) return
    await loadComparison(path)
  }, [isCompareMode, exitCompare, loadComparison])

  const confirmFileChangeIfNeeded = useCallback(async () => {
    if (!isDirty) return true

    const choice = await window.electronAPI.confirmFileChange()
    if (choice === 'cancel') return false
    if (choice === 'discard') return true
    if (!filePath) return false

    return saveDocument(filePath)
  }, [filePath, isDirty, saveDocument])

  const executeSave = useCallback(async () => {
    if (!filePath) return false

    if (shouldWarnBeforeOverwrite()) {
      const confirmed = await window.electronAPI.confirmOverwriteOriginal(filePath)
      if (!confirmed) return false
    }

    const saved = await saveDocument(filePath)
    if (!saved) return false

    if (validationFeatureEnabled) {
      await validate()
      setShowValidation(true)
    }
    return true
  }, [filePath, saveDocument, shouldWarnBeforeOverwrite, validate, validationFeatureEnabled])

  const loadFileAtPath = useCallback(
    async (path: string) => {
      setFilePath(path)
      const loaded = await loadDocument(path)
      if (!loaded) return false

      await window.electronAPI.addRecentFile({
        filePath: path,
        fileName: getFileName(path),
        lastTool: 'xml-editor',
      })
      await onRecentRecord?.()

      if (validationFeatureEnabled && validateOnOpen) {
        await validate()
        setShowValidation(true)
      }

      return true
    },
    [loadDocument, onRecentRecord, setFilePath, validate, validateOnOpen, validationFeatureEnabled]
  )

  const handleChangeFile = useCallback(
    async (nextPath?: string) => {
      const canChangeFile = await confirmFileChangeIfNeeded()
      if (!canChangeFile) return

      const path = nextPath ?? (await window.electronAPI.openFile())
      if (!path) return

      await loadFileAtPath(path)
    },
    [confirmFileChangeIfNeeded, loadFileAtPath]
  )

  // Handle file open from menu
  useEffect(() => {
    const cleanup = window.electronAPI.onFileOpened(async (path) => {
      await handleChangeFile(path)
    })
    return cleanup
  }, [handleChangeFile])

  // Handle save from menu
  useEffect(() => {
    const cleanup = window.electronAPI.onMenuSave(async () => {
      await executeSave()
    })
    return cleanup
  }, [executeSave])

  // Handle save-as from menu
  useEffect(() => {
    const cleanup = window.electronAPI.onMenuSaveAs(async () => {
      const newPath = await window.electronAPI.saveFile(filePath ?? undefined)
      if (newPath) {
        const saved = await saveDocumentAs(newPath)
        if (saved && validationFeatureEnabled) {
          await validate()
          setShowValidation(true)
        }
      }
    })
    return cleanup
  }, [filePath, saveDocumentAs, validate, validationFeatureEnabled])

  // Handle validate from menu
  useEffect(() => {
    const cleanup = window.electronAPI.onMenuValidate(async () => {
      if (!validationFeatureEnabled) return
      await validate()
      setShowValidation(true)
    })
    return cleanup
  }, [validate, validationFeatureEnabled])

  useEffect(() => {
    if (!validationFeatureEnabled) {
      setShowValidation(false)
    }
  }, [validationFeatureEnabled])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!documentData) return
      if (!validationFeatureEnabled) return
      if (isSettingsOpen) return
      if (event.repeat) return
      if (!matchesShortcut(event, revalidateShortcut)) return

      event.preventDefault()
      void (async () => {
        await validate()
        setShowValidation(true)
      })()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [documentData, isSettingsOpen, revalidateShortcut, validate, validationFeatureEnabled])

  const handleSave = async () => {
    await executeSave()
  }

  const handleSaveAs = async () => {
    const newPath = await window.electronAPI.saveFile(filePath ?? undefined)
    if (newPath) {
      const saved = await saveDocumentAs(newPath)
      if (saved && validationFeatureEnabled) {
        await validate()
        setShowValidation(true)
      }
    }
  }

  const handleSelectPart = async (partPath: string) => {
    await selectPart(partPath)
  }

  const getPluginContext = useCallback((): PluginContext | null => {
    const state = useDocumentStore.getState()
    if (!state.fileData || !state.filePath || !state.selectedPart || !state.documentData) {
      return null
    }
    const currentFilePath = state.filePath
    return {
      filePath: currentFilePath,
      partPath: state.selectedPart,
      containerFormat: state.documentData.containerFormat,
      documentType: state.documentData.documentType,
      parts: state.documentData.parts,
      getPart: async (path) => {
        const fresh = useDocumentStore.getState()
        if (!fresh.fileData) return null
        const result = await window.electronAPI.getPart(
          fresh.fileData,
          path,
          fresh.filePath ?? undefined
        )
        if (!result?.success) return null
        return (result.data ?? null) as string | null
      },
    }
  }, [])

  const handleContentChange = (content: string) => {
    updatePartContent(content)
  }

  const handleValidate = async () => {
    if (!validationFeatureEnabled) return
    await validate()
    setShowValidation(true)
  }

  useEffect(() => {
    if (!fileData || !documentData || documentData.containerFormat !== 'ooxml') {
      setSchemaReferenceSummary(null)
      setSchemaReferenceError(null)
      setIsSchemaReferenceLoading(false)
      return
    }

    let cancelled = false
    setIsSchemaReferenceLoading(true)

    const timeout = window.setTimeout(async () => {
      try {
        let base64Data = fileData

        if (modifiedContent !== null && selectedPart) {
          const updated = await window.electronAPI.updatePart(
            fileData,
            selectedPart,
            modifiedContent
          )
          if (updated.success && updated.data) {
            base64Data = updated.data
          }
        }

        const result = await window.electronAPI.analyzeSchemaReferences(base64Data)
        if (cancelled) return

        if (!result.success) {
          setSchemaReferenceSummary(null)
          setSchemaReferenceError(result.error || '문서 스키마 참조 분석에 실패했습니다.')
          return
        }

        setSchemaReferenceSummary(result.data ?? null)
        setSchemaReferenceError(null)
      } catch {
        if (cancelled) return

        setSchemaReferenceSummary(null)
        setSchemaReferenceError('문서 스키마 참조 분석 중 오류가 발생했습니다.')
      } finally {
        if (!cancelled) {
          setIsSchemaReferenceLoading(false)
        }
      }
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [documentData, fileData, modifiedContent, selectedPart])

  const rightPanels: StackPanel[] = []
  if (documentData) {
    if (showSearch) {
      rightPanels.push({
        key: 'search',
        label: '검색',
        node: (
          <SearchPanel
            results={searchResults}
            isSearching={isSearching}
            onSearch={(q) => void searchDocument(q)}
            onClear={clearSearch}
            onNavigate={handleSelectPart}
            onClose={() => setShowSearch(false)}
          />
        ),
      })
    }
    if (validationFeatureEnabled && showValidation) {
      rightPanels.push({
        key: 'validation',
        label: '검증 결과',
        node: (
          <ValidationPanel
            results={validationResults}
            isValidating={isValidating}
            onClose={() => setShowValidation(false)}
            onNavigate={handleSelectPart}
            onRevalidate={handleValidate}
          />
        ),
      })
    }
    if (isOoxml && showInspector && !isCompareMode) {
      rightPanels.push({
        key: 'inspector',
        label: '스키마 인스펙터',
        node: (
          <SchemaInspectorPanel
            query={inspectorQuery}
            documentType={documentData.documentType}
            onClose={() => setShowInspector(false)}
          />
        ),
      })
    }
    if (documentData.containerFormat === 'ooxml') {
      rightPanels.push({
        key: 'schemaRef',
        label: '스키마 참조',
        node: (
          <SchemaReferencePanel
            summary={schemaReferenceSummary}
            isLoading={isSchemaReferenceLoading}
            error={schemaReferenceError}
          />
        ),
      })
    }
  }

  return (
    <>
      <Toolbar
        onOpenFile={() => void handleChangeFile()}
        openLabel={documentData ? '파일 변경' : '파일 열기'}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onValidate={handleValidate}
        validationEnabled={validationFeatureEnabled}
        onOpenSettings={onOpenSettings}
        hasDocument={!!documentData}
        filePath={filePath}
        isDirty={isDirty}
        onNavigateHome={onNavigateHome}
        isCompareMode={isCompareMode}
        onToggleCompare={() => void handleToggleCompare()}
        isSearchOpen={showSearch}
        onToggleSearch={() => setShowSearch((prev) => !prev)}
        isInspectorOpen={showInspector}
        onToggleInspector={isOoxml ? () => setShowInspector((prev) => !prev) : undefined}
      />

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={clearError}>×</button>
        </div>
      )}

      <div className="main-content">
        {!documentData ? (
          <div className="welcome">
            <h1>OOXML Validator</h1>
            <p>OOXML 또는 ODF 문서(xlsx, docx, pptx, odt, ods, odp)를 열어 시작하세요</p>
            <button onClick={() => void handleChangeFile()}>파일 열기</button>
          </div>
        ) : (
          <>
            <aside className="sidebar" style={{ width: sidebarWidth }}>
              <DocumentTree
                containerFormat={documentData.containerFormat}
                documentType={documentData.documentType}
                parts={documentData.parts}
                selectedPart={selectedPart}
                onSelectPart={handleSelectPart}
                comparisonParts={isCompareMode ? comparisonDocumentData?.parts : undefined}
                partDiffStatus={isCompareMode ? partDiffStatus : undefined}
              />
            </aside>

            <ResizeHandle
              orientation="vertical"
              ariaLabel="사이드바 너비 조절"
              onResize={(delta) =>
                setSidebarWidth((width) => clamp(width + delta, SIDEBAR_MIN, SIDEBAR_MAX))
              }
            />

            <main className="editor-container">
              {selectedPart && partContent !== null ? (
                <XmlEditor
                  content={partContent}
                  partPath={selectedPart}
                  onChange={handleContentChange}
                  getPluginContext={getPluginContext}
                  compareMode={isCompareMode}
                  comparisonContent={isCompareMode ? comparisonPartContent : null}
                  primaryLabel={filePath ? filePath.split(/[\\/]/).pop() : undefined}
                  comparisonLabel={
                    comparisonFilePath ? comparisonFilePath.split(/[\\/]/).pop() : undefined
                  }
                  documentType={documentData.documentType}
                  schemaHoverEnabled={isOoxml && !isCompareMode && schemaHoverEnabled}
                  onSchemaContextChange={isOoxml && !isCompareMode ? setCursorContext : undefined}
                />
              ) : isLoading ? (
                <div className="loading">불러오는 중…</div>
              ) : (
                <div className="placeholder">트리에서 파트를 선택하면 내용이 표시됩니다</div>
              )}
            </main>

            {rightPanels.length > 0 && (
              <>
                <ResizeHandle
                  orientation="vertical"
                  ariaLabel="우측 패널 너비 조절"
                  onResize={(delta) =>
                    setRightPanelWidth((width) =>
                      clamp(width - delta, RIGHT_PANEL_MIN, RIGHT_PANEL_MAX)
                    )
                  }
                />
                <aside className="right-panels" style={{ width: rightPanelWidth }}>
                  <ResizablePanelStack panels={rightPanels} />
                </aside>
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}
