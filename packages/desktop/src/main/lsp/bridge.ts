import type { ChildProcessWithoutNullStreams } from 'child_process'
import { ipcMain, type WebContents } from 'electron'
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from 'vscode-jsonrpc/node'
import { mkdirSync, appendFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { spawnLspServer, type SpawnLspOptions } from './server'

const LOG_DIR = join(process.cwd(), '.omc', 'logs')
const LOG_FILE = join(LOG_DIR, 'lsp-debug.log')

function ensureLogDir(): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true })
  } catch {
    /* ignore */
  }
}

function resetLogFile(): void {
  ensureLogDir()
  try {
    writeFileSync(LOG_FILE, `=== session start ${new Date().toISOString()} ===\n`, 'utf-8')
  } catch {
    /* ignore */
  }
}

function logToFile(line: string): void {
  ensureLogDir()
  try {
    appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`, 'utf-8')
  } catch {
    /* ignore */
  }
}

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

    resetLogFile()
    logToFile(`[bridge.start] options=${JSON.stringify(options)}`)

    this.child = spawnLspServer(options)
    this.child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8').trimEnd()
      console.warn('[ooxml-lsp stderr]', text)
      logToFile(`[stderr] ${text}`)
    })
    this.child.on('exit', (code, signal) => {
      const msg = `code=${code} signal=${signal ?? 'none'}`
      console.warn(`[ooxml-lsp exit] ${msg}`)
      logToFile(`[exit] ${msg}`)
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
        logToFile(`[notify ${method}] ${JSON.stringify(params).slice(0, 800)}`)
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
    logToFile(`[request ${method}] ${JSON.stringify(params).slice(0, 800)}`)
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

  ipcMain.handle('lsp:log', async (_event, message: string) => {
    logToFile(`[renderer] ${message}`)
    return { success: true }
  })
}
