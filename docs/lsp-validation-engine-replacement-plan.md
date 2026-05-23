# OOXML LSP 기반 검증 엔진 교체 계획

## 1. 목적

현재 데스크톱 앱의 검증 흐름은 `@ooxml/core`의 로컬 검증 엔진을 직접 호출하고, 결과를 검증 패널에 표시하는 배치형 구조다. 향후 외부 OOXML LSP 서버를 검증 엔진으로 사용하려면 검증 결과의 원천을 LSP diagnostics로 전환하고, 에디터에서는 Monaco 인라인 표시를 기본 UX로 삼는다.

이 문서는 다음 두 사용 흐름을 모두 LSP 기반으로 전환하기 위한 수정 지점을 정의한다.

- XML 에디터: 열린 OOXML part의 diagnostics를 Monaco 밑줄, gutter marker, hover로 표시한다.
- 배치 검증: 에디터를 열지 않고 OOXML 문서의 XML parts를 LSP에 임시로 열어 diagnostics를 수집하고 기존 배치 결과 구조로 집계한다.

## 2. 전환 원칙

### 2.1 제거할 UX

에디터 화면의 기존 검증 패널 중심 UX는 제거한다.

- 수동 `Validate` 실행 후 결과 패널에 표시하는 흐름 제거
- `ValidationPanel` 기반 part별 오류 목록 제거
- XML 에디터 화면의 `validationResults`, `showValidation`, `Re-validate` 상태 제거

에디터 검증의 기본 표면은 Monaco editor 자체가 된다.

- 오류/경고 밑줄
- gutter marker
- hover 메시지
- 문제 위치로 커서 이동
- LSP 연결 상태 표시

### 2.2 유지할 UX

배치 검증 화면은 에디터가 없으므로 결과 목록 UI가 필요하다. 기존 `BatchValidator`와 `ValidationResultTree` 계열 UI는 유지하되, 내부 검증 방식만 로컬 core 엔진에서 LSP diagnostics 수집으로 바꾼다.

### 2.3 로컬 검증 엔진의 위치

`@ooxml/core` 검증 엔진은 즉시 삭제하지 않는다.

- `packages/core`: 스키마 모델, 기존 테스트, MCP/CLI fallback 용도로 유지 가능
- `packages/mcp`: 기존 MCP validate tool을 유지할지 별도 결정
- `packages/desktop`: 기본 검증 경로에서는 LSP provider만 사용

## 3. 현재 구조의 교체 대상

### 3.1 Desktop main process

현재 데스크톱 검증은 `packages/desktop/src/main/index.ts` 안에 통합되어 있다.

- `validateXmlPart()`: XML 문자열을 `parseXmlToEventArray()`로 변환한 뒤 `validateXmlEvents()` 호출
- `ooxml:validate`: 에디터 화면의 전체 문서 검증
- `ooxml:batchValidate`: 여러 문서를 순회하며 로컬 검증 실행

LSP 전환 후 변경 방향:

- `validateXmlPart()` 제거
- `ooxml:validate` 제거 또는 LSP status/debug 용도 외 비노출
- `ooxml:batchValidate` 내부 구현을 LSP diagnostics 수집으로 교체
- LSP process lifecycle과 JSON-RPC 통신은 main process에서만 처리

### 3.2 Preload API

현재 renderer에는 `window.electronAPI.validate()`가 노출되어 있다. LSP 전환 후 에디터는 수동 검증 호출 대신 문서/part lifecycle 이벤트를 보낸다.

제거 또는 교체 대상:

- `validate(base64Data, filePath?)`

추가할 API:

```typescript
interface ElectronAPI {
  lspOpenPart(input: LspOpenPartInput): Promise<LspOperationResult>
  lspChangePart(input: LspChangePartInput): Promise<LspOperationResult>
  lspClosePart(input: LspClosePartInput): Promise<LspOperationResult>
  lspRestart(): Promise<LspOperationResult>
  onLspDiagnostics(callback: (event: LspDiagnosticsEvent) => void): () => void
  onLspStatus(callback: (status: LspStatusEvent) => void): () => void
}
```

### 3.3 Renderer store

현재 `document` store는 `validationResults`와 `validate()` 액션을 갖고 있다. 에디터 전환 후에는 패널 결과가 아니라 part별 diagnostics 상태를 저장한다.

제거 대상:

- `validationResults`
- `validate()`
- 에디터 화면에서 검증 패널 표시를 위한 상태

추가 대상:

```typescript
interface DocumentState {
  diagnosticsByPartPath: Record<string, OoxmlDiagnostic[]>
  lspStatus: 'disabled' | 'starting' | 'ready' | 'analyzing' | 'error'
  lspError: string | null
}
```

### 3.4 XML Editor

`XmlEditor`는 Monaco model 생성 지점에서 diagnostics를 marker로 반영해야 한다.

추가할 책임:

- `diagnostics` prop 수신
- `monaco.editor.setModelMarkers()` 호출
- 현재 model 텍스트 변경 시 debounce 후 `lspChangePart` 호출
- part 변경 시 이전 part `didClose`, 새 part `didOpen`

## 4. 신규 main process 모듈 구조

LSP 관련 코드는 `main/index.ts`에 직접 추가하지 않고 별도 모듈로 분리한다.

```text
packages/desktop/src/main/lsp/
├── ooxml-lsp-client.ts
├── ooxml-document-session.ts
├── ooxml-uri.ts
├── diagnostics-store.ts
├── batch-lsp-validator.ts
└── types.ts
```

### 4.1 `ooxml-lsp-client.ts`

외부 OOXML LSP 서버와의 통신을 담당한다.

책임:

- LSP 서버 프로세스 시작/종료
- `initialize`, `initialized`, `shutdown`, `exit`
- `textDocument/didOpen`
- `textDocument/didChange`
- `textDocument/didClose`
- `textDocument/publishDiagnostics` 수신
- request timeout, crash, restart 처리

### 4.2 `ooxml-document-session.ts`

사용자가 데스크톱 에디터에서 열고 있는 문서와 part lifecycle을 관리한다.

책임:

- 현재 열린 `filePath`, `partPath`, URI, version 관리
- part 선택 변경 시 didOpen/didClose 전송
- 에디터 변경 사항을 didChange로 전송
- 저장 전 수정 중인 텍스트와 LSP에 전달한 텍스트의 기준 일치 보장

### 4.3 `ooxml-uri.ts`

OOXML package 내부 part를 LSP 문서 URI로 변환한다.

권장 URI 형태:

```text
ooxml:///<encoded-file-path>/<part-path>
```

예:

```text
ooxml:////Users/me/book.xlsx/xl/charts/chart1.xml
```

주의사항:

- URI는 안정적으로 round-trip 가능해야 한다.
- file path와 part path를 명확히 분리해야 한다.
- Windows path, 공백, 한글 파일명, 특수문자를 encode/decode 테스트에 포함한다.

### 4.4 `diagnostics-store.ts`

LSP 서버가 보낸 diagnostics를 앱 내부 타입으로 정규화해 보관한다.

책임:

- URI별 최신 diagnostics 저장
- URI를 partPath로 역변환
- renderer로 `lsp:diagnostics` 이벤트 발행
- batch 검증 대기 로직에서 diagnostics 도착 여부 확인

### 4.5 `batch-lsp-validator.ts`

에디터 없이 여러 문서를 검증하는 배치 경로를 담당한다.

책임:

- OOXML 파일을 파싱해 검증 대상 XML part 추출
- part별 LSP URI 생성
- `didOpen` 전송 후 diagnostics 대기
- timeout 시 part별 오류 상태 기록
- `didClose` 전송
- 기존 batch validation result 형태로 집계

## 5. 공통 diagnostics 타입

로컬 core 검증 결과 타입 대신 LSP 중심 타입을 공통 계약으로 사용한다.

```typescript
export type OoxmlDiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint'

export interface OoxmlDiagnostic {
  source: 'ooxml-lsp'
  severity: OoxmlDiagnosticSeverity
  code?: string
  message: string
  filePath?: string
  partPath: string
  uri: string
  range: {
    startLineNumber: number
    startColumn: number
    endLineNumber: number
    endColumn: number
  }
}
```

Monaco marker 변환:

```typescript
function toMonacoMarker(diagnostic: OoxmlDiagnostic): monaco.editor.IMarkerData {
  return {
    severity: toMonacoSeverity(diagnostic.severity),
    message: diagnostic.message,
    code: diagnostic.code,
    startLineNumber: diagnostic.range.startLineNumber,
    startColumn: diagnostic.range.startColumn,
    endLineNumber: diagnostic.range.endLineNumber,
    endColumn: diagnostic.range.endColumn,
  }
}
```

## 6. 에디터 검증 흐름

### 6.1 Part 선택

```text
selectPart(partPath)
  -> getPart(base64Data, partPath)
  -> renderer displays XML in Monaco
  -> lspOpenPart(filePath, partPath, currentEditorText)
  -> LSP publishDiagnostics
  -> main emits lsp:diagnostics
  -> store.diagnosticsByPartPath[partPath] update
  -> XmlEditor setModelMarkers()
```

### 6.2 Part 수정

```text
Monaco onDidChangeModelContent
  -> updatePartContent(content)
  -> debounce
  -> lspChangePart(filePath, partPath, content, version)
  -> LSP publishDiagnostics
  -> main emits lsp:diagnostics
  -> marker refresh
```

### 6.3 Part 닫기 또는 변경

```text
selectedPart changes
  -> lspClosePart(previousUri)
  -> lspOpenPart(nextUri, nextContent)
```

### 6.4 저장

저장은 기존 OOXML package update 흐름을 유지한다. 단, 저장 직전 텍스트와 LSP에 전달된 최신 텍스트가 다를 수 있으므로 debounce 중인 didChange를 flush한 뒤 저장한다.

## 7. 배치 검증 흐름

배치 검증은 기존 UI를 유지하되 검증 실행 방식만 바꾼다.

```text
ooxml:batchValidate(filePaths)
  -> ensure LSP client ready
  -> for each file:
       read file
       detect OOXML
       parse OOXML package
       load validatable XML parts
       for each part:
         uri = createOoxmlUri(filePath, partPath)
         didOpen(uri, text)
         wait diagnostics or timeout
         didClose(uri)
       aggregate diagnostics by part
  -> return batch result
```

권장 결과 구조:

```typescript
interface LspBatchPartResult {
  path: string
  valid: boolean
  diagnostics: OoxmlDiagnostic[]
  errors: OoxmlDiagnostic[]
  warnings: OoxmlDiagnostic[]
}

interface LspBatchValidationResult {
  valid: boolean
  results: LspBatchPartResult[]
  summary: {
    totalParts: number
    validParts: number
    invalidParts: number
    totalErrors: number
    totalWarnings: number
  }
}
```

기존 `ValidationResultTree`가 `errors`와 `warnings`를 기대하므로, 초기 전환 단계에서는 diagnostics를 severity별로 나누어 호환 필드를 함께 제공한다.

## 8. 설정 및 오류 처리

### 8.1 설정 항목

`SettingsScreen`에는 최소한 다음 설정이 필요하다.

- LSP 서버 실행 파일 경로
- LSP 서버 인자
- 자동 시작 여부
- diagnostics timeout
- LSP restart 버튼

### 8.2 상태 표시

에디터 상단에는 검증 패널 대신 작은 상태 표시만 둔다.

- `Starting`
- `Ready`
- `Analyzing`
- `Error`
- `Disabled`

오류 상태에서는 원인과 조치가 보여야 한다.

예:

```text
OOXML LSP 서버를 시작하지 못했습니다. 설정에서 서버 경로를 확인한 뒤 다시 시작하세요.
```

## 9. 테스트 계획

### 9.1 Unit tests

- OOXML URI encode/decode
- LSP diagnostics severity mapping
- LSP range를 Monaco marker range로 변환
- diagnostics store의 URI별 최신 상태 갱신
- batch diagnostics 집계

### 9.2 Integration tests

- mock LSP server로 `publishDiagnostics` 수신 테스트
- part 변경 시 didClose/didOpen 순서 테스트
- didChange debounce와 version 증가 테스트
- batch 검증 timeout 처리 테스트

### 9.3 Manual QA

- XML part를 열면 diagnostics 밑줄이 표시된다.
- XML 수정 후 diagnostics가 갱신된다.
- part를 바꾸면 이전 part marker가 새 part에 남지 않는다.
- LSP 서버가 죽으면 상태 표시와 재시작 동작이 정상 동작한다.
- 배치 검증 결과가 파일/part/error/warning 단위로 집계된다.

## 10. 단계별 적용 계획

### Phase 1: LSP 기반 진단 인프라 추가

- `main/lsp` 모듈 추가
- LSP 프로세스 시작/종료 구현
- URI 매핑과 diagnostics store 구현
- mock LSP 기반 테스트 추가

### Phase 2: 에디터 인라인 diagnostics 전환

- preload에 LSP part lifecycle API 추가
- document store에 `diagnosticsByPartPath`, `lspStatus`, `lspError` 추가
- `XmlEditor`에 Monaco marker 적용
- 기존 `ValidationPanel` 연결 제거

### Phase 3: 배치 검증 LSP 전환

- `batch-lsp-validator.ts` 구현
- `ooxml:batchValidate` 내부 로컬 core 호출 제거
- 기존 batch result UI와 호환되는 result adapter 추가
- timeout, server failure, unsupported document 처리 정리

### Phase 4: 정리

- desktop main의 `loadSchemaRegistry`, `validateXmlEvents`, `SchemaRegistry` 의존 제거
- renderer의 manual validate action 제거
- 사용하지 않는 validation panel 컴포넌트 삭제
- docs와 settings 문구 업데이트

## 11. 주요 리스크

### 11.1 Range 기준 불일치

현재 에디터는 XML part를 열 때 포맷팅한 텍스트를 보여준다. LSP diagnostics range는 반드시 Monaco model의 현재 텍스트 기준이어야 한다. 원본 ZIP part 텍스트를 LSP에 보내면 줄 번호와 밑줄 위치가 어긋난다.

대응:

- 에디터에 표시된 텍스트를 didOpen/didChange로 전송한다.
- 저장 전 debounce된 didChange를 flush한다.

### 11.2 LSP 서버 안정성

외부 프로세스가 죽거나 응답하지 않을 수 있다.

대응:

- 상태 표시
- restart API
- batch timeout
- crash 후 열린 document session 재동기화

### 11.3 배치 검증 성능

대량 파일 검증 시 모든 part를 동시에 didOpen하면 LSP 서버가 과부하될 수 있다.

대응:

- 파일/part 단위 concurrency 제한
- progress event 유지
- timeout과 partial result 제공

### 11.4 기존 MCP 검증과의 불일치

desktop은 LSP로 전환하고 MCP validate tool은 local core를 유지하면 같은 문서에 대해 결과가 다를 수 있다.

대응:

- 전환 범위를 명확히 문서화한다.
- 필요 시 MCP validate tool도 LSP provider를 선택할 수 있도록 후속 설계한다.

