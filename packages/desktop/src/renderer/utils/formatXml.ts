/**
 * XML을 들여쓰기로 정렬한다.
 *
 * 데이터 무결성 주의(C1): 이 포매터는 태그 사이의 공백-only 텍스트를 제거한다.
 * `xml:space="preserve"`가 선언된 문서는 공백 자체가 유의미하므로(예: OOXML의
 * `<w:t xml:space="preserve">   </w:t>` 공백 런) 재포맷하면 콘텐츠가 손상된다.
 * 따라서 preserve가 발견되면 재포맷하지 않고 원본을 그대로 반환한다.
 */
const PRESERVE_SPACE_PATTERN = /xml:space\s*=\s*["']preserve["']/

export function formatXml(xml: string): string {
  // 비파괴 보장: 유의미한 공백을 가진 문서는 건드리지 않는다.
  if (PRESERVE_SPACE_PATTERN.test(xml)) {
    return xml
  }

  try {
    const formatted = xml
      // Remove existing whitespace between tags
      .replace(/>\s+</g, '><')
      // Add newlines
      .replace(/></g, '>\n<')

    // Indent
    const lines = formatted.split('\n')
    let indent = 0
    const indentedLines = lines.map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return ''

      const isClosingTag = trimmed.startsWith('</')
      const isOpeningTag =
        trimmed.startsWith('<') &&
        !isClosingTag &&
        !trimmed.startsWith('<?') &&
        !trimmed.startsWith('<!')
      const isSelfClosingTag = trimmed.endsWith('/>')
      const isInlineTag = isOpeningTag && trimmed.includes('</')

      // Decrease indent for closing tags
      if (isClosingTag) {
        indent = Math.max(0, indent - 1)
      }

      const indentedLine = '  '.repeat(indent) + trimmed

      // Increase indent only for true container opening tags.
      // Inline tags like <AppVersion>1.0</AppVersion> should stay on the same level.
      if (isOpeningTag && !isSelfClosingTag && !isInlineTag) {
        indent++
      }

      return indentedLine
    })

    return indentedLines.join('\n')
  } catch {
    return xml
  }
}
