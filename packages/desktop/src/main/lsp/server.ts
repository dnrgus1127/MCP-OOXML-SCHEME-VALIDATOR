import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { createRequire } from 'module'

const moduleRequire = createRequire(__filename)

export type DeepValidateMode = 'on-change' | 'on-save' | 'manual'

export interface SpawnLspOptions {
  enableMsValidator?: boolean
  msValidatorBinPath?: string
  deepValidate?: DeepValidateMode
  fileFormatVersion?: string
}

export function resolveLspServerBinPath(): string {
  return moduleRequire.resolve('@ooxml-tools/lsp-server/dist/bin.js')
}

export function spawnLspServer(options: SpawnLspOptions = {}): ChildProcessWithoutNullStreams {
  const binPath = resolveLspServerBinPath()
  const args = [binPath]

  if (options.enableMsValidator === false) args.push('--no-ms-validator')
  if (options.msValidatorBinPath) args.push('--ms-validator-bin', options.msValidatorBinPath)
  if (options.deepValidate) args.push('--deep-validate', options.deepValidate)
  if (options.fileFormatVersion) args.push('--ms-validator-version', options.fileFormatVersion)

  const child = spawn(process.execPath, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })

  return child as ChildProcessWithoutNullStreams
}
