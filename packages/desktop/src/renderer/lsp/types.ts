export type PackageKind = 'xlsx' | 'docx' | 'pptx'

export interface PartDescriptor {
  path: string
  contentType: string
  text?: string
}

export interface Position {
  line: number
  character: number
}

export interface Range {
  start: Position
  end: Position
}

export type DiagnosticSeverity = 1 | 2 | 3 | 4

export interface Diagnostic {
  range: Range
  severity?: DiagnosticSeverity
  code?: string | number
  source?: string
  message: string
}

export interface PublishDiagnosticsParams {
  uri: string
  diagnostics: Diagnostic[]
}

export type DeepValidateMode = 'on-change' | 'on-save' | 'manual'

export interface LspStartOptions {
  enableMsValidator?: boolean
  msValidatorBinPath?: string
  deepValidate?: DeepValidateMode
  fileFormatVersion?: string
}

export type LspServerState = 'stopped' | 'starting' | 'running' | 'crashed'

export interface LspStatus {
  /** LSP 서버 프로세스의 현재 상태 */
  state: LspServerState
  /** MS Open XML SDK 기반 심층 검증 활성 여부 */
  msValidator: boolean
  /** 상태 부연 설명(오류 사유 등) */
  detail?: string
}
