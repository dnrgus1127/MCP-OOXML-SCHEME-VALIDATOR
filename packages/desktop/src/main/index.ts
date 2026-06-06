/**
 * @ooxml/desktop - Main Process
 *
 * Electron main process entry point
 */

import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import { basename, join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { readFile as readFileAsync, readdir as readdirAsync, stat as statAsync } from 'fs/promises'
import { OoxmlParser, parseXmlToEventArray } from '@ooxml/parser'
import {
  loadSchemaRegistry,
  getSupportedSchemaNamespaces,
  analyzeOoxmlSchemaReferences,
  describeSchemaElementByPath,
  type SchemaPathStep,
  validateXmlEvents,
  type OoxmlDocumentType,
  type ValidationError,
  type ValidationWarning,
  type SchemaRegistry,
} from '@ooxml/core'
import { shouldValidateXmlPart } from './part-validation-filter'
import {
  detectDocumentFormatFromBuffer,
  getEditablePartText,
  isSupportedBatchFile,
  isSupportedEditorFile,
  parseEditableDocument,
  searchEditableDocument,
  updateEditablePartText,
} from './editable-document'
import {
  addRecentFile,
  addRecentFiles,
  clearRecentFiles,
  listRecentFiles,
  removeRecentFile,
} from './recent-files-store'
import { getLspBridge, registerLspIpc } from './lsp/bridge'
import type { OpenTool } from '../shared/recent-files'

let mainWindow: BrowserWindow | null = null

interface RendererValidationIssue {
  code: string
  message: string
  path: string
  value?: string
  line?: number
  column?: number
}

interface RendererPartValidationResult {
  path: string
  valid: boolean
  error?: string
  errors?: RendererValidationIssue[]
  warnings?: RendererValidationIssue[]
}

interface RendererValidationSummary {
  totalParts: number
  validParts: number
  invalidParts: number
  totalErrors: number
  totalWarnings: number
}

interface RendererValidationResult {
  supportStatus?: 'supported' | 'unsupported'
  message?: string
  valid: boolean
  results: RendererPartValidationResult[]
  summary: RendererValidationSummary
}

function createUnsupportedValidationResult(message: string): RendererValidationResult {
  return {
    supportStatus: 'unsupported',
    message,
    valid: false,
    results: [],
    summary: {
      totalParts: 0,
      validParts: 0,
      invalidParts: 0,
      totalErrors: 0,
      totalWarnings: 0,
    },
  }
}

function normalizeOpenableFilePaths(input: unknown, mode: 'editor' | 'batch' = 'editor'): string[] {
  if (!Array.isArray(input)) return []

  const uniquePaths = new Set<string>()
  for (const value of input) {
    if (typeof value !== 'string') continue
    const filePath = value.trim()
    if (!filePath) continue
    if (!existsSync(filePath)) continue
    if (mode === 'batch' && !isSupportedBatchFile(filePath)) continue
    if (mode === 'editor' && !isSupportedEditorFile(filePath)) continue
    uniquePaths.add(filePath)
  }

  return Array.from(uniquePaths)
}

function mapValidationIssues(
  issues: Array<ValidationError | ValidationWarning> | undefined
): RendererValidationIssue[] | undefined {
  if (!issues || issues.length === 0) {
    return undefined
  }

  return issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: issue.path,
    value: 'value' in issue ? issue.value : undefined,
    line: 'line' in issue ? issue.line : undefined,
    column: 'column' in issue ? issue.column : undefined,
  }))
}

function summarizeValidationResults(
  results: RendererPartValidationResult[]
): RendererValidationSummary {
  return {
    totalParts: results.length,
    validParts: results.filter((result) => result.valid).length,
    invalidParts: results.filter((result) => !result.valid).length,
    totalErrors: results.reduce((sum, result) => sum + (result.errors?.length ?? 0), 0),
    totalWarnings: results.reduce((sum, result) => sum + (result.warnings?.length ?? 0), 0),
  }
}

const schemaRegistryCache = new Map<OoxmlDocumentType, SchemaRegistry>()

/** documentType별 스키마 레지스트리를 캐시해 커서 이동마다 재생성하지 않도록 한다. */
function getCachedSchemaRegistry(documentType: OoxmlDocumentType): SchemaRegistry {
  const cached = schemaRegistryCache.get(documentType)
  if (cached) return cached
  const registry = loadSchemaRegistry(documentType)
  schemaRegistryCache.set(documentType, registry)
  return registry
}

function validateXmlPart(
  path: string,
  xmlContent: string,
  registry: SchemaRegistry
): RendererPartValidationResult {
  try {
    const events = parseXmlToEventArray(xmlContent)
    const result = validateXmlEvents(registry, events, {
      maxErrors: 100,
      allowWhitespace: true,
      includeWarnings: true,
    })

    return {
      path,
      valid: result.valid,
      errors: mapValidationIssues(result.errors),
      warnings: mapValidationIssues(result.warnings),
    }
  } catch (error) {
    return {
      path,
      valid: false,
      errors: [
        {
          code: 'XML_PARSE_ERROR',
          message: String(error),
          path: '/',
        },
      ],
    }
  }
}

function emitOpenFilesEvent(filePaths: string[]): void {
  if (filePaths.length === 0) return
  if (filePaths.length === 1) {
    mainWindow?.webContents.send('file:opened', filePaths[0])
    return
  }

  mainWindow?.webContents.send('files:opened', filePaths)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    show: false,
  })

  // Load the app
  // dev: electron-vite가 주입하는 렌더러 dev 서버 URL 사용 (포트가 밀려도 항상 정확한 주소 로드)
  // prod: 빌드된 렌더러 파일 로드
  const rendererDevUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererDevUrl) {
    mainWindow.loadURL(rendererDevUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// App menu
function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: () => handleOpenFile(),
        },
        {
          label: 'Quick Open from Folder...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => mainWindow?.webContents.send('menu:quick-open'),
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('menu:save'),
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow?.webContents.send('menu:save-as'),
        },
        { type: 'separator' },
        {
          label: 'Validate',
          accelerator: 'CmdOrCtrl+Shift+V',
          click: () => mainWindow?.webContents.send('menu:validate'),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

async function handleOpenFile(): Promise<void> {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [
      { name: 'Office Documents', extensions: ['xlsx', 'docx', 'pptx', 'odt', 'ods', 'odp'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })

  if (!result.canceled && result.filePaths.length > 0) {
    mainWindow?.webContents.send('file:opened', result.filePaths[0])
  }
}

// IPC Handlers
function setupIpcHandlers(): void {
  // Open file dialog
  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [
        { name: 'Office Documents', extensions: ['xlsx', 'docx', 'pptx', 'odt', 'ods', 'odp'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })

    if (result.canceled) return null
    return result.filePaths[0]
  })

  ipcMain.handle('app:openDroppedFiles', async (_, filePaths: unknown) => {
    const normalizedPaths = normalizeOpenableFilePaths(filePaths)
    emitOpenFilesEvent(normalizedPaths)
    return normalizedPaths
  })

  ipcMain.handle('dialog:pickFolder', async (_, defaultPath?: string) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: defaultPath && existsSync(defaultPath) ? defaultPath : undefined,
    })

    if (result.canceled) return null
    return result.filePaths[0] ?? null
  })

  ipcMain.handle('fs:listFolders', async (_, folderPaths: unknown) => {
    if (!Array.isArray(folderPaths)) {
      return { success: false, error: '폴더 목록이 올바르지 않습니다.' }
    }

    type FolderFile = {
      fileName: string
      filePath: string
      modifiedAt: number
      size: number
      folderPath: string
    }

    const files: FolderFile[] = []
    const missingFolders: string[] = []

    for (const folderPath of folderPaths) {
      if (typeof folderPath !== 'string' || !folderPath) continue
      if (!existsSync(folderPath)) {
        missingFolders.push(folderPath)
        continue
      }

      try {
        const entries = await readdirAsync(folderPath, { withFileTypes: true })
        const statTasks = entries
          .filter((entry) => entry.isFile() && isSupportedEditorFile(entry.name))
          .map(async (entry) => {
            const fullPath = join(folderPath, entry.name)
            try {
              const stats = await statAsync(fullPath)
              files.push({
                fileName: entry.name,
                filePath: fullPath,
                modifiedAt: stats.mtimeMs,
                size: stats.size,
                folderPath,
              })
            } catch {
              // 권한 등으로 stat 실패 시 항목 제외
            }
          })

        await Promise.all(statTasks)
      } catch {
        missingFolders.push(folderPath)
      }
    }

    files.sort((a, b) => b.modifiedAt - a.modifiedAt)

    return { success: true, data: files, missingFolders }
  })

  // Save file dialog
  ipcMain.handle('dialog:saveFile', async (_, defaultPath?: string) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath,
      filters: [
        { name: 'Office Documents', extensions: ['xlsx', 'docx', 'pptx', 'odt', 'ods', 'odp'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })

    if (result.canceled) return null
    return result.filePath
  })

  ipcMain.handle('dialog:confirmFileChange', async () => {
    const result = await dialog.showMessageBox(mainWindow!, {
      type: 'warning',
      buttons: ['Save', 'Discard', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      message: 'You have unsaved changes.',
      detail: 'Save changes before opening another file?',
    })

    if (result.response === 0) return 'save'
    if (result.response === 1) return 'discard'
    return 'cancel'
  })

  ipcMain.handle('dialog:confirmOverwriteOriginal', async (_, filePath?: string) => {
    const result = await dialog.showMessageBox(mainWindow!, {
      type: 'warning',
      buttons: ['원본에 저장', '취소'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      message: '원본 파일이 변경됩니다.',
      detail: filePath
        ? `저장하면 다음 원본 문서에 변경 사항이 덮어쓰기됩니다:\n${filePath}`
        : '저장하면 원본 문서에 변경 사항이 덮어쓰기됩니다.',
    })

    return result.response === 0
  })

  // Read file
  ipcMain.handle('fs:readFile', async (_, filePath: string) => {
    try {
      const buffer = readFileSync(filePath)
      return { success: true, data: buffer.toString('base64') }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // Write file
  ipcMain.handle('fs:writeFile', async (_, filePath: string, base64Data: string) => {
    try {
      const buffer = Buffer.from(base64Data, 'base64')
      writeFileSync(filePath, buffer)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // Check file existence
  ipcMain.handle('fs:exists', async (_, filePath: string) => {
    try {
      return existsSync(filePath)
    } catch {
      return false
    }
  })

  // Recent files
  ipcMain.handle('recent-files:list', async () => {
    return listRecentFiles()
  })

  ipcMain.handle('schema:supported-list', async () => {
    return getSupportedSchemaNamespaces()
  })

  ipcMain.handle('ooxml:analyzeSchemaReferences', async (_, base64Data: string) => {
    try {
      const buffer = Buffer.from(base64Data, 'base64')
      if (detectDocumentFormatFromBuffer(buffer) !== 'ooxml') {
        return { success: true, data: null }
      }

      const doc = await OoxmlParser.fromBuffer(buffer)

      const xmlParts: Array<{ partPath: string; xml: string }> = []

      for (const partPath of doc.parts.keys()) {
        if (!partPath.toLowerCase().endsWith('.xml')) continue

        const xml = doc.getPartAsXml(partPath)
        if (!xml) continue

        xmlParts.push({ partPath, xml })
      }

      return {
        success: true,
        data: analyzeOoxmlSchemaReferences(xmlParts),
      }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle(
    'ooxml:resolveSchemaElement',
    async (_, params: { documentType?: string; path: SchemaPathStep[] }) => {
      try {
        if (!params || !Array.isArray(params.path) || params.path.length === 0) {
          return { success: false, error: 'Invalid resolveSchemaElement parameters' }
        }

        const documentType = (params.documentType as OoxmlDocumentType | undefined) ?? 'unknown'
        const registry = getCachedSchemaRegistry(documentType)
        const description = describeSchemaElementByPath(registry, params.path)
        return { success: true, data: description }
      } catch (error) {
        return { success: false, error: String(error) }
      }
    }
  )

  const isValidRecentFileInput = (
    input: unknown
  ): input is {
    filePath: string
    fileName?: string
    lastTool: OpenTool
  } => {
    if (!input || typeof input !== 'object') return false
    const value = input as { filePath?: unknown; fileName?: unknown; lastTool?: unknown }
    if (typeof value.filePath !== 'string' || value.filePath.length === 0) return false
    if (value.fileName != null && typeof value.fileName !== 'string') return false
    return value.lastTool === 'xml-editor' || value.lastTool === 'batch-validator'
  }

  ipcMain.handle(
    'recent-files:add',
    async (_, input: { filePath: string; fileName?: string; lastTool: OpenTool }) => {
      if (!isValidRecentFileInput(input)) return listRecentFiles()
      return addRecentFile(input)
    }
  )

  ipcMain.handle('recent-files:add-many', async (_, inputs: unknown[]) => {
    if (!Array.isArray(inputs) || inputs.length === 0) return listRecentFiles()
    const validInputs = inputs.filter(isValidRecentFileInput)
    if (validInputs.length === 0) return listRecentFiles()
    return addRecentFiles(validInputs)
  })

  ipcMain.handle('recent-files:remove', async (_, filePath: string) => {
    if (typeof filePath !== 'string' || !filePath) return listRecentFiles()
    return removeRecentFile(filePath)
  })

  ipcMain.handle('recent-files:clear', async () => {
    return clearRecentFiles()
  })

  // Parse OOXML document
  ipcMain.handle('ooxml:parse', async (_, base64Data: string, filePath?: string) => {
    try {
      const buffer = Buffer.from(base64Data, 'base64')

      return {
        success: true,
        data: parseEditableDocument(buffer, filePath),
      }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // Get part content
  ipcMain.handle(
    'ooxml:getPart',
    async (_, base64Data: string, partPath: string, filePath?: string) => {
      try {
        const buffer = Buffer.from(base64Data, 'base64')
        const content = getEditablePartText(buffer, partPath, filePath)

        if (!content) {
          return { success: false, error: 'Part not found' }
        }

        return { success: true, data: content }
      } catch (error) {
        return { success: false, error: String(error) }
      }
    }
  )

  // Search document
  ipcMain.handle(
    'ooxml:search',
    async (_, base64Data: string, query: string, filePath?: string) => {
      try {
        const buffer = Buffer.from(base64Data, 'base64')
        return { success: true, data: searchEditableDocument(buffer, query, filePath) }
      } catch (error) {
        return { success: false, error: String(error) }
      }
    }
  )

  // Update part content
  ipcMain.handle(
    'ooxml:updatePart',
    async (_, base64Data: string, partPath: string, content: string, filePath?: string) => {
      try {
        const buffer = Buffer.from(base64Data, 'base64')
        const newBuffer = updateEditablePartText(buffer, partPath, content, filePath)

        return { success: true, data: newBuffer.toString('base64') }
      } catch (error) {
        return { success: false, error: String(error) }
      }
    }
  )

  // Open multiple files dialog
  ipcMain.handle('dialog:openFiles', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Office Documents', extensions: ['xlsx', 'docx', 'pptx'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })

    if (result.canceled) return null
    return result.filePaths
  })

  // Batch validate multiple files
  ipcMain.handle('ooxml:batchValidate', async (_, filePaths: string[]) => {
    try {
      const fileResults: Array<{
        filePath: string
        fileName: string
        success: boolean
        documentType?: string
        validation?: RendererValidationResult
        error?: string
      }> = []

      for (let i = 0; i < filePaths.length; i++) {
        const filePath = filePaths[i]
        if (!filePath) continue

        // Send progress update
        mainWindow?.webContents.send('batch:progress', { current: i + 1, total: filePaths.length })
        await new Promise<void>((resolve) => setImmediate(resolve))
        try {
          const buffer = await readFileAsync(filePath)
          if (detectDocumentFormatFromBuffer(buffer, filePath) !== 'ooxml') {
            fileResults.push({
              filePath,
              fileName: basename(filePath) || filePath,
              success: true,
              documentType: 'odf',
              validation: createUnsupportedValidationResult(
                'ODF validation is not supported. Open the file in XML Editor to inspect XML parts.'
              ),
            })
            continue
          }

          const doc = await OoxmlParser.fromBuffer(buffer)
          const documentType = doc.documentType as OoxmlDocumentType

          let registry: SchemaRegistry
          try {
            registry = loadSchemaRegistry(documentType)
          } catch (schemaError) {
            fileResults.push({
              filePath,
              fileName: basename(filePath) || filePath,
              success: false,
              error: `Schema loading failed: ${String(schemaError)}`,
            })
            continue
          }

          const results: RendererPartValidationResult[] = []

          for (const [path, part] of doc.parts) {
            if (!shouldValidateXmlPart(path, part.contentType)) continue

            results.push(validateXmlPart(path, part.content.toString('utf-8'), registry))
          }

          const summary = summarizeValidationResults(results)

          fileResults.push({
            filePath,
            fileName: basename(filePath) || filePath,
            success: true,
            documentType,
            validation: {
              valid: summary.totalErrors === 0,
              results,
              summary,
            },
          })
        } catch (error) {
          fileResults.push({
            filePath,
            fileName: basename(filePath) || filePath,
            success: false,
            error: String(error),
          })
        }
      }

      return { success: true, data: fileResults }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // Export validation results
  ipcMain.handle(
    'export:results',
    async (_, format: 'json' | 'csv' | 'html' | 'pdf', data: any) => {
      try {
        const result = await dialog.showSaveDialog(mainWindow!, {
          defaultPath: `validation-results.${format}`,
          filters: [
            format === 'json' && { name: 'JSON', extensions: ['json'] },
            format === 'csv' && { name: 'CSV', extensions: ['csv'] },
            format === 'html' && { name: 'HTML', extensions: ['html'] },
            format === 'pdf' && { name: 'PDF', extensions: ['pdf'] },
          ].filter(Boolean) as any,
        })

        if (result.canceled || !result.filePath) {
          return { success: false, error: 'Export cancelled' }
        }

        let content = ''

        switch (format) {
          case 'json':
            content = JSON.stringify(data, null, 2)
            break

          case 'csv':
            content = generateCSV(data)
            break

          case 'html':
            content = generateHTML(data)
            break

          case 'pdf':
            return { success: false, error: 'PDF export not yet implemented' }

          default:
            return { success: false, error: 'Unknown export format' }
        }

        writeFileSync(result.filePath, content, 'utf-8')
        return { success: true, filePath: result.filePath }
      } catch (error) {
        return { success: false, error: String(error) }
      }
    }
  )

  // Validate document with XSD schema validation
  ipcMain.handle('ooxml:validate', async (_, base64Data: string, filePath?: string) => {
    try {
      const buffer = Buffer.from(base64Data, 'base64')
      if (detectDocumentFormatFromBuffer(buffer, filePath) !== 'ooxml') {
        return {
          success: true,
          data: createUnsupportedValidationResult(
            'ODF validation is not supported. XML parts can be opened and edited, but validation is skipped.'
          ),
        }
      }

      const doc = await OoxmlParser.fromBuffer(buffer)

      // Load schema registry based on document type
      const documentType = doc.documentType as OoxmlDocumentType
      let registry: SchemaRegistry
      try {
        registry = loadSchemaRegistry(documentType)
      } catch (schemaError) {
        // Fallback to basic validation if schema loading fails
        console.warn('Schema loading failed, using basic validation:', schemaError)
        return basicValidation(doc)
      }

      // Validate each XML part
      const results: RendererPartValidationResult[] = []

      for (const [path, part] of doc.parts) {
        if (!shouldValidateXmlPart(path, part.contentType)) continue

        results.push(validateXmlPart(path, part.content.toString('utf-8'), registry))
      }

      const summary = summarizeValidationResults(results)

      return {
        success: true,
        data: {
          supportStatus: 'supported',
          valid: summary.totalErrors === 0,
          results,
          summary,
        },
      }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })
}

/**
 * Generate CSV from validation results
 */
function generateCSV(data: any): string {
  const lines: string[] = []
  lines.push(
    buildCsvRow(['File', 'Part', 'Status', 'Error Code', 'Error Message', 'Path', 'Line', 'Column'])
  )

  for (const file of data) {
    if (!file.success) {
      lines.push(buildCsvRow([file.fileName, '', 'ERROR', '', file.error, '', '', '']))
      continue
    }

    if (!file.validation) continue

    for (const part of file.validation.results) {
      const hasErrors = Array.isArray(part.errors) && part.errors.length > 0
      const hasWarnings = Array.isArray(part.warnings) && part.warnings.length > 0

      if (!hasErrors && !hasWarnings && part.valid) {
        lines.push(buildCsvRow([file.fileName, part.path, 'VALID', '', '', '', '', '']))
      }

      if (part.errors) {
        for (const error of part.errors) {
          lines.push(
            buildCsvRow([
              file.fileName,
              part.path,
              'INVALID',
              error.code,
              error.message,
              error.path,
              error.line ?? '',
              error.column ?? '',
            ])
          )
        }
      }

      if (part.warnings) {
        for (const warning of part.warnings) {
          lines.push(
            buildCsvRow([
              file.fileName,
              part.path,
              'WARNING',
              warning.code,
              warning.message,
              warning.path,
              warning.line ?? '',
              warning.column ?? '',
            ])
          )
        }
      }
    }
  }

  // Add UTF-8 BOM for Excel compatibility
  return '\uFEFF' + lines.join('\n')
}

function buildCsvRow(values: unknown[]): string {
  return values.map(escapeCsvValue).join(',')
}

function escapeCsvValue(value: unknown): string {
  const raw = value == null ? '' : String(value)
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const formulaSafe = /^[\s]*[=+\-@]/.test(normalized) ? `'${normalized}` : normalized
  return `"${formulaSafe.replace(/"/g, '""')}"`
}

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Generate HTML report from validation results
 */
function generateHTML(data: any): string {
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OOXML Validation Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; }
    h1 { color: #333; }
    .summary { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    .file { margin-bottom: 30px; border: 1px solid #ddd; border-radius: 5px; }
    .file-header { background: #f9f9f9; padding: 15px; border-bottom: 1px solid #ddd; }
    .file-header.valid { background: #e8f5e9; }
    .file-header.invalid { background: #ffebee; }
    .file-title { font-size: 18px; font-weight: bold; margin-bottom: 5px; }
    .file-stats { font-size: 14px; color: #666; }
    .parts { padding: 15px; }
    .part { margin-bottom: 15px; }
    .part-header { font-weight: bold; margin-bottom: 5px; }
    .error { background: #fff3e0; padding: 10px; margin: 5px 0; border-left: 3px solid #ff9800; border-radius: 3px; }
    .error-code { font-weight: bold; color: #e65100; }
    .error-message { margin: 5px 0; }
    .error-path { font-size: 12px; color: #666; font-family: monospace; }
    .valid-badge { color: #4caf50; }
    .invalid-badge { color: #f44336; }
  </style>
</head>
<body>
  <h1>OOXML Validation Report</h1>
  <div class="summary">
    <div><strong>Total Files:</strong> ${data.length}</div>
    <div><strong>Valid Files:</strong> ${data.filter((f: any) => f.success && f.validation?.valid).length}</div>
    <div><strong>Invalid Files:</strong> ${data.filter((f: any) => !f.success || !f.validation?.valid).length}</div>
    <div><strong>Total Errors:</strong> ${data.reduce((sum: number, f: any) => sum + (f.validation?.summary?.totalErrors || 0), 0)}</div>
    <div><strong>Total Warnings:</strong> ${data.reduce((sum: number, f: any) => sum + (f.validation?.summary?.totalWarnings || 0), 0)}</div>
  </div>
`

  for (const file of data) {
    const isValid = file.success && file.validation?.valid
    html += `
  <div class="file">
    <div class="file-header ${isValid ? 'valid' : 'invalid'}">
      <div class="file-title">${escapeHtml(file.fileName)}</div>
      <div class="file-stats">
        ${
          file.success
            ? `
          <span class="${isValid ? 'valid-badge' : 'invalid-badge'}">${isValid ? '✓ VALID' : '✗ INVALID'}</span>
          ${
            file.validation
              ? `
            | Parts: ${file.validation.summary.totalParts}
            | Valid: ${file.validation.summary.validParts}
            | Invalid: ${file.validation.summary.invalidParts}
            | Errors: ${file.validation.summary.totalErrors}
            | Warnings: ${file.validation.summary.totalWarnings}
          `
              : ''
          }
        `
            : `<span class="invalid-badge">✗ ERROR: ${escapeHtml(file.error ?? 'Unknown error')}</span>`
        }
      </div>
    </div>
`

    if (file.success && file.validation) {
      const partsWithIssues = file.validation.results.filter(
        (part: any) =>
          !part.valid || (part.errors?.length ?? 0) > 0 || (part.warnings?.length ?? 0) > 0
      )
      if (partsWithIssues.length > 0) {
        html += `    <div class="parts">\n`
        for (const part of partsWithIssues) {
          html += `      <div class="part">
        <div class="part-header">${escapeHtml(part.path)}</div>
`
          if (part.errors) {
            for (const error of part.errors) {
              html += `        <div class="error">
          <div class="error-code">${escapeHtml(error.code)}</div>
          <div class="error-message">${escapeHtml(error.message)}</div>
          <div class="error-path">Path: ${escapeHtml(error.path)}${error.line ? ` | Line: ${error.line}` : ''}${error.column ? `, Col: ${error.column}` : ''}</div>
        </div>
`
            }
          }
          if (part.warnings) {
            for (const warning of part.warnings) {
              html += `        <div class="error">
          <div class="error-code">${escapeHtml(warning.code)}</div>
          <div class="error-message">${escapeHtml(warning.message)}</div>
          <div class="error-path">Path: ${escapeHtml(warning.path)}${warning.line ? ` | Line: ${warning.line}` : ''}${warning.column ? `, Col: ${warning.column}` : ''}</div>
        </div>
`
            }
          }
          html += `      </div>\n`
        }
        html += `    </div>\n`
      }
    }

    html += `  </div>\n`
  }

  html += `
</body>
</html>`

  return html
}

/**
 * Basic validation fallback (XML parsing only)
 */
async function basicValidation(doc: Awaited<ReturnType<typeof OoxmlParser.fromBuffer>>) {
  const results: { path: string; valid: boolean; error?: string }[] = []

  for (const [path, part] of doc.parts) {
    if (!shouldValidateXmlPart(path, part.contentType)) continue

    try {
      const xmlContent = part.content.toString('utf-8')
      parseXmlToEventArray(xmlContent)
      results.push({ path, valid: true })
    } catch (err) {
      results.push({ path, valid: false, error: String(err) })
    }
  }

  const valid = results.every((r) => r.valid)
  return {
    success: true,
    data: {
      supportStatus: 'supported',
      valid,
      results,
      summary: {
        totalParts: results.length,
        validParts: results.filter((r) => r.valid).length,
        invalidParts: results.filter((r) => !r.valid).length,
        totalErrors: results.filter((r) => !r.valid).length,
        totalWarnings: 0,
      },
    },
  }
}

// App lifecycle
app.whenReady().then(() => {
  createMenu()
  createWindow()
  setupIpcHandlers()
  registerLspIpc()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  getLspBridge().stop()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  getLspBridge().stop()
})
