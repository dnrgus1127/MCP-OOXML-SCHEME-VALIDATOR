# 스키마 기반 요소 인스펙터 (Phase 1) 설계

작성일: 2026-06-06
브랜치: `feature/schema-inspector`

## 1. 배경 / 문제

XML 편집기 사용자 중 **문서 구조를 탐색·이해하려는 사용자**가 가장 답답해하는 지점은
**"커서가 놓인 이 태그/속성이 스키마상 무슨 의미인지 모르겠다"** 이다.

현재 편집기는 검증(diagnostics), 검색, 비교, 문서 전체 스키마 참조 패널을 제공하지만,
"지금 이 요소가 무엇인지"를 알려주는 기능은 없었다.

다행히 이 프로젝트는 XSD→JSON 스키마를 `@ooxml/core` 레지스트리로 이미 보유한다.
단, 현재 JSON 스키마에는 `<xsd:documentation>` 산문 설명이 보존되어 있지 않으므로
Phase 1에서는 **구조적 정보**(타입, 허용 자식 요소, 허용 속성, 허용 값/facet)만 제공한다.

## 2. 목표 / 비목표

- 목표: 커서 위치 요소·속성의 스키마 구조를 인스펙터 패널 + hover로 항상/요청 시 보여준다.
- 목표: 렌더러에서 코어 레지스트리를 IPC로 직접 사용한다(LSP 서버 확장 없음).
- 비목표(후속): 자동완성(Phase 2), `<xsd:documentation>` 산문 보존(Phase 0).

## 3. 아키텍처

```
커서 이동/호버 → resolveCursorContext(text, offset)
   → { prefix, localName, attributeName?, ancestors[] }
   → buildSchemaPath(context, xmlnsBindings)  // 루트 전역요소 → 대상까지 경로
   → lookupSchemaElementByPath(documentType, path)  // 캐시 → IPC
   → describeSchemaElementByPath(registry, path)  // 코어, 경로 따라 local element 해석
   → SchemaElementDescription
      → ① SchemaInspectorPanel 렌더  ② formatSchemaHoverMarkdown → Monaco hover
```

### 핵심 결정: 경로 기반 해석

OOXML 요소 대부분은 **지역(local) element**로 complexType 안에 정의되어 있어
`registry.resolveElement(ns, name)`(전역 조회)로는 찾을 수 없다.
따라서 커서의 상위 요소 경로(루트 전역 element → … → 대상)를 따라
부모 타입의 콘텐츠 모델에서 자식 element 정의를 단계적으로 찾아 내려간다
(`describeSchemaElementByPath`). 검증 엔진의 요소 해석 방식과 동일한 원리.

## 4. 구성 요소

### 코어 (`packages/core`)
- `schema/element-describer.ts`
  - `describeSchemaElement(registry, ns, name)` — 전역 element용
  - `describeSchemaElementByPath(registry, SchemaPathStep[])` — 지역 element용(주 경로)
  - `SchemaElementDescription` DTO: typeName, contentKind, attributes[], children[],
    allowedValues, facets, baseType, isAbstract, documentation(미래)
  - 타입/속성/자식 평탄화: complexContent extension의 base 상속, attributeGroup ref,
    simpleType restriction 체인의 enumeration·facet 수집 포함

### 메인 (`packages/desktop/src/main`)
- IPC `ooxml:resolveSchemaElement` — `{ documentType, path }` → DTO
- `getCachedSchemaRegistry(documentType)` — documentType별 레지스트리 캐시

### 렌더러 (`packages/desktop/src/renderer`)
- `schema/cursor-context.ts` (순수 함수) — `resolveCursorContext`,
  `collectXmlnsBindings`, `resolveNamespaceUri`, `buildSchemaPath`
- `schema/schemaInspector.ts` — `lookupSchemaElementByPath`(경로 키 캐시)
- `schema/describe-format.ts` — hover 마크다운 포맷터
- `components/SchemaInspectorPanel.tsx` — 상태 모델 `idle|loading|empty|error|success`
- `components/XmlEditor.tsx` — 커서 변경(디바운스 150ms) 알림 + 스키마 hover provider
- `screens/XmlEditorScreen.tsx` — 패널 배치, 커서 컨텍스트 상태, 툴바 토글 연동
- `components/Toolbar.tsx` — "📖 Schema" 토글 버튼
- 설정: `xmlEditor.schemaHoverEnabled`(기본 true) + SettingsScreen 토글

## 5. 상태 / 오류 UX

- 커서가 요소 밖 → idle 안내
- prefix→namespace 미해석 → empty("네임스페이스 확인 불가")
- 스키마 미정의 요소 → empty("스키마에 정의되지 않은 요소")
- IPC 실패 → error + 메시지
- 비-OOXML/비교 모드에서는 인스펙터·hover 비활성

## 6. 테스트

- 코어 `element-describer.test.ts` (8): 전역/경로 해석, 경로 단절, enumeration 허용 값,
  미존재 요소·네임스페이스 안전 처리
- 렌더러 `cursor-context.test.ts` (8): 태그/콘텐츠/속성 위치 판별, xmlns 수집, ns 해석

## 7. 단계

- Phase 1 (완료): 위 전체(구조 정보)
- Phase 0 (완료): 산문 설명 = **수동 큐레이션 사전**(`element-docs.ts`)
  - OOXML 공식 XSD엔 `<xsd:documentation>`이 거의 없음을 확인(본문 wml/sml/pml/dml-main = 0개)
    → XSD 추출이 아니라 핵심 요소 수동 큐레이션으로 결정
  - strict 네임스페이스 키 기준 TS 사전(런타임 의존성 0), 조회 시 transitional→strict 정규화
  - describer가 `documentation`(요소) / `description`(속성) / `specRef`(출처)을 병합
  - 큐레이션 우선순위는 "핵심 요소 수동 선정"으로 시작(빈도 자동 분석은 샘플 문서 확보 시),
    ISO 섹션 번호/인벤토리 SDK 자동 추출은 보류(현재는 specRef를 파트 수준으로 수동 표기)
- Phase 2 (예정): 같은 서비스 재사용한 자동완성(completion provider)

## 8. 알려진 한계

- 커서 컨텍스트는 경량 스캐너 기반 — 속성 값에 `>`가 포함되면 태그 경계 추정이 어긋날 수 있음(OOXML에선 드묾)
- 루트가 전역 element가 아닌 파트는 경로 해석이 실패할 수 있음(degraded: "정의되지 않음" 표시)
- 산문 설명(documentation)은 Phase 0 전까지 비어 있음
