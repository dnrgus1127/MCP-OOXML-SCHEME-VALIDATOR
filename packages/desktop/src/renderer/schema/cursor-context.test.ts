import { describe, expect, it } from 'vitest'
import { collectXmlnsBindings, resolveCursorContext, resolveNamespaceUri } from './cursor-context'

const DOC = `<?xml version="1.0"?>
<w:document xmlns:w="http://ns/w" xmlns:r="http://ns/r" xmlns="http://ns/default">
  <w:body>
    <w:p w:rsidR="00AB12">
      <w:r>
        <w:t>Hello</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`

function offsetOf(text: string, marker: string, within?: string): number {
  if (within) {
    const base = text.indexOf(within)
    return base + within.indexOf(marker)
  }
  return text.indexOf(marker)
}

describe('collectXmlnsBindings', () => {
  it('prefix와 기본 네임스페이스 선언을 모두 수집한다', () => {
    const bindings = collectXmlnsBindings(DOC)
    expect(bindings.get('w')).toBe('http://ns/w')
    expect(bindings.get('r')).toBe('http://ns/r')
    expect(bindings.get('')).toBe('http://ns/default')
  })
})

describe('resolveCursorContext', () => {
  it('여는 태그 이름 위의 커서는 그 요소를 가리킨다', () => {
    const offset = offsetOf(DOC, 't>', '<w:t>') // '<w:│t>' 근처
    const context = resolveCursorContext(DOC, offset)
    expect(context).not.toBeNull()
    expect(context?.rawName).toBe('w:t')
    expect(context?.prefix).toBe('w')
    expect(context?.localName).toBe('t')
    expect(context?.attributeName).toBeUndefined()
  })

  it('텍스트 콘텐츠 위의 커서는 감싸는 요소를 가리킨다', () => {
    const offset = DOC.indexOf('Hello') + 2
    const context = resolveCursorContext(DOC, offset)
    expect(context?.rawName).toBe('w:t')
    expect(context?.ancestors).toContain('w:r')
    expect(context?.ancestors).toContain('w:p')
    expect(context?.ancestors).toContain('w:body')
  })

  it('속성 이름 위의 커서는 attributeName을 채운다', () => {
    const offset = DOC.indexOf('w:rsidR') + 3
    const context = resolveCursorContext(DOC, offset)
    expect(context?.rawName).toBe('w:p')
    expect(context?.attributeName).toBe('w:rsidR')
  })

  it('속성 값 내부 커서는 attributeName을 채우지 않는다', () => {
    const offset = DOC.indexOf('00AB12') + 2
    const context = resolveCursorContext(DOC, offset)
    expect(context?.rawName).toBe('w:p')
    expect(context?.attributeName).toBeUndefined()
  })

  it('루트 밖(빈 위치)은 null', () => {
    const context = resolveCursorContext('   ', 1)
    expect(context).toBeNull()
  })
})

describe('resolveNamespaceUri', () => {
  it('컨텍스트 prefix를 네임스페이스 URI로 해석한다', () => {
    const bindings = collectXmlnsBindings(DOC)
    const offset = DOC.indexOf('Hello') + 1
    const context = resolveCursorContext(DOC, offset)
    expect(context).not.toBeNull()
    expect(resolveNamespaceUri(context!, bindings)).toBe('http://ns/w')
  })

  it('매핑이 없으면 null', () => {
    const bindings = new Map<string, string>()
    expect(
      resolveNamespaceUri({ prefix: 'x', localName: 'a', rawName: 'x:a', ancestors: [] }, bindings)
    ).toBeNull()
  })
})
