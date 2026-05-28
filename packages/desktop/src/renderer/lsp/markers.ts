import type * as Monaco from 'monaco-editor'
import type { Diagnostic, DiagnosticSeverity } from './types'

export const LSP_MARKER_OWNER = 'ooxml-lsp'

function severityToMonaco(
  monaco: typeof Monaco,
  severity: DiagnosticSeverity | undefined
): Monaco.MarkerSeverity {
  switch (severity) {
    case 1:
      return monaco.MarkerSeverity.Error
    case 2:
      return monaco.MarkerSeverity.Warning
    case 3:
      return monaco.MarkerSeverity.Info
    case 4:
      return monaco.MarkerSeverity.Hint
    default:
      return monaco.MarkerSeverity.Error
  }
}

export function diagnosticsToMarkers(
  monaco: typeof Monaco,
  diagnostics: Diagnostic[]
): Monaco.editor.IMarkerData[] {
  return diagnostics.map((d) => ({
    severity: severityToMonaco(monaco, d.severity),
    message: d.message,
    startLineNumber: d.range.start.line + 1,
    startColumn: d.range.start.character + 1,
    endLineNumber: d.range.end.line + 1,
    endColumn: d.range.end.character + 1,
    source: d.source ?? LSP_MARKER_OWNER,
    code: d.code != null ? String(d.code) : undefined,
  }))
}
