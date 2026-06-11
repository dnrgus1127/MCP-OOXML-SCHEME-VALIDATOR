# OOXML Schema Validator

OOXML(`.xlsx`, `.docx`, `.pptx`)과 ODF(`.ods`, `.odt`, `.odp`) 문서를 열어
내부 XML을 편집하고, 문서 또는 패키지 간 차이를 비교하는 데스크톱 앱입니다.

데스크톱 앱은 Monaco Editor를 사용하며, OOXML LSP 서버의 diagnostics를 에디터에
표시합니다. LSP 서버는 XSD 스키마 검증을 기본으로 수행하고, 선택적으로
MS Open XML SDK 기반 심층 검증을 함께 실행할 수 있습니다.

이 저장소는 `pnpm`과 Turborepo를 사용하는 모노레포입니다. 검증 엔진, XML 파서,
Electron 데스크톱 앱과 OOXML LSP submodule을 함께 관리합니다.

## 주요 기능

- **열기**: OOXML/ODF 패키지(`zip`)를 풀어 내부 XML 파트 트리를 탐색
- **편집**: Monaco 기반 에디터로 XML 파트를 직접 수정하고 패키지로 저장
- **비교**: 두 패키지 또는 XML 파일 간 구조와 내용 차이를 diff로 확인
- **검증**: OOXML LSP diagnostics를 통해 XSD 스키마 오류 위치를 표시
- **심층 검증(선택)**: MS Open XML SDK 기반 sidecar로 추가 오류를 검출

## 데스크톱 앱 빌드 (Windows exe)

`packages/desktop`은 Electron 앱입니다. `electron-builder`를 사용해 Windows 실행 파일을
만들 수 있습니다.

데스크톱 앱은 OOXML LSP 서버(`@ooxml-tools/lsp-server`)를 자식 프로세스로 실행합니다.
따라서 패키징 전에 LSP 서버 번들과 런타임 의존성을 함께 빌드해야 합니다.

### 사전 요구사항

- Node.js 18 이상
- pnpm 9
- Git
- Windows 환경
- .NET SDK (MS Validator를 포함할 때만 필요)

LSP 서버는 `packages/ooxml-lsp` Git submodule로 관리합니다. 다른 운영체제에서 Windows
타겟을 빌드하려면 Wine 등의 추가 설정이 필요합니다.

#### pnpm 설치

`pnpm`이 설치되어 있지 않다면 다음 중 한 가지 방법으로 설치합니다.

```bash
# 1. Corepack 사용 (권장)
corepack enable
corepack prepare pnpm@9 --activate

# 2. npm으로 전역 설치
npm install -g pnpm@9

# 3. Windows PowerShell 설치 스크립트
iwr https://get.pnpm.io/install.ps1 -useb | iex
```

설치 후 버전 확인:

```bash
pnpm -v
```

### 공통 빌드 절차

```bash
# 1. LSP 서버 submodule 체크아웃
git submodule update --init --recursive

# 2. 의존성 설치
pnpm install

# 3. 루트 워크스페이스 패키지 빌드
pnpm run build

# 4. LSP 서버와 의존성 빌드
pnpm --filter "@ooxml-tools/lsp-server..." run build

# 5. LSP 서버 번들에 createRequire 배너 적용
node tools/build-lsp-bin.mjs
```

`pnpm run build`는 submodule의 `@ooxml-tools/*` 패키지를 빌드하지 않습니다.
따라서 LSP 서버 빌드와 `tools/build-lsp-bin.mjs` 실행은 생략할 수 없습니다.

공통 빌드가 끝나면 필요한 검증 수준에 따라 아래 시나리오 중 하나를
선택합니다.

### 시나리오 A: MS Validator 없이 빌드 (XSD 스키마 검증만 사용)

.NET SDK 없이 데스크톱 앱을 빌드하는 방법입니다.

`ooxml-msvalidator.exe`가 없으면 LSP 서버는 심층 검증을 자동으로 비활성화하고
XSD 스키마 기반 diagnostics만 제공합니다. 이전 빌드의 sidecar가 남아 있다면
제거한 뒤 패키징합니다.

```bash
# 6. sidecar 바이너리가 없는지 확인
test ! -f packages/ooxml-lsp/packages/ms-validator-bin/win-x64/ooxml-msvalidator.exe

# 7. Windows 폴더형 실행 파일 패키징
pnpm --filter @ooxml/desktop exec electron-builder --win --dir --config electron-builder.yml
```

### 시나리오 B: MS Validator 포함 빌드 (심층 검증 사용)

.NET SDK가 설치된 Windows x64 환경에서 MS Open XML SDK 기반 sidecar를 함께 빌드하는
방법입니다.

생성된 `ooxml-msvalidator.exe`는 `@ooxml-tools/ms-validator-bin` 워크스페이스 패키지를
통해 앱에 포함됩니다. LSP 서버는 실행 시 sidecar를 자동으로 탐색합니다.

```bash
# 6. MS Open XML SDK 기반 .NET sidecar 빌드
pnpm --filter @ooxml-tools/ms-validator-bin run build:win-x64

# 7. sidecar 생성 확인
test -f packages/ooxml-lsp/packages/ms-validator-bin/win-x64/ooxml-msvalidator.exe

# 8. Windows 폴더형 실행 파일 패키징
pnpm --filter @ooxml/desktop exec electron-builder --win --dir --config electron-builder.yml
```

### 산출물

폴더형 실행 파일은 `packages/desktop/release/win-unpacked/`에 생성됩니다.

- `OOXML Validator.exe`: 실행 파일

`win-unpacked/` 폴더 전체를 함께 배포해야 합니다. 대상 PC에서 압축을 해제한 뒤
`OOXML Validator.exe`를 실행합니다.

### 패키징 결과 확인

패키징된 `app.asar`에 LSP 런타임 의존성이 포함되었는지 확인합니다.

```bash
# LSP 런타임 의존성 확인
npx asar list "packages/desktop/release/win-unpacked/resources/app.asar" | grep vscode-languageserver

# 시나리오 B에서만 실행: MS Validator sidecar 확인
npx asar list "packages/desktop/release/win-unpacked/resources/app.asar" | grep ooxml-msvalidator.exe
```

### 알려진 제약 사항

#### NSIS 인스톨러와 portable 단일 exe

`electron-builder.yml`은 `nsis`와 `portable` 타겟을 정의하지만, 두 타겟은 현재 긴 경로
문제로 빌드에 실패할 수 있습니다. pnpm의 `.pnpm` 가상 스토어 경로와 프로젝트 루트
경로가 합쳐져 Windows `MAX_PATH(260자)`를 초과하기 때문입니다.

이 문서의 기본 빌드는 `makensis`를 사용하지 않는 폴더형 `win-unpacked` 산출물을
생성합니다. 단일 exe 또는 인스톨러가 필요하면 pnpm `virtual-store-dir`을 짧은 경로로
옮기거나 `node-linker=hoisted` 설정을 검토해야 합니다.

#### LSP 서버의 `createRequire` 배너

`@ooxml-tools/lsp-server`의 `dist/bin.js`는 ESM 형식으로 번들됩니다. 일부 CommonJS
의존성이 런타임에 `require()`를 호출하므로, 기본 번들만 사용하면 로드에
실패합니다.

`tools/build-lsp-bin.mjs`는 `createRequire` 배너를 주입해 `dist/bin.js`를 다시 생성합니다.
LSP 서버를 빌드한 직후 반드시 실행해야 합니다.

#### MS Validator sidecar

MS Open XML SDK 기반 심층 검증은 기본 빌드에 포함되지 않습니다.
`ooxml-msvalidator.exe`는 저장소에 커밋하지 않으며, .NET SDK로 별도 빌드합니다.

sidecar가 없어도 앱은 정상 동작합니다. 이 경우 LSP 서버는 XSD 스키마 기반 검증만
수행합니다.

### 참고 스크립트

- `pnpm --filter @ooxml/desktop run package`: 현재 OS의 기본 타겟
- `pnpm --filter @ooxml/desktop run package:mac`: macOS `dmg`, `zip`
- `pnpm --filter @ooxml/desktop run package:linux`: Linux `AppImage`, `deb`

## 주요 구성

- `SchemaRegistry`/`SchemaRegistryBuilder`: 네임스페이스별 스키마 관리
- `CompositorState`: sequence/choice/all 검증 상태 관리
- `ValidationEngine`: 이벤트 기반 XML 검증

## 패키지 구성

자세한 패키지 구조는 `packages/README.md`를 참고합니다.

- `packages/core`: OOXML 스키마 검증 엔진
- `packages/desktop`: Electron 데스크톱 앱
- `packages/parser`: XML 이벤트 스트리밍 파서
- `packages/ooxml-lsp`: OOXML LSP Git submodule
- `tools/validate-xml`: 에디터 없이 스키마 검증을 실행하는 개발용 CLI

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

## 참고 문서

- 검증 엔진 교체 계획: `docs/lsp-validation-engine-replacement-plan.md`
- LSP/Monaco 연동 흐름: `docs/lsp-monaco-integration-flow.md`
