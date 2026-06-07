import { describe, expect, it } from 'vitest'
import { explainValidationCode } from './validation-error-explainer'

describe('explainValidationCode', () => {
  it('알려진 코드에 한국어 제목과 다음 행동을 제공한다', () => {
    const explanation = explainValidationCode('MISSING_REQUIRED_ELEMENT')
    expect(explanation.title).toBe('필수 요소 누락')
    expect(explanation.action.length).toBeGreaterThan(0)
  })

  it('XML 파싱 오류(데스크톱 합성 코드)도 안내한다', () => {
    const explanation = explainValidationCode('XML_PARSE_ERROR')
    expect(explanation.title).toContain('구문')
    expect(explanation.action.length).toBeGreaterThan(0)
  })

  it('알 수 없는 코드는 코드 자체를 제목으로 두고 다음 행동은 비운다', () => {
    const explanation = explainValidationCode('SOME_FUTURE_CODE')
    expect(explanation.title).toBe('SOME_FUTURE_CODE')
    expect(explanation.action).toBe('')
  })
})
