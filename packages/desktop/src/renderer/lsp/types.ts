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
