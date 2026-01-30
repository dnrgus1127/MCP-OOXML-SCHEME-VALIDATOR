/**
 * OOXML XSD Schema Runtime Types
 * 
 * XSD 스키마를 JSON으로 변환하여 런타임에 XML 검증을 수행하기 위한 타입 정의
 * complexType 하나당 하나의 객체로 관리되며, XML 순차 탐색 시 스펙 준수 여부 검사에 사용
 */

// ============================================================================
// 기본 타입 및 공통 인터페이스
// ============================================================================

/** XSD 네임스페이스 정보 */
export interface XsdNamespace {
  prefix: string;
  uri: string;
}

/** 발생 횟수 제약 */
export interface OccurrenceConstraint {
  minOccurs: number;
  maxOccurs: number | 'unbounded';
}

/** 타입 참조 (로컬 또는 외부 네임스페이스) */
export interface TypeReference {
  /** 네임스페이스 prefix (없으면 현재 스키마의 targetNamespace) */
  namespacePrefix?: string;
  /** 타입 이름 */
  name: string;
  /** xsd: 내장 타입인지 여부 */
  isBuiltin: boolean;
}

/** 요소/속성의 기본값 정보 */
export interface DefaultValue {
  value: string;
  /** fixed가 true면 이 값만 허용 */
  fixed: boolean;
}

// ============================================================================
// SimpleType 관련 타입 정의
// ============================================================================

/** XSD 내장 primitive 타입 */
export type XsdBuiltinType =
  | 'string'
  | 'boolean'
  | 'decimal'
  | 'float'
  | 'double'
  | 'duration'
  | 'dateTime'
  | 'time'
  | 'date'
  | 'gYearMonth'
  | 'gYear'
  | 'gMonthDay'
  | 'gDay'
  | 'gMonth'
  | 'hexBinary'
  | 'base64Binary'
  | 'anyURI'
  | 'QName'
  | 'NOTATION'
  // derived types
  | 'normalizedString'
  | 'token'
  | 'language'
  | 'NMTOKEN'
  | 'NMTOKENS'
  | 'Name'
  | 'NCName'
  | 'ID'
  | 'IDREF'
  | 'IDREFS'
  | 'ENTITY'
  | 'ENTITIES'
  | 'integer'
  | 'nonPositiveInteger'
  | 'negativeInteger'
  | 'long'
  | 'int'
  | 'short'
  | 'byte'
  | 'nonNegativeInteger'
  | 'unsignedLong'
  | 'unsignedInt'
  | 'unsignedShort'
  | 'unsignedByte'
  | 'positiveInteger';

/** Restriction facet 타입 */
export type FacetType =
  | 'length'
  | 'minLength'
  | 'maxLength'
  | 'pattern'
  | 'enumeration'
  | 'whiteSpace'
  | 'maxInclusive'
  | 'maxExclusive'
  | 'minInclusive'
  | 'minExclusive'
  | 'totalDigits'
  | 'fractionDigits';

/** 개별 Facet 정의 */
export interface XsdFacet {
  type: FacetType;
  value: string;
  /** length 등의 fixed 속성 */
  fixed?: boolean;
}

/** Enumeration Facet (여러 값 허용) */
export interface EnumerationFacet {
  type: 'enumeration';
  values: string[];
}

/** Pattern Facet (여러 패턴 OR 조건) */
export interface PatternFacet {
  type: 'pattern';
  patterns: string[];
}

/** 숫자 범위 Facet */
export interface NumericRangeFacet {
  type: 'minInclusive' | 'maxInclusive' | 'minExclusive' | 'maxExclusive';
  value: string;
}

/** 길이 관련 Facet */
export interface LengthFacet {
  type: 'length' | 'minLength' | 'maxLength';
  value: number;
  fixed?: boolean;
}

/** WhiteSpace Facet */
export interface WhiteSpaceFacet {
  type: 'whiteSpace';
  value: 'preserve' | 'replace' | 'collapse';
}

/** 자릿수 Facet */
export interface DigitsFacet {
  type: 'totalDigits' | 'fractionDigits';
  value: number;
}

/** 모든 Facet 유니온 타입 */
export type Facet =
  | EnumerationFacet
  | PatternFacet
  | NumericRangeFacet
  | LengthFacet
  | WhiteSpaceFacet
  | DigitsFacet;

/** SimpleType의 Restriction 정의 */
export interface SimpleTypeRestriction {
  kind: 'restriction';
  /** 기반 타입 (내장 타입 또는 다른 simpleType 참조) */
  base: TypeReference;
  /** 적용된 facets */
  facets: Facet[];
}

/** SimpleType의 Union 정의 */
export interface SimpleTypeUnion {
  kind: 'union';
  /** 멤버 타입들 */
  memberTypes: TypeReference[];
}

/** SimpleType의 List 정의 */
export interface SimpleTypeList {
  kind: 'list';
  /** 아이템 타입 */
  itemType: TypeReference;
}

/** SimpleType 정의 (complexType 내부에서도 사용) */
export interface XsdSimpleType {
  kind: 'simpleType';
  /** 타입 이름 (anonymous일 경우 undefined) */
  name?: string;
  /** 정의 방식 */
  content: SimpleTypeRestriction | SimpleTypeUnion | SimpleTypeList;
}

// ============================================================================
// Attribute 관련 타입 정의
// ============================================================================

/** Attribute use 값 */
export type AttributeUse = 'required' | 'optional' | 'prohibited';

/** Attribute 정의 */
export interface XsdAttribute {
  kind: 'attribute';
  /** 속성 이름 (ref 사용 시 undefined) */
  name?: string;
  /** 타입 참조 (inline simpleType일 경우 undefined) */
  typeRef?: TypeReference;
  /** 인라인 simpleType 정의 */
  inlineType?: XsdSimpleType;
  /** use 속성 */
  use: AttributeUse;
  /** 기본값 */
  default?: DefaultValue;
  /** ref로 다른 attribute 참조 */
  ref?: TypeReference;
  /** form (qualified/unqualified) */
  form?: 'qualified' | 'unqualified';
}

/** AttributeGroup 정의 */
export interface XsdAttributeGroup {
  kind: 'attributeGroup';
  /** 그룹 이름 (정의 시) */
  name?: string;
  /** ref로 다른 attributeGroup 참조 */
  ref?: TypeReference;
  /** 포함된 attributes */
  attributes?: XsdAttribute[];
  /** 포함된 attributeGroup 참조들 */
  attributeGroupRefs?: TypeReference[];
  /** anyAttribute */
  anyAttribute?: XsdAnyAttribute;
}

/** anyAttribute 정의 */
export interface XsdAnyAttribute {
  kind: 'anyAttribute';
  namespace?: string;
  processContents: 'strict' | 'lax' | 'skip';
}

// ============================================================================
// Element 관련 타입 정의
// ============================================================================

/** Element 정의 */
export interface XsdElement {
  kind: 'element';
  /** 요소 이름 (ref 사용 시 undefined) */
  name?: string;
  /** 타입 참조 (inline type일 경우 undefined) */
  typeRef?: TypeReference;
  /** 인라인 complexType 정의 */
  inlineComplexType?: XsdComplexType;
  /** 인라인 simpleType 정의 */
  inlineSimpleType?: XsdSimpleType;
  /** ref로 다른 element 참조 */
  ref?: TypeReference;
  /** 발생 횟수 제약 */
  occurs: OccurrenceConstraint;
  /** 기본값 */
  default?: DefaultValue;
  /** nillable 속성 */
  nillable?: boolean;
  /** abstract 속성 */
  abstract?: boolean;
  /** substitutionGroup */
  substitutionGroup?: TypeReference;
  /** form (qualified/unqualified) */
  form?: 'qualified' | 'unqualified';
  /** block 속성 */
  block?: ('extension' | 'restriction' | 'substitution')[];
  /** final 속성 */
  final?: ('extension' | 'restriction')[];
}

/** any (wildcard element) 정의 */
export interface XsdAny {
  kind: 'any';
  /** 허용되는 namespace */
  namespace?: string;
  /** 처리 방식 */
  processContents: 'strict' | 'lax' | 'skip';
  /** 발생 횟수 제약 */
  occurs: OccurrenceConstraint;
}

// ============================================================================
// Compositor (Sequence, Choice, All) 관련 타입 정의
// ============================================================================

/** Compositor 내부에 올 수 있는 particle들 */
export type Particle =
  | XsdElement
  | XsdAny
  | XsdSequence
  | XsdChoice
  | XsdAll
  | XsdGroupRef;

/** Group 참조 */
export interface XsdGroupRef {
  kind: 'groupRef';
  ref: TypeReference;
  occurs: OccurrenceConstraint;
}

/** Sequence compositor */
export interface XsdSequence {
  kind: 'sequence';
  particles: Particle[];
  occurs: OccurrenceConstraint;
}

/** Choice compositor */
export interface XsdChoice {
  kind: 'choice';
  particles: Particle[];
  occurs: OccurrenceConstraint;
}

/** All compositor */
export interface XsdAll {
  kind: 'all';
  /** all 내부의 요소들 (sequence/choice/any 불가) */
  elements: XsdElement[];
  occurs: OccurrenceConstraint;
}

/** Group 정의 */
export interface XsdGroup {
  kind: 'group';
  name: string;
  /** 그룹의 내용 (sequence, choice, all 중 하나) */
  compositor?: XsdSequence | XsdChoice | XsdAll;
}

// ============================================================================
// ComplexType 관련 타입 정의
// ============================================================================

/** ComplexType의 content 종류 */
export type ComplexTypeContentKind =
  | 'empty'           // 자식 요소 없음
  | 'elementOnly'     // 요소만 포함
  | 'mixed'           // 요소 + 텍스트 혼합
  | 'simpleContent'   // 텍스트만 (속성 가능)
  | 'complexContent'; // 다른 complexType 확장/제한

/** 빈 content (속성만 가능) */
export interface EmptyContent {
  kind: 'empty';
}

/** Element-only 또는 Mixed content */
export interface ElementContent {
  kind: 'elementOnly' | 'mixed';
  /** 최상위 compositor */
  compositor?: XsdSequence | XsdChoice | XsdAll;
  /** group 참조 (compositor 대신 사용) */
  groupRef?: XsdGroupRef;
}

/** SimpleContent (extension/restriction) */
export interface SimpleContentExtension {
  derivation: 'extension';
  base: TypeReference;
  attributes: XsdAttribute[];
  attributeGroups: XsdAttributeGroup[];
  anyAttribute?: XsdAnyAttribute;
}

export interface SimpleContentRestriction {
  derivation: 'restriction';
  base: TypeReference;
  /** simpleType facets (base가 simpleType인 경우) */
  facets?: Facet[];
  /** 인라인 simpleType */
  simpleType?: XsdSimpleType;
  attributes: XsdAttribute[];
  attributeGroups: XsdAttributeGroup[];
  anyAttribute?: XsdAnyAttribute;
}

export interface SimpleContent {
  kind: 'simpleContent';
  content: SimpleContentExtension | SimpleContentRestriction;
}

/** ComplexContent (extension/restriction) */
export interface ComplexContentExtension {
  derivation: 'extension';
  base: TypeReference;
  /** 추가 compositor */
  compositor?: XsdSequence | XsdChoice | XsdAll;
  groupRef?: XsdGroupRef;
  attributes: XsdAttribute[];
  attributeGroups: XsdAttributeGroup[];
  anyAttribute?: XsdAnyAttribute;
}

export interface ComplexContentRestriction {
  derivation: 'restriction';
  base: TypeReference;
  /** 재정의된 compositor */
  compositor?: XsdSequence | XsdChoice | XsdAll;
  groupRef?: XsdGroupRef;
  attributes: XsdAttribute[];
  attributeGroups: XsdAttributeGroup[];
  anyAttribute?: XsdAnyAttribute;
}

export interface ComplexContent {
  kind: 'complexContent';
  mixed?: boolean;
  content: ComplexContentExtension | ComplexContentRestriction;
}

/** ComplexType 전체 정의 */
export interface XsdComplexType {
  kind: 'complexType';
  /** 타입 이름 (anonymous일 경우 undefined) */
  name?: string;
  /** abstract 속성 */
  abstract?: boolean;
  /** mixed 속성 */
  mixed?: boolean;
  /** block 속성 */
  block?: ('extension' | 'restriction')[];
  /** final 속성 */
  final?: ('extension' | 'restriction')[];
  /** content 모델 */
  content: EmptyContent | ElementContent | SimpleContent | ComplexContent;
  /** 직접 정의된 attributes */
  attributes: XsdAttribute[];
  /** attributeGroup 참조들 */
  attributeGroups: XsdAttributeGroup[];
  /** anyAttribute */
  anyAttribute?: XsdAnyAttribute;
}

// ============================================================================
// Schema 레벨 타입 정의
// ============================================================================

/** Import 정의 */
export interface XsdImport {
  kind: 'import';
  namespace: string;
  schemaLocation?: string;
}

/** Include 정의 */
export interface XsdInclude {
  kind: 'include';
  schemaLocation: string;
}

/** Redefine 정의 */
export interface XsdRedefine {
  kind: 'redefine';
  schemaLocation: string;
  /** 재정의된 타입들 */
  simpleTypes: XsdSimpleType[];
  complexTypes: XsdComplexType[];
  groups: XsdGroup[];
  attributeGroups: XsdAttributeGroup[];
}

/** Schema 전체 정의 */
export interface XsdSchema {
  /** 타겟 네임스페이스 */
  targetNamespace?: string;
  /** 사용된 네임스페이스들 */
  namespaces: XsdNamespace[];
  /** elementFormDefault */
  elementFormDefault: 'qualified' | 'unqualified';
  /** attributeFormDefault */
  attributeFormDefault: 'qualified' | 'unqualified';
  /** blockDefault */
  blockDefault?: ('extension' | 'restriction' | 'substitution')[];
  /** finalDefault */
  finalDefault?: ('extension' | 'restriction')[];
  /** import된 스키마들 */
  imports: XsdImport[];
  /** include된 스키마들 */
  includes: XsdInclude[];
  /** redefine된 스키마들 */
  redefines: XsdRedefine[];
  /** 전역 simpleType 정의들 */
  simpleTypes: Map<string, XsdSimpleType>;
  /** 전역 complexType 정의들 */
  complexTypes: Map<string, XsdComplexType>;
  /** 전역 element 정의들 */
  elements: Map<string, XsdElement>;
  /** 전역 attribute 정의들 */
  attributes: Map<string, XsdAttribute>;
  /** group 정의들 */
  groups: Map<string, XsdGroup>;
  /** attributeGroup 정의들 */
  attributeGroups: Map<string, XsdAttributeGroup>;
}

// ============================================================================
// 런타임 스키마 레지스트리 (여러 스키마 통합 관리)
// ============================================================================

/** 스키마 레지스트리 - 여러 스키마를 namespace로 관리 */
export interface SchemaRegistry {
  /** namespace URI -> Schema 매핑 */
  schemas: Map<string, XsdSchema>;
  
  /** 타입 조회 (namespace 포함) */
  resolveType(namespaceUri: string, typeName: string): XsdComplexType | XsdSimpleType | undefined;
  
  /** 요소 조회 */
  resolveElement(namespaceUri: string, elementName: string): XsdElement | undefined;
  
  /** 그룹 조회 */
  resolveGroup(namespaceUri: string, groupName: string): XsdGroup | undefined;
  
  /** 속성 그룹 조회 */
  resolveAttributeGroup(namespaceUri: string, groupName: string): XsdAttributeGroup | undefined;
}

// ============================================================================
// XML 검증용 컨텍스트 및 유틸리티 타입
// ============================================================================

/** 검증 오류 정보 */
export interface ValidationError {
  /** 오류 코드 */
  code: ValidationErrorCode;
  /** 오류 메시지 */
  message: string;
  /** XML 경로 (XPath 형식) */
  path: string;
  /** 문제가 된 값 */
  value?: string;
  /** 기대된 값/타입 */
  expected?: string;
  /** 줄 번호 (가능한 경우) */
  line?: number;
  /** 컬럼 번호 (가능한 경우) */
  column?: number;
}

/** 검증 오류 코드 */
export type ValidationErrorCode =
  | 'INVALID_ELEMENT'           // 허용되지 않는 요소
  | 'MISSING_REQUIRED_ELEMENT'  // 필수 요소 누락
  | 'INVALID_ELEMENT_ORDER'     // 요소 순서 오류
  | 'TOO_FEW_ELEMENTS'         // minOccurs 미충족
  | 'TOO_MANY_ELEMENTS'        // maxOccurs 초과
  | 'INVALID_ATTRIBUTE'        // 허용되지 않는 속성
  | 'MISSING_REQUIRED_ATTR'    // 필수 속성 누락
  | 'INVALID_VALUE'            // 값 검증 실패
  | 'INVALID_ENUM_VALUE'       // 열거값 불일치
  | 'PATTERN_MISMATCH'         // 패턴 불일치
  | 'VALUE_TOO_LONG'           // maxLength 초과
  | 'VALUE_TOO_SHORT'          // minLength 미충족
  | 'VALUE_OUT_OF_RANGE'       // 숫자 범위 초과
  | 'UNKNOWN_TYPE'             // 참조된 타입을 찾을 수 없음
  | 'INVALID_NAMESPACE'        // 네임스페이스 오류
  | 'INVALID_CONTENT'          // 내용 모델 불일치
  | 'UNEXPECTED_TEXT'          // element-only에 텍스트 존재
  | 'CHOICE_NOT_SATISFIED';    // choice 조건 미충족

/** 검증 결과 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings?: ValidationWarning[];
}

/** 검증 경고 (비필수적 권장사항) */
export interface ValidationWarning {
  code: string;
  message: string;
  path: string;
}

/** 검증 옵션 */
export interface ValidationOptions {
  /** strict 모드 (processContents="strict" 강제) */
  strict?: boolean;
  /** 첫 번째 오류에서 중단 */
  failFast?: boolean;
  /** 최대 오류 수 */
  maxErrors?: number;
  /** 경고 포함 여부 */
  includeWarnings?: boolean;
  /** 커스텀 타입 검증기 */
  customValidators?: Map<string, (value: string) => boolean>;
}

/** 검증 컨텍스트 (순회 중 상태 관리) */
export interface ValidationContext {
  /** 현재 스키마 레지스트리 */
  registry: SchemaRegistry;
  /** 현재 XML 경로 스택 */
  pathStack: string[];
  /** 수집된 오류들 */
  errors: ValidationError[];
  /** 수집된 경고들 */
  warnings: ValidationWarning[];
  /** 검증 옵션 */
  options: ValidationOptions;
  /** 현재 네임스페이스 매핑 (prefix -> uri) */
  namespaceContext: Map<string, string>;
  /** ID 값 집합 (중복 체크용) */
  idValues: Set<string>;
  /** IDREF 값 집합 (참조 검증용) */
  idrefValues: Set<string>;
}

// ============================================================================
// 스키마 파서/로더 인터페이스
// ============================================================================

/** XSD를 JSON으로 변환하는 파서 인터페이스 */
export interface XsdParser {
  /** XSD 문자열을 파싱하여 스키마 객체 반환 */
  parse(xsdContent: string, baseUri?: string): Promise<XsdSchema>;
  
  /** 파일 경로에서 XSD 로드 */
  parseFile(filePath: string): Promise<XsdSchema>;
}

/** 스키마 레지스트리 빌더 인터페이스 */
export interface SchemaRegistryBuilder {
  /** 스키마 추가 */
  addSchema(schema: XsdSchema): void;
  
  /** 파일에서 스키마 추가 */
  addSchemaFromFile(filePath: string): Promise<void>;
  
  /** import/include 해결 */
  resolveReferences(): Promise<void>;
  
  /** 레지스트리 빌드 */
  build(): SchemaRegistry;
}

// ============================================================================
// 타입 가드 함수 시그니처
// ============================================================================

export function isSimpleType(type: XsdComplexType | XsdSimpleType): type is XsdSimpleType {
  return type.kind === 'simpleType';
}

export function isComplexType(type: XsdComplexType | XsdSimpleType): type is XsdComplexType {
  return type.kind === 'complexType';
}

export function isSequence(particle: Particle): particle is XsdSequence {
  return particle.kind === 'sequence';
}

export function isChoice(particle: Particle): particle is XsdChoice {
  return particle.kind === 'choice';
}

export function isAll(particle: Particle): particle is XsdAll {
  return particle.kind === 'all';
}

export function isElement(particle: Particle): particle is XsdElement {
  return particle.kind === 'element';
}

export function isAny(particle: Particle): particle is XsdAny {
  return particle.kind === 'any';
}

export function isGroupRef(particle: Particle): particle is XsdGroupRef {
  return particle.kind === 'groupRef';
}

export function hasSimpleContent(content: XsdComplexType['content']): content is SimpleContent {
  return content.kind === 'simpleContent';
}

export function hasComplexContent(content: XsdComplexType['content']): content is ComplexContent {
  return content.kind === 'complexContent';
}

export function hasElementContent(content: XsdComplexType['content']): content is ElementContent {
  return content.kind === 'elementOnly' || content.kind === 'mixed';
}

export function isEnumerationFacet(facet: Facet): facet is EnumerationFacet {
  return facet.type === 'enumeration';
}

export function isPatternFacet(facet: Facet): facet is PatternFacet {
  return facet.type === 'pattern';
}
