# MCP 베이스 → OOXML 문서 편집기 프로젝트 전환: 패키지 정리 설계

- 작성일: 2026-06-11
- 작성자: wooki
- 상태: 설계 합의됨 (구현 계획 대기)

## 1. 목표와 배경

이 모노레포는 처음에 "OOXML 검증 + MCP 서버 + 데스크톱 앱" 세 갈래로 출발했다.
실제 개발 무게중심은 **에디터(Electron 데스크톱 앱) + LSP 기반 검증**으로 이동했고,
MCP 노출 계층은 더 이상 로드맵에 없다.

이 문서는 프로젝트를 **"OOXML 문서 편집기 + LSP 검증"** 단일 정체성으로 재정의할 때,
어떤 패키지가 불필요해지고 어떤 패키지가 핵심으로 남는지를 의존성 그래프 기준으로 확정한다.

핵심 발견: 검증 체인이 데스크톱 앱 → LSP 서버 → (XSD 엔진 + MS SDK 사이드카)로
촘촘히 연결돼 있어, **실제로 떼어낼 수 있는 패키지는 2개뿐**이다. 나머지는 전부 load-bearing이다.

## 2. 현재 패키지 의존성 그래프 (조사 결과)

### 최상위 `packages/*`

| 패키지 | 역할 | 코드상 의존하는 곳 | 판정 |
|---|---|---|---|
| `@ooxml/core` | XSD 스트리밍 검증 엔진 (런타임 의존성 0) | desktop, parser, mcp, validate-xml, **lsp-server(`diagnostics/schema.ts`)** | **유지(핵심)** |
| `@ooxml/parser` | OPC(ZIP)/XML 파싱·이벤트 변환 | desktop, mcp, validate-xml, **lsp-server(`diagnostics/schema.ts`)** | **유지(핵심)** |
| `@ooxml/desktop` | Electron + React + Monaco 편집기 | (최종 산출물) | **유지(주력)** |
| `@ooxml/mcp` | MCP 서버 (validate tool 노출) | **코드 의존 없음** — 문서/README에서만 언급 | **삭제** |
| `ooxml-lsp` | 중첩 모노레포 래퍼 (아래 분해) | desktop가 `@ooxml-tools/lsp-server`를 사용 | **유지** |

### 중첩 `packages/ooxml-lsp/packages/*`

| 패키지 | 역할 | 의존하는 곳 | 판정 |
|---|---|---|---|
| `@ooxml-tools/lsp-server` | LSP 서버 (XSD 진단 + MS SDK 심층검증) | **desktop `build:lsp`/predev/prebuild** | **유지(핵심)** |
| `@ooxml-tools/sdk` | 엔진 디스패처 (analyze/dispatch) | lsp-server | **유지** |
| `@ooxml-tools/ooxml-core` | OPC 리더·관계그래프·XML walk (LSP 측) | engines, ms-validator, sdk | **유지** |
| `@ooxml-tools/xlsx-engine` | xlsx 진단/hover/definition | sdk | **유지** |
| `@ooxml-tools/docx-engine` | docx 진단/hover/definition | sdk | **유지** |
| `@ooxml-tools/pptx-engine` | pptx 진단/hover/definition | sdk | **유지** |
| `@ooxml-tools/ms-validator` | MS Open XML SDK 사이드카 Node 래퍼 | lsp-server | **유지** |
| `@ooxml-tools/ms-validator-bin` | .NET 사이드카 프리빌트 바이너리 | ms-validator | **유지** |
| `@ooxml-tools/test-fixtures` | 테스트 픽스처 (devDep) | 각 패키지 devDep | **유지** |
| `@ooxml-tools/vscode-extension` | VS Code 확장 (커스텀 에디터) | **없음** — 이미 `pnpm-workspace.yaml`에서 제외됨 | **삭제** |

### `tools/*`

| 도구 | 역할 | 판정 |
|---|---|---|
| `tools/xsd-converter` | XSD → JSON 스키마 변환 (core `generate:schemas` 빌드 단계) | **유지(필수)** |
| `tools/validate-xml` | core+parser 기반 개발용 검증 CLI | **유지** (에디터 없이 엔진 디버깅용) |

## 3. 정리 결정 (사용자 확정)

1. **`packages/mcp` 완전 삭제** — 디렉토리·`pnpm-lock.yaml` 항목 제거. 코드 의존성이 전무하여 안전. 필요 시 git 히스토리에서 복구 가능.
2. **`packages/ooxml-lsp/packages/vscode-extension` 완전 삭제** — 데스크톱 앱이 동일한 편집기 역할을 하므로 중복. 이미 워크스페이스/CI에서 제외돼 있어 빌드 영향 없음.
3. **`tools/validate-xml` 유지** — 유지 비용이 거의 없고 엔진 단독 디버깅에 유용.
4. **ODF(odt/ods/odp) 지원: 미정** — 이번 정리 범위에 포함하지 않는다(§6 참고).

## 4. 정리 후 패키지 구성 (목표 상태)

```
packages/
  core/                      @ooxml/core        — XSD 검증 엔진 (핵심)
  parser/                    @ooxml/parser      — OPC/XML 파싱 (핵심)
  desktop/                   @ooxml/desktop     — Electron 편집기 (주력)
  ooxml-lsp/
    packages/
      lsp-server/            @ooxml-tools/lsp-server      — LSP 서버 (핵심)
      sdk/                   @ooxml-tools/sdk
      ooxml-core/            @ooxml-tools/ooxml-core
      xlsx-engine/           @ooxml-tools/xlsx-engine
      docx-engine/           @ooxml-tools/docx-engine
      pptx-engine/           @ooxml-tools/pptx-engine
      ms-validator/          @ooxml-tools/ms-validator
      ms-validator-bin/      @ooxml-tools/ms-validator-bin
      test-fixtures/         @ooxml-tools/test-fixtures
tools/
  xsd-converter/             XSD → JSON (빌드 필수)
  validate-xml/              개발용 검증 CLI
schemas/                     OOXML XSD 원본
```

데이터 흐름(편집 시점):
`Monaco 편집기(desktop renderer)` → `LSP 브리지(desktop main)` → `@ooxml-tools/lsp-server`
→ ① `@ooxml/core` + `@ooxml/parser` 로 XSD 스트리밍 진단
→ ② `@ooxml-tools/sdk` → 포맷별 engine + `@ooxml-tools/ms-validator`(MS SDK 사이드카)로 심층 진단
→ 진단 결과를 LSP diagnostics로 편집기에 표시.

## 5. 정리에 수반되는 참조 업데이트

패키지 디렉토리 삭제만으로 끝나지 않고, 아래 참조를 함께 정리한다.

### 코드/설정
- `pnpm-workspace.yaml` — `!packages/ooxml-lsp/packages/vscode-extension` 제외 라인 삭제(디렉토리 자체가 사라지므로 불필요). `packages/mcp`는 `packages/*` glob으로 자동 흡수되므로 디렉토리 삭제로 충분.
- `pnpm-lock.yaml` — `pnpm install` 재실행으로 재생성.
- 루트 `package.json` — `description`에서 "MCP server" 문구 제거(프로젝트 정체성 재정의).
- (선택) 루트 `package.json` `name` 및 리포 폴더명 `MCP-OOXML-...` — 폴더명/리포명 변경은 작업 디렉토리 이동을 동반하므로 이번 범위에서 제외, 별도 결정.

### 문서
- `CLAUDE.md` — "MCP integration is planned" / `packages/mcp` / `@ooxml/mcp` 항목 제거 또는 "검증 엔진 + 편집기" 중심으로 재서술.
- `AGENTS.md` — `packages/mcp` 항목 제거.
- `README.md`, `packages/README.md` — MCP 패키지 설명·명령 제거.
- `docs/electron-mcp-setup.md` — MCP 연동 전용 문서. 삭제 또는 "deprecated/historical" 표기.
- `docs/modular-architecture-design.md` — 아키텍처 다이어그램에서 `@ooxml/mcp` 박스 제거(또는 historical 표기).
- `docs/lsp-validation-engine-replacement-plan.md` — "MCP validate tool 유지 여부" 항목을 "MCP 제거됨"으로 갱신.
- VS Code 확장 관련 문서/`.vscode` 설정이 있으면 함께 정리.

### 범위 밖(건드리지 않음)
- `.worktrees/` 하위 체크아웃 — 별도 git worktree이므로 그대로 둔다.
- `agent/` 플레이북 — grep 결과 MCP/vscode-extension 직접 언급이 없어 변경 불필요(확인 완료).
- `.vscode/` — 존재하지 않음(확인 완료).

## 6. ODF 지원에 대한 메모 (미정 / 범위 밖)

현재 검증 스택은 **OOXML 전용 가정** 위에 서 있다:
- `@ooxml/core`는 XSD(JSON 변환) 기반 검증 — ODF는 RelaxNG 스키마라 별도 검증 경로 필요.
- `@ooxml/parser` / `@ooxml-tools/ooxml-core`는 OPC(`[Content_Types].xml` + rels) 패키지 모델 — ODF는 `mimetype` + `META-INF/manifest.xml` 구조라 별도 패키지 리더 필요.
- MS SDK 사이드카는 OOXML 전용이라 ODF 심층검증에는 사용 불가.

따라서 ODF는 "정리"가 아니라 "신규 기능"이며, 도입 시:
1. ODF 패키지 리더(manifest 기반) 추가,
2. RelaxNG 기반 검증 경로 추가(또는 ODF 스키마의 XSD 근사),
3. LSP 엔진에 ODF 포맷 디스패치 추가
가 필요하다. 이번 정리에서는 위 확장 지점만 인지하고 **구조를 OOXML 가정에 묶이지 않게 과도히 일반화하지는 않는다**(YAGNI). ODF 결정이 서면 별도 spec으로 진행.

## 7. 검증 방법 (정리가 안전했음을 확인)

삭제 후 아래가 통과해야 한다.
1. `pnpm install` — lockfile 재생성, 워크스페이스 해석 오류 없음.
2. `pnpm run typecheck` — 모든 잔존 패키지 타입 통과(삭제된 패키지 참조로 인한 오류 없음).
3. `pnpm run build` — `generate:schemas` + 전체 빌드 통과.
4. `pnpm --filter @ooxml/desktop run build:lsp` — LSP 서버 빌드 통과.
5. (요청 시/커밋 직전) `pnpm run test` — 전체 테스트 통과.
6. 문서 grep — `@ooxml/mcp`, `packages/mcp`, `vscode-extension` 잔여 참조가 의도된 historical 표기 외에 없는지 확인.

## 8. 비목표 (Non-goals)

- 리포 폴더명/`name` 리브랜딩(별도 결정).
- ODF 지원 구현.
- 중첩 `ooxml-lsp` 모노레포 구조 평탄화(flattening) — 동작에 영향 없는 리팩터링이라 이번 범위 밖.
- 에디터 기능 추가/UX 변경.
