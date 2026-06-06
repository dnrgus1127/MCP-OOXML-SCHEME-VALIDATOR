/**
 * Schema Element Describer
 *
 * 주어진 (namespaceUri, elementName)을 스키마 레지스트리에서 해석해
 * 에디터가 사람이 읽기 쉬운 형태로 보여줄 수 있는 구조 정보(타입, 허용 자식 요소,
 * 허용 속성, 허용 값/facet)를 생성한다.
 *
 * 산문 설명: OOXML 공식 XSD에는 <xsd:documentation>이 거의 없으므로, 사람이 읽는
 * 설명은 element-docs.ts의 수동 큐레이션 사전에서 가져와 `documentation`/속성
 * `description`을 채운다(있을 때만).
 */

import type {
  SchemaRegistry,
  XsdAttribute,
  XsdAttributeGroup,
  XsdComplexType,
  XsdElement,
  XsdSimpleType,
  Particle,
  TypeReference,
  AttributeUse,
} from '../types'
import {
  hasComplexContent,
  hasElementContent,
  hasSimpleContent,
  isEnumerationFacet,
  isSimpleType,
} from '../types'
import { getElementDoc } from './element-docs'
import { resolveTypeReference } from '../engine/type-resolver'
import { resolveNamespaceWithFallback } from '../engine/namespace-helpers'

const EMPTY_CONTEXT: Map<string, string> = new Map()
const noop = (): void => {}

/** 요소의 콘텐츠 모델 종류 (사람이 읽기 쉬운 분류) */
export type SchemaContentKind =
  | 'empty'
  | 'elementOnly'
  | 'mixed'
  | 'simpleContent'
  | 'complexContent'
  | 'simpleType'
  | 'unknown'

/** facet 요약 (enumeration 제외) */
export interface SchemaFacetInfo {
  type: string
  value: string
}

/** 허용 속성 정보 */
export interface SchemaAttributeInfo {
  name: string
  use: AttributeUse
  typeName?: string
  allowedValues?: string[]
  fixed?: string
  default?: string
  /** 큐레이션된 속성 설명(있을 때만) */
  description?: string
}

/** 허용 자식 요소 정보 */
export interface SchemaChildInfo {
  /** 'any'(wildcard)일 경우 '*' */
  name: string
  namespaceUri?: string
  minOccurs: number
  maxOccurs: number | 'unbounded'
  /** wildcard(any) 여부 */
  isWildcard?: boolean
}

/** describeSchemaElement 결과 DTO */
export interface SchemaElementDescription {
  found: boolean
  name: string
  namespaceUri: string
  typeName?: string
  contentKind: SchemaContentKind
  /** 큐레이션된 산문 설명(element-docs.ts, 있을 때만) */
  documentation?: string
  /** 설명 출처 표기(있을 때만) */
  specRef?: string
  isAbstract?: boolean
  /** elementOnly/complexContent의 최상위 compositor 종류 */
  compositor?: 'sequence' | 'choice' | 'all'
  attributes: SchemaAttributeInfo[]
  children: SchemaChildInfo[]
  /** simpleType / simpleContent의 enumeration 허용 값 */
  allowedValues?: string[]
  /** enumeration을 제외한 facet들 (min/max/pattern 등) */
  facets?: SchemaFacetInfo[]
  baseType?: string
}

interface ResolvedType {
  type: XsdComplexType | XsdSimpleType
  namespaceUri: string
}

/** TypeReference를 해석해 타입과 그 타입이 속한 네임스페이스를 함께 반환 */
function resolveRef(
  ref: TypeReference,
  registry: SchemaRegistry,
  fallbackNamespaceUri: string
): ResolvedType | null {
  const type = resolveTypeReference(ref, EMPTY_CONTEXT, registry, noop, fallbackNamespaceUri)
  if (!type) return null
  if (ref.isBuiltin) {
    return { type, namespaceUri: fallbackNamespaceUri }
  }
  const namespaceUri = resolveNamespaceWithFallback(
    EMPTY_CONTEXT,
    ref.namespacePrefix,
    registry,
    fallbackNamespaceUri
  )
  const resolvedNamespaceUri = namespaceUri || (!ref.namespacePrefix ? fallbackNamespaceUri : '')
  return { type, namespaceUri: resolvedNamespaceUri }
}

/** simpleType의 restriction 체인을 따라가며 enumeration 값과 기타 facet을 수집 */
function collectSimpleTypeConstraints(
  simpleType: XsdSimpleType,
  registry: SchemaRegistry,
  fallbackNamespaceUri: string,
  visited = new Set<string>()
): { allowedValues: string[]; facets: SchemaFacetInfo[]; baseType?: string } {
  const allowedValues: string[] = []
  const facets: SchemaFacetInfo[] = []
  let baseType: string | undefined

  const content = simpleType.content
  if (content.kind === 'restriction') {
    baseType = content.base.name
    for (const facet of content.facets) {
      if (isEnumerationFacet(facet)) {
        for (const value of facet.values) {
          if (!allowedValues.includes(value)) allowedValues.push(value)
        }
      } else if (facet.type === 'pattern') {
        for (const pattern of facet.patterns) {
          facets.push({ type: 'pattern', value: pattern })
        }
      } else {
        facets.push({ type: facet.type, value: String(facet.value) })
      }
    }

    // base가 사용자 정의 simpleType이면 그 제약도 상속해 표시
    if (!content.base.isBuiltin) {
      const visitKey = `${content.base.namespacePrefix ?? ''}:${content.base.name}`
      if (!visited.has(visitKey)) {
        visited.add(visitKey)
        const resolved = resolveRef(content.base, registry, fallbackNamespaceUri)
        if (resolved && isSimpleType(resolved.type)) {
          const inherited = collectSimpleTypeConstraints(
            resolved.type,
            registry,
            resolved.namespaceUri,
            visited
          )
          for (const value of inherited.allowedValues) {
            if (!allowedValues.includes(value)) allowedValues.push(value)
          }
          facets.push(...inherited.facets)
        }
      }
    }
  } else if (content.kind === 'union') {
    for (const member of content.memberTypes) {
      if (member.isBuiltin) continue
      const resolved = resolveRef(member, registry, fallbackNamespaceUri)
      if (resolved && isSimpleType(resolved.type)) {
        const inherited = collectSimpleTypeConstraints(
          resolved.type,
          registry,
          resolved.namespaceUri,
          visited
        )
        for (const value of inherited.allowedValues) {
          if (!allowedValues.includes(value)) allowedValues.push(value)
        }
      }
    }
  } else if (content.kind === 'list') {
    baseType = content.itemType.name
  }

  return { allowedValues, facets, baseType }
}

/** 속성의 타입을 해석해 허용 값(enumeration)을 수집 */
function describeAttributeValues(
  attr: XsdAttribute,
  registry: SchemaRegistry,
  fallbackNamespaceUri: string
): { typeName?: string; allowedValues?: string[] } {
  let simpleType: XsdSimpleType | undefined
  let typeName: string | undefined

  if (attr.inlineType) {
    simpleType = attr.inlineType
  } else if (attr.typeRef) {
    typeName = attr.typeRef.name
    const resolved = resolveRef(attr.typeRef, registry, fallbackNamespaceUri)
    if (resolved && isSimpleType(resolved.type)) {
      simpleType = resolved.type
    }
  }

  if (!simpleType) return { typeName }
  const { allowedValues } = collectSimpleTypeConstraints(simpleType, registry, fallbackNamespaceUri)
  return {
    typeName: typeName ?? simpleType.name,
    allowedValues: allowedValues.length > 0 ? allowedValues : undefined,
  }
}

function attributeDisplayName(attr: XsdAttribute): string | undefined {
  if (attr.name) return attr.name
  if (attr.ref) {
    return attr.ref.namespacePrefix ? `${attr.ref.namespacePrefix}:${attr.ref.name}` : attr.ref.name
  }
  return undefined
}

/** complexType의 모든 속성(상속/속성그룹 포함)을 평탄화해 정보 객체로 수집 */
function collectAttributes(
  type: XsdComplexType,
  registry: SchemaRegistry,
  fallbackNamespaceUri: string,
  out: Map<string, SchemaAttributeInfo>,
  visitedTypes: Set<string>
): void {
  const directAttributes: XsdAttribute[] = [...type.attributes]
  const directGroups: XsdAttributeGroup[] = [...type.attributeGroups]

  if (hasComplexContent(type.content) || hasSimpleContent(type.content)) {
    const derivation = type.content.content
    directAttributes.push(...derivation.attributes)
    directGroups.push(...derivation.attributeGroups)
  }

  const addAttribute = (attr: XsdAttribute) => {
    if (attr.use === 'prohibited') return
    const name = attributeDisplayName(attr)
    if (!name || out.has(name)) return
    const { typeName, allowedValues } = describeAttributeValues(
      attr,
      registry,
      fallbackNamespaceUri
    )
    out.set(name, {
      name,
      use: attr.use,
      typeName,
      allowedValues,
      fixed: attr.default?.fixed ? attr.default.value : undefined,
      default: attr.default && !attr.default.fixed ? attr.default.value : undefined,
    })
  }

  for (const attr of directAttributes) addAttribute(attr)

  for (const group of directGroups) {
    if (group.attributes) {
      for (const attr of group.attributes) addAttribute(attr)
    }
    if (group.ref) {
      const namespaceUri = resolveNamespaceWithFallback(
        EMPTY_CONTEXT,
        group.ref.namespacePrefix,
        registry,
        fallbackNamespaceUri
      )
      const resolved = registry.resolveAttributeGroup(namespaceUri, group.ref.name)
      if (resolved?.attributes) {
        for (const attr of resolved.attributes) addAttribute(attr)
      }
    }
  }

  // complexContent extension: base 타입의 속성도 상속
  if (hasComplexContent(type.content)) {
    const derivation = type.content.content
    if (derivation.derivation === 'extension' && !derivation.base.isBuiltin) {
      const visitKey = `${derivation.base.namespacePrefix ?? ''}:${derivation.base.name}`
      if (!visitedTypes.has(visitKey)) {
        visitedTypes.add(visitKey)
        const resolved = resolveRef(derivation.base, registry, fallbackNamespaceUri)
        if (resolved && !isSimpleType(resolved.type)) {
          collectAttributes(resolved.type, registry, resolved.namespaceUri, out, visitedTypes)
        }
      }
    }
  }
}

/** compositor/particle 트리를 순회하며 허용 자식 요소를 평탄 수집 */
function collectChildren(
  particle: Particle,
  registry: SchemaRegistry,
  fallbackNamespaceUri: string,
  out: SchemaChildInfo[],
  seen: Set<string>,
  visitedGroups: Set<string>
): void {
  switch (particle.kind) {
    case 'element': {
      const name = particle.name ?? particle.ref?.name
      if (!name || seen.has(name)) return
      seen.add(name)
      let namespaceUri = fallbackNamespaceUri
      if (particle.ref?.namespacePrefix) {
        namespaceUri = resolveNamespaceWithFallback(
          EMPTY_CONTEXT,
          particle.ref.namespacePrefix,
          registry,
          fallbackNamespaceUri
        )
      }
      out.push({
        name,
        namespaceUri,
        minOccurs: particle.occurs.minOccurs,
        maxOccurs: particle.occurs.maxOccurs,
      })
      return
    }
    case 'any': {
      if (seen.has('*')) return
      seen.add('*')
      out.push({
        name: '*',
        isWildcard: true,
        minOccurs: particle.occurs.minOccurs,
        maxOccurs: particle.occurs.maxOccurs,
      })
      return
    }
    case 'sequence':
    case 'choice': {
      for (const child of particle.particles) {
        collectChildren(child, registry, fallbackNamespaceUri, out, seen, visitedGroups)
      }
      return
    }
    case 'all': {
      for (const el of particle.elements) {
        collectChildren(el, registry, fallbackNamespaceUri, out, seen, visitedGroups)
      }
      return
    }
    case 'groupRef': {
      const namespaceUri = resolveNamespaceWithFallback(
        EMPTY_CONTEXT,
        particle.ref.namespacePrefix,
        registry,
        fallbackNamespaceUri
      )
      const visitKey = `${namespaceUri}:${particle.ref.name}`
      if (visitedGroups.has(visitKey)) return
      visitedGroups.add(visitKey)
      const group = registry.resolveGroup(namespaceUri, particle.ref.name)
      if (group?.compositor) {
        collectChildren(group.compositor, registry, namespaceUri, out, seen, visitedGroups)
      }
      return
    }
  }
}

/** complexContent extension에서 base 타입의 자식 요소까지 수집 */
function collectChildrenFromComplexType(
  type: XsdComplexType,
  registry: SchemaRegistry,
  fallbackNamespaceUri: string,
  out: SchemaChildInfo[],
  seen: Set<string>,
  visitedGroups: Set<string>,
  visitedTypes: Set<string>
): 'sequence' | 'choice' | 'all' | undefined {
  let compositorKind: 'sequence' | 'choice' | 'all' | undefined

  const walkCompositorOrGroup = (
    compositor: Particle | undefined,
    groupRef: Particle | undefined
  ) => {
    if (compositor) {
      if (
        compositor.kind === 'sequence' ||
        compositor.kind === 'choice' ||
        compositor.kind === 'all'
      ) {
        compositorKind = compositorKind ?? compositor.kind
      }
      collectChildren(compositor, registry, fallbackNamespaceUri, out, seen, visitedGroups)
    }
    if (groupRef) {
      collectChildren(groupRef, registry, fallbackNamespaceUri, out, seen, visitedGroups)
    }
  }

  if (hasElementContent(type.content)) {
    walkCompositorOrGroup(type.content.compositor, type.content.groupRef)
  } else if (hasComplexContent(type.content)) {
    const derivation = type.content.content
    // extension인 경우 base 타입의 자식 요소를 먼저 수집(스키마 순서 유지)
    if (derivation.derivation === 'extension' && !derivation.base.isBuiltin) {
      const visitKey = `${derivation.base.namespacePrefix ?? ''}:${derivation.base.name}`
      if (!visitedTypes.has(visitKey)) {
        visitedTypes.add(visitKey)
        const resolved = resolveRef(derivation.base, registry, fallbackNamespaceUri)
        if (resolved && !isSimpleType(resolved.type)) {
          const baseKind = collectChildrenFromComplexType(
            resolved.type,
            registry,
            resolved.namespaceUri,
            out,
            seen,
            visitedGroups,
            visitedTypes
          )
          compositorKind = compositorKind ?? baseKind
        }
      }
    }
    walkCompositorOrGroup(derivation.compositor, derivation.groupRef)
  }

  return compositorKind
}

function notFound(namespaceUri: string, elementName: string): SchemaElementDescription {
  return {
    found: false,
    name: elementName,
    namespaceUri,
    contentKind: 'unknown',
    attributes: [],
    children: [],
  }
}

/** 단일 element 정의 + 그 element가 속한 네임스페이스로부터 설명 DTO를 만든다. */
function describeElementDef(
  schemaElement: XsdElement,
  registry: SchemaRegistry,
  namespaceUri: string,
  elementName: string
): SchemaElementDescription {
  // 요소의 타입 해석
  let type: XsdComplexType | XsdSimpleType | null = null
  let typeNamespaceUri = namespaceUri
  let typeName: string | undefined

  if (schemaElement.inlineComplexType) {
    type = schemaElement.inlineComplexType
  } else if (schemaElement.inlineSimpleType) {
    type = schemaElement.inlineSimpleType
  } else if (schemaElement.typeRef) {
    typeName = schemaElement.typeRef.name
    const resolved = resolveRef(schemaElement.typeRef, registry, namespaceUri)
    if (resolved) {
      type = resolved.type
      typeNamespaceUri = resolved.namespaceUri
    }
  }

  const curatedDoc = getElementDoc(namespaceUri, elementName)

  const description: SchemaElementDescription = {
    found: true,
    name: elementName,
    namespaceUri,
    typeName,
    contentKind: 'unknown',
    isAbstract: schemaElement.abstract,
    documentation: curatedDoc?.summary,
    specRef: curatedDoc?.specRef,
    attributes: [],
    children: [],
  }

  if (!type) {
    // 타입을 못 찾으면(예: anyType) 빈 구조로 처리
    description.contentKind = 'unknown'
    return description
  }

  if (isSimpleType(type)) {
    description.contentKind = 'simpleType'
    const { allowedValues, facets, baseType } = collectSimpleTypeConstraints(
      type,
      registry,
      typeNamespaceUri
    )
    description.allowedValues = allowedValues.length > 0 ? allowedValues : undefined
    description.facets = facets.length > 0 ? facets : undefined
    description.baseType = baseType
    return description
  }

  // complexType
  description.isAbstract = description.isAbstract || type.abstract

  // 콘텐츠 분류
  if (type.content.kind === 'empty') {
    description.contentKind = 'empty'
  } else if (hasSimpleContent(type.content)) {
    description.contentKind = 'simpleContent'
    const derivation = type.content.content
    // 텍스트 값의 허용 값 수집 (base simpleType)
    if (derivation.derivation === 'restriction' && derivation.simpleType) {
      const { allowedValues, facets } = collectSimpleTypeConstraints(
        derivation.simpleType,
        registry,
        typeNamespaceUri
      )
      description.allowedValues = allowedValues.length > 0 ? allowedValues : undefined
      description.facets = facets.length > 0 ? facets : undefined
    } else if (!derivation.base.isBuiltin) {
      const resolved = resolveRef(derivation.base, registry, typeNamespaceUri)
      if (resolved && isSimpleType(resolved.type)) {
        const { allowedValues, facets } = collectSimpleTypeConstraints(
          resolved.type,
          registry,
          resolved.namespaceUri
        )
        description.allowedValues = allowedValues.length > 0 ? allowedValues : undefined
        description.facets = facets.length > 0 ? facets : undefined
      }
    }
    description.baseType = derivation.base.name
  } else if (hasElementContent(type.content)) {
    description.contentKind = type.content.kind === 'mixed' ? 'mixed' : 'elementOnly'
  } else if (hasComplexContent(type.content)) {
    description.contentKind = type.content.mixed ? 'mixed' : 'complexContent'
    description.baseType = type.content.content.base.name
  }

  // 자식 요소 수집
  const children: SchemaChildInfo[] = []
  const compositor = collectChildrenFromComplexType(
    type,
    registry,
    typeNamespaceUri,
    children,
    new Set<string>(),
    new Set<string>(),
    new Set<string>()
  )
  description.children = children
  description.compositor = compositor

  // 속성 수집 + 큐레이션된 속성 설명 병합
  const attributes = new Map<string, SchemaAttributeInfo>()
  collectAttributes(type, registry, typeNamespaceUri, attributes, new Set<string>())
  description.attributes = [...attributes.values()].map((attr) => {
    const attrDoc = curatedDoc?.attributes?.[attr.name]
    return attrDoc ? { ...attr, description: attrDoc } : attr
  })

  return description
}

/**
 * 주어진 네임스페이스 + 요소명을 (전역 element로) 스키마에서 해석해 구조 정보를 반환한다.
 * 해당 요소가 전역 element로 없으면 `found: false`.
 * 대부분의 OOXML 요소는 지역(local) element이므로 일반적으로는
 * {@link describeSchemaElementByPath}를 사용한다.
 */
export function describeSchemaElement(
  registry: SchemaRegistry,
  namespaceUri: string,
  elementName: string
): SchemaElementDescription {
  const schemaElement = registry.resolveElement(namespaceUri, elementName)
  if (!schemaElement) {
    return notFound(namespaceUri, elementName)
  }
  return describeElementDef(schemaElement, registry, namespaceUri, elementName)
}

interface ResolvedElement {
  element: XsdElement
  namespaceUri: string
}

/** particle 트리에서 주어진 로컬명과 일치하는 자식 element 정의를 찾는다. */
function matchChildInParticle(
  particle: Particle,
  registry: SchemaRegistry,
  fallbackNamespaceUri: string,
  targetLocalName: string,
  visitedGroups: Set<string>
): ResolvedElement | null {
  switch (particle.kind) {
    case 'element': {
      const name = particle.name ?? particle.ref?.name
      if (name !== targetLocalName) return null
      if (particle.ref) {
        const namespaceUri = resolveNamespaceWithFallback(
          EMPTY_CONTEXT,
          particle.ref.namespacePrefix,
          registry,
          fallbackNamespaceUri
        )
        const resolved = registry.resolveElement(namespaceUri, particle.ref.name)
        if (resolved) return { element: resolved, namespaceUri }
        return null
      }
      return { element: particle, namespaceUri: fallbackNamespaceUri }
    }
    case 'sequence':
    case 'choice': {
      for (const child of particle.particles) {
        const match = matchChildInParticle(
          child,
          registry,
          fallbackNamespaceUri,
          targetLocalName,
          visitedGroups
        )
        if (match) return match
      }
      return null
    }
    case 'all': {
      for (const el of particle.elements) {
        const match = matchChildInParticle(
          el,
          registry,
          fallbackNamespaceUri,
          targetLocalName,
          visitedGroups
        )
        if (match) return match
      }
      return null
    }
    case 'groupRef': {
      const namespaceUri = resolveNamespaceWithFallback(
        EMPTY_CONTEXT,
        particle.ref.namespacePrefix,
        registry,
        fallbackNamespaceUri
      )
      const visitKey = `${namespaceUri}:${particle.ref.name}`
      if (visitedGroups.has(visitKey)) return null
      visitedGroups.add(visitKey)
      const group = registry.resolveGroup(namespaceUri, particle.ref.name)
      if (group?.compositor) {
        return matchChildInParticle(
          group.compositor,
          registry,
          namespaceUri,
          targetLocalName,
          visitedGroups
        )
      }
      return null
    }
    default:
      return null
  }
}

/** complexType의 콘텐츠 모델(상속 base 포함)에서 자식 element 정의를 찾는다. */
function findChildElementDef(
  type: XsdComplexType,
  registry: SchemaRegistry,
  ownerNamespaceUri: string,
  targetLocalName: string,
  visitedTypes: Set<string>
): ResolvedElement | null {
  const visitedGroups = new Set<string>()

  if (hasElementContent(type.content)) {
    if (type.content.compositor) {
      const match = matchChildInParticle(
        type.content.compositor,
        registry,
        ownerNamespaceUri,
        targetLocalName,
        visitedGroups
      )
      if (match) return match
    }
    if (type.content.groupRef) {
      const match = matchChildInParticle(
        type.content.groupRef,
        registry,
        ownerNamespaceUri,
        targetLocalName,
        visitedGroups
      )
      if (match) return match
    }
  } else if (hasComplexContent(type.content)) {
    const derivation = type.content.content
    if (derivation.compositor) {
      const match = matchChildInParticle(
        derivation.compositor,
        registry,
        ownerNamespaceUri,
        targetLocalName,
        visitedGroups
      )
      if (match) return match
    }
    if (derivation.groupRef) {
      const match = matchChildInParticle(
        derivation.groupRef,
        registry,
        ownerNamespaceUri,
        targetLocalName,
        visitedGroups
      )
      if (match) return match
    }
    if (derivation.derivation === 'extension' && !derivation.base.isBuiltin) {
      const visitKey = `${derivation.base.namespacePrefix ?? ''}:${derivation.base.name}`
      if (!visitedTypes.has(visitKey)) {
        visitedTypes.add(visitKey)
        const resolved = resolveRef(derivation.base, registry, ownerNamespaceUri)
        if (resolved && !isSimpleType(resolved.type)) {
          return findChildElementDef(
            resolved.type,
            registry,
            resolved.namespaceUri,
            targetLocalName,
            visitedTypes
          )
        }
      }
    }
  }

  return null
}

/** 경로 한 단계 */
export interface SchemaPathStep {
  namespaceUri: string
  localName: string
}

/**
 * 루트(전역 element)부터 대상 요소까지의 경로를 따라가며 지역(local) element를 해석한다.
 * `path[0]`은 전역 element여야 하며, 이후 각 단계는 부모 타입의 콘텐츠 모델에서 찾는다.
 * 경로 중 해석 실패 시 `found: false`.
 */
export function describeSchemaElementByPath(
  registry: SchemaRegistry,
  path: SchemaPathStep[]
): SchemaElementDescription {
  if (path.length === 0) {
    return notFound('', '')
  }

  const root = path[0]!
  let currentDef = registry.resolveElement(root.namespaceUri, root.localName)
  let currentNamespaceUri = root.namespaceUri

  if (!currentDef) {
    const last = path[path.length - 1]!
    return notFound(last.namespaceUri, last.localName)
  }

  for (let i = 1; i < path.length; i++) {
    const step = path[i]!
    const type = resolveElementType(currentDef, registry, currentNamespaceUri)
    if (!type || isSimpleType(type.type)) {
      return notFound(step.namespaceUri, step.localName)
    }
    const child = findChildElementDef(
      type.type,
      registry,
      type.namespaceUri,
      step.localName,
      new Set<string>()
    )
    if (!child) {
      return notFound(step.namespaceUri, step.localName)
    }
    currentDef = child.element
    currentNamespaceUri = child.namespaceUri
  }

  const target = path[path.length - 1]!
  return describeElementDef(currentDef, registry, currentNamespaceUri, target.localName)
}

/** element 정의의 타입과 그 네임스페이스를 해석 (describeElementDef와 동일 규칙) */
function resolveElementType(
  schemaElement: XsdElement,
  registry: SchemaRegistry,
  namespaceUri: string
): { type: XsdComplexType | XsdSimpleType; namespaceUri: string } | null {
  if (schemaElement.inlineComplexType) {
    return { type: schemaElement.inlineComplexType, namespaceUri }
  }
  if (schemaElement.inlineSimpleType) {
    return { type: schemaElement.inlineSimpleType, namespaceUri }
  }
  if (schemaElement.typeRef) {
    const resolved = resolveRef(schemaElement.typeRef, registry, namespaceUri)
    if (resolved) return resolved
  }
  return null
}
