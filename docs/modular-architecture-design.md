# OOXML Validator 모듈러 아키텍처 설계

> ⚠️ **HISTORICAL / DEPRECATED** — 이 문서는 초기 "검증 엔진 + MCP 서버 + 데스크톱 앱"
> 3분할 아키텍처 설계 기록이다. 프로젝트는 이후 **OOXML 문서 편집기(에디터 + LSP 검증)**
> 로 재정의되었고 `@ooxml/mcp` 패키지와 MCP 서버 계층은 제거되었다. MCP 관련 내용
> (2.3절, Phase 4 등)은 더 이상 유효하지 않다. 현재 설계는
> `docs/superpowers/specs/2026-06-11-mcp-to-editor-package-cleanup-design.md`를 참고할 것.

## 1. 개요

OOXML 문서 검증 시스템을 4개의 독립적인 모듈로 분리하여 관리합니다.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        OOXML Validator Monorepo                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│  │  @ooxml/core    │    │  @ooxml/parser  │    │   @ooxml/mcp    │ │
│  │  검증 엔진       │◄───│  문서 처리 모듈   │◄───│   MCP 서버      │ │
│  │                 │    │                 │    │                 │ │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘ │
│          ▲                      ▲                                   │
│          │                      │                                   │
│          │              ┌───────┴───────┐                          │
│          │              │               │                          │
│          │      ┌───────┴───────┐       │                          │
│          └──────│ @ooxml/desktop │───────┘                          │
│                 │  Electron 앱    │                                  │
│                 └─────────────────┘                                 │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. 모듈 정의

### 2.1 `@ooxml/core` - 스키마 검증 엔진

**역할:** OOXML XSD 스키마를 기반으로 XML 문서를 검증하는 핵심 엔진

**책임:**

- XSD 스키마를 JSON 런타임 타입으로 관리
- 이벤트 기반 XML 검증 (SAX 스타일)
- 타입 검증 (SimpleType, ComplexType, Facet)
- Compositor 상태 관리 (sequence, choice, all)
- 검증 오류 리포팅

**주요 API:**

```typescript
// 스키마 레지스트리
interface SchemaRegistry {
  resolveType(ns: string, name: string): XsdType
  resolveElement(ns: string, name: string): XsdElement
}

// 검증 엔진
class ValidationEngine {
  startDocument(): void
  startElement(element: XmlElementInfo): void
  text(text: string): void
  endElement(element: XmlElementInfo): void
  endDocument(): ValidationResult
}

// 헬퍼 함수
function validateXmlEvents(registry, events, options): ValidationResult
function validateParts(registry, inputs, options): ValidationReport
```

**의존성:** 없음 (zero-dependency)

---

### 2.2 `@ooxml/parser` - OOXML 문서 처리 모듈

**역할:** OOXML 문서(xlsx, docx, pptx) 파일의 압축 해제, XML 파싱, JSON 변환, 재압축 처리

**책임:**

- ZIP 아카이브 해제/압축
- XML → JSON 파싱
- JSON → XML 직렬화
- Content Types 및 Relationships 해석
- Part 구조 탐색

**주요 API:**

```typescript
// 문서 로더
interface OoxmlDocument {
  readonly contentTypes: ContentTypes
  readonly parts: Map<string, OoxmlPart>

  getPart(path: string): OoxmlPart | undefined
  getPartAsJson(path: string): JsonElement
  getPartAsXml(path: string): string
  getRelationships(partPath: string): Relationship[]
}

// 파서
class OoxmlParser {
  static async fromFile(filePath: string): Promise<OoxmlDocument>
  static async fromBuffer(buffer: Buffer): Promise<OoxmlDocument>
  static async fromStream(stream: Readable): Promise<OoxmlDocument>
}

// XML ↔ JSON 변환
interface XmlJsonConverter {
  xmlToJson(xml: string): JsonElement
  jsonToXml(json: JsonElement): string
}

// 문서 빌더 (수정/재압축)
class OoxmlBuilder {
  static fromDocument(doc: OoxmlDocument): OoxmlBuilder
  setPart(path: string, content: string | Buffer): this
  setPartFromJson(path: string, json: JsonElement): this
  removePart(path: string): this
  async toBuffer(): Promise<Buffer>
  async toFile(filePath: string): Promise<void>
}

// 스트리밍 XML 파서 (SAX 이벤트 생성)
interface StreamingXmlParser {
  parse(xml: string | Readable): AsyncIterable<XmlValidationEvent>
}
```

**의존성:**

- `adm-zip` 또는 `yauzl` - ZIP 처리
- `fast-xml-parser` 또는 `sax` - XML 파싱
- `@ooxml/core` - XmlValidationEvent 타입 참조

---

### 2.3 `@ooxml/mcp` - MCP 서버

**역할:** AI 에이전트에게 OOXML 문서 검증 도구를 제공하는 MCP(Model Context Protocol) 서버

**책임:**

- MCP 프로토콜 구현
- 도구(Tool) 정의 및 핸들링
- 문서 수신 및 검증 파이프라인 실행
- 검증 결과 리포팅

**제공 도구:**

```typescript
// Tool: validate_ooxml
{
  name: "validate_ooxml",
  description: "OOXML 문서(xlsx, docx, pptx)의 스키마 적합성을 검증합니다",
  inputSchema: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "검증할 파일 경로" },
      file_base64: { type: "string", description: "Base64 인코딩된 파일 (file_path 대안)" },
      options: {
        type: "object",
        properties: {
          strict: { type: "boolean", default: false },
          maxErrors: { type: "number", default: 100 },
          targetParts: { type: "array", items: { type: "string" } }
        }
      }
    }
  }
}

// Tool: analyze_ooxml_structure
{
  name: "analyze_ooxml_structure",
  description: "OOXML 문서의 내부 구조와 파트 목록을 분석합니다",
  inputSchema: {
    type: "object",
    properties: {
      file_path: { type: "string" },
      include_content_preview: { type: "boolean", default: false }
    }
  }
}

// Tool: get_ooxml_part
{
  name: "get_ooxml_part",
  description: "OOXML 문서의 특정 파트 내용을 조회합니다",
  inputSchema: {
    type: "object",
    properties: {
      file_path: { type: "string" },
      part_path: { type: "string" },
      format: { enum: ["xml", "json"], default: "json" }
    }
  }
}
```

**의존성:**

- `@modelcontextprotocol/sdk` - MCP SDK
- `@ooxml/core` - 검증 엔진
- `@ooxml/parser` - 문서 처리

---

### 2.4 `@ooxml/desktop` - Electron 데스크톱 앱

**역할:** 사용자가 로컬에서 OOXML 문서를 분석하고 편집할 수 있는 데스크톱 애플리케이션

**기능:**

1. **파일 탐색기** - 로컬 OOXML 파일 열기
2. **문서 구조 뷰어** - 파트 트리 시각화
3. **검증 대시보드** - 오류/경고 목록 및 상세 정보
4. **XML 편집기** (선택적)
   - 구문 하이라이팅
   - 자동 완성 (스키마 기반)
   - 실시간 검증
   - 포맷팅
5. **리포트 내보내기** - HTML, JSON, CSV 형식

**화면 구성:**

```
┌────────────────────────────────────────────────────────────────┐
│  File  Edit  View  Tools  Help                          ─ □ ✕ │
├────────────────────────────────────────────────────────────────┤
│ ┌──────────────┐ ┌───────────────────────────────────────────┐ │
│ │ Document     │ │  XML Editor / Preview                    │ │
│ │ Structure    │ │                                          │ │
│ │              │ │  <worksheet xmlns="...">                 │ │
│ │ 📁 [Content_ │ │    <sheetData>                           │ │
│ │    Types].xml│ │      <row r="1">                         │ │
│ │ 📁 _rels/    │ │        <c r="A1" t="s">                  │ │
│ │ 📁 xl/       │ │          <v>0</v>                        │ │
│ │   📄 workbook│ │        </c>                              │ │
│ │   📄 styles  │ │      </row>                              │ │
│ │   📁 workshee│ │    </sheetData>                          │ │
│ │     📄 sheet1│ │  </worksheet>                            │ │
│ │     📄 sheet2│ │                                          │ │
│ │              │ └───────────────────────────────────────────┘ │
│ └──────────────┘ ┌───────────────────────────────────────────┐ │
│                  │  Validation Results                       │ │
│                  │  ──────────────────────────────────────── │ │
│                  │  ⚠ 3 Errors  ⚡ 12 Warnings               │ │
│                  │                                           │ │
│                  │  ❌ INVALID_VALUE at /worksheet/sheetData │ │
│                  │     Expected: xsd:unsignedInt             │ │
│                  │     Got: "abc"                            │ │
│                  │                                           │ │
│                  └───────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

**의존성:**

- `electron` - 데스크톱 프레임워크
- `electron-builder` - 패키징
- `react` + `@tanstack/react-query` - UI
- `monaco-editor` - XML 편집기 (선택적)
- `@ooxml/core` - 검증 엔진
- `@ooxml/parser` - 문서 처리

---

## 3. 디렉토리 구조

```
ooxml-validator/
├── .github/
│   └── workflows/
│       ├── ci.yml                    # CI 파이프라인
│       ├── release-packages.yml      # npm 패키지 배포
│       └── release-desktop.yml       # 데스크톱 앱 배포
│
├── packages/
│   ├── core/                         # @ooxml/core
│   │   ├── src/
│   │   │   ├── index.ts              # 공개 API
│   │   │   ├── types.ts              # 타입 정의
│   │   │   ├── registry.ts           # 스키마 레지스트리
│   │   │   ├── validator.ts          # 검증 엔진
│   │   │   ├── compositor.ts         # Compositor 상태 관리
│   │   │   ├── runtime.ts            # 런타임 유틸리티
│   │   │   └── facets/               # Facet 검증 로직
│   │   │       ├── index.ts
│   │   │       ├── enumeration.ts
│   │   │       ├── pattern.ts
│   │   │       ├── length.ts
│   │   │       └── numeric.ts
│   │   ├── schemas/                  # 프리로드된 스키마 정의
│   │   │   ├── index.ts
│   │   │   ├── spreadsheetml.ts      # XLSX 스키마
│   │   │   ├── wordprocessingml.ts   # DOCX 스키마
│   │   │   ├── presentationml.ts     # PPTX 스키마
│   │   │   └── drawingml.ts          # DrawingML 공유 스키마
│   │   ├── tests/
│   │   │   ├── validator.test.ts
│   │   │   ├── compositor.test.ts
│   │   │   └── fixtures/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── README.md
│   │
│   ├── parser/                       # @ooxml/parser
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── document.ts           # OoxmlDocument 구현
│   │   │   ├── parser.ts             # OoxmlParser 구현
│   │   │   ├── builder.ts            # OoxmlBuilder 구현
│   │   │   ├── zip/
│   │   │   │   ├── index.ts
│   │   │   │   ├── reader.ts         # ZIP 읽기
│   │   │   │   └── writer.ts         # ZIP 쓰기
│   │   │   ├── xml/
│   │   │   │   ├── index.ts
│   │   │   │   ├── json-converter.ts # XML ↔ JSON
│   │   │   │   └── streaming.ts      # SAX 스트리밍 파서
│   │   │   ├── content-types.ts      # [Content_Types].xml 파싱
│   │   │   ├── relationships.ts      # .rels 파싱
│   │   │   └── types.ts
│   │   ├── tests/
│   │   │   ├── parser.test.ts
│   │   │   ├── builder.test.ts
│   │   │   └── fixtures/
│   │   │       ├── sample.xlsx
│   │   │       ├── sample.docx
│   │   │       └── sample.pptx
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── README.md
│   │
│   ├── mcp/                          # @ooxml/mcp
│   │   ├── src/
│   │   │   ├── index.ts              # MCP 서버 진입점
│   │   │   ├── server.ts             # MCP 서버 구현
│   │   │   ├── tools/
│   │   │   │   ├── index.ts
│   │   │   │   ├── validate.ts       # validate_ooxml 도구
│   │   │   │   ├── analyze.ts        # analyze_ooxml_structure 도구
│   │   │   │   └── get-part.ts       # get_ooxml_part 도구
│   │   │   ├── pipeline/
│   │   │   │   ├── index.ts
│   │   │   │   └── validation.ts     # 검증 파이프라인
│   │   │   └── types.ts
│   │   ├── tests/
│   │   │   └── tools.test.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── README.md
│   │
│   └── desktop/                      # @ooxml/desktop
│       ├── src/
│       │   ├── main/                 # Electron Main Process
│       │   │   ├── index.ts
│       │   │   ├── ipc-handlers.ts   # IPC 핸들러
│       │   │   ├── file-system.ts    # 파일 시스템 작업
│       │   │   └── menu.ts           # 앱 메뉴
│       │   ├── preload/              # Preload Scripts
│       │   │   └── index.ts
│       │   ├── renderer/             # React 앱 (Renderer Process)
│       │   │   ├── index.tsx
│       │   │   ├── App.tsx
│       │   │   ├── components/
│       │   │   │   ├── Layout/
│       │   │   │   ├── DocumentTree/
│       │   │   │   ├── XmlEditor/
│       │   │   │   ├── ValidationPanel/
│       │   │   │   └── common/
│       │   │   ├── hooks/
│       │   │   │   ├── useDocument.ts
│       │   │   │   ├── useValidation.ts
│       │   │   │   └── useEditor.ts
│       │   │   ├── stores/
│       │   │   │   └── document.ts
│       │   │   ├── styles/
│       │   │   │   ├── globals.css
│       │   │   │   └── themes/
│       │   │   └── utils/
│       │   └── shared/               # Main/Renderer 공유 타입
│       │       └── types.ts
│       ├── resources/
│       │   ├── icons/
│       │   │   ├── icon.icns         # macOS
│       │   │   ├── icon.ico          # Windows
│       │   │   └── icon.png          # Linux
│       │   └── entitlements.plist    # macOS 권한
│       ├── tests/
│       │   └── e2e/
│       ├── electron-builder.yml
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts            # Renderer 번들링
│       └── README.md
│
├── tools/                            # 개발 도구
│   ├── xsd-converter/                # XSD → JSON 변환 도구
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── converter.ts
│   │   └── package.json
│   └── schema-generator/             # 스키마 코드 생성기
│       ├── src/
│       │   ├── index.ts
│       │   └── generator.ts
│       └── package.json
│
├── schemas/                          # XSD 원본 스키마
│   ├── ecma-376/
│   │   ├── sml.xsd
│   │   ├── wml.xsd
│   │   ├── pml.xsd
│   │   ├── dml-main.xsd
│   │   └── ...
│   └── README.md
│
├── docs/
│   ├── architecture.md               # 아키텍처 문서
│   ├── getting-started.md
│   ├── api/
│   │   ├── core.md
│   │   ├── parser.md
│   │   └── mcp.md
│   └── contributing.md
│
├── .eslintrc.js
├── .prettierrc
├── .gitignore
├── turbo.json                        # Turborepo 설정
├── pnpm-workspace.yaml               # pnpm workspace 설정
├── package.json                      # 루트 package.json
├── tsconfig.base.json                # 공유 tsconfig
└── README.md
```

---

## 4. 빌드 전략

### 4.1 모노레포 도구

**pnpm + Turborepo** 조합 사용

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'tools/*'
```

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["tsconfig.base.json"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "test": {
      "dependsOn": ["build"],
      "inputs": ["src/**", "tests/**"]
    },
    "lint": {
      "inputs": ["src/**"]
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "tsconfig.json"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

### 4.2 패키지별 빌드 설정

#### `@ooxml/core` - 라이브러리 빌드

```json
// packages/core/package.json
{
  "name": "@ooxml/core",
  "version": "0.1.0",
  "main": "./dist/cjs/index.js",
  "module": "./dist/esm/index.js",
  "types": "./dist/types/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/esm/index.js",
      "require": "./dist/cjs/index.js",
      "types": "./dist/types/index.d.ts"
    }
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts",
    "dev": "tsup src/index.ts --format cjs,esm --dts --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0"
  }
}
```

```typescript
// packages/core/tsup.config.ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false, // 라이브러리는 minify 안함
})
```

#### `@ooxml/parser` - 라이브러리 빌드

```json
// packages/parser/package.json
{
  "name": "@ooxml/parser",
  "version": "0.1.0",
  "main": "./dist/cjs/index.js",
  "module": "./dist/esm/index.js",
  "types": "./dist/types/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/esm/index.js",
      "require": "./dist/cjs/index.js",
      "types": "./dist/types/index.d.ts"
    }
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@ooxml/core": "workspace:*",
    "adm-zip": "^0.5.10",
    "fast-xml-parser": "^4.3.0",
    "sax": "^1.3.0"
  },
  "devDependencies": {
    "@types/adm-zip": "^0.5.5",
    "@types/sax": "^1.2.7",
    "tsup": "^8.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0"
  }
}
```

#### `@ooxml/mcp` - 실행 가능 패키지

```json
// packages/mcp/package.json
{
  "name": "@ooxml/mcp",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "ooxml-mcp": "./dist/index.js"
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsup src/index.ts --format esm --target node18",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@ooxml/core": "workspace:*",
    "@ooxml/parser": "workspace:*"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0"
  }
}
```

#### `@ooxml/desktop` - Electron 앱 빌드

```json
// packages/desktop/package.json
{
  "name": "@ooxml/desktop",
  "version": "0.1.0",
  "private": true,
  "main": "./dist/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "package": "electron-builder --config electron-builder.yml",
    "package:mac": "electron-builder --mac --config electron-builder.yml",
    "package:win": "electron-builder --win --config electron-builder.yml",
    "package:linux": "electron-builder --linux --config electron-builder.yml",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@ooxml/core": "workspace:*",
    "@ooxml/parser": "workspace:*",
    "@tanstack/react-query": "^5.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zustand": "^4.4.0"
  },
  "optionalDependencies": {
    "monaco-editor": "^0.45.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "electron": "^28.0.0",
    "electron-builder": "^24.9.0",
    "electron-vite": "^2.0.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
```

```yaml
# packages/desktop/electron-builder.yml
appId: com.ooxml.validator
productName: OOXML Validator
copyright: Copyright © 2024

directories:
  output: release
  buildResources: resources

files:
  - dist/**/*
  - package.json

mac:
  category: public.app-category.developer-tools
  icon: resources/icons/icon.icns
  target:
    - target: dmg
      arch: [x64, arm64]
    - target: zip
      arch: [x64, arm64]
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: resources/entitlements.plist
  entitlementsInherit: resources/entitlements.plist

win:
  icon: resources/icons/icon.ico
  target:
    - target: nsis
      arch: [x64]
    - target: portable
      arch: [x64]

linux:
  icon: resources/icons/icon.png
  target:
    - target: AppImage
      arch: [x64]
    - target: deb
      arch: [x64]
  category: Development

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  installerIcon: resources/icons/icon.ico
  uninstallerIcon: resources/icons/icon.ico
```

### 4.3 루트 package.json

```json
// package.json (root)
{
  "name": "ooxml-validator",
  "private": true,
  "packageManager": "pnpm@8.14.0",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "clean": "turbo run clean && rm -rf node_modules",
    "format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,md}\"",
    "prepare": "husky install"
  },
  "devDependencies": {
    "@changesets/cli": "^2.27.0",
    "@types/node": "^20.10.0",
    "eslint": "^8.56.0",
    "husky": "^8.0.0",
    "lint-staged": "^15.2.0",
    "prettier": "^3.1.0",
    "turbo": "^1.11.0",
    "typescript": "^5.3.0"
  },
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md}": ["prettier --write"]
  }
}
```

### 4.4 공유 TypeScript 설정

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

---

## 5. 의존성 그래프

```
                    ┌─────────────────┐
                    │   @ooxml/core   │
                    │  (zero-deps)    │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
    ┌─────────────────┐           ┌─────────────────┐
    │  @ooxml/parser  │           │   (external)    │
    │                 │           │                 │
    │  • adm-zip      │           │                 │
    │  • fast-xml-    │           │                 │
    │    parser       │           │                 │
    │  • sax          │           │                 │
    └────────┬────────┘           └─────────────────┘
             │
    ┌────────┴────────┬─────────────────┐
    │                 │                 │
    ▼                 ▼                 ▼
┌─────────┐   ┌─────────────┐   ┌─────────────┐
│@ooxml/  │   │ @ooxml/     │   │  Other      │
│  mcp    │   │  desktop    │   │  Projects   │
│         │   │             │   │             │
│ • MCP   │   │ • electron  │   │ (npm에서    │
│   SDK   │   │ • react     │   │  import)    │
│         │   │ • monaco    │   │             │
└─────────┘   └─────────────┘   └─────────────┘
```

---

## 6. CI/CD 파이프라인

### 6.1 GitHub Actions - CI

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Build
        run: pnpm build

      - name: Test
        run: pnpm test

  test-packages:
    needs: build-and-test
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node: [18, 20]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm test
```

### 6.2 패키지 릴리스

```yaml
# .github/workflows/release-packages.yml
name: Release Packages

on:
  push:
    branches: [main]

concurrency: ${{ github.workflow }}-${{ github.ref }}

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
          registry-url: 'https://registry.npmjs.org'

      - run: pnpm install --frozen-lockfile
      - run: pnpm build

      - name: Create Release Pull Request or Publish
        uses: changesets/action@v1
        with:
          publish: pnpm changeset publish
          version: pnpm changeset version
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### 6.3 데스크톱 앱 릴리스

```yaml
# .github/workflows/release-desktop.yml
name: Release Desktop App

on:
  push:
    tags: ['desktop-v*']

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: macos-latest
            platform: mac
          - os: windows-latest
            platform: win
          - os: ubuntu-latest
            platform: linux
    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile
      - run: pnpm build

      - name: Build Desktop App
        run: pnpm --filter @ooxml/desktop package:${{ matrix.platform }}
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # macOS 코드 서명
          CSC_LINK: ${{ secrets.MAC_CERTS }}
          CSC_KEY_PASSWORD: ${{ secrets.MAC_CERTS_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}

      - name: Upload Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: desktop-${{ matrix.platform }}
          path: packages/desktop/release/*

  release:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Download all artifacts
        uses: actions/download-artifact@v4

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            desktop-mac/*
            desktop-win/*
            desktop-linux/*
          draft: true
          generate_release_notes: true
```

---

## 7. 기술 스택 요약

| 레이어              | 기술                      | 용도                |
| ------------------- | ------------------------- | ------------------- |
| **언어**            | TypeScript 5.3+           | 전체                |
| **모노레포**        | pnpm + Turborepo          | 워크스페이스 관리   |
| **라이브러리 빌드** | tsup                      | core, parser 번들링 |
| **테스트**          | Vitest                    | 단위/통합 테스트    |
| **린팅**            | ESLint + Prettier         | 코드 품질           |
| **버전 관리**       | Changesets                | npm 배포            |
| **MCP**             | @modelcontextprotocol/sdk | MCP 서버            |
| **Electron**        | Electron + electron-vite  | 데스크톱 앱         |
| **UI**              | React + TanStack Query    | 데스크톱 UI         |
| **상태 관리**       | Zustand                   | 데스크톱 상태       |
| **에디터**          | Monaco Editor             | XML 편집 (선택)     |
| **ZIP 처리**        | adm-zip                   | OOXML 압축/해제     |
| **XML 파싱**        | fast-xml-parser, sax      | XML 처리            |
| **CI/CD**           | GitHub Actions            | 자동화              |

---

## 8. 마이그레이션 계획

### Phase 1: 모노레포 설정

1. pnpm workspace 및 Turborepo 초기화
2. 기존 코드를 `packages/core`로 이동
3. tsconfig, eslint, prettier 공유 설정
4. CI 파이프라인 구축

### Phase 2: core 패키지 정리

1. 기존 코드 정리 및 모듈화
2. 테스트 추가
3. API 문서화
4. npm 배포 준비

### Phase 3: parser 패키지 개발

1. ZIP 처리 모듈 구현
2. XML 파싱/직렬화 구현
3. Content Types, Relationships 처리
4. 스트리밍 파서 구현

### Phase 4: MCP 서버 개발

1. MCP SDK 통합
2. 도구 핸들러 구현
3. 검증 파이프라인 구축
4. 테스트 및 문서화

### Phase 5: 데스크톱 앱 개발

1. Electron + React 보일러플레이트
2. 파일 탐색 및 문서 뷰어
3. 검증 대시보드
4. XML 편집기 (선택)
5. 패키징 및 배포

---

## 9. 다음 단계

이 설계를 기반으로:

1. **즉시 진행 가능:**
   - 모노레포 구조 초기화
   - 기존 core 코드 마이그레이션
   - parser 패키지 스켈레톤 생성

2. **우선순위 결정 필요:**
   - MCP 서버 vs 데스크톱 앱 개발 순서
   - XML 편집기 기능 포함 여부

3. **추가 논의 필요:**
   - 스키마 프리로드 전략 (런타임 vs 빌드타임)
   - 대용량 파일 처리 전략
   - 오프라인 지원 범위
