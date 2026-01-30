# OOXML XML Validation Engine 설계 문서

## 1. 개요

### 1.1 목적
XSD 스키마를 JSON으로 변환하여 런타임에 메모리에 적재하고, XML 문서를 순차적으로 순회하며 OOXML 스펙 준수 여부를 검증하는 엔진 설계

### 1.2 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Validation Engine                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │  XSD Files   │───▶│  XSD Parser  │───▶│   Schema     │              │
│  │  (.xsd)      │    │              │    │   Registry   │              │
│  └──────────────┘    └──────────────┘    └──────┬───────┘              │
│                                                  │                       │
│                                                  ▼                       │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │  XML Input   │───▶│  XML Stream  │───▶│  Validation  │──▶ Result   │
│  │  (.xml)      │    │  Parser      │    │  State Machine│              │
│  └──────────────┘    └──────────────┘    └──────────────┘              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 스키마 레지스트리 구조

### 2.1 메모리 구조

```
SchemaRegistry
├── schemas: Map<namespaceUri, XsdSchema>
│   ├── "http://.../drawingml/2006/chart" → dml-chart.xsd의 파싱 결과
│   ├── "http://.../drawingml/2006/main"  → dml-main.xsd의 파싱 결과
│   ├── "http://.../officeDocument/sharedTypes" → shared-commonSimpleTypes.xsd
│   └── ...
│
├── typeCache: WeakMap<XmlNode, ResolvedType>  // 조회 결과 캐싱
│
└── 조회 메서드
    ├── resolveType(ns, name) → XsdComplexType | XsdSimpleType
    ├── resolveElement(ns, name) → XsdElement
    ├── resolveGroup(ns, name) → XsdGroup
    └── resolveAttributeGroup(ns, name) → XsdAttributeGroup
```

### 2.2 타입 참조 해결 (Cross-Schema Reference)

```
예시: dml-chart.xsd에서 shared-commonSimpleTypes.xsd 참조

<xsd:attribute name="val" type="s:ST_OnOff"/>
                               ↑
                               prefix "s"
                               
해결 과정:
1. 현재 스키마의 namespace 매핑에서 "s" 조회
   → "http://purl.oclc.org/ooxml/officeDocument/sharedTypes"
2. SchemaRegistry.resolveType(위 URI, "ST_OnOff")
3. shared-commonSimpleTypes.xsd의 simpleTypes.get("ST_OnOff") 반환
```

---

## 3. 검증 상태 머신

### 3.1 ValidationContext 구조

```typescript
interface ValidationContext {
  // 스키마 레지스트리
  registry: SchemaRegistry;
  
  // 현재 순회 상태
  elementStack: ElementStackFrame[];
  
  // 네임스페이스 컨텍스트 (스택 구조 - 요소별 상속)
  namespaceStack: Map<string, string>[];
  
  // 결과 수집
  errors: ValidationError[];
  warnings: ValidationWarning[];
  
  // ID/IDREF 추적 (문서 전체 유효성)
  idValues: Set<string>;
  idrefValues: Set<string>;
  
  // 옵션
  options: ValidationOptions;
}
```

### 3.2 ElementStackFrame 구조

```typescript
interface ElementStackFrame {
  // 기본 정보
  elementName: string;
  namespaceUri: string;
  schemaType: XsdComplexType | null;
  
  // Compositor 상태 (순서 검증의 핵심)
  compositorState: CompositorState | null;
  
  // 텍스트 컨텐츠 누적 (mixed/simpleContent용)
  textContent: string;
  
  // 검증된 속성 목록 (required 체크용)
  validatedAttributes: Set<string>;
}
```

### 3.3 CompositorState 구조 (순서 검증 핵심)

```typescript
interface CompositorState {
  kind: 'sequence' | 'choice' | 'all';
  
  // 펼쳐진 particles (group 참조 해결 후)
  flattenedParticles: FlattenedParticle[];
  
  // === Sequence 전용 ===
  // 현재 위치 포인터 (앞으로만 이동 가능)
  currentIndex: number;
  
  // === Choice 전용 ===
  // 선택된 branch
  selectedBranch: number | null;
  
  // === All 전용 ===
  // 이미 나타난 요소들
  appearedElements: Set<string>;
  
  // === 공통 ===
  // 각 particle의 출현 횟수
  occurrenceCounts: Map<number, number>;
  
  // 중첩 compositor 스택 (sequence 안의 choice 등)
  nestedStack: CompositorState[];
}

interface FlattenedParticle {
  index: number;
  particle: XsdElement | XsdAny | XsdSequence | XsdChoice | XsdAll;
  minOccurs: number;
  maxOccurs: number | 'unbounded';
  
  // 빠른 매칭을 위한 캐시
  allowedNames?: Set<string>;  // 이 particle이 허용하는 요소명들
}
```

---

## 4. Compositor별 순서 검증 알고리즘

### 4.1 Sequence 검증 알고리즘

```
알고리즘: validateSequenceChild(childElement, state)

입력: 
  - childElement: 새로 진입한 자식 요소
  - state: 현재 CompositorState (kind='sequence')

처리:
  1. startIndex = state.currentIndex
  
  2. FOR i = startIndex TO particles.length - 1:
       particle = particles[i]
       
       IF particle이 childElement를 허용하는가?
         // 매칭 성공
         state.occurrenceCounts[i]++
         
         IF occurrenceCounts[i] > particle.maxOccurs:
           RETURN Error(TOO_MANY_ELEMENTS)
         
         // 포인터는 현재 위치 유지 (같은 요소 반복 가능)
         // maxOccurs 도달 시에만 다음으로 이동
         IF occurrenceCounts[i] == particle.maxOccurs:
           state.currentIndex = i + 1
         ELSE:
           state.currentIndex = i
         
         RETURN Success
       
       ELSE:
         // 이 particle 스킵 가능한지 확인
         IF occurrenceCounts[i] < particle.minOccurs:
           RETURN Error(MISSING_REQUIRED_ELEMENT, particle)
         
         // 스킵하고 다음으로
         CONTINUE
  
  3. // 모든 particle 소진 - 허용되지 않는 요소
     RETURN Error(INVALID_ELEMENT)
```

**시각화 예시:**

```
Sequence 정의: [date1904?, roundedCorners?, chart]
              minOccurs:  0          0           1

상태 변화:

초기:        [date1904?, roundedCorners?, chart]
                 ↑ currentIndex=0

<date1904> 진입:
             [date1904?, roundedCorners?, chart]
                 ↑ 매칭! count=1, maxOccurs=1 도달
             
             [date1904?, roundedCorners?, chart]
                          ↑ currentIndex=1로 이동

<chart> 진입 (roundedCorners 스킵):
             [date1904?, roundedCorners?, chart]
                          ↑ 스킵 가능? minOccurs=0 ✓
             
             [date1904?, roundedCorners?, chart]
                                          ↑ 매칭!
```

### 4.2 Choice 검증 알고리즘

```
알고리즘: validateChoiceChild(childElement, state)

입력:
  - childElement: 새로 진입한 자식 요소  
  - state: 현재 CompositorState (kind='choice')

처리:
  1. IF state.selectedBranch != null:
       // 이미 선택된 branch가 있음
       particle = particles[state.selectedBranch]
       
       IF particle이 childElement를 허용하는가?
         state.occurrenceCounts[selectedBranch]++
         // maxOccurs 체크
         RETURN Success
       ELSE:
         // choice 자체의 반복인지 확인
         IF choice.maxOccurs > totalOccurrences:
           // 새로운 choice 반복 시작 가능
           GOTO step 2
         ELSE:
           RETURN Error(INVALID_ELEMENT)
  
  2. // 새 branch 선택 시도
     FOR i = 0 TO particles.length - 1:
       IF particles[i]가 childElement를 허용하는가?
         state.selectedBranch = i
         state.occurrenceCounts[i] = 1
         RETURN Success
     
  3. RETURN Error(CHOICE_NOT_SATISFIED)
```

**시각화 예시:**

```
Choice 정의: (pieChart | barChart | lineChart | areaChart)

<pieChart> 진입:
  - selectedBranch = null
  - pieChart 찾음 → selectedBranch = 0
  - ✓ Success

<barChart> 진입 (같은 choice 내):
  - selectedBranch = 0 (pieChart)
  - barChart는 pieChart가 아님
  - choice.maxOccurs=1이면 → ❌ Error
  - choice.maxOccurs=unbounded면 → 새 반복, selectedBranch = 1
```

### 4.3 All 검증 알고리즘

```
알고리즘: validateAllChild(childElement, state)

입력:
  - childElement: 새로 진입한 자식 요소
  - state: 현재 CompositorState (kind='all')

처리:
  1. elementName = childElement.name
  
  2. particle = particles에서 elementName 찾기
     
     IF particle == null:
       RETURN Error(INVALID_ELEMENT)
  
  3. IF state.appearedElements.has(elementName):
       // all 내에서는 각 요소 최대 1회
       RETURN Error(TOO_MANY_ELEMENTS)
  
  4. state.appearedElements.add(elementName)
     RETURN Success

종료 검증 (부모 요소 닫힐 때):
  FOR each particle in particles:
    IF particle.minOccurs > 0:
      IF NOT appearedElements.has(particle.name):
        RETURN Error(MISSING_REQUIRED_ELEMENT)
```

---

## 5. 전체 검증 흐름

### 5.1 이벤트 기반 처리

```
┌─────────────────────────────────────────────────────────────────┐
│                    XML Parser Events                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  START_DOCUMENT ──▶ 초기화                                       │
│        │                                                         │
│        ▼                                                         │
│  START_ELEMENT ──▶ ┌─────────────────────────────────────────┐  │
│        │           │ 1. 네임스페이스 컨텍스트 업데이트         │  │
│        │           │ 2. 부모의 compositor에서 순서 검증        │  │
│        │           │ 3. 스키마 타입 조회                       │  │
│        │           │ 4. 속성 검증                              │  │
│        │           │ 5. 새 StackFrame 푸시                     │  │
│        │           └─────────────────────────────────────────┘  │
│        ▼                                                         │
│  CHARACTERS ─────▶ ┌─────────────────────────────────────────┐  │
│        │           │ 1. mixed/simpleContent 확인              │  │
│        │           │ 2. 텍스트 누적                            │  │
│        │           └─────────────────────────────────────────┘  │
│        ▼                                                         │
│  END_ELEMENT ────▶ ┌─────────────────────────────────────────┐  │
│        │           │ 1. 필수 자식 요소 누락 체크               │  │
│        │           │ 2. 필수 속성 누락 체크                    │  │
│        │           │ 3. 텍스트 컨텐츠 값 검증                  │  │
│        │           │ 4. StackFrame 팝                          │  │
│        │           └─────────────────────────────────────────┘  │
│        ▼                                                         │
│  END_DOCUMENT ───▶ ┌─────────────────────────────────────────┐  │
│                    │ 1. IDREF 참조 유효성 최종 검증            │  │
│                    │ 2. 결과 반환                              │  │
│                    └─────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 START_ELEMENT 상세 처리

```
함수: handleStartElement(element)

1. ═══ 네임스페이스 처리 ═══
   - xmlns 선언 파싱하여 namespaceStack에 푸시
   - element의 prefix로 실제 namespace URI 해결

2. ═══ 부모 Compositor 검증 (순서 체크) ═══
   IF elementStack이 비어있지 않음:
     parentFrame = elementStack.top()
     
     IF parentFrame.compositorState != null:
       result = validateCompositorChild(element, parentFrame.compositorState)
       
       IF result.isError:
         errors.push(result.error)
         IF options.failFast: THROW

3. ═══ 스키마 타입 조회 ═══
   schemaElement = registry.resolveElement(namespaceUri, localName)
   
   IF schemaElement == null:
     // 부모가 any를 허용하는지 확인
     IF parentAllowsAny(processContents):
       SWITCH processContents:
         'skip': schemaType = null  // 검증 스킵
         'lax':  schemaType = null  // 스키마 없으면 스킵
         'strict': errors.push(UNKNOWN_TYPE)
     ELSE:
       errors.push(INVALID_ELEMENT)
   ELSE:
     schemaType = resolveType(schemaElement.typeRef)

4. ═══ 속성 검증 ═══
   IF schemaType != null AND schemaType.kind == 'complexType':
     validateAttributes(element.attributes, schemaType)

5. ═══ 새 프레임 푸시 ═══
   newFrame = {
     elementName: localName,
     namespaceUri: namespaceUri,
     schemaType: schemaType,
     compositorState: initCompositorState(schemaType),
     textContent: "",
     validatedAttributes: new Set(검증된 속성들)
   }
   elementStack.push(newFrame)
```

### 5.3 END_ELEMENT 상세 처리

```
함수: handleEndElement(element)

1. currentFrame = elementStack.top()

2. ═══ 필수 자식 요소 누락 체크 ═══
   IF currentFrame.compositorState != null:
     missingElements = checkMissingRequiredElements(currentFrame.compositorState)
     
     FOR each missing in missingElements:
       errors.push({
         code: 'MISSING_REQUIRED_ELEMENT',
         message: `Required element '${missing}' is missing`,
         path: currentPath()
       })

3. ═══ 필수 속성 누락 체크 ═══
   IF currentFrame.schemaType != null:
     FOR each attr in schemaType.attributes:
       IF attr.use == 'required':
         IF NOT currentFrame.validatedAttributes.has(attr.name):
           errors.push(MISSING_REQUIRED_ATTR)

4. ═══ 텍스트 컨텐츠 검증 ═══
   IF currentFrame.textContent.trim() != "":
     IF schemaType.content.kind == 'simpleContent':
       validateSimpleTypeValue(textContent, schemaType.content)
     ELSE IF schemaType.content.kind == 'elementOnly':
       IF NOT options.allowWhitespace:
         errors.push(UNEXPECTED_TEXT)

5. ═══ 프레임 팝 ═══
   elementStack.pop()
   namespaceStack.pop()  // 이 요소에서 선언된 네임스페이스 제거
```

---

## 6. 속성 검증

### 6.1 속성 검증 흐름

```
함수: validateAttributes(xmlAttributes, schemaType)

1. ═══ 허용된 속성 목록 구축 ═══
   allowedAttrs = new Map()
   
   // 직접 정의된 속성
   FOR each attr in schemaType.attributes:
     allowedAttrs.set(attr.name, attr)
   
   // attributeGroup 참조 해결 (재귀)
   FOR each groupRef in schemaType.attributeGroups:
     group = registry.resolveAttributeGroup(groupRef)
     mergeAttributes(allowedAttrs, group)

2. ═══ 각 XML 속성 검증 ═══
   FOR each xmlAttr in xmlAttributes:
     // 네임스페이스 속성은 스킵
     IF xmlAttr.name.startsWith('xmlns'):
       CONTINUE
     
     schemaDef = allowedAttrs.get(xmlAttr.localName)
     
     IF schemaDef == null:
       // anyAttribute 허용 여부 확인
       IF schemaType.anyAttribute != null:
         handleAnyAttribute(xmlAttr, schemaType.anyAttribute)
       ELSE:
         errors.push(INVALID_ATTRIBUTE)
       CONTINUE
     
     // 값 검증
     validateAttributeValue(xmlAttr.value, schemaDef)
     validatedAttributes.add(xmlAttr.localName)

3. ═══ use="prohibited" 체크 ═══
   FOR each attr in allowedAttrs.values():
     IF attr.use == 'prohibited':
       IF validatedAttributes.has(attr.name):
         errors.push(INVALID_ATTRIBUTE)  // 금지된 속성 사용
```

### 6.2 속성 값 검증

```
함수: validateAttributeValue(value, schemaDef)

1. // 타입 결정
   IF schemaDef.inlineType != null:
     type = schemaDef.inlineType
   ELSE IF schemaDef.typeRef != null:
     type = registry.resolveType(schemaDef.typeRef)
   ELSE:
     // 타입 없으면 xsd:anySimpleType (모든 값 허용)
     RETURN Success

2. // SimpleType 검증
   RETURN validateSimpleTypeValue(value, type)
```

---

## 7. SimpleType 값 검증

### 7.1 SimpleType 검증 알고리즘

```
함수: validateSimpleTypeValue(value, simpleType)

SWITCH simpleType.content.kind:

  CASE 'restriction':
    // 1. 기반 타입 먼저 검증
    IF content.base.isBuiltin:
      IF NOT validateBuiltinType(value, content.base.name):
        RETURN Error(INVALID_VALUE)
    ELSE:
      baseType = registry.resolveType(content.base)
      result = validateSimpleTypeValue(value, baseType)
      IF result.isError: RETURN result
    
    // 2. Facet 검증
    FOR each facet in content.facets:
      IF NOT validateFacet(value, facet):
        RETURN facetError(facet)
    
    RETURN Success

  CASE 'union':
    // 멤버 타입 중 하나라도 통과하면 OK
    FOR each memberTypeRef in content.memberTypes:
      memberType = registry.resolveType(memberTypeRef)
      result = validateSimpleTypeValue(value, memberType)
      IF result.isSuccess:
        RETURN Success
    
    RETURN Error(INVALID_VALUE, "No union member matched")

  CASE 'list':
    // 공백으로 분리하여 각 아이템 검증
    items = value.split(/\s+/)
    itemType = registry.resolveType(content.itemType)
    
    FOR each item in items:
      result = validateSimpleTypeValue(item, itemType)
      IF result.isError:
        RETURN result
    
    RETURN Success
```

### 7.2 Facet 검증 상세

```
함수: validateFacet(value, facet)

SWITCH facet.type:

  CASE 'enumeration':
    RETURN facet.values.includes(value)

  CASE 'pattern':
    FOR each pattern in facet.patterns:
      IF new RegExp(`^${pattern}$`).test(value):
        RETURN true
    RETURN false

  CASE 'minLength':
    RETURN value.length >= facet.value

  CASE 'maxLength':
    RETURN value.length <= facet.value

  CASE 'length':
    RETURN value.length == facet.value

  CASE 'minInclusive':
    RETURN parseNumber(value) >= parseNumber(facet.value)

  CASE 'maxInclusive':
    RETURN parseNumber(value) <= parseNumber(facet.value)

  CASE 'minExclusive':
    RETURN parseNumber(value) > parseNumber(facet.value)

  CASE 'maxExclusive':
    RETURN parseNumber(value) < parseNumber(facet.value)

  CASE 'totalDigits':
    digits = value.replace(/[-+.]/g, '')
    RETURN digits.length <= facet.value

  CASE 'fractionDigits':
    IF value.includes('.'):
      fraction = value.split('.')[1]
      RETURN fraction.length <= facet.value
    RETURN true

  CASE 'whiteSpace':
    // whiteSpace는 값 정규화에 사용, 검증은 항상 통과
    RETURN true
```

### 7.3 Built-in 타입 검증

```
함수: validateBuiltinType(value, typeName)

SWITCH typeName:
  CASE 'string':
    RETURN true  // 모든 문자열 허용

  CASE 'boolean':
    RETURN ['true', 'false', '1', '0'].includes(value)

  CASE 'integer':
    RETURN /^[+-]?\d+$/.test(value)

  CASE 'int':
    num = parseInt(value)
    RETURN !isNaN(num) && num >= -2147483648 && num <= 2147483647

  CASE 'unsignedInt':
    num = parseInt(value)
    RETURN !isNaN(num) && num >= 0 && num <= 4294967295

  CASE 'unsignedByte':
    num = parseInt(value)
    RETURN !isNaN(num) && num >= 0 && num <= 255

  CASE 'decimal':
  CASE 'float':
  CASE 'double':
    RETURN !isNaN(parseFloat(value))

  CASE 'hexBinary':
    RETURN /^[0-9A-Fa-f]*$/.test(value) && value.length % 2 == 0

  CASE 'base64Binary':
    RETURN /^[A-Za-z0-9+/]*={0,2}$/.test(value)

  CASE 'dateTime':
    RETURN isValidXsdDateTime(value)

  CASE 'token':
    // 선행/후행 공백 없고, 연속 공백 없음
    RETURN value == value.trim() && !/\s{2,}/.test(value)

  CASE 'NCName':
    // XML 이름, 콜론 불가
    RETURN /^[a-zA-Z_][\w.-]*$/.test(value) && !value.includes(':')

  // ... 기타 타입들
```

---

## 8. 특수 케이스 처리

### 8.1 mc:AlternateContent 처리

```
OOXML의 Markup Compatibility 네임스페이스 처리:

<mc:AlternateContent>
  <mc:Choice Requires="c14">
    <!-- c14 네임스페이스 지원 시 사용 -->
  </mc:Choice>
  <mc:Fallback>
    <!-- 미지원 시 사용 -->
  </mc:Fallback>
</mc:AlternateContent>

처리 전략:

┌─────────────────────────────────────────────────────────────────┐
│ ValidationOptions.mcHandling                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ 'validateAll':    Choice와 Fallback 모두 검증                    │
│                   → 완전한 스키마 준수 확인                       │
│                                                                  │
│ 'preferChoice':   Requires 조건 확인                             │
│                   → 지원되면 Choice만, 아니면 Fallback만 검증     │
│                                                                  │
│ 'preferFallback': 항상 Fallback 검증                             │
│                   → 호환성 우선                                   │
│                                                                  │
│ 'skip':           AlternateContent 전체 스킵                     │
│                   → MC 검증 제외                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 확장 네임스페이스 처리

```
OOXML 확장 (c14, a14, w14 등):

예시: <c14:style val="102"/>

처리 흐름:

1. "c14" prefix를 namespace URI로 해결
   → "http://schemas.microsoft.com/office/drawing/2010/chart"

2. SchemaRegistry에서 해당 스키마 조회
   schema = registry.schemas.get(uri)

3. IF schema == null:
     // 알 수 없는 확장 네임스페이스
     
     SWITCH determineProcessContents():
       CASE 'lax':
         // 스키마 없으면 통과, 있으면 검증
         RETURN Success
         
       CASE 'strict':
         // 반드시 스키마 필요
         RETURN Error(UNKNOWN_TYPE)
         
       CASE 'skip':
         // 완전 무시
         RETURN Success
```

### 8.3 xsd:any / xsd:anyAttribute 처리

```
any 처리 예시:

<xsd:complexType name="CT_OfficeArtExtension">
  <xsd:sequence>
    <xsd:any processContents="lax" minOccurs="0" maxOccurs="unbounded"/>
  </xsd:sequence>
  <xsd:attribute name="uri" type="xsd:token" use="required"/>
</xsd:complexType>

검증 로직:

함수: handleAnyElement(element, anyDef)

1. // namespace 제약 확인
   SWITCH anyDef.namespace:
     CASE '##any':
       // 모든 네임스페이스 허용
       PASS
       
     CASE '##other':
       // 현재 스키마의 targetNamespace 외의 것만 허용
       IF element.namespace == currentSchema.targetNamespace:
         RETURN Error(INVALID_NAMESPACE)
       
     CASE '##targetNamespace':
       // 현재 스키마의 targetNamespace만 허용
       IF element.namespace != currentSchema.targetNamespace:
         RETURN Error(INVALID_NAMESPACE)
       
     CASE '##local':
       // 네임스페이스 없는 요소만
       IF element.namespace != null:
         RETURN Error(INVALID_NAMESPACE)
       
     DEFAULT:
       // 특정 네임스페이스 목록
       IF element.namespace NOT IN anyDef.namespace.split(' '):
         RETURN Error(INVALID_NAMESPACE)

2. // processContents에 따른 검증
   SWITCH anyDef.processContents:
     CASE 'strict':
       schema = registry.getSchema(element.namespace)
       IF schema == null:
         RETURN Error(UNKNOWN_TYPE)
       // 전체 검증 수행
       RETURN validateElement(element, schema)
       
     CASE 'lax':
       schema = registry.getSchema(element.namespace)
       IF schema != null:
         RETURN validateElement(element, schema)
       // 스키마 없으면 통과
       RETURN Success
       
     CASE 'skip':
       // 검증 완전 스킵
       RETURN Success
```

---

## 9. 중첩 Compositor 처리

### 9.1 Compositor 중첩 구조

```
XSD에서 자주 나타나는 중첩 패턴:

<xsd:sequence>                    Level 0
  <xsd:element name="a"/>
  <xsd:choice>                    Level 1
    <xsd:element name="b"/>
    <xsd:sequence>                Level 2
      <xsd:element name="c"/>
      <xsd:element name="d"/>
    </xsd:sequence>
  </xsd:choice>
  <xsd:element name="e"/>
</xsd:sequence>

허용되는 XML:
  <a/><b/><e/>           ✓
  <a/><c/><d/><e/>       ✓
  <a/><b/><c/><d/><e/>   ✗ (choice에서 하나만)
```

### 9.2 중첩 Compositor 상태 관리

```
CompositorState에 nestedStack 사용:

예시: <a/> → <c/> → <d/> → <e/> 검증

1. <a/> 진입
   mainState = { kind: 'sequence', currentIndex: 0 }
   → particles[0]이 'a' 매칭 ✓
   → currentIndex = 1 (다음은 choice)

2. <c/> 진입
   → particles[1]이 choice
   → choice 진입, nestedStack에 choiceState 푸시
   
   choiceState = { kind: 'choice', selectedBranch: null }
   → particles[1] (sequence containing c,d) 선택
   → nestedStack에 innerSeqState 푸시
   
   innerSeqState = { kind: 'sequence', currentIndex: 0 }
   → 'c' 매칭 ✓

3. <d/> 진입
   → innerSeqState에서 'd' 매칭 ✓
   → innerSeqState.currentIndex = 2 (끝)

4. <e/> 진입
   → innerSeqState 종료 (모든 required 충족)
   → choiceState 종료 (선택 완료)
   → nestedStack 팝
   → mainState로 복귀, currentIndex = 2
   → 'e' 매칭 ✓
```

### 9.3 Group 참조 인라인 확장

```
XSD:
  <xsd:group name="EG_ColorChoice">
    <xsd:choice>
      <xsd:element name="scrgbClr" type="CT_ScRgbColor"/>
      <xsd:element name="srgbClr" type="CT_SRgbColor"/>
      <xsd:element name="hslClr" type="CT_HslColor"/>
    </xsd:choice>
  </xsd:group>

  <xsd:complexType name="CT_Color">
    <xsd:sequence>
      <xsd:group ref="EG_ColorChoice"/>
    </xsd:sequence>
  </xsd:complexType>

Compositor 초기화 시:
  1. sequence 파싱
  2. group ref 발견
  3. EG_ColorChoice 조회
  4. 그룹의 choice를 현재 위치에 "인라인"

결과 FlattenedParticles:
  [
    { 
      particle: choice(scrgbClr | srgbClr | hslClr),
      minOccurs: 1,
      maxOccurs: 1 
    }
  ]
```

---

## 10. 에러 리포팅

### 10.1 ValidationError 구조

```typescript
interface ValidationError {
  // 에러 식별
  code: ValidationErrorCode;
  severity: 'error' | 'warning';
  
  // 위치 정보
  path: string;           // XPath: /c:chartSpace/c:chart/c:plotArea
  line?: number;          // 소스 라인
  column?: number;        // 소스 컬럼
  
  // 상세 정보
  message: string;        // 사람이 읽을 수 있는 메시지
  value?: string;         // 문제가 된 실제 값
  expected?: string;      // 기대되는 값/타입 설명
  
  // 스키마 참조
  schemaFile?: string;    // 관련 XSD 파일
  schemaType?: string;    // 관련 타입 이름
}
```

### 10.2 에러 메시지 예시

```
┌─────────────────────────────────────────────────────────────────┐
│ INVALID_ENUM_VALUE                                               │
├─────────────────────────────────────────────────────────────────┤
│ Path: /c:chartSpace/c:chart/c:plotArea/c:pieChart/c:ser/        │
│       c:dLbls/c:dLblPos/@val                                    │
│ Line: 42, Column: 18                                            │
│                                                                  │
│ Message: Attribute 'val' has invalid value 'r'.                 │
│          Expected one of: bestFit, b, ctr, inBase, inEnd,       │
│          l, outEnd, t                                           │
│                                                                  │
│ Schema: dml-chart.xsd                                           │
│ Type: ST_DLblPos                                                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ MISSING_REQUIRED_ELEMENT                                         │
├─────────────────────────────────────────────────────────────────┤
│ Path: /c:chartSpace/c:chart                                      │
│ Line: 150, Column: 3                                            │
│                                                                  │
│ Message: Required child element 'plotArea' is missing.          │
│          Expected at position 3 in sequence.                    │
│                                                                  │
│ Schema: dml-chart.xsd                                           │
│ Type: CT_Chart                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ INVALID_ELEMENT_ORDER                                            │
├─────────────────────────────────────────────────────────────────┤
│ Path: /c:chartSpace/c:chart/c:legend                            │
│ Line: 145, Column: 5                                            │
│                                                                  │
│ Message: Element 'legend' appears in wrong order.               │
│          Expected after 'plotArea', but 'plotVisOnly'           │
│          was expected next.                                     │
│                                                                  │
│ Schema: dml-chart.xsd                                           │
│ Type: CT_Chart (sequence)                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 11. 최적화 전략

### 11.1 타입 조회 캐싱

```
┌─────────────────────────────────────────────────────────────────┐
│                    Type Resolution Cache                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Level 1: Hot Type Cache                                         │
│   - 자주 사용되는 타입 사전 로드                                  │
│   - CT_Boolean, ST_OnOff, CT_UnsignedInt 등                     │
│   - Map<qualifiedName, ResolvedType>                            │
│                                                                  │
│ Level 2: Session Cache                                          │
│   - 검증 세션 동안 조회된 타입 캐싱                               │
│   - WeakMap<TypeReference, ResolvedType>                        │
│                                                                  │
│ Level 3: Particle Match Cache                                   │
│   - Compositor의 허용 요소명 Set 사전 계산                       │
│   - Map<CompositorId, Set<allowedNames>>                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 11.2 Compositor 최적화

```
Sequence 최적화:
  - 허용 요소명 → particle index 매핑 미리 구축
  - Map<elementName, number[]> (같은 이름 여러 위치 가능)

Choice 최적화:
  - Set<allowedNames> 미리 구축
  - O(n) 탐색 → O(1) 존재 여부 확인

예시:
  sequence: [date1904?, roundedCorners?, AlternateContent*, chart]
  
  precomputed = {
    'date1904': [0],
    'roundedCorners': [1],
    'AlternateContent': [2],
    'chart': [3]
  }
  
  <chart> 요소 진입 시:
    → precomputed['chart'] = [3]
    → currentIndex(0)부터 index(3)까지 스킵 가능 여부만 확인
```

### 11.3 Early Exit 전략

```
ValidationOptions:
  failFast: boolean       // 첫 에러에서 중단
  maxErrors: number       // 최대 수집 에러 수 (기본: 100)
  skipAfterErrors: number // N개 에러 후 해당 브랜치 스킵

예시 (maxErrors: 10):
  에러 1, 2, 3 ... 10 수집
  → 11번째 에러 발생 시점에 검증 중단
  → 부분 결과 반환 + "추가 에러 존재할 수 있음" 플래그
```

---

## 12. 검증 결과 구조

```typescript
interface ValidationResult {
  // 전체 유효성
  valid: boolean;
  
  // 에러 목록
  errors: ValidationError[];
  
  // 경고 목록 (선택적)
  warnings?: ValidationWarning[];
  
  // 통계
  statistics: {
    elementsValidated: number;
    attributesValidated: number;
    errorsFound: number;
    warningsFound: number;
    validationTimeMs: number;
  };
  
  // 검증 완료 여부 (early exit 시 false)
  complete: boolean;
  
  // 검증 범위 (complete=false 시)
  lastValidatedPath?: string;
}
```

---

## 13. 예시 검증 시나리오

### 13.1 주어진 XML 검증 흐름

```
입력 XML (일부):

<c:chartSpace xmlns:c="..." xmlns:a="..." xmlns:r="...">
  <c:date1904 val="0"/>
  <c:roundedCorners val="0"/>
  <mc:AlternateContent xmlns:mc="...">
    ...
  </mc:AlternateContent>
  <c:chart>
    <c:plotArea>
      <c:pieChart>
        <c:ser>
          <c:dLbls>
            <c:dLblPos val="r"/>  ← 잠재적 에러
            ...
```

### 13.2 검증 트레이스

```
STEP 1: c:chartSpace 진입
  ├─ namespace 바인딩 수집
  ├─ CT_ChartSpace 타입 조회
  ├─ compositorState 초기화 (sequence)
  └─ 스택: [chartSpace]

STEP 2: c:date1904 진입
  ├─ 부모 compositor 검증
  │   └─ sequence[0] = date1904? → 매칭 ✓
  ├─ @val="0" 검증
  │   └─ ST_OnOff → boolean "0" → ✓
  └─ 스택: [chartSpace, date1904]

STEP 3: c:date1904 종료
  └─ 스택: [chartSpace]

STEP 4: c:roundedCorners 진입
  ├─ 부모 compositor 검증
  │   └─ currentIndex=1, sequence[1] = roundedCorners? → 매칭 ✓
  └─ 스택: [chartSpace, roundedCorners]

... (중략) ...

STEP N: c:dLblPos 진입
  ├─ 부모 compositor 검증 → ✓
  ├─ @val="r" 검증
  │   ├─ ST_DLblPos 타입 조회
  │   ├─ enumeration: [bestFit, b, ctr, inBase, inEnd, l, outEnd, t]
  │   ├─ "r" NOT IN enumeration
  │   └─ ❌ INVALID_ENUM_VALUE 에러 수집
  └─ 검증 계속 (failFast=false)

... (나머지 요소 검증) ...

FINAL: 검증 완료
  └─ ValidationResult {
       valid: false,
       errors: [
         { code: 'INVALID_ENUM_VALUE', path: '.../@val', value: 'r', ... }
       ],
       statistics: { elementsValidated: 47, ... }
     }
```

---

## 14. 향후 확장 고려사항

### 14.1 Identity Constraints (unique, key, keyref)
```
현재 설계에서 ID/IDREF만 지원
향후 xsd:unique, xsd:key, xsd:keyref 지원 필요:
  - selector XPath 평가
  - field 값 수집
  - 유일성/참조 무결성 검증
```

### 14.2 Assert (XSD 1.1)
```
XSD 1.1의 xsd:assert 지원:
  - XPath 2.0 표현식 평가
  - 조건 기반 검증
```

### 14.3 Type Alternatives (XSD 1.1)
```
조건부 타입 할당:
  - 속성 값에 따른 다른 타입 적용
  - 더 유연한 검증
```

---

## 15. 요약

이 설계는 다음을 달성합니다:

1. **완전한 순서 검증**: Sequence의 currentIndex 포인터가 앞으로만 이동하며, 필수 요소 스킵 시 에러 발생

2. **유연한 선택 검증**: Choice의 branch 선택 및 반복 처리

3. **중첩 구조 처리**: nestedStack으로 compositor 안의 compositor 처리

4. **효율적인 타입 해결**: 다단계 캐싱으로 cross-schema 참조 최적화

5. **상세한 에러 리포팅**: XPath 경로, 라인/컬럼, 기대값 포함

6. **OOXML 특수 케이스**: mc:AlternateContent, 확장 네임스페이스, xsd:any 처리
