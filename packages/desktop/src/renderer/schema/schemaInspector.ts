/**
 * Schema Inspector Service (renderer)
 *
 * 커서 컨텍스트(루트→대상 요소 경로)를 받아 메인 프로세스의
 * `ooxml:resolveSchemaElement` IPC로 스키마 구조 정보를 조회한다.
 * 동일 키 요청은 캐시해 커서 이동/호버마다 중복 IPC를 막는다.
 */

export interface SchemaFacetInfo {
  type: string
  value: string
}

export interface SchemaAttributeInfo {
  name: string
  use: 'required' | 'optional' | 'prohibited'
  typeName?: string
  allowedValues?: string[]
  fixed?: string
  default?: string
  description?: string
}

export interface SchemaChildInfo {
  name: string
  namespaceUri?: string
  minOccurs: number
  maxOccurs: number | 'unbounded'
  isWildcard?: boolean
}

export type SchemaContentKind =
  | 'empty'
  | 'elementOnly'
  | 'mixed'
  | 'simpleContent'
  | 'complexContent'
  | 'simpleType'
  | 'unknown'

export interface SchemaElementDescription {
  found: boolean
  name: string
  namespaceUri: string
  typeName?: string
  contentKind: SchemaContentKind
  documentation?: string
  specRef?: string
  isAbstract?: boolean
  compositor?: 'sequence' | 'choice' | 'all'
  attributes: SchemaAttributeInfo[]
  children: SchemaChildInfo[]
  allowedValues?: string[]
  facets?: SchemaFacetInfo[]
  baseType?: string
}

export interface SchemaPathStep {
  namespaceUri: string
  localName: string
}

const cache = new Map<string, Promise<SchemaElementDescription | null>>()

function cacheKey(documentType: string, path: SchemaPathStep[]): string {
  const encoded = path.map((step) => `${step.namespaceUri}#${step.localName}`).join('/')
  return `${documentType} ${encoded}`
}

/**
 * 루트→대상 경로를 따라 스키마 요소 정보를 조회한다. 조회 불가/오류 시 null.
 */
export function lookupSchemaElementByPath(
  documentType: string,
  path: SchemaPathStep[]
): Promise<SchemaElementDescription | null> {
  if (typeof window === 'undefined' || !window.electronAPI?.resolveSchemaElement) {
    return Promise.resolve(null)
  }
  if (path.length === 0) return Promise.resolve(null)

  const key = cacheKey(documentType, path)
  const existing = cache.get(key)
  if (existing) return existing

  const promise = window.electronAPI
    .resolveSchemaElement({ documentType, path })
    .then((result) => {
      if (!result.success || !result.data) return null
      return result.data as SchemaElementDescription
    })
    .catch(() => null)

  cache.set(key, promise)
  return promise
}

/** 테스트/문서 전환 시 캐시 초기화 */
export function clearSchemaLookupCache(): void {
  cache.clear()
}

function localPart(name: string): string {
  const colon = name.indexOf(':')
  return colon >= 0 ? name.slice(colon + 1) : name
}

/**
 * 커서가 가리키는 속성명으로 스키마 속성을 찾는다.
 * 커서 토큰은 prefix가 붙은 raw 형태(예: `w:val`)이지만, 스키마 속성은 보통
 * local name(`val`)으로 키잡혀 있으므로 exact 일치를 먼저, 이어서 local name으로 매칭한다.
 * (ref로 `prefix:name` 키인 속성은 exact 일치가 우선되어 깨지지 않는다.)
 */
export function findAttributeByName(
  attributes: SchemaAttributeInfo[],
  attributeName: string | undefined
): SchemaAttributeInfo | undefined {
  if (!attributeName) return undefined
  const exact = attributes.find((attr) => attr.name === attributeName)
  if (exact) return exact
  const target = localPart(attributeName)
  return attributes.find((attr) => localPart(attr.name) === target)
}
