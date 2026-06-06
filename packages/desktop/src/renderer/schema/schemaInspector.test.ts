import { describe, expect, it } from 'vitest'
import { findAttributeByName, type SchemaAttributeInfo } from './schemaInspector'

const attrs: SchemaAttributeInfo[] = [
  { name: 'val', use: 'optional', description: '정렬 방식' },
  { name: 'r:id', use: 'optional', description: '관계 ID' },
]

describe('findAttributeByName', () => {
  it('prefix가 붙은 커서 토큰(w:val)을 local name(val)으로 매칭한다', () => {
    expect(findAttributeByName(attrs, 'w:val')?.name).toBe('val')
  })

  it('prefix 없는 이름도 그대로 매칭한다', () => {
    expect(findAttributeByName(attrs, 'val')?.name).toBe('val')
  })

  it('exact 일치(prefix:name 키)를 우선한다', () => {
    expect(findAttributeByName(attrs, 'r:id')?.name).toBe('r:id')
  })

  it('없는 속성/undefined는 undefined', () => {
    expect(findAttributeByName(attrs, 'w:nope')).toBeUndefined()
    expect(findAttributeByName(attrs, undefined)).toBeUndefined()
  })
})
