import { create } from 'zustand'
import { lspClient, lspLog } from '../lsp/client'
import type { PackageKind, PartDescriptor } from '../lsp/types'

interface DocumentData {
  containerFormat: 'ooxml' | 'odf'
  validationSupport: 'supported' | 'unsupported'
  documentType: string
  contentTypes: any[]
  parts: Record<string, { contentType: string; size: number }>
}

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
  error?: string // For backward compatibility (XML parse errors)
  errors?: ValidationError[] // Schema validation errors
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

export interface SearchMatch {
  line: number
  lineContent: string
}

export interface SearchPartResult {
  partPath: string
  matches: SearchMatch[]
}

export interface DocumentSearchResult {
  query: string
  totalMatches: number
  results: SearchPartResult[]
}

export type PartDiffStatus =
  | 'identical'
  | 'modified'
  | 'only-primary'
  | 'only-comparison'
  | 'pending'

export function isOriginalDocumentPath(
  filePath: string | null,
  originalFilePath: string | null
): boolean {
  return Boolean(filePath && originalFilePath && filePath === originalFilePath)
}

function mapDocumentTypeToLspKind(documentType: string | undefined): PackageKind | null {
  if (!documentType) return null
  const value = documentType.toLowerCase()
  if (value === 'xlsx' || value === 'spreadsheet' || value.includes('spreadsheet') || value.includes('sml'))
    return 'xlsx'
  if (
    value === 'docx' ||
    value === 'document' ||
    value === 'wordprocessing' ||
    value.includes('wordprocess') ||
    value.includes('wml')
  )
    return 'docx'
  if (value === 'pptx' || value === 'presentation' || value.includes('presentation') || value.includes('pml'))
    return 'pptx'
  return null
}

function isXmlPart(partPath: string, contentType: string | undefined): boolean {
  if (partPath.toLowerCase().endsWith('.xml') || partPath.toLowerCase().endsWith('.rels')) return true
  if (!contentType) return false
  return contentType.includes('xml')
}

async function loadCurrentDocumentToLsp(
  filePath: string,
  fileData: string,
  documentData: DocumentData
): Promise<void> {
  if (!lspClient.isAvailable()) {
    console.warn('[lsp] bridge not available on window.electronAPI')
    return
  }
  const kind = mapDocumentTypeToLspKind(documentData.documentType)
  if (!kind) {
    console.warn('[lsp] skip packageLoaded — unsupported documentType:', documentData.documentType)
    return
  }

  const xmlEntries = Object.entries(documentData.parts).filter(([partPath, info]) =>
    isXmlPart(partPath, info?.contentType)
  )

  const parts: PartDescriptor[] = []
  for (const [partPath, info] of xmlEntries) {
    const result = await window.electronAPI.getPart(fileData, partPath, filePath)
    if (result.success && typeof result.data === 'string') {
      parts.push({
        path: partPath,
        contentType: info?.contentType ?? 'application/xml',
        text: result.data,
      })
    } else {
      lspLog(`[lsp] getPart failed → ${partPath}: ${result.error ?? 'no data'}`)
    }
  }

  lspLog(`[lsp] packageLoaded → kind=${kind} parts=${parts.length}`)
  for (const p of parts) {
    lspLog(`[lsp]   • ${p.path} (ct=${p.contentType}, text.length=${(p.text ?? '').length})`)
  }
  try {
    await lspClient.loadPackage({ packageId: `file://${filePath}`, kind, parts })
  } catch (error) {
    console.warn('[lsp] Failed to push package to LSP:', error)
  }
}

interface DocumentState {
  // Primary document state
  filePath: string | null
  originalFilePath: string | null
  fileData: string | null // base64
  documentData: DocumentData | null
  selectedPart: string | null
  partContent: string | null
  modifiedContent: string | null
  validationResults: ValidationResult | null
  isLoading: boolean
  error: string | null

  // Comparison document state
  isCompareMode: boolean
  comparisonFilePath: string | null
  comparisonFileData: string | null
  comparisonDocumentData: DocumentData | null
  comparisonPartContent: string | null
  partDiffStatus: Record<string, PartDiffStatus>

  // Search state
  searchResults: DocumentSearchResult | null
  isSearching: boolean

  // Actions
  setFilePath: (path: string | null) => void
  shouldWarnBeforeOverwrite: () => boolean
  loadDocument: (path: string) => Promise<boolean>
  selectPart: (partPath: string) => Promise<void>
  updatePartContent: (content: string) => void
  saveDocument: (path: string) => Promise<boolean>
  saveDocumentAs: (path: string) => Promise<boolean>
  validate: () => Promise<void>
  loadComparison: (path: string) => Promise<boolean>
  exitCompare: () => void
  clearError: () => void
  reset: () => void
  searchDocument: (query: string) => Promise<void>
  clearSearch: () => void
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  filePath: null,
  originalFilePath: null,
  fileData: null,
  documentData: null,
  selectedPart: null,
  partContent: null,
  modifiedContent: null,
  validationResults: null,
  isLoading: false,
  error: null,

  isCompareMode: false,
  comparisonFilePath: null,
  comparisonFileData: null,
  comparisonDocumentData: null,
  comparisonPartContent: null,
  partDiffStatus: {},

  searchResults: null,
  isSearching: false,

  setFilePath: (path) => set({ filePath: path }),

  shouldWarnBeforeOverwrite: () => {
    const { filePath, originalFilePath } = get()
    return isOriginalDocumentPath(filePath, originalFilePath)
  },

  loadDocument: async (path) => {
    set({ isLoading: true, error: null })

    try {
      // Read file
      const readResult = await window.electronAPI.readFile(path)
      if (!readResult.success) {
        throw new Error(readResult.error || 'Failed to read file')
      }

      const fileData = readResult.data!

      // Parse document
      const parseResult = await window.electronAPI.parseDocument(fileData, path)
      if (!parseResult.success) {
        throw new Error(parseResult.error || 'Failed to parse document')
      }

      set({
        filePath: path,
        originalFilePath: path,
        fileData,
        documentData: parseResult.data,
        selectedPart: null,
        partContent: null,
        modifiedContent: null,
        validationResults: null,
        isLoading: false,
        // 새 문서 로드 시 비교 상태 해제
        isCompareMode: false,
        comparisonFilePath: null,
        comparisonFileData: null,
        comparisonDocumentData: null,
        comparisonPartContent: null,
        partDiffStatus: {},
      })
      void loadCurrentDocumentToLsp(path, fileData, parseResult.data)
      return true
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isLoading: false,
      })
      return false
    }
  },

  selectPart: async (partPath) => {
    const state = get()
    const { fileData, modifiedContent, selectedPart, isCompareMode } = state
    if (!fileData) return

    // 비교 모드가 아닐 때만 수정 내용을 패키지에 반영(read-only 보장)
    if (!isCompareMode && modifiedContent !== null && selectedPart) {
      const updateResult = await window.electronAPI.updatePart(
        fileData,
        selectedPart,
        modifiedContent,
        get().filePath ?? undefined
      )
      if (updateResult.success) {
        set({ fileData: updateResult.data! })
      }
    }

    set({ isLoading: true, error: null })

    try {
      const fresh = get()
      const currentFileData = fresh.fileData!

      const primaryHas = fresh.documentData?.parts[partPath] !== undefined
      const comparisonHas =
        fresh.isCompareMode &&
        fresh.comparisonDocumentData?.parts[partPath] !== undefined

      const [primaryResult, comparisonResult] = await Promise.all([
        primaryHas
          ? window.electronAPI.getPart(
              currentFileData,
              partPath,
              fresh.filePath ?? undefined
            )
          : Promise.resolve(null),
        comparisonHas && fresh.comparisonFileData
          ? window.electronAPI.getPart(
              fresh.comparisonFileData,
              partPath,
              fresh.comparisonFilePath ?? undefined
            )
          : Promise.resolve(null),
      ])

      if (primaryResult && !primaryResult.success) {
        throw new Error(primaryResult.error || 'Failed to get part content')
      }
      if (comparisonResult && !comparisonResult.success) {
        throw new Error(comparisonResult.error || 'Failed to get comparison part content')
      }

      set({
        selectedPart: partPath,
        partContent: primaryResult?.data ?? '',
        comparisonPartContent: fresh.isCompareMode
          ? (comparisonResult?.data ?? '')
          : null,
        modifiedContent: null,
        isLoading: false,
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isLoading: false,
      })
    }
  },

  updatePartContent: (content) => {
    set({ modifiedContent: content })
    const { selectedPart } = get()
    if (selectedPart) {
      lspClient.schedulePartUpdate(selectedPart, content)
    }
  },

  saveDocument: async (path) => {
    const { fileData, modifiedContent, selectedPart } = get()
    if (!fileData) return false

    set({ error: null })

    try {
      let currentFileData = fileData

      // Apply pending modifications
      if (modifiedContent !== null && selectedPart) {
        const updateResult = await window.electronAPI.updatePart(
          currentFileData,
          selectedPart,
          modifiedContent,
          get().filePath ?? undefined
        )
        if (updateResult.success) {
          currentFileData = updateResult.data!
        }
      }

      // Write to file
      const writeResult = await window.electronAPI.writeFile(path, currentFileData)
      if (!writeResult.success) {
        throw new Error(writeResult.error || 'Failed to write file')
      }

      set({
        fileData: currentFileData,
        modifiedContent: null,
      })
      return true
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  },

  saveDocumentAs: async (path) => {
    const { fileData, modifiedContent, selectedPart } = get()
    if (!fileData) return false

    set({ error: null })

    try {
      let currentFileData = fileData

      if (modifiedContent !== null && selectedPart) {
        const updateResult = await window.electronAPI.updatePart(
          currentFileData,
          selectedPart,
          modifiedContent,
          get().filePath ?? undefined
        )
        if (updateResult.success) {
          currentFileData = updateResult.data!
        }
      }

      const writeResult = await window.electronAPI.writeFile(path, currentFileData)
      if (!writeResult.success) {
        throw new Error(writeResult.error || 'Failed to write file')
      }

      set({
        filePath: path,
        fileData: currentFileData,
        modifiedContent: null,
      })
      return true
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  },

  validate: async () => {
    const { fileData, modifiedContent, selectedPart } = get()
    if (!fileData) return

    set({ error: null })

    try {
      let currentFileData = fileData

      // Apply pending modifications before validation
      if (modifiedContent !== null && selectedPart) {
        const updateResult = await window.electronAPI.updatePart(
          currentFileData,
          selectedPart,
          modifiedContent,
          get().filePath ?? undefined
        )
        if (updateResult.success) {
          currentFileData = updateResult.data!
        }
      }

      const result = await window.electronAPI.validate(
        currentFileData,
        get().filePath ?? undefined
      )
      if (!result.success) {
        throw new Error(result.error || 'Validation failed')
      }

      set({
        validationResults: result.data,
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },

  loadComparison: async (path) => {
    const state = get()
    if (!state.fileData || !state.documentData) {
      set({ error: '먼저 비교의 기준이 될 파일을 열어주세요.' })
      return false
    }

    set({ isLoading: true, error: null })

    try {
      const readResult = await window.electronAPI.readFile(path)
      if (!readResult.success) {
        throw new Error(readResult.error || 'Failed to read comparison file')
      }
      const comparisonFileData = readResult.data!

      const parseResult = await window.electronAPI.parseDocument(comparisonFileData, path)
      if (!parseResult.success) {
        throw new Error(parseResult.error || 'Failed to parse comparison file')
      }

      const comparisonDocumentData: DocumentData = parseResult.data

      const primaryParts = state.documentData.parts
      const comparisonParts = comparisonDocumentData.parts
      const allPaths = Array.from(
        new Set([...Object.keys(primaryParts), ...Object.keys(comparisonParts)])
      )

      // 1차: 존재 여부만 즉시 판정 → 양쪽에 있는 part는 'pending'으로 두고 백그라운드 비교
      const initialStatus: Record<string, PartDiffStatus> = {}
      const bothSidePaths: string[] = []
      for (const partPath of allPaths) {
        const inPrimary = primaryParts[partPath] !== undefined
        const inComparison = comparisonParts[partPath] !== undefined
        if (inPrimary && !inComparison) initialStatus[partPath] = 'only-primary'
        else if (!inPrimary && inComparison) initialStatus[partPath] = 'only-comparison'
        else {
          initialStatus[partPath] = 'pending'
          bothSidePaths.push(partPath)
        }
      }

      set({
        isCompareMode: true,
        comparisonFilePath: path,
        comparisonFileData,
        comparisonDocumentData,
        partDiffStatus: initialStatus,
        // 비교 모드 진입 시 편집 보류분은 폐기(read-only)
        modifiedContent: null,
        comparisonPartContent: null,
        isLoading: false,
      })

      // 2차: 양쪽에 존재하는 part 텍스트를 병렬 fetch해서 점진 비교
      void compareBothSideParts(bothSidePaths)

      return true
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isLoading: false,
      })
      return false
    }
  },

  exitCompare: () => {
    set({
      isCompareMode: false,
      comparisonFilePath: null,
      comparisonFileData: null,
      comparisonDocumentData: null,
      comparisonPartContent: null,
      partDiffStatus: {},
    })
  },

  clearError: () => set({ error: null }),

  searchDocument: async (query) => {
    const { fileData, filePath } = get()
    if (!fileData) return

    set({ isSearching: true })
    try {
      const result = await window.electronAPI.searchDocument(
        fileData,
        query,
        filePath ?? undefined
      )
      if (result.success) {
        set({ searchResults: result.data, isSearching: false })
      } else {
        set({ isSearching: false })
      }
    } catch {
      set({ isSearching: false })
    }
  },

  clearSearch: () => set({ searchResults: null }),

  reset: () =>
    set({
      filePath: null,
      originalFilePath: null,
      fileData: null,
      documentData: null,
      selectedPart: null,
      partContent: null,
      modifiedContent: null,
      validationResults: null,
      isLoading: false,
      error: null,
      isCompareMode: false,
      comparisonFilePath: null,
      comparisonFileData: null,
      comparisonDocumentData: null,
      comparisonPartContent: null,
      partDiffStatus: {},
      searchResults: null,
      isSearching: false,
    }),
}))

async function compareBothSideParts(partPaths: string[]): Promise<void> {
  // 청크 단위 병렬 처리(과도한 IPC 폭주 방지)
  const concurrency = 6
  for (let i = 0; i < partPaths.length; i += concurrency) {
    const chunk = partPaths.slice(i, i + concurrency)
    await Promise.all(chunk.map(comparePartOnce))
  }
}

async function comparePartOnce(partPath: string): Promise<void> {
  const state = useDocumentStore.getState()
  if (!state.isCompareMode) return
  if (!state.fileData || !state.comparisonFileData) return

  try {
    const [primaryResult, comparisonResult] = await Promise.all([
      window.electronAPI.getPart(
        state.fileData,
        partPath,
        state.filePath ?? undefined
      ),
      window.electronAPI.getPart(
        state.comparisonFileData,
        partPath,
        state.comparisonFilePath ?? undefined
      ),
    ])

    // 비교 도중 사용자가 Compare 모드를 종료했으면 결과 무시
    if (!useDocumentStore.getState().isCompareMode) return

    if (!primaryResult?.success || !comparisonResult?.success) return

    const status: PartDiffStatus =
      primaryResult.data === comparisonResult.data ? 'identical' : 'modified'

    useDocumentStore.setState((current) => ({
      partDiffStatus: { ...current.partDiffStatus, [partPath]: status },
    }))
  } catch {
    // 단일 part 비교 실패는 조용히 pending 유지
  }
}
