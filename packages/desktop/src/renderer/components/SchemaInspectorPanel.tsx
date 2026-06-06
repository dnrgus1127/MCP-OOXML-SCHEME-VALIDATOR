import { useEffect, useState } from 'react'
import {
  lookupSchemaElementByPath,
  type SchemaElementDescription,
  type SchemaPathStep,
} from '../schema/schemaInspector'

export interface SchemaInspectorQuery {
  rawName: string
  path: SchemaPathStep[]
  attributeName?: string
}

interface SchemaInspectorPanelProps {
  query: SchemaInspectorQuery | null
  documentType: string
  onClose: () => void
}

type PanelState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'empty'; message: string }
  | { status: 'error'; message: string }
  | { status: 'success'; description: SchemaElementDescription }

const CONTENT_KIND_LABEL: Record<SchemaElementDescription['contentKind'], string> = {
  empty: '빈 요소 (자식·텍스트 없음)',
  elementOnly: '자식 요소만 포함',
  mixed: '자식 요소 + 텍스트 혼합',
  simpleContent: '텍스트 값 (속성 가능)',
  complexContent: '복합 콘텐츠',
  simpleType: '단순 값',
  unknown: '구조 정보 없음',
}

function formatOccurs(min: number, max: number | 'unbounded'): string {
  const maxLabel = max === 'unbounded' ? '∞' : String(max)
  if (min === 1 && max === 1) return '필수, 1회'
  if (min === 0 && max === 1) return '선택, 0~1회'
  if (min === 0) return `선택, 0~${maxLabel}회`
  return `${min}~${maxLabel}회`
}

function AllowedValues({ values }: { values: string[] }) {
  return (
    <ul className="schema-inspector-values">
      {values.map((value) => (
        <li key={value}>
          <code>{value}</code>
        </li>
      ))}
    </ul>
  )
}

function renderSuccess(description: SchemaElementDescription, attributeName?: string) {
  const focusedAttribute = attributeName
    ? description.attributes.find((attr) => attr.name === attributeName)
    : undefined

  return (
    <div className="schema-inspector-content">
      <div className="schema-inspector-headline">
        <code className="schema-inspector-element">{description.name}</code>
        {description.isAbstract ? <span className="schema-inspector-tag">abstract</span> : null}
      </div>

      {description.documentation ? (
        <p className="schema-inspector-doc">{description.documentation}</p>
      ) : (
        <p className="schema-inspector-doc schema-inspector-doc--empty">
          이 요소의 설명은 아직 준비되지 않았습니다. 아래 구조 정보를 참고하세요.
        </p>
      )}

      <dl className="schema-inspector-meta">
        <div>
          <dt>콘텐츠</dt>
          <dd>{CONTENT_KIND_LABEL[description.contentKind]}</dd>
        </div>
        {description.typeName ? (
          <div>
            <dt>타입</dt>
            <dd>
              <code>{description.typeName}</code>
            </dd>
          </div>
        ) : null}
      </dl>

      {focusedAttribute ? (
        <section className="schema-inspector-section schema-inspector-section--focus">
          <h4>
            속성 <code>{focusedAttribute.name}</code>
          </h4>
          <p className="schema-inspector-attr-meta">
            {focusedAttribute.use === 'required' ? '필수' : '선택'}
            {focusedAttribute.typeName ? ` · ${focusedAttribute.typeName}` : ''}
          </p>
          {focusedAttribute.description ? (
            <p className="schema-inspector-doc">{focusedAttribute.description}</p>
          ) : null}
          {focusedAttribute.allowedValues && focusedAttribute.allowedValues.length > 0 ? (
            <>
              <p className="schema-inspector-subtitle">허용 값</p>
              <AllowedValues values={focusedAttribute.allowedValues} />
            </>
          ) : (
            <p className="schema-inspector-empty-line">
              정해진 허용 값 목록이 없습니다(자유 입력).
            </p>
          )}
        </section>
      ) : null}

      {description.allowedValues && description.allowedValues.length > 0 ? (
        <section className="schema-inspector-section">
          <h4>허용 값</h4>
          <AllowedValues values={description.allowedValues} />
        </section>
      ) : null}

      {description.attributes.length > 0 ? (
        <section className="schema-inspector-section">
          <h4>속성 {description.attributes.length}개</h4>
          <ul className="schema-inspector-attrs">
            {description.attributes.map((attr) => (
              <li
                key={attr.name}
                className={attr.name === attributeName ? 'is-focused' : undefined}
                title={attr.description}
              >
                <code>{attr.name}</code>
                <span className={`schema-inspector-use schema-inspector-use--${attr.use}`}>
                  {attr.use === 'required' ? '필수' : '선택'}
                </span>
                {attr.typeName ? (
                  <span className="schema-inspector-attr-type">{attr.typeName}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {description.children.length > 0 ? (
        <section className="schema-inspector-section">
          <h4>
            허용 자식 요소 {description.children.length}개
            {description.compositor ? (
              <span className="schema-inspector-compositor"> · {description.compositor}</span>
            ) : null}
          </h4>
          <ul className="schema-inspector-children">
            {description.children.map((child) => (
              <li key={child.name}>
                <code>{child.isWildcard ? '(any)' : child.name}</code>
                <span className="schema-inspector-occurs">
                  {formatOccurs(child.minOccurs, child.maxOccurs)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {description.specRef ? (
        <p className="schema-inspector-specref">출처: {description.specRef}</p>
      ) : null}
    </div>
  )
}

export function SchemaInspectorPanel({ query, documentType, onClose }: SchemaInspectorPanelProps) {
  const [state, setState] = useState<PanelState>({ status: 'idle' })

  useEffect(() => {
    if (!query) {
      setState({ status: 'idle' })
      return
    }
    if (query.path.length === 0) {
      setState({
        status: 'empty',
        message: `네임스페이스를 확인할 수 없습니다: ${query.rawName}`,
      })
      return
    }

    let cancelled = false
    setState({ status: 'loading' })

    lookupSchemaElementByPath(documentType, query.path)
      .then((description) => {
        if (cancelled) return
        if (!description) {
          setState({ status: 'error', message: '스키마 정보를 불러오지 못했습니다.' })
          return
        }
        if (!description.found) {
          setState({
            status: 'empty',
            message: `스키마에 정의되지 않은 요소입니다: ${query.rawName}`,
          })
          return
        }
        setState({ status: 'success', description })
      })
      .catch(() => {
        if (cancelled) return
        setState({ status: 'error', message: '스키마 정보를 불러오지 못했습니다.' })
      })

    return () => {
      cancelled = true
    }
  }, [query, documentType])

  return (
    <section className="schema-inspector-panel" aria-labelledby="schema-inspector-title">
      <div className="schema-inspector-panel-header">
        <h3 id="schema-inspector-title">요소 스키마 정보</h3>
        <button
          type="button"
          className="schema-inspector-close"
          onClick={onClose}
          aria-label="요소 스키마 패널 닫기"
        >
          ×
        </button>
      </div>

      {state.status === 'idle' ? (
        <p className="schema-inspector-state">
          편집기에서 XML 요소나 속성에 커서를 두면 스키마 구조 정보가 표시됩니다.
        </p>
      ) : null}

      {state.status === 'loading' ? (
        <p className="schema-inspector-state">스키마 정보를 조회하는 중입니다…</p>
      ) : null}

      {state.status === 'empty' ? <p className="schema-inspector-state">{state.message}</p> : null}

      {state.status === 'error' ? (
        <p className="schema-inspector-state schema-inspector-state--error">{state.message}</p>
      ) : null}

      {state.status === 'success' ? renderSuccess(state.description, query?.attributeName) : null}
    </section>
  )
}
