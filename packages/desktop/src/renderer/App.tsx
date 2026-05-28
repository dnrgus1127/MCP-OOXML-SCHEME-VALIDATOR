import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { BatchValidator } from './components/BatchValidator'
import { QuickOpenPalette } from './components/QuickOpenPalette'
import { SettingsScreen } from './screens/SettingsScreen'
import { HomeScreen } from './screens/HomeScreen'
import { SupportedSchemasScreen } from './screens/SupportedSchemasScreen'
import { XmlEditorScreen } from './screens/XmlEditorScreen'
import { useDocumentStore } from './stores/document'
import { useSettingsStore } from './stores/settings'
import type { OpenTool, RecentFileEntry } from '../shared/recent-files'
import { getEditorThemeCssVars } from './constants/editorTheme'

declare global {
  interface Window {
    electronAPI: {
      openFile: () => Promise<string | null>
      openDroppedFiles: (filePaths: string[]) => Promise<string[]>
      saveFile: (defaultPath?: string) => Promise<string | null>
      confirmFileChange: () => Promise<'save' | 'discard' | 'cancel'>
      confirmOverwriteOriginal: (filePath?: string) => Promise<boolean>
      readFile: (filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>
      writeFile: (filePath: string, data: string) => Promise<{ success: boolean; error?: string }>
      fileExists: (filePath: string) => Promise<boolean>
      pickFolder: (defaultPath?: string) => Promise<string | null>
      listFolders: (folderPaths: string[]) => Promise<{
        success: boolean
        data?: Array<{
          fileName: string
          filePath: string
          modifiedAt: number
          size: number
          folderPath: string
        }>
        missingFolders?: string[]
        error?: string
      }>
      getRecentFiles: () => Promise<RecentFileEntry[]>
      addRecentFile: (input: {
        filePath: string
        fileName?: string
        lastTool: OpenTool
      }) => Promise<RecentFileEntry[]>
      addRecentFiles: (
        inputs: Array<{
          filePath: string
          fileName?: string
          lastTool: OpenTool
        }>
      ) => Promise<RecentFileEntry[]>
      removeRecentFile: (filePath: string) => Promise<RecentFileEntry[]>
      clearRecentFiles: () => Promise<RecentFileEntry[]>
      getSupportedSchemaList: () => Promise<
        Array<{
          category: string
          schemaName: string
          namespaceUri: string
          specType: 'Strict' | 'Transitional' | 'Other'
        }>
      >
      parseDocument: (
        base64Data: string,
        filePath?: string
      ) => Promise<{ success: boolean; data?: any; error?: string }>
      getPart: (
        base64Data: string,
        partPath: string,
        filePath?: string
      ) => Promise<{ success: boolean; data?: string; error?: string }>
      updatePart: (
        base64Data: string,
        partPath: string,
        content: string,
        filePath?: string
      ) => Promise<{ success: boolean; data?: string; error?: string }>
      validate: (
        base64Data: string,
        filePath?: string
      ) => Promise<{ success: boolean; data?: any; error?: string }>
      analyzeSchemaReferences: (
        base64Data: string
      ) => Promise<{ success: boolean; data?: any; error?: string }>
      searchDocument: (
        base64Data: string,
        query: string,
        filePath?: string
      ) => Promise<{ success: boolean; data?: any; error?: string }>
      openFiles: () => Promise<string[] | null>
      batchValidate: (
        filePaths: string[]
      ) => Promise<{ success: boolean; data?: any; error?: string }>
      exportResults: (
        format: 'json' | 'csv' | 'html' | 'pdf',
        data: any
      ) => Promise<{ success: boolean; filePath?: string; error?: string }>
      onBatchProgress: (
        callback: (progress: { current: number; total: number }) => void
      ) => () => void
      onFileOpened: (callback: (filePath: string) => void) => () => void
      onFilesOpened: (callback: (filePaths: string[]) => void) => () => void
      onMenuSave: (callback: () => void) => () => void
      onMenuSaveAs: (callback: () => void) => () => void
      onMenuValidate: (callback: () => void) => () => void
      onMenuQuickOpen: (callback: () => void) => () => void
      lsp: {
        start: (options?: {
          enableMsValidator?: boolean
          msValidatorBinPath?: string
          deepValidate?: 'on-change' | 'on-save' | 'manual'
          fileFormatVersion?: string
        }) => Promise<{ success: boolean; error?: string }>
        stop: () => Promise<{ success: boolean; error?: string }>
        request: <T = unknown>(
          method: string,
          params?: unknown
        ) => Promise<{ success: true; data: T } | { success: false; error: string }>
        notify: (
          method: string,
          params?: unknown
        ) => Promise<{ success: boolean; error?: string }>
        onNotification: (
          callback: (message: { method: string; params: unknown }) => void
        ) => () => void
      }
    }
  }
}

type Screen = 'home' | 'xml-editor' | 'batch-validator' | 'supported-schemas'
type FileWithPath = File & { path?: string }

const XML_EDITOR_EXTENSIONS = ['.xlsx', '.docx', '.pptx', '.odt', '.ods', '.odp']
const BATCH_EXTENSIONS = ['.xlsx', '.docx', '.pptx']

function getFileName(filePath: string): string {
  const segments = filePath.split(/[\\/]/)
  return segments[segments.length - 1] || filePath
}

function hasExtension(filePath: string, extensions: string[]): boolean {
  const lower = filePath.toLowerCase()
  return extensions.some((extension) => lower.endsWith(extension))
}

function isSupportedOfficePath(filePath: string): boolean {
  return hasExtension(filePath, XML_EDITOR_EXTENSIONS)
}

function isBatchOfficePath(filePath: string): boolean {
  return hasExtension(filePath, BATCH_EXTENSIONS)
}

function getDroppedFilePaths(dataTransfer: DataTransfer): string[] {
  const uniquePaths = new Set<string>()

  for (const item of Array.from(dataTransfer.files)) {
    const file = item as FileWithPath
    const path = typeof file.path === 'string' ? file.path.trim() : ''
    if (!path) continue
    if (!isSupportedOfficePath(path)) continue
    uniquePaths.add(path)
  }

  return Array.from(uniquePaths)
}

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isQuickOpenOpen, setIsQuickOpenOpen] = useState(false)
  const [recentFiles, setRecentFiles] = useState<RecentFileEntry[]>([])
  const [recentError, setRecentError] = useState<string | null>(null)
  const [batchInitialFilePaths, setBatchInitialFilePaths] = useState<string[] | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)

  const filePath = useDocumentStore((state) => state.filePath)
  const modifiedContent = useDocumentStore((state) => state.modifiedContent)
  const partContent = useDocumentStore((state) => state.partContent)
  const setFilePath = useDocumentStore((state) => state.setFilePath)
  const loadDocument = useDocumentStore((state) => state.loadDocument)
  const saveDocument = useDocumentStore((state) => state.saveDocument)
  const validateDocument = useDocumentStore((state) => state.validate)
  const loadComparison = useDocumentStore((state) => state.loadComparison)
  const validationFeatureEnabled = useSettingsStore(
    (state) => state.xmlEditor.validationFeatureEnabled
  )
  const validateOnOpen = useSettingsStore((state) => state.xmlEditor.validateOnOpen)
  const downloadFolders = useSettingsStore((state) => state.general.downloadFolders)
  const effectiveEditorTheme = useSettingsStore((state) => state.effectiveEditorTheme)
  const isMac = navigator.platform.includes('Mac')

  const isDirty = useMemo(
    () => modifiedContent !== null && modifiedContent !== partContent,
    [modifiedContent, partContent]
  )
  const appThemeVars = useMemo(
    () => getEditorThemeCssVars(effectiveEditorTheme) as CSSProperties,
    [effectiveEditorTheme]
  )

  const openSettings = useCallback(() => {
    setIsSettingsOpen(true)
  }, [])

  const closeSettings = useCallback(() => {
    setIsSettingsOpen(false)
  }, [])

  const refreshRecentFiles = useCallback(async () => {
    try {
      const items = await window.electronAPI.getRecentFiles()
      setRecentFiles(Array.isArray(items) ? items : [])
    } catch {
      setRecentFiles([])
    }
  }, [])

  const recordRecentFile = useCallback(
    async (path: string, lastTool: OpenTool) => {
      await window.electronAPI.addRecentFile({
        filePath: path,
        fileName: getFileName(path),
        lastTool,
      })
      await refreshRecentFiles()
    },
    [refreshRecentFiles]
  )

  const openPathInEditor = useCallback(
    async (path: string) => {
      setRecentError(null)
      setBatchInitialFilePaths(null)
      setCurrentScreen('xml-editor')
      setFilePath(path)

      const loaded = await loadDocument(path)
      if (!loaded) return false

      if (validationFeatureEnabled && validateOnOpen) {
        await validateDocument()
      }
      await recordRecentFile(path, 'xml-editor')
      return true
    },
    [
      loadDocument,
      recordRecentFile,
      setFilePath,
      validateDocument,
      validateOnOpen,
      validationFeatureEnabled,
    ]
  )

  const confirmFileChangeIfNeeded = useCallback(async () => {
    if (!isDirty) return true

    const choice = await window.electronAPI.confirmFileChange()
    if (choice === 'cancel') return false
    if (choice === 'discard') return true
    if (!filePath) return false

    return saveDocument(filePath)
  }, [filePath, isDirty, saveDocument])

  useEffect(() => {
    void refreshRecentFiles()
  }, [refreshRecentFiles])

  useEffect(() => {
    const cleanup = window.electronAPI.onFileOpened(async (path) => {
      if (isSettingsOpen) {
        closeSettings()
      }
      if (currentScreen !== 'home' && currentScreen !== 'supported-schemas') return

      setRecentError(null)
      setBatchInitialFilePaths(null)
      setCurrentScreen('xml-editor')
      setFilePath(path)

      const loaded = await loadDocument(path)
      if (!loaded) return

      if (validationFeatureEnabled && validateOnOpen) {
        await validateDocument()
      }
      await recordRecentFile(path, 'xml-editor')
    })

    return cleanup
  }, [
    closeSettings,
    currentScreen,
    isSettingsOpen,
    loadDocument,
    recordRecentFile,
    setFilePath,
    validateDocument,
    validateOnOpen,
    validationFeatureEnabled,
  ])

  useEffect(() => {
    const cleanup = window.electronAPI.onFilesOpened(async (filePaths) => {
      if (!Array.isArray(filePaths) || filePaths.length === 0) return

      if (isSettingsOpen) {
        closeSettings()
      }

      if (currentScreen === 'xml-editor') {
        const canChangeFile = await confirmFileChangeIfNeeded()
        if (!canChangeFile) return
      }

      setRecentError(null)

      // 2개 파일이 모두 XML Editor 호환 포맷이면 Compare 모드로 진입
      if (filePaths.length === 2 && filePaths.every(isSupportedOfficePath)) {
        const [primaryPath, comparisonPath] = filePaths
        if (!primaryPath || !comparisonPath) return

        setBatchInitialFilePaths(null)
        setCurrentScreen('xml-editor')
        setFilePath(primaryPath)

        const loaded = await loadDocument(primaryPath)
        if (!loaded) return

        await recordRecentFile(primaryPath, 'xml-editor')
        await loadComparison(comparisonPath)
        return
      }

      setBatchInitialFilePaths(filePaths)
      setCurrentScreen('batch-validator')
    })

    return cleanup
  }, [
    closeSettings,
    confirmFileChangeIfNeeded,
    currentScreen,
    isSettingsOpen,
    loadComparison,
    loadDocument,
    recordRecentFile,
    setFilePath,
  ])

  useEffect(() => {
    const onDragEnter = (event: DragEvent) => {
      const types = Array.from(event.dataTransfer?.types ?? [])
      if (!types.includes('Files')) return

      event.preventDefault()
      setIsDragActive(true)
    }

    const onDragOver = (event: DragEvent) => {
      const types = Array.from(event.dataTransfer?.types ?? [])
      if (!types.includes('Files')) return

      event.preventDefault()
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy'
      }
      setIsDragActive(true)
    }

    const onDragLeave = (event: DragEvent) => {
      if (event.relatedTarget) return
      setIsDragActive(false)
    }

    const onDrop = async (event: DragEvent) => {
      const dataTransfer = event.dataTransfer
      if (!dataTransfer) return

      event.preventDefault()
      setIsDragActive(false)

      const droppedPaths = getDroppedFilePaths(dataTransfer)
      if (droppedPaths.length === 0) {
        setRecentError('Drop an OOXML or ODF file (.xlsx, .docx, .pptx, .odt, .ods, .odp).')
        return
      }

      const isCompareDrop = droppedPaths.length === 2 && droppedPaths.every(isSupportedOfficePath)

      if (
        !isCompareDrop &&
        droppedPaths.length > 1 &&
        droppedPaths.some((path) => !isBatchOfficePath(path))
      ) {
        setRecentError('ODF files can be dropped only one at a time in XML Editor.')
        return
      }

      const openedPaths = await window.electronAPI.openDroppedFiles(droppedPaths)
      if (!openedPaths || openedPaths.length === 0) {
        setRecentError('The dropped files could not be opened.')
      }
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)

    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  const handleOpenRecent = useCallback(
    async (entry: RecentFileEntry) => {
      setRecentError(null)
      const exists = await window.electronAPI.fileExists(entry.filePath)
      if (!exists) {
        setRecentError(`File no longer exists: ${entry.filePath}`)
        await window.electronAPI.removeRecentFile(entry.filePath)
        await refreshRecentFiles()
        return
      }

      if (entry.lastTool === 'xml-editor') {
        setBatchInitialFilePaths(null)
        setCurrentScreen('xml-editor')
        setFilePath(entry.filePath)

        const loaded = await loadDocument(entry.filePath)
        if (!loaded) return

        if (validationFeatureEnabled && validateOnOpen) {
          await validateDocument()
        }
        await recordRecentFile(entry.filePath, 'xml-editor')
        return
      }

      setBatchInitialFilePaths([entry.filePath])
      setCurrentScreen('batch-validator')
    },
    [
      loadDocument,
      recordRecentFile,
      refreshRecentFiles,
      setFilePath,
      validateDocument,
      validateOnOpen,
      validationFeatureEnabled,
    ]
  )

  const handleRemoveRecent = useCallback(
    async (path: string) => {
      await window.electronAPI.removeRecentFile(path)
      await refreshRecentFiles()
    },
    [refreshRecentFiles]
  )

  const handleClearRecent = useCallback(async () => {
    await window.electronAPI.clearRecentFiles()
    setRecentFiles([])
  }, [])

  const handleNavigateToHome = () => {
    setBatchInitialFilePaths(null)
    setCurrentScreen('home')
    void refreshRecentFiles()
  }

  useEffect(() => {
    if (!isSettingsOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeSettings()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeSettings, isSettingsOpen])

  useEffect(() => {
    const cleanup = window.electronAPI.onMenuQuickOpen(async () => {
      if (isSettingsOpen) closeSettings()
      if (currentScreen === 'xml-editor') {
        const canChangeFile = await confirmFileChangeIfNeeded()
        if (!canChangeFile) return
      }
      setIsQuickOpenOpen(true)
    })
    return cleanup
  }, [closeSettings, confirmFileChangeIfNeeded, currentScreen, isSettingsOpen])

  const handleQuickOpenSelect = useCallback(
    async (path: string) => {
      setIsQuickOpenOpen(false)
      const exists = await window.electronAPI.fileExists(path)
      if (!exists) {
        setRecentError(`File no longer exists: ${path}`)
        return
      }
      await openPathInEditor(path)
    },
    [openPathInEditor]
  )

  const handleOpenXmlFromHome = async () => {
    const path = await window.electronAPI.openFile()
    if (!path) return

    setRecentError(null)
    setBatchInitialFilePaths(null)
    setCurrentScreen('xml-editor')
    setFilePath(path)

    const loaded = await loadDocument(path)
    if (!loaded) return

    if (validationFeatureEnabled && validateOnOpen) {
      await validateDocument()
    }
    await recordRecentFile(path, 'xml-editor')
  }

  const handleOpenBatchFromHome = async () => {
    const filePaths = await window.electronAPI.openFiles()
    if (!filePaths || filePaths.length === 0) return

    setRecentError(null)
    setBatchInitialFilePaths(filePaths)
    setCurrentScreen('batch-validator')
  }

  const handleOpenSchemasFromHome = () => {
    setBatchInitialFilePaths(null)
    setCurrentScreen('supported-schemas')
  }

  return (
    <div
      className={`app${isMac ? ' app--mac' : ''}`}
      data-app-theme={effectiveEditorTheme}
      style={appThemeVars}
    >
      {currentScreen === 'home' && (
        <HomeScreen
          onOpenXmlFromHome={handleOpenXmlFromHome}
          onOpenBatchFromHome={handleOpenBatchFromHome}
          onOpenSchemasFromHome={handleOpenSchemasFromHome}
          onOpenSettingsFromHome={openSettings}
          recentFiles={recentFiles}
          recentError={recentError}
          onDismissRecentError={() => setRecentError(null)}
          onOpenRecent={handleOpenRecent}
          onRemoveRecent={handleRemoveRecent}
          onClearRecent={handleClearRecent}
          downloadFolders={downloadFolders}
          onOpenStorageFile={(path) => void openPathInEditor(path)}
        />
      )}

      {currentScreen === 'xml-editor' && (
        <XmlEditorScreen
          onNavigateHome={handleNavigateToHome}
          onOpenSettings={openSettings}
          isSettingsOpen={isSettingsOpen}
          onRecentRecord={refreshRecentFiles}
        />
      )}

      {currentScreen === 'batch-validator' && (
        <BatchValidator
          onNavigateHome={handleNavigateToHome}
          initialFilePaths={batchInitialFilePaths}
          onOpenSettings={openSettings}
          onRecentRecord={refreshRecentFiles}
        />
      )}

      {currentScreen === 'supported-schemas' && (
        <SupportedSchemasScreen onNavigateHome={handleNavigateToHome} />
      )}

      {isDragActive && (
        <div className="file-drop-overlay" role="status" aria-live="polite">
          <div className="file-drop-overlay__content">
            <strong>Drop files to open them</strong>
            <span>Supported: .xlsx, .docx, .pptx, .odt, .ods, .odp</span>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div className="settings-modal-backdrop" onClick={closeSettings}>
          <div className="settings-modal" onClick={(event) => event.stopPropagation()}>
            <SettingsScreen onClose={closeSettings} />
          </div>
        </div>
      )}

      <QuickOpenPalette
        isOpen={isQuickOpenOpen}
        folders={downloadFolders}
        onClose={() => setIsQuickOpenOpen(false)}
        onSelect={handleQuickOpenSelect}
        onOpenSettings={openSettings}
      />
    </div>
  )
}
