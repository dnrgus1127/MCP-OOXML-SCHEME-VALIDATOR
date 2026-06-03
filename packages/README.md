# Packages

이 디렉터리는 OOXML 검증 도구의 런타임 패키지와 데스크톱 앱을 담습니다.
루트 워크스페이스는 `pnpm-workspace.yaml` 기준으로 아래 패키지를 연결합니다.

## 워크스페이스 구성

- `core`: OOXML XSD 스키마 검증 엔진
- `parser`: OOXML/ODF 패키지 압축 해제와 XML 파싱 유틸리티
- `mcp`: 검증 기능을 MCP 도구로 노출하는 서버
- `desktop`: Electron과 React 기반 데스크톱 앱
- `ooxml-lsp/packages/*`: OOXML LSP submodule의 워크스페이스 패키지

`packages/ooxml-lsp` 자체는 Git submodule 루트이므로 워크스페이스에서 제외합니다.
대신 그 하위의 `packages/ooxml-lsp/packages/*` 패키지를 루트 워크스페이스에
연결합니다. VS Code extension 패키지는 현재 루트 워크스페이스 대상에서 제외합니다.

## 루트 패키지

### `@ooxml/core`

OOXML XSD 스키마를 런타임 검증 모델로 사용해 XML 이벤트 스트림을 검증합니다.

주요 디렉터리:

- `src/engine`: 검증 엔진과 compositor 상태 관리
- `src/schema`: 스키마 타입과 registry 구현
- `src/schemas`: strict OOXML 스키마 생성 산출물
- `src/schemas-transitional`: transitional OOXML 스키마 생성 산출물
- `src/__tests__`: 검증 엔진 테스트

스키마 산출물은 `tools/xsd-converter`로 생성합니다. `@ooxml/core`의 `build`는
`prebuild` 단계에서 strict/transitional 스키마를 다시 생성합니다.

### `@ooxml/parser`

OOXML/ODF 패키지를 ZIP으로 읽고, 내부 XML을 파싱해 검증 흐름에서 사용할 수 있는
데이터로 변환합니다.

주요 디렉터리:

- `src/zip`: 패키지 압축 해제와 파일 접근
- `src/xml`: XML 파싱과 이벤트 변환

`@ooxml/parser`는 `@ooxml/core`를 의존합니다.

### `@ooxml/mcp`

OOXML 검증 기능을 MCP 서버와 도구 핸들러로 노출합니다.

주요 디렉터리:

- `src/index.ts`: MCP 서버 진입점
- `src/tools`: 검증 관련 MCP tool 구현

`@ooxml/mcp`는 `@ooxml/core`와 `@ooxml/parser`를 조합해 동작합니다.

### `@ooxml/desktop`

Electron main/preload process와 React renderer로 구성된 데스크톱 앱입니다.
Monaco Editor로 XML 파트를 편집하고, OOXML LSP diagnostics를 화면에 표시합니다.

주요 디렉터리:

- `src/main`: Electron main process, 파일 처리, IPC, LSP bridge
- `src/preload`: renderer에 노출하는 안전한 Electron API
- `src/renderer`: React UI, 상태 관리, XML editor 화면
- `src/shared`: main/preload/renderer에서 공유하는 타입과 유틸리티

`@ooxml/desktop`은 `@ooxml/core`, `@ooxml/parser`,
`@ooxml-tools/lsp-server`를 의존합니다.

## OOXML LSP Submodule

`packages/ooxml-lsp`는 별도 저장소로 관리되는 Git submodule입니다.
루트 앱에서는 이 submodule의 일부 패키지를 직접 workspace dependency로 사용합니다.

주요 패키지:

- `@ooxml-tools/lsp-server`: 데스크톱 앱이 자식 프로세스로 실행하는 OOXML LSP 서버
- `@ooxml-tools/ms-validator`: MS Open XML SDK sidecar를 호출하는 Node wrapper
- `@ooxml-tools/ms-validator-bin`: RID별 `ooxml-msvalidator` sidecar 바이너리 위치
- `@ooxml-tools/ooxml-core`: LSP 도구 모음에서 공유하는 OOXML package/core 유틸리티
- `@ooxml-tools/sdk`: 외부 도구 연동용 SDK
- `@ooxml-tools/docx-engine`: DOCX 관련 엔진
- `@ooxml-tools/pptx-engine`: PPTX 관련 엔진
- `@ooxml-tools/xlsx-engine`: XLSX 관련 엔진
- `@ooxml-tools/test-fixtures`: LSP와 엔진 테스트 fixture

`@ooxml-tools/vscode-extension`은 submodule 안에 있지만 루트 워크스페이스에는
포함하지 않습니다.

## 의존 방향

일반적인 런타임 의존 방향은 아래와 같습니다.

```text
desktop
  ├─ @ooxml/core
  ├─ @ooxml/parser
  └─ @ooxml-tools/lsp-server

mcp
  ├─ @ooxml/core
  └─ @ooxml/parser

parser
  └─ @ooxml/core

lsp-server
  ├─ @ooxml/core
  ├─ @ooxml/parser
  ├─ @ooxml-tools/ms-validator
  └─ @ooxml-tools/ms-validator-bin
```

`core`는 하위 런타임 기반 패키지입니다. `desktop`, `mcp`, `parser`, `lsp-server`가
검증 기능을 사용할 때 `core`를 참조합니다.

## 자주 쓰는 명령

루트에서 실행합니다.

```bash
# 전체 패키지 빌드
pnpm run build

# 패키지별 테스트
pnpm --filter @ooxml/core test
pnpm --filter @ooxml/parser test
pnpm --filter @ooxml/mcp test
pnpm --filter @ooxml/desktop test

# 데스크톱 앱 개발 서버
pnpm --filter @ooxml/desktop dev

# LSP 서버 빌드
pnpm --filter "@ooxml-tools/lsp-server..." run build

# Windows x64 MS Validator sidecar 빌드
pnpm --filter @ooxml-tools/ms-validator-bin run build:win-x64
```
