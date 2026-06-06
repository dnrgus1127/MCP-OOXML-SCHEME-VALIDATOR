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
