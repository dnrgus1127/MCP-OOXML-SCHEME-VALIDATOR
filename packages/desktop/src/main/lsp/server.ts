import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { createRequire } from 'module'
import { existsSync } from 'fs'
import { dirname, join, sep } from 'path'

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

/** Node platform/arch → .NET RID (ms-validator-bin 의 디렉터리 이름) */
function ridFor(platform: string, arch: string): string | undefined {
  if (platform === 'win32' && arch === 'x64') return 'win-x64'
  if (platform === 'darwin' && arch === 'arm64') return 'osx-arm64'
  if (platform === 'darwin' && arch === 'x64') return 'osx-x64'
  if (platform === 'linux' && arch === 'x64') return 'linux-x64'
  return undefined
}

/**
 * ms-validator sidecar 네이티브 실행 파일의 "실제 디스크 경로"를 해석한다.
 *
 * 패키징(app.asar) 환경에서는 sidecar 가 asar 내부에 들어가는데,
 * 네이티브 exe 는 asar 가상 경로로 실행할 수 없어 spawn 시 ENOENT 로 LSP 서버가 죽는다.
 * 또한 asar-fs 때문에 existsSync 가 asar 내부 경로를 "존재함"으로 오판하므로,
 * asarUnpack 으로 풀린 실제 경로(app.asar.unpacked)를 직접 찾아 반환한다.
 * dev 환경(asar 아님)에서는 일반 디스크 경로를 그대로 반환한다.
 * 찾지 못하면 undefined → 호출부에서 심층 검증을 끈다.
 */
export function resolveMsValidatorBinPath(): string | undefined {
  const rid = ridFor(process.platform, process.arch)
  if (!rid) return undefined
  const exe = process.platform === 'win32' ? 'ooxml-msvalidator.exe' : 'ooxml-msvalidator'
  try {
    const lspRequire = createRequire(resolveLspServerBinPath())
    const pkgJson = lspRequire.resolve('@ooxml-tools/ms-validator-bin/package.json')
    const candidate = join(dirname(pkgJson), rid, exe)
    const asarToken = `app.asar${sep}`
    if (candidate.includes(asarToken)) {
      // 패키징 환경: asarUnpack 으로 풀린 실제 파일만 인정한다(asar 내부 경로는 실행 불가).
      const unpacked = candidate.replace(asarToken, `app.asar.unpacked${sep}`)
      return existsSync(unpacked) ? unpacked : undefined
    }
    return existsSync(candidate) ? candidate : undefined
  } catch {
    return undefined
  }
}

export function spawnLspServer(options: SpawnLspOptions = {}): ChildProcessWithoutNullStreams {
  const binPath = resolveLspServerBinPath()
  const args = [binPath, '--stdio']

  const wantMsValidator = options.enableMsValidator !== false
  const msValidatorBinPath = wantMsValidator
    ? (options.msValidatorBinPath ?? resolveMsValidatorBinPath())
    : undefined

  if (wantMsValidator && msValidatorBinPath) {
    args.push('--ms-validator-bin', msValidatorBinPath)
  } else {
    // sidecar 를 못 찾으면 심층 검증을 끈다. 그래야 asar 내부 경로 spawn 으로 LSP 서버가
    // 통째로 죽는 일을 막고 XSD 스키마 검증만이라도 정상 동작한다.
    args.push('--no-ms-validator')
  }

  if (options.deepValidate) args.push('--deep-validate', options.deepValidate)
  if (options.fileFormatVersion) args.push('--ms-validator-version', options.fileFormatVersion)

  const child = spawn(process.execPath, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    // Windows 에서 자식 프로세스 콘솔 창이 foreground 로 뜨지 않도록 숨긴다.
    windowsHide: true,
  })

  return child as ChildProcessWithoutNullStreams
}
