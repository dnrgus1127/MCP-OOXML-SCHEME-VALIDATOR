/**
 * SchemaElementDescription을 Monaco hover용 마크다운으로 변환한다.
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

function truncateList(items: string[], limit: number): string {
  if (items.length <= limit) return items.join(', ')
  return `${items.slice(0, limit).join(', ')} … (+${items.length - limit})`
}

/**
 * 호버 마크다운 문자열 배열. 표시할 정보가 없으면 빈 배열.
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
      const lines = [`**\`@${attr.name}\`** — ${attr.use === 'required' ? '필수' : '선택'} 속성`]
      if (attr.typeName) lines.push(`타입: \`${attr.typeName}\``)
      if (attr.allowedValues && attr.allowedValues.length > 0) {
        lines.push(
          `허용 값: ${truncateList(
            attr.allowedValues.map((v) => `\`${v}\``),
            12
          )}`
        )
      }
      if (attr.fixed) lines.push(`고정 값: \`${attr.fixed}\``)
      else if (attr.default) lines.push(`기본값: \`${attr.default}\``)
      return [lines.join('\n\n')]
    }
  }

  const lines = [`**\`<${description.name}>\`**`]
  const meta: string[] = [CONTENT_KIND_LABEL[description.contentKind]]
  if (description.typeName) meta.push(`타입 \`${description.typeName}\``)
  lines.push(meta.join(' · '))

  if (description.documentation) {
    lines.push(description.documentation)
  }

  if (description.allowedValues && description.allowedValues.length > 0) {
    lines.push(
      `**허용 값**: ${truncateList(
        description.allowedValues.map((v) => `\`${v}\``),
        12
      )}`
    )
  }

  if (description.attributes.length > 0) {
    const required = description.attributes
      .filter((a) => a.use === 'required')
      .map((a) => `\`${a.name}\``)
    const optional = description.attributes
      .filter((a) => a.use !== 'required')
      .map((a) => `\`${a.name}\``)
    const parts: string[] = []
    if (required.length > 0) parts.push(`필수 ${truncateList(required, 8)}`)
    if (optional.length > 0) parts.push(`선택 ${truncateList(optional, 8)}`)
    lines.push(`**속성**: ${parts.join(' · ')}`)
  }

  if (description.children.length > 0) {
    const names = description.children.map((c) => (c.isWildcard ? '(any)' : `\`${c.name}\``))
    lines.push(`**자식 요소**: ${truncateList(names, 12)}`)
  }

  return [lines.join('\n\n')]
}
