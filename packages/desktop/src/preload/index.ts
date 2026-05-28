/**
 * Preload Script
 *
 * Exposes safe IPC methods to the renderer process.
 */

import { contextBridge, ipcRenderer } from 'electron'
import type { OpenTool } from '../shared/recent-files'

// API exposed to renderer
const api = {
  // Dialog
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  openDroppedFiles: (filePaths: string[]) => ipcRenderer.invoke('app:openDroppedFiles', filePaths),
  saveFile: (defaultPath?: string) => ipcRenderer.invoke('dialog:saveFile', defaultPath),
  confirmFileChange: () => ipcRenderer.invoke('dialog:confirmFileChange'),
  confirmOverwriteOriginal: (filePath?: string) =>
    ipcRenderer.invoke('dialog:confirmOverwriteOriginal', filePath),

  // File system
  readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath: string, data: string) => ipcRenderer.invoke('fs:writeFile', filePath, data),
  fileExists: (filePath: string) => ipcRenderer.invoke('fs:exists', filePath),
  pickFolder: (defaultPath?: string) => ipcRenderer.invoke('dialog:pickFolder', defaultPath),
  listFolders: (folderPaths: string[]) => ipcRenderer.invoke('fs:listFolders', folderPaths),

  // Recent files
  getRecentFiles: () => ipcRenderer.invoke('recent-files:list'),
  addRecentFile: (input: { filePath: string; fileName?: string; lastTool: OpenTool }) =>
    ipcRenderer.invoke('recent-files:add', input),
  addRecentFiles: (inputs: Array<{ filePath: string; fileName?: string; lastTool: OpenTool }>) =>
    ipcRenderer.invoke('recent-files:add-many', inputs),
  removeRecentFile: (filePath: string) => ipcRenderer.invoke('recent-files:remove', filePath),
  clearRecentFiles: () => ipcRenderer.invoke('recent-files:clear'),

  // Schema metadata
  getSupportedSchemaList: () => ipcRenderer.invoke('schema:supported-list'),

  // OOXML operations
  parseDocument: (base64Data: string, filePath?: string) =>
    ipcRenderer.invoke('ooxml:parse', base64Data, filePath),
  getPart: (base64Data: string, partPath: string, filePath?: string) =>
    ipcRenderer.invoke('ooxml:getPart', base64Data, partPath, filePath),
  updatePart: (base64Data: string, partPath: string, content: string, filePath?: string) =>
    ipcRenderer.invoke('ooxml:updatePart', base64Data, partPath, content, filePath),
  validate: (base64Data: string, filePath?: string) =>
    ipcRenderer.invoke('ooxml:validate', base64Data, filePath),
  analyzeSchemaReferences: (base64Data: string) =>
    ipcRenderer.invoke('ooxml:analyzeSchemaReferences', base64Data),
  searchDocument: (base64Data: string, query: string, filePath?: string) =>
    ipcRenderer.invoke('ooxml:search', base64Data, query, filePath),

  // Batch operations
  openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
  batchValidate: (filePaths: string[]) => ipcRenderer.invoke('ooxml:batchValidate', filePaths),
  exportResults: (format: 'json' | 'csv' | 'html' | 'pdf', data: any) =>
    ipcRenderer.invoke('export:results', format, data),
  onBatchProgress: (callback: (progress: { current: number; total: number }) => void) => {
    const listener = (_: Electron.IpcRendererEvent, progress: { current: number; total: number }) =>
      callback(progress)
    ipcRenderer.on('batch:progress', listener)
    return () => ipcRenderer.removeListener('batch:progress', listener)
  },

  // Menu events
  onFileOpened: (callback: (filePath: string) => void) => {
    const listener = (_: Electron.IpcRendererEvent, filePath: string) => callback(filePath)
    ipcRenderer.on('file:opened', listener)
    return () => ipcRenderer.removeListener('file:opened', listener)
  },
  onFilesOpened: (callback: (filePaths: string[]) => void) => {
    const listener = (_: Electron.IpcRendererEvent, filePaths: string[]) => callback(filePaths)
    ipcRenderer.on('files:opened', listener)
    return () => ipcRenderer.removeListener('files:opened', listener)
  },
  onMenuSave: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('menu:save', listener)
    return () => ipcRenderer.removeListener('menu:save', listener)
  },
  onMenuSaveAs: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('menu:save-as', listener)
    return () => ipcRenderer.removeListener('menu:save-as', listener)
  },
  onMenuValidate: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('menu:validate', listener)
    return () => ipcRenderer.removeListener('menu:validate', listener)
  },
  onMenuQuickOpen: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('menu:quick-open', listener)
    return () => ipcRenderer.removeListener('menu:quick-open', listener)
  },

  // LSP bridge (ooxml-lsp via main-process child)
  lsp: {
    start: (options?: {
      enableMsValidator?: boolean
      msValidatorBinPath?: string
      deepValidate?: 'on-change' | 'on-save' | 'manual'
      fileFormatVersion?: string
    }) => ipcRenderer.invoke('lsp:start', options ?? {}),
    stop: () => ipcRenderer.invoke('lsp:stop'),
    request: <T = unknown>(method: string, params?: unknown) =>
      ipcRenderer.invoke('lsp:request', method, params) as Promise<
        { success: true; data: T } | { success: false; error: string }
      >,
    notify: (method: string, params?: unknown) => ipcRenderer.invoke('lsp:notify', method, params),
    onNotification: (
      callback: (message: { method: string; params: unknown }) => void
    ) => {
      const listener = (
        _: Electron.IpcRendererEvent,
        message: { method: string; params: unknown }
      ) => callback(message)
      ipcRenderer.on('lsp:notification', listener)
      return () => ipcRenderer.removeListener('lsp:notification', listener)
    },
  },
}

// Expose API to renderer
contextBridge.exposeInMainWorld('electronAPI', api)

// Type declaration for renderer
export type ElectronAPI = typeof api
