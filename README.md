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

`packages/desktop`는 Electron 앱이며, `electron-builder` 로 Windows 실행 파일을 만들 수 있습니다.
이 브랜치(`feature/ooxml-lsp-integration`)는 OOXML LSP 서버(`@ooxml-tools/lsp-server`)를 자식 프로세스로 실행해 Monaco 에디터에 diagnostics를 표시하므로, 빌드 시 **LSP 서버 번들과 그 의존성**까지 패키징에 포함되어야 합니다.

### 사전 요구사항

- Node.js 18 이상
- pnpm 9 (없으면 아래 절차로 설치)
- Git (LSP 서버는 `packages/ooxml-lsp` **git submodule** 로 관리됨)
- Windows 환경 (다른 OS에서 win 타겟 빌드 시 wine 등 별도 설정 필요)
- (선택) .NET SDK — MS Open XML SDK 기반 **심층 검증**까지 사용하려는 경우에만 필요. 아래 "알려진 제약" 참고

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
# 1. LSP 서버 submodule 체크아웃 (필수)
#    체크아웃하지 않으면 @ooxml-tools/lsp-server 가 없어 LSP 가 동작하지 않습니다.
git submodule update --init --recursive

# 2. 의존성 설치 (모노레포 루트)
#    desktop 의 dependencies 에 vscode-languageserver 계열이 포함되어 있어야
#    패키징 시 LSP 런타임 의존성이 누락되지 않습니다.
pnpm install

# 3. 루트 워크스페이스 패키지 빌드 (core / parser / desktop 등)
pnpm run build

# 4. LSP 서버(+의존성) 빌드
#    turbo(pnpm run build) 는 submodule(@ooxml-tools/*) 패키지를 빌드 대상에 포함하지 않으므로
#    아래 filter 빌드를 반드시 별도로 실행해 dist/bin.js 를 생성해야 합니다.
pnpm --filter "@ooxml-tools/lsp-server..." run build

# 5. LSP 서버 번들(dist/bin.js) 을 createRequire 배너와 함께 다시 번들 (필수)
#    submodule 의 원본 build 스크립트는 ESM 번들에서 동적 require 가 막혀 런타임 로드에 실패합니다.
#    아래 스크립트가 banner 를 주입해 bin.js 를 다시 생성합니다. (자세한 내용은 "알려진 제약" 참고)
node tools/build-lsp-bin.mjs

# 6. Windows 패키징 (win-unpacked 폴더형 실행 파일)
pnpm --filter @ooxml/desktop exec electron-builder --win --dir --config electron-builder.yml
```

### 산출물

`packages/desktop/release/win-unpacked/` 아래에 폴더형 실행 파일이 생성됩니다.

- `OOXML Validator.exe` — 실행 파일 (폴더 전체를 함께 배포해야 동작)

폴더 전체(`win-unpacked/`)를 압축해 배포하고, 대상 PC에서 압축 해제 후 `OOXML Validator.exe` 를 실행합니다.

### 빌드가 올바른지 검증 (LSP 기동 확인)

패키징된 LSP 서버 번들이 앱과 동일한 방식(`ELECTRON_RUN_AS_NODE`)으로 정상 기동하는지 확인할 수 있습니다.

```bash
# app.asar 내부 의존성(vscode-languageserver 계열) 포함 여부 확인
npx asar list "packages/desktop/release/win-unpacked/resources/app.asar" | grep vscode-languageserver

# LSP 서버 번들이 실제로 로드되어 initialize 에 응답하는지 확인
# (정상이면 capabilities 가 포함된 JSON-RPC 응답이 출력됨)
```

### 알려진 제약 / 주의사항

- **NSIS 인스톨러 / portable 단일 exe 는 현재 이 경로에서 빌드 실패함**
  - `electron-builder.yml` 은 `nsis` + `portable` 타겟을 정의하지만, 두 타겟 모두 `makensis` 를 사용합니다.
  - 번들된 `makensis 3.0.4.1` 은 긴 경로(long path)를 지원하지 않는데, pnpm 의 깊은 `.pnpm` 가상 스토어 경로 + 긴 프로젝트 루트 경로가 합쳐져 Windows `MAX_PATH(260자)` 를 초과합니다(`could not open file: ...StdUtils.nsh`).
  - 단일 exe/인스톨러가 필요하면: pnpm `virtual-store-dir` 를 짧은 경로로 재배치하거나 `node-linker=hoisted` 로 재설치하는 우회가 필요합니다. 폴더형(win-unpacked)은 `makensis` 를 사용하지 않으므로 영향을 받지 않습니다.
- **LSP 서버 번들의 `createRequire` 배너 (빌드 step 5)**
  - `@ooxml-tools/lsp-server` 의 `dist/bin.js` 는 esbuild `--format=esm` 으로 번들됩니다. `adm-zip` 등 CommonJS 의존성이 런타임에 `require('fs')` 를 호출하는데, ESM 출력에서는 동적 `require` 가 막혀(`Dynamic require of "fs" is not supported`) 번들이 로드되지 않습니다.
  - submodule(`packages/ooxml-lsp`) 은 고정 커밋(pinned SHA)으로 체크아웃되므로 submodule build 스크립트를 직접 고쳐도 재체크아웃 시 사라집니다. 따라서 메인 저장소의 `tools/build-lsp-bin.mjs` 가 `createRequire` 배너를 주입해 `dist/bin.js` 를 다시 번들합니다(빌드 step 5). submodule build 직후 반드시 실행해야 하며, 근본적으로는 `ooxml-lsp` 저장소의 lsp-server build 스크립트에 banner 가 반영(upstream)되어야 합니다.
- **MS Open XML SDK 심층 검증(deep validation) 은 기본 빌드에 포함되지 않음**
  - 심층 검증은 `@ooxml-tools/ms-validator-bin` 의 네이티브 .NET sidecar(`ooxml-msvalidator.exe`)가 필요하지만, 해당 바이너리는 저장소에 커밋되어 있지 않고 `dotnet publish` 로 별도 빌드해야 합니다.
  - 바이너리가 없으면 LSP 서버는 심층 검증을 자동으로 비활성화하고 **XSD 스키마 기반 검증만** 수행합니다(앱은 정상 동작). 심층 검증까지 쓰려면 .NET SDK 설치 후 `pnpm --filter @ooxml-tools/ms-validator-bin run build:win-x64` 로 sidecar 를 빌드해야 합니다.

### 참고 스크립트

- `pnpm --filter @ooxml/desktop run package` — 현재 OS 기본 타겟(인스톨러; 위 NSIS 제약 적용)
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
