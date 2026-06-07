import { describe, expect, it } from 'vitest'
import { formatXml } from './formatXml'

describe('formatXml', () => {
  it('컨테이너 요소를 들여쓰기하고 인라인 텍스트 요소는 한 줄로 유지한다', () => {
    const input = '<root><child>text</child></root>'
    expect(formatXml(input)).toBe(['<root>', '  <child>text</child>', '</root>'].join('\n'))
  })

  it('self-closing 태그는 들여쓰기를 증가시키지 않는다', () => {
    const input = '<root><a/><b/></root>'
    expect(formatXml(input)).toBe(['<root>', '  <a/>', '  <b/>', '</root>'].join('\n'))
  })

  describe('데이터 무결성: xml:space="preserve" 보호 (C1)', () => {
    it('xml:space="preserve"가 있으면 공백-only 텍스트 런을 손상시키지 않고 원본을 그대로 반환한다', () => {
      const input = '<w:p><w:r><w:t xml:space="preserve">   </w:t></w:r></w:p>'
      // 재포맷하면 공백-only 콘텐츠가 collapse되어 손상되므로, 원본을 그대로 보존해야 한다.
      expect(formatXml(input)).toBe(input)
    })

    it("작은따옴표 xml:space='preserve'도 보호한다", () => {
      const input = "<a><t xml:space='preserve'> </t></a>"
      expect(formatXml(input)).toBe(input)
    })

    it('preserve가 없으면 기존 포맷 동작을 유지한다', () => {
      const input = '<root><child>text</child></root>'
      expect(formatXml(input)).toContain('\n')
    })
  })

  it('잘못된 입력에서도 예외 없이 입력을 반환한다', () => {
    const broken = '<<<not really xml'
    expect(() => formatXml(broken)).not.toThrow()
  })
})
