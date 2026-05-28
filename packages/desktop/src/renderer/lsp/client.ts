import type {
  Diagnostic,
  LspStartOptions,
  PackageKind,
  PartDescriptor,
  PublishDiagnosticsParams,
} from './types'

type DiagnosticsListener = (diagnostics: Diagnostic[]) => void

interface CurrentPackage {
  packageId: string
  kind: PackageKind
}

function encodeBase64Url(value: string): string {
  if (typeof window === 'undefined' || typeof window.btoa !== 'function') return value
  return window
    .btoa(unescape(encodeURIComponent(value)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

class LspClient {
  private startPromise: Promise<void> | null = null
  private notificationCleanup: (() => void) | null = null
  private diagnosticListeners = new Map<string, Set<DiagnosticsListener>>()
  private lastDiagnostics = new Map<string, Diagnostic[]>()
  private currentPackage: CurrentPackage | null = null
  private updateTimers = new Map<string, ReturnType<typeof setTimeout>>()

  isAvailable(): boolean {
    return typeof window !== 'undefined' && window.electronAPI?.lsp !== undefined
  }

  ensureStarted(options: LspStartOptions = { enableMsValidator: false }): Promise<void> {
    if (!this.isAvailable()) return Promise.reject(new Error('LSP bridge is not available'))
    if (this.startPromise) return this.startPromise

    this.startPromise = (async () => {
      const api = window.electronAPI.lsp
      const startResult = await api.start(options)
      if (!startResult.success) {
        this.startPromise = null
        throw new Error(startResult.error ?? 'Failed to start LSP server')
      }
      this.notificationCleanup = api.onNotification((message) => this.handleNotification(message))
      await this.request('initialize', { processId: null, rootUri: null, capabilities: {} })
      await this.notify('initialized', {})
    })()

    return this.startPromise
  }

  async loadPackage(params: {
    packageId: string
    kind: PackageKind
    parts: PartDescriptor[]
  }): Promise<void> {
    await this.ensureStarted()
    this.currentPackage = { packageId: params.packageId, kind: params.kind }
    this.lastDiagnostics.clear()
    await this.request('ooxml/packageLoaded', params)
  }

  schedulePartUpdate(path: string, text: string, delayMs = 200): void {
    if (!this.currentPackage || !this.isAvailable()) return
    const existing = this.updateTimers.get(path)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      this.updateTimers.delete(path)
      void this.updatePart(path, text)
    }, delayMs)
    this.updateTimers.set(path, timer)
  }

  async updatePart(path: string, text: string): Promise<void> {
    if (!this.currentPackage) return
    await this.request('ooxml/partUpdated', {
      packageId: this.currentPackage.packageId,
      path,
      text,
    })
  }

  virtualUriFor(partPath: string): string | null {
    if (!this.currentPackage) return null
    const { kind, packageId } = this.currentPackage
    const encoded = encodeBase64Url(packageId)
    return `ooxml-${kind}:/${encoded}/${partPath}`
  }

  onDiagnostics(uri: string, listener: DiagnosticsListener): () => void {
    let set = this.diagnosticListeners.get(uri)
    if (!set) {
      set = new Set()
      this.diagnosticListeners.set(uri, set)
    }
    set.add(listener)

    const cached = this.lastDiagnostics.get(uri)
    if (cached) listener(cached)

    return () => {
      const current = this.diagnosticListeners.get(uri)
      if (!current) return
      current.delete(listener)
      if (current.size === 0) this.diagnosticListeners.delete(uri)
    }
  }

  reset(): void {
    for (const timer of this.updateTimers.values()) clearTimeout(timer)
    this.updateTimers.clear()
    this.diagnosticListeners.clear()
    this.lastDiagnostics.clear()
    this.currentPackage = null
  }

  private async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    const result = await window.electronAPI.lsp.request<T>(method, params)
    if (!result.success) throw new Error(result.error ?? `LSP request failed: ${method}`)
    return result.data
  }

  private async notify(method: string, params?: unknown): Promise<void> {
    const result = await window.electronAPI.lsp.notify(method, params)
    if (result && typeof result === 'object' && 'success' in result && !result.success) {
      throw new Error(
        ('error' in result && typeof result.error === 'string'
          ? result.error
          : `LSP notify failed: ${method}`) as string
      )
    }
  }

  private handleNotification(message: { method: string; params: unknown }): void {
    if (message.method !== 'textDocument/publishDiagnostics') return
    const params = message.params as PublishDiagnosticsParams
    this.lastDiagnostics.set(params.uri, params.diagnostics)
    const listeners = this.diagnosticListeners.get(params.uri)
    if (!listeners) return
    for (const listener of listeners) listener(params.diagnostics)
  }
}

export const lspClient = new LspClient()
