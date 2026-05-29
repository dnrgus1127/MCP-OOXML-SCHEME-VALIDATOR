# OOXML Schema Validator

OOXML(.xlsx / .docx / .pptx)과 ODF(.ods / .odt / .odp) 문서를 열어 내부 XML을 **편집**하고, 두 문서/패키지를 **비교**하며, XSD 스키마 기반으로 **검증(Pre)** 할 수 있는 데스크톱 앱입니다.
내부적으로는 OOXML XSD 스키마를 JSON 런타임 타입으로 변환해 XML을 스트리밍 방식으로 검증하는 엔진을 사용하며, 그 위에 Monaco 에디터 기반의 데스크톱 UI를 얹어 편집/비교 워크플로우를 제공합니다. 현재 검증 엔진은 실험적 Pre 기능이며, 추후 별도 OOXML LSP 서버를 개발해 검증 방식과 에디터 진단 표시를 LSP diagnostics 기반으로 교체하는 방안을 검토 중입니다.
`docs/ooxml-validation-engine-design.md`와 `docs/ooxml-schema-types.ts` 설계를 기반으로 핵심 런타임을 구성했습니다.
현재 저장소는 **모노레포**로 구성되어 검증 엔진(`core`)과 데스크톱 UI(`desktop`)를 중심으로 개발 중입니다.

## 주요 기능

- **열기**: OOXML/ODF 패키지(zip)를 풀어 내부 XML 파트(파일) 트리를 탐색
- **편집**: Monaco 기반 에디터로 XML 파트를 직접 수정하고 패키지로 저장
- **비교**: 두 패키지(또는 XML 파일) 간 구조/내용 차이를 diff 로 확인
- **검증(Pre)**: 로드된 XSD 스키마(OOXML sml/wml/pml/dml/shared 등)에 맞춰 XML 유효성 검사 및 오류 위치 표시. 향후 OOXML LSP 서버 기반 diagnostics 방식으로 교체 검토 중

## 데스크톱 앱 빌드 (Windows exe)

`packages/desktop`는 Electron 앱이며, `electron-builder` 로 Windows 설치 파일(.exe)과 portable 실행 파일을 만들 수 있습니다.

### 사전 요구사항

- Node.js 18 이상
- pnpm 9 (없으면 아래 절차로 설치)
- Windows 환경 (다른 OS에서 win 타겟 빌드 시 wine 등 별도 설정 필요)

#### pnpm 설치

`pnpm` 이 설치되어 있지 않다면 다음 중 한 가지 방법으로 설치합니다.

```bash
# 1) Node.js 16.13 이상이 설치된 경우 — Corepack 사용 (권장)
corepack enable
corepack prepare pnpm@9 --activate

# 2) npm 으로 전역 설치
npm install -g pnpm@9

# 3) Windows PowerShell 단독 설치 스크립트
iwr https://get.pnpm.io/install.ps1 -useb | iex
```

설치 후 버전 확인:

```bash
pnpm -v
```

### 빌드 절차

```bash
# 1. 의존성 설치 (모노레포 루트)
pnpm install

# 2. core / parser / desktop 빌드 산출물 준비
pnpm run build

# 3. desktop 패키지에서 Windows 타겟 패키징
pnpm --filter @ooxml/desktop run package:win
```

### 산출물

`packages/desktop/release/` 아래에 다음이 생성됩니다 (`electron-builder.yml` 기준).

- `OOXML Validator Setup <version>.exe` — NSIS 인스톨러 (설치 경로 변경 가능)
- `OOXML Validator <version>.exe` — portable 실행 파일 (설치 없이 실행)

### 참고 스크립트

- `pnpm --filter @ooxml/desktop run package` — 현재 OS 기본 타겟
- `pnpm --filter @ooxml/desktop run package:mac` — macOS dmg/zip
- `pnpm --filter @ooxml/desktop run package:linux` — Linux AppImage/deb

## 주요 구성

- `SchemaRegistry`/`SchemaRegistryBuilder`: 네임스페이스별 스키마 관리
- `CompositorState`: sequence/choice/all 검증 상태 관리
- `ValidationEngine`: 이벤트 기반 XML 검증

## 패키지 구성

- `packages/core`: OOXML 스키마 검증 엔진 **(주요 개발 대상, 현재 Pre 기능)**
- `packages/desktop`: 데스크톱 UI **(주요 개발 대상)**
- `packages/parser`: XML 이벤트 스트리밍 파서
- `packages/mcp`: MCP 서버/도구 래퍼 (후순위)

## 사용 예시

```ts
import { SchemaRegistryImpl, ValidationEngine } from './dist'

const registry = new SchemaRegistryImpl(new Map())
const validator = new ValidationEngine(registry, { failFast: false })

validator.startDocument()
validator.startElement({
  name: 'c:chart',
  localName: 'chart',
  namespaceUri: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
  attributes: [],
})
validator.endElement({
  name: 'c:chart',
  localName: 'chart',
  namespaceUri: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
  attributes: [],
})
const result = validator.endDocument()

console.log(result.valid, result.errors)
```

## 개발

```bash
pnpm install
pnpm run build
```

### 자주 쓰는 스크립트

```bash
pnpm run dev
pnpm run test
pnpm run lint
pnpm run typecheck
```

## 개발 우선순위

현재 **core** (검증 엔진)와 **desktop** (데스크톱 UI) 개발에 집중하고 있습니다.
MCP 통합은 후순위로 계획되어 있습니다.
검증 엔진은 현재 Pre 기능으로 제공하며, 추후 별도 OOXML LSP 서버를 개발해 데스크톱 에디터의 인라인 diagnostics와 배치 검증 모두 LSP 기반으로 전환하는 방안을 검토 중입니다.

## 참고 문서

- MCP 통합 시나리오: `docs/mcp-integration.md`
- Electron/MCP 환경설정: `docs/electron-mcp-setup.md`
- 검증 엔진 교체 계획: `docs/lsp-validation-engine-replacement-plan.md`
- LSP/Monaco 연동 흐름: `docs/lsp-monaco-integration-flow.md`
