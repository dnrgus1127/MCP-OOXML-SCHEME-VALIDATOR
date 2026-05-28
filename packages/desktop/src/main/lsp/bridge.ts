import type { ChildProcessWithoutNullStreams } from 'child_process'
import { ipcMain, type WebContents } from 'electron'
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from 'vscode-jsonrpc/node'
import { spawnLspServer, type SpawnLspOptions } from './server'

const FORWARDED_NOTIFICATIONS = [
  'textDocument/publishDiagnostics',
  'window/showMessage',
  'window/logMessage',
  'telemetry/event',
] as const

export class LspBridge {
  private child: ChildProcessWithoutNullStreams | null = null
  private connection: MessageConnection | null = null
  private subscribers = new Set<WebContents>()

  start(options: SpawnLspOptions = {}): void {
    if (this.connection) return

    this.child = spawnLspServer(options)
    this.child.stderr.on('data', (chunk: Buffer) => {
      console.warn('[ooxml-lsp stderr]', chunk.toString('utf-8').trimEnd())
    })
    this.child.on('exit', (code, signal) => {
      console.warn(`[ooxml-lsp exit] code=${code} signal=${signal ?? 'none'}`)
      this.connection?.dispose()
      this.connection = null
      this.child = null
    })

    const connection = createMessageConnection(
      new StreamMessageReader(this.child.stdout),
      new StreamMessageWriter(this.child.stdin)
    )

    for (const method of FORWARDED_NOTIFICATIONS) {
      connection.onNotification(method, (params) => {
        this.broadcast({ method, params })
      })
    }

    connection.listen()
    this.connection = connection
  }

  stop(): void {
    this.connection?.dispose()
    this.connection = null
    this.child?.kill()
    this.child = null
    this.subscribers.clear()
  }

  async sendRequest<T = unknown>(method: string, params?: unknown): Promise<T> {
    const connection = this.requireConnection()
    return connection.sendRequest<T>(method, params)
  }

  async sendNotification(method: string, params?: unknown): Promise<void> {
    const connection = this.requireConnection()
    await connection.sendNotification(method, params)
  }

  subscribe(webContents: WebContents): void {
    if (this.subscribers.has(webContents)) return
    this.subscribers.add(webContents)
    webContents.once('destroyed', () => this.subscribers.delete(webContents))
  }

  private broadcast(payload: { method: string; params: unknown }): void {
    for (const webContents of this.subscribers) {
      if (webContents.isDestroyed()) {
        this.subscribers.delete(webContents)
        continue
      }
      webContents.send('lsp:notification', payload)
    }
  }

  private requireConnection(): MessageConnection {
    if (!this.connection) {
      throw new Error('LSP server is not running. Call lsp:start first.')
    }
    return this.connection
  }
}

let bridgeInstance: LspBridge | null = null

export function getLspBridge(): LspBridge {
  if (!bridgeInstance) bridgeInstance = new LspBridge()
  return bridgeInstance
}

export function registerLspIpc(bridge: LspBridge = getLspBridge()): void {
  ipcMain.handle('lsp:start', async (event, options: SpawnLspOptions = {}) => {
    try {
      bridge.start(options)
      bridge.subscribe(event.sender)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('lsp:stop', async () => {
    bridge.stop()
    return { success: true }
  })

  ipcMain.handle('lsp:request', async (_event, method: string, params: unknown) => {
    try {
      const data = await bridge.sendRequest(method, params)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('lsp:notify', async (_event, method: string, params: unknown) => {
    try {
      await bridge.sendNotification(method, params)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })
}
