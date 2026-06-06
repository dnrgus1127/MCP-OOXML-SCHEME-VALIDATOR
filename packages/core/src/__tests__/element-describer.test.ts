import { describe, expect, it } from 'vitest'
import { loadSchemaRegistry } from '../schema/schema-loader'
import {
  describeSchemaElement,
  describeSchemaElementByPath,
  type SchemaPathStep,
} from '../schema/element-describer'

const WML_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

function step(localName: string): SchemaPathStep {
  return { namespaceUri: WML_NS, localName }
}

describe('describeSchemaElement (global)', () => {
  const registry = loadSchemaRegistry('document')

  it('루트 요소(document)를 해석하고 자식 요소를 수집한다', () => {
    const result = describeSchemaElement(registry, WML_NS, 'document')
    expect(result.found).toBe(true)
    expect(result.children.map((child) => child.name)).toContain('body')
    expect(['elementOnly', 'complexContent', 'mixed']).toContain(result.contentKind)
  })

  it('각 자식 요소는 occurs 정보를 포함한다', () => {
    const result = describeSchemaElement(registry, WML_NS, 'document')
    for (const child of result.children) {
      expect(typeof child.minOccurs).toBe('number')
      expect(child.maxOccurs === 'unbounded' || typeof child.maxOccurs === 'number').toBe(true)
    }
  })

  it('전역 element가 아니면 found=false', () => {
    // p는 지역(local) element이므로 전역 조회로는 찾지 못한다
    const result = describeSchemaElement(registry, WML_NS, 'p')
    expect(result.found).toBe(false)
  })

  it('알 수 없는 네임스페이스도 found=false로 안전하게 처리한다', () => {
    const result = describeSchemaElement(registry, 'http://example.com/unknown', 'foo')
    expect(result.found).toBe(false)
  })
})

describe('describeSchemaElementByPath (local)', () => {
  const registry = loadSchemaRegistry('document')

  it('경로를 따라 지역 요소(document > body > p)를 해석한다', () => {
    const result = describeSchemaElementByPath(registry, [
      step('document'),
      step('body'),
      step('p'),
    ])
    expect(result.found).toBe(true)
    expect(result.name).toBe('p')
    expect(result.children.length + result.attributes.length).toBeGreaterThan(0)
  })

  it('경로 중간이 끊기면 found=false', () => {
    const result = describeSchemaElementByPath(registry, [step('document'), step('notAChild')])
    expect(result.found).toBe(false)
  })

  it('enumeration 제약을 가진 속성의 허용 값을 수집한다', () => {
    // document > body > p > pPr > jc 의 val 속성은 ST_Jc enumeration 타입
    const result = describeSchemaElementByPath(registry, [
      step('document'),
      step('body'),
      step('p'),
      step('pPr'),
      step('jc'),
    ])
    expect(result.found).toBe(true)
    const valAttr = result.attributes.find((attr) => attr.name === 'val' || attr.name === 'w:val')
    expect(valAttr).toBeDefined()
    expect(valAttr?.allowedValues && valAttr.allowedValues.length).toBeGreaterThan(0)
  })

  it('빈 경로는 found=false', () => {
    const result = describeSchemaElementByPath(registry, [])
    expect(result.found).toBe(false)
  })
})
