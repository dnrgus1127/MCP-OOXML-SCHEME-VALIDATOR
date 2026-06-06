/**
 * Cursor Context Resolver
 *
 * Monaco 에디터의 커서/호버 위치(offset)와 XML 텍스트로부터 "지금 이 위치가
 * 스키마상 어떤 요소/속성인지"를 판별하는 순수 함수 모음.
 *
 * 정식 XML 파서가 아니라 경량 스캐너다. OOXML 파트는 루트에서 모든 네임스페이스를
 * 선언하므로 prefix→namespace 매핑은 문서 전체에서 수집해도 충분히 정확하다.
 * 알려진 한계: 속성 값에 '>'가 포함되면 태그 경계 추정이 어긋날 수 있다(OOXML에선 드묾).
 */

/** 커서 위치가 가리키는 요소(및 선택적으로 속성) 컨텍스트 */
export interface CursorElementContext {
  /** 네임스페이스 prefix. 없으면 빈 문자열(기본 네임스페이스) */
  prefix: string
  /** 콜론을 제외한 로컬 요소명 */
  localName: string
  /** 원본 요소명 (예: 'w:p') */
  rawName: string
  /** 커서가 속성 이름 위에 있으면 그 속성명 */
  attributeName?: string
  /** 바깥쪽부터 나열한 상위 요소 rawName 목록 (현재 요소 제외) */
  ancestors: string[]
}

const NAME_CHAR = /[A-Za-z0-9_.:-]/
const TAG_RE = /<(\/?)([A-Za-z_][\w.\-:]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g

function splitName(rawName: string): { prefix: string; localName: string } {
  const colon = rawName.indexOf(':')
  if (colon < 0) return { prefix: '', localName: rawName }
  return { prefix: rawName.slice(0, colon), localName: rawName.slice(colon + 1) }
}

/**
 * 문서 전체의 xmlns 선언을 수집해 prefix→namespaceUri 맵을 만든다.
 * 기본 네임스페이스(xmlns="...")는 빈 문자열 키('')로 저장.
 */
export function collectXmlnsBindings(text: string): Map<string, string> {
  const bindings = new Map<string, string>()
  const re = /xmlns(?::([A-Za-z_][\w.\-]*))?\s*=\s*"([^"]*)"/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const prefix = match[1] ?? ''
    const uri = match[2] ?? ''
    if (!bindings.has(prefix)) {
      bindings.set(prefix, uri)
    }
  }
  return bindings
}

/**
 * text[0, end) 범위에서 닫히지 않은 여는 요소들의 스택(rawName)을 구한다.
 */
function buildOpenElementStack(text: string, end: number): string[] {
  const stack: string[] = []
  TAG_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TAG_RE.exec(text)) !== null) {
    if (match.index >= end) break
    const isClosing = match[1] === '/'
    const name = match[2] ?? ''
    const selfClosing = match[4] === '/'
    if (isClosing) {
      // 가장 가까운 동일 이름까지 pop
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i] === name) {
          stack.length = i
          break
        }
      }
    } else if (!selfClosing) {
      stack.push(name)
    }
  }
  return stack
}

/** 태그 텍스트 안에서 커서 위치의 속성명을 추정 (값 안이면 undefined) */
function attributeNameAt(
  tagText: string,
  posInTag: number,
  elementNameEnd: number
): string | undefined {
  if (posInTag <= elementNameEnd) return undefined

  // 커서가 따옴표로 열린 값 내부인지 검사
  let inQuote: '"' | "'" | null = null
  for (let i = 0; i < posInTag && i < tagText.length; i++) {
    const ch = tagText[i]
    if (inQuote) {
      if (ch === inQuote) inQuote = null
    } else if (ch === '"' || ch === "'") {
      inQuote = ch
    }
  }
  if (inQuote) return undefined

  // 커서 위치의 토큰 추출
  let start = posInTag
  while (start > 0 && NAME_CHAR.test(tagText[start - 1] ?? '')) start--
  let endPos = posInTag
  while (endPos < tagText.length && NAME_CHAR.test(tagText[endPos] ?? '')) endPos++
  const token = tagText.slice(start, endPos)
  if (!token || /^[0-9]/.test(token)) return undefined

  // 토큰 다음 비공백 문자가 '='이면 속성명으로 간주
  let after = endPos
  while (after < tagText.length && /\s/.test(tagText[after] ?? '')) after++
  if (tagText[after] === '=') return token

  // '=' 앞 토큰이 아니어도, 이미 정의된 속성명 토큰일 수 있음(값 입력 전). 보수적으로 무시.
  return undefined
}

/**
 * 커서/호버 offset 위치의 요소 컨텍스트를 해석한다.
 * 위치를 특정할 수 없으면 null.
 */
export function resolveCursorContext(text: string, offset: number): CursorElementContext | null {
  if (!text) return null
  const pos = Math.max(0, Math.min(offset, text.length))

  const before = text.slice(0, pos)
  const lastOpen = before.lastIndexOf('<')
  const lastClose = before.lastIndexOf('>')
  const insideTag = lastOpen > lastClose

  if (insideTag) {
    // 주석/PI/선언 내부는 무시
    const lead = text.slice(lastOpen, lastOpen + 4)
    if (lead.startsWith('<!') || lead.startsWith('<?')) return null

    const tagEndRel = text.slice(lastOpen).search(/>/)
    const tagEnd = tagEndRel === -1 ? text.length : lastOpen + tagEndRel + 1
    const tagText = text.slice(lastOpen, tagEnd)

    const nameMatch = /^<\/?([A-Za-z_][\w.\-:]*)/.exec(tagText)
    if (!nameMatch) return null
    const rawName = nameMatch[1] ?? ''
    const isClosing = tagText.startsWith('</')
    const { prefix, localName } = splitName(rawName)

    const elementNameEnd = nameMatch[0].length
    const attributeName = isClosing
      ? undefined
      : attributeNameAt(tagText, pos - lastOpen, elementNameEnd)

    const stack = buildOpenElementStack(text, lastOpen)
    // 닫는 태그면 매칭되는 여는 요소가 스택에 남아 있으니 ancestors에서 제외
    const ancestors = isClosing && stack[stack.length - 1] === rawName ? stack.slice(0, -1) : stack

    return { prefix, localName, rawName, attributeName, ancestors }
  }

  // 콘텐츠 영역: 감싸는 요소가 현재 컨텍스트
  const stack = buildOpenElementStack(text, pos)
  const rawName = stack[stack.length - 1]
  if (!rawName) return null
  const { prefix, localName } = splitName(rawName)
  return { prefix, localName, rawName, ancestors: stack.slice(0, -1) }
}

/**
 * 커서 컨텍스트의 prefix를 namespace URI로 해석한다.
 * 매핑이 없으면 null.
 */
export function resolveNamespaceUri(
  context: CursorElementContext,
  bindings: Map<string, string>
): string | null {
  return bindings.get(context.prefix) ?? null
}

export interface SchemaPathStep {
  namespaceUri: string
  localName: string
}

/**
 * 커서 컨텍스트(상위 요소 + 현재 요소)를 스키마 조회용 경로로 변환한다.
 * 루트(가장 바깥) → 현재 요소 순. 현재 요소의 네임스페이스를 해석하지 못하면 null.
 * 상위 요소의 네임스페이스를 해석하지 못하면 빈 문자열로 둔다(best-effort).
 */
export function buildSchemaPath(
  context: CursorElementContext,
  bindings: Map<string, string>
): SchemaPathStep[] | null {
  const currentNamespaceUri = resolveNamespaceUri(context, bindings)
  if (!currentNamespaceUri) return null

  const steps: SchemaPathStep[] = []
  for (const rawName of context.ancestors) {
    const { prefix, localName } = splitName(rawName)
    steps.push({ namespaceUri: bindings.get(prefix) ?? '', localName })
  }
  steps.push({ namespaceUri: currentNamespaceUri, localName: context.localName })
  return steps
}
