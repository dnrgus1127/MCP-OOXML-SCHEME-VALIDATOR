import { describe, expect, it } from 'vitest'
import { validateXmlEvents, type XmlValidationEvent } from '../mcp'
import { loadSchemaRegistry } from '../schema/schema-loader'
import type { XmlAttribute, XmlElementInfo } from '../runtime'

const SML = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const LOEXT = 'http://schemas.libreoffice.org/'

function attrs(values: Record<string, string>): XmlAttribute[] {
  return Object.entries(values).map(([name, value]) => ({
    name,
    localName: name.includes(':') ? (name.split(':')[1] as string) : name,
    value,
  }))
}

function el(
  name: string,
  localName: string,
  namespaceUri: string,
  attributes: XmlAttribute[] = [],
  namespaceDeclarations?: Map<string, string>
): XmlElementInfo {
  return { name, localName, namespaceUri, attributes, namespaceDeclarations }
}

function validateSpreadsheet(events: XmlValidationEvent[]) {
  const registry = loadSchemaRegistry('spreadsheet')
  return validateXmlEvents(registry, events, {
    allowWhitespace: true,
    maxErrors: 100,
    includeWarnings: true,
  })
}

describe('extLst 검증 제외 (lax 와일드카드 확장 영역)', () => {
  // workbook > sheets > sheet, 그리고 extLst > ext > loext:extCalcPr
  function buildWorkbookEvents(): XmlValidationEvent[] {
    const workbook = el(
      'workbook',
      'workbook',
      SML,
      [],
      new Map([
        ['', SML],
        ['r', R],
      ])
    )
    const sheets = el('sheets', 'sheets', SML)
    const sheet = el('sheet', 'sheet', SML, attrs({ name: 'Sheet1', sheetId: '1', 'r:id': 'rId3' }))
    const extLst = el('extLst', 'extLst', SML)
    const ext = el(
      'ext',
      'ext',
      SML,
      attrs({ uri: '{7626C862-2A13-11E5-B345-FEFF819CDC9F}' }),
      new Map([['loext', LOEXT]])
    )
    const loextChild = el(
      'loext:extCalcPr',
      'extCalcPr',
      LOEXT,
      attrs({ stringRefSyntax: 'ExcelA1' })
    )

    return [
      { type: 'startDocument' },
      { type: 'startElement', element: workbook },
      { type: 'startElement', element: sheets },
      { type: 'startElement', element: sheet },
      { type: 'endElement', element: sheet },
      { type: 'endElement', element: sheets },
      { type: 'startElement', element: extLst },
      { type: 'startElement', element: ext },
      { type: 'startElement', element: loextChild },
      { type: 'endElement', element: loextChild },
      { type: 'endElement', element: ext },
      { type: 'endElement', element: extLst },
      { type: 'endElement', element: workbook },
      { type: 'endDocument' },
    ]
  }

  it("extLst 내부 lax 와일드카드 콘텐츠에 대해 'any' 필수 누락 오탐을 내지 않는다", () => {
    const result = validateSpreadsheet(buildWorkbookEvents())

    const missingRequired = result.errors.filter((e) => e.code === 'MISSING_REQUIRED_ELEMENT')
    expect(missingRequired).toEqual([])
  })

  it('extLst 하위의 미지 네임스페이스 콘텐츠에 UNKNOWN_NAMESPACE 경고를 내지 않는다', () => {
    const result = validateSpreadsheet(buildWorkbookEvents())

    const unknownNs = (result.warnings ?? []).filter((w) => w.code === 'UNKNOWN_NAMESPACE')
    expect(unknownNs).toEqual([])
  })

  it('extLst 자체는 부모 content model에서 유효 요소로 수용된다(INVALID_ELEMENT 없음)', () => {
    const result = validateSpreadsheet(buildWorkbookEvents())

    const invalidExtLst = result.errors.filter(
      (e) => e.code === 'INVALID_ELEMENT' && e.path.includes('extLst')
    )
    expect(invalidExtLst).toEqual([])
  })
})
