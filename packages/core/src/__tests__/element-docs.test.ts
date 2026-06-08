import { describe, expect, it } from 'vitest'
import { getElementDoc, getAttributeDoc } from '../schema/element-docs'
import { loadSchemaRegistry } from '../schema/schema-loader'
import { describeSchemaElementByPath, type SchemaPathStep } from '../schema/element-describer'

const WML_STRICT = 'http://purl.oclc.org/ooxml/wordprocessingml/main'
const WML_TRANSITIONAL = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const CHART_STRICT = 'http://purl.oclc.org/ooxml/drawingml/chart'
const CHART_TRANSITIONAL = 'http://schemas.openxmlformats.org/drawingml/2006/chart'

function step(localName: string): SchemaPathStep {
  return { namespaceUri: WML_TRANSITIONAL, localName }
}

function chartStep(localName: string): SchemaPathStep {
  return { namespaceUri: CHART_STRICT, localName }
}

describe('element-docs (curated dictionary)', () => {
  it('strict 네임스페이스로 요소 설명을 조회한다', () => {
    const doc = getElementDoc(WML_STRICT, 'p')
    expect(doc?.summary).toContain('문단')
  })

  it('transitional 네임스페이스도 정규화해 같은 설명을 반환한다', () => {
    const doc = getElementDoc(WML_TRANSITIONAL, 'p')
    expect(doc?.summary).toContain('문단')
  })

  it('속성 설명을 조회한다', () => {
    expect(getAttributeDoc(WML_TRANSITIONAL, 'jc', 'val')).toBeTruthy()
  })

  it('없는 요소는 undefined', () => {
    expect(getElementDoc(WML_TRANSITIONAL, 'definitelyNotReal')).toBeUndefined()
  })

  it('차트 요소 설명을 strict 네임스페이스로 조회한다', () => {
    expect(getElementDoc(CHART_STRICT, 'chartSpace')?.summary).toContain('루트')
    expect(getElementDoc(CHART_STRICT, 'plotArea')?.summary).toContain('그림 영역')
  })

  it('차트 transitional 네임스페이스도 정규화해 같은 설명을 반환한다', () => {
    expect(getElementDoc(CHART_TRANSITIONAL, 'barChart')?.summary).toContain('막대')
  })

  it('차트 속성 설명을 조회한다', () => {
    expect(getAttributeDoc(CHART_TRANSITIONAL, 'barDir', 'val')).toBeTruthy()
  })
})

describe('describeSchemaElementByPath + 큐레이션 설명 병합', () => {
  const registry = loadSchemaRegistry('document')

  it('해석된 요소에 documentation이 채워진다', () => {
    const result = describeSchemaElementByPath(registry, [
      step('document'),
      step('body'),
      step('p'),
    ])
    expect(result.found).toBe(true)
    expect(result.documentation).toContain('문단')
    expect(result.specRef).toBeTruthy()
  })

  it('해석된 속성에 description이 채워진다', () => {
    const result = describeSchemaElementByPath(registry, [
      step('document'),
      step('body'),
      step('p'),
      step('pPr'),
      step('jc'),
    ])
    expect(result.found).toBe(true)
    const valAttr = result.attributes.find((attr) => attr.name === 'val')
    expect(valAttr?.description).toBeTruthy()
  })

  it('차트 요소(plotArea)에 documentation이 채워진다', () => {
    const result = describeSchemaElementByPath(registry, [
      chartStep('chartSpace'),
      chartStep('chart'),
      chartStep('plotArea'),
    ])
    expect(result.found).toBe(true)
    expect(result.documentation).toContain('그림 영역')
    expect(result.specRef).toBeTruthy()
  })
})
