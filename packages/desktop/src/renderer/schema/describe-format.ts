/**
 * SchemaElementDescription을 Monaco hover용 마크다운으로 변환한다.
 *
 * 가독성 원칙: 제목(요소/속성명) → 설명 → 메타 → 구분선 → 칩 목록 순.
 * 값·요소명은 백틱 코드 칩으로 감싸고 공백으로 구분해 시각적으로 분리한다.
 */
import type { SchemaElementDescription } from './schemaInspector'

const CONTENT_KIND_LABEL: Record<SchemaElementDescription['contentKind'], string> = {
  empty: '빈 요소',
  elementOnly: '자식 요소만 포함',
  mixed: '자식 요소 + 텍스트 혼합',
  simpleContent: '텍스트 값 (속성 가능)',
  complexContent: '복합 콘텐츠',
  simpleType: '단순 값',
  unknown: '구조 정보 없음',
}

/** 항목들을 코드 칩(백틱)으로 감싸 공백 구분, 한도 초과 시 "+N" 표기 */
function chips(items: string[], limit: number): string {
  const shown = items.slice(0, limit).map((v) => `\`${v}\``)
  const rest = items.length - limit
  return rest > 0 ? `${shown.join(' ')} _+${rest}_` : shown.join(' ')
}

/**
 * 호버 마크다운 문자열 배열. 표시할 정보가 없으면 빈 배열.
 * Monaco hover는 섹션(블록)을 배열 항목으로 구분해 렌더링한다.
 */
export function formatSchemaHoverMarkdown(
  description: SchemaElementDescription,
  attributeName?: string
): string[] {
  if (!description.found) return []

  // 속성에 호버한 경우: 해당 속성 정보를 우선 표시
  if (attributeName) {
    const attr = description.attributes.find((candidate) => candidate.name === attributeName)
    if (attr) {
      const head: string[] = [`### \`@${attr.name}\``]
      if (attr.description) head.push(attr.description)
      const meta = [`\`${attr.use === 'required' ? '필수 속성' : '선택 속성'}\``]
      if (attr.typeName) meta.push(`타입 \`${attr.typeName}\``)
      head.push(meta.join(' · '))

      const tail: string[] = []
      if (attr.allowedValues && attr.allowedValues.length > 0) {
        tail.push(`**허용 값**\n\n${chips(attr.allowedValues, 16)}`)
      }
      if (attr.fixed) tail.push(`**고정 값** \`${attr.fixed}\``)
      else if (attr.default) tail.push(`**기본값** \`${attr.default}\``)

      const sections = [head.join('\n\n')]
      if (tail.length > 0) sections.push(tail.join('\n\n'))
      return sections
    }
  }

  // 요소에 호버한 경우
  const head: string[] = [`### \`<${description.name}>\``]
  if (description.documentation) head.push(description.documentation)
  const meta = [`\`${CONTENT_KIND_LABEL[description.contentKind]}\``]
  if (description.typeName) meta.push(`타입 \`${description.typeName}\``)
  head.push(meta.join(' · '))

  const tail: string[] = []

  if (description.allowedValues && description.allowedValues.length > 0) {
    tail.push(`**허용 값**\n\n${chips(description.allowedValues, 16)}`)
  }

  if (description.attributes.length > 0) {
    const required = description.attributes.filter((a) => a.use === 'required').map((a) => a.name)
    const optional = description.attributes.filter((a) => a.use !== 'required').map((a) => a.name)
    const parts: string[] = []
    if (required.length > 0) parts.push(`필수 ${chips(required, 10)}`)
    if (optional.length > 0) parts.push(`선택 ${chips(optional, 10)}`)
    tail.push(`**속성**\n\n${parts.join('\n\n')}`)
  }

  if (description.children.length > 0) {
    const names = description.children.map((c) => (c.isWildcard ? '(any)' : c.name))
    tail.push(`**자식 요소**\n\n${chips(names, 16)}`)
  }

  // head(제목+설명+메타)와 tail(목록)을 별도 섹션으로 → Monaco가 구분선으로 분리
  const sections = [head.join('\n\n')]
  if (tail.length > 0) sections.push(tail.join('\n\n'))
  return sections
}
