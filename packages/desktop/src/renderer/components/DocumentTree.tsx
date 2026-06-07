import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PartDiffStatus } from '../stores/document'

interface PartInfo {
  contentType: string
  size: number
}

interface DocumentTreeProps {
  containerFormat?: 'ooxml' | 'odf'
  documentType: string
  parts: Record<string, PartInfo>
  selectedPart: string | null
  onSelectPart: (partPath: string) => void
  // Compare 모드 전용
  comparisonParts?: Record<string, PartInfo>
  partDiffStatus?: Record<string, PartDiffStatus>
}

interface TreeNode {
  name: string
  path: string
  isDirectory: boolean
  children: TreeNode[]
  part?: PartInfo
  // 디렉토리에서도 자식들의 상태가 모두 동일할 때만 표시되도록 집계
  diffStatus?: PartDiffStatus
}

function buildTree(
  parts: Record<string, PartInfo>,
  comparisonParts: Record<string, PartInfo> | undefined,
  partDiffStatus: Record<string, PartDiffStatus> | undefined
): TreeNode[] {
  const root: TreeNode = { name: '', path: '', isDirectory: true, children: [] }

  // 양쪽 part 합집합으로 트리 구성 (없는 쪽은 더미 PartInfo 사용)
  const allPaths = new Set<string>(Object.keys(parts))
  if (comparisonParts) Object.keys(comparisonParts).forEach((path) => allPaths.add(path))

  for (const path of allPaths) {
    const partInfo = parts[path] ?? comparisonParts?.[path]
    if (!partInfo) continue

    const segments = path.split('/').filter(Boolean)
    let current = root

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]
      if (!segment) continue

      const isLast = i === segments.length - 1
      const currentPath = '/' + segments.slice(0, i + 1).join('/')

      let child = current.children.find((candidate) => candidate.name === segment)
      if (!child) {
        child = {
          name: segment,
          path: currentPath,
          isDirectory: !isLast,
          children: [],
          part: isLast ? partInfo : undefined,
          diffStatus: isLast ? partDiffStatus?.[path] : undefined,
        }
        current.children.push(child)
      }

      current = child
    }
  }

  function aggregateDiffStatus(node: TreeNode): PartDiffStatus | undefined {
    if (!node.isDirectory) return node.diffStatus
    const childStatuses = node.children.map(aggregateDiffStatus)
    if (childStatuses.some((status) => status === 'modified')) return 'modified'
    if (childStatuses.some((status) => status === 'pending')) return 'pending'
    if (childStatuses.every((status) => status === 'identical')) return 'identical'
    if (childStatuses.every((status) => status === 'only-primary')) return 'only-primary'
    if (childStatuses.every((status) => status === 'only-comparison')) return 'only-comparison'
    return undefined
  }

  function sortChildren(node: TreeNode) {
    node.children.sort((left, right) => {
      if (left.isDirectory !== right.isDirectory) {
        return left.isDirectory ? -1 : 1
      }
      return left.name.localeCompare(right.name)
    })

    node.children.forEach(sortChildren)
  }

  sortChildren(root)
  if (partDiffStatus) {
    root.children.forEach((child) => {
      child.diffStatus = aggregateDiffStatus(child)
    })
  }
  return root.children
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function getIcon(node: TreeNode): string {
  if (node.isDirectory) {
    if (node.name === '_rels') return '🔗'
    if (node.name.includes('xl')) return '📊'
    if (node.name.includes('word')) return '📝'
    if (node.name.includes('ppt')) return '📽️'
    return '📁'
  }

  const ext = node.name.split('.').pop()?.toLowerCase()
  if (ext === 'xml') return '📄'
  if (ext === 'rels') return '🔗'
  if (['png', 'jpg', 'jpeg', 'gif'].includes(ext || '')) return '🖼️'
  return '📄'
}

function getDocumentLabel(
  containerFormat: 'ooxml' | 'odf' | undefined,
  documentType: string
): string {
  const prefix = containerFormat === 'odf' ? 'ODF' : 'OOXML'

  switch (documentType) {
    case 'spreadsheet':
      return `${prefix} Spreadsheet`
    case 'document':
      return `${prefix} Text`
    case 'presentation':
      return `${prefix} Presentation`
    case 'odf-text':
      return 'ODF Text'
    case 'odf-spreadsheet':
      return 'ODF Spreadsheet'
    case 'odf-presentation':
      return 'ODF Presentation'
    case 'odf-graphics':
      return 'ODF Graphics'
    case 'odf-package':
      return 'ODF Package'
    default:
      return `${prefix} Package`
  }
}

function getDiffMarker(status: PartDiffStatus | undefined): string {
  switch (status) {
    case 'only-primary':
      return '◀'
    case 'only-comparison':
      return '▶'
    case 'modified':
      return '●'
    case 'pending':
      return '…'
    default:
      return ''
  }
}

/** 기본 펼침: 깊이 0,1의 디렉토리를 펼친 상태로 시작 (기존 동작 유지) */
function defaultExpanded(nodes: TreeNode[]): Set<string> {
  const expanded = new Set<string>()
  const walk = (node: TreeNode, depth: number) => {
    if (node.isDirectory && depth < 2) expanded.add(node.path)
    node.children.forEach((child) => walk(child, depth + 1))
  }
  nodes.forEach((node) => walk(node, 0))
  return expanded
}

interface VisibleRow {
  node: TreeNode
  depth: number
  parentPath: string | null
}

/** 펼침 상태를 반영해 화면에 보이는 노드를 평탄화 (키보드 탐색용) */
function flattenVisible(nodes: TreeNode[], expanded: Set<string>): VisibleRow[] {
  const rows: VisibleRow[] = []
  const walk = (node: TreeNode, depth: number, parentPath: string | null) => {
    rows.push({ node, depth, parentPath })
    if (node.isDirectory && expanded.has(node.path)) {
      node.children.forEach((child) => walk(child, depth + 1, node.path))
    }
  }
  nodes.forEach((node) => walk(node, 0, null))
  return rows
}

interface TreeRowProps {
  row: VisibleRow
  selectedPart: string | null
  focusedPath: string | null
  expanded: boolean
  registerRef: (path: string, el: HTMLDivElement | null) => void
  onActivate: (row: VisibleRow) => void
  onFocusRow: (path: string) => void
}

function TreeRow({
  row,
  selectedPart,
  focusedPath,
  expanded,
  registerRef,
  onActivate,
  onFocusRow,
}: TreeRowProps) {
  const { node, depth } = row
  const isSelected = node.path === selectedPart
  const isXml = node.part?.contentType.includes('xml')
  const isDisabled = !node.isDirectory && !isXml
  const marker = getDiffMarker(node.diffStatus)

  return (
    <div
      ref={(el) => registerRef(node.path, el)}
      className={`tree-item ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
      data-diff-status={node.diffStatus ?? undefined}
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={node.isDirectory ? undefined : isSelected}
      aria-expanded={node.isDirectory ? expanded : undefined}
      aria-disabled={isDisabled || undefined}
      tabIndex={node.path === focusedPath ? 0 : -1}
      onClick={() => onActivate(row)}
      onFocus={() => onFocusRow(node.path)}
    >
      {node.isDirectory && <span className="expand-icon">{expanded ? '▼' : '▶'}</span>}
      <span className="icon" aria-hidden>
        {getIcon(node)}
      </span>
      <span className="name">{node.name}</span>
      {marker && <span className="diff-marker">{marker}</span>}
      {node.part && <span className="size">{formatSize(node.part.size)}</span>}
    </div>
  )
}

export function DocumentTree({
  containerFormat,
  documentType,
  parts,
  selectedPart,
  onSelectPart,
  comparisonParts,
  partDiffStatus,
}: DocumentTreeProps) {
  const tree = useMemo(
    () => buildTree(parts, comparisonParts, partDiffStatus),
    [parts, comparisonParts, partDiffStatus]
  )

  const [expanded, setExpanded] = useState<Set<string>>(() => defaultExpanded(tree))
  const [focusedPath, setFocusedPath] = useState<string | null>(null)
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  // 키보드 탐색으로 focusedPath가 바뀐 경우에만 DOM 포커스를 옮긴다(마운트 시 포커스 탈취 방지)
  const pendingFocusRef = useRef(false)

  // 문서(트리)가 바뀌면 기본 펼침으로 초기화
  useEffect(() => {
    setExpanded(defaultExpanded(tree))
  }, [tree])

  const visibleRows = useMemo(() => flattenVisible(tree, expanded), [tree, expanded])

  // 로빙 tabindex의 기준점: 선택된 파트 → 첫 노드 순으로 보정
  const activeFocusPath = useMemo(() => {
    if (focusedPath && visibleRows.some((row) => row.node.path === focusedPath)) {
      return focusedPath
    }
    if (selectedPart && visibleRows.some((row) => row.node.path === selectedPart)) {
      return selectedPart
    }
    return visibleRows[0]?.node.path ?? null
  }, [focusedPath, selectedPart, visibleRows])

  const registerRef = useCallback((path: string, el: HTMLDivElement | null) => {
    if (el) itemRefs.current.set(path, el)
    else itemRefs.current.delete(path)
  }, [])

  // 키보드 탐색 후 실제 DOM 포커스 이동
  useEffect(() => {
    if (!pendingFocusRef.current || !focusedPath) return
    pendingFocusRef.current = false
    itemRefs.current.get(focusedPath)?.focus()
  }, [focusedPath])

  const moveFocus = useCallback((path: string) => {
    pendingFocusRef.current = true
    setFocusedPath(path)
  }, [])

  const toggleExpand = useCallback((path: string, next: boolean) => {
    setExpanded((current) => {
      const updated = new Set(current)
      if (next) updated.add(path)
      else updated.delete(path)
      return updated
    })
  }, [])

  const activate = useCallback(
    (row: VisibleRow) => {
      const { node } = row
      if (node.isDirectory) {
        toggleExpand(node.path, !expanded.has(node.path))
        return
      }
      onSelectPart(node.path)
    },
    [expanded, onSelectPart, toggleExpand]
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (visibleRows.length === 0) return
      const currentPath = activeFocusPath
      const index = visibleRows.findIndex((row) => row.node.path === currentPath)
      const currentRow = index >= 0 ? visibleRows[index] : undefined

      switch (event.key) {
        case 'ArrowDown': {
          event.preventDefault()
          const next = visibleRows[Math.min(visibleRows.length - 1, index + 1)]
          if (next) moveFocus(next.node.path)
          break
        }
        case 'ArrowUp': {
          event.preventDefault()
          const prev = visibleRows[Math.max(0, index - 1)]
          if (prev) moveFocus(prev.node.path)
          break
        }
        case 'ArrowRight': {
          event.preventDefault()
          if (!currentRow) break
          if (currentRow.node.isDirectory) {
            if (!expanded.has(currentRow.node.path)) {
              toggleExpand(currentRow.node.path, true)
            } else {
              const first = visibleRows[index + 1]
              if (first && first.parentPath === currentRow.node.path) {
                moveFocus(first.node.path)
              }
            }
          }
          break
        }
        case 'ArrowLeft': {
          event.preventDefault()
          if (!currentRow) break
          if (currentRow.node.isDirectory && expanded.has(currentRow.node.path)) {
            toggleExpand(currentRow.node.path, false)
          } else if (currentRow.parentPath) {
            moveFocus(currentRow.parentPath)
          }
          break
        }
        case 'Home': {
          event.preventDefault()
          const first = visibleRows[0]
          if (first) moveFocus(first.node.path)
          break
        }
        case 'End': {
          event.preventDefault()
          const last = visibleRows[visibleRows.length - 1]
          if (last) moveFocus(last.node.path)
          break
        }
        case 'Enter':
        case ' ': {
          event.preventDefault()
          if (currentRow) activate(currentRow)
          break
        }
        default:
          break
      }
    },
    [activate, activeFocusPath, expanded, moveFocus, toggleExpand, visibleRows]
  )

  const partCount = comparisonParts
    ? new Set([...Object.keys(parts), ...Object.keys(comparisonParts)]).size
    : Object.keys(parts).length

  return (
    <div className="document-tree">
      <div className="tree-header">
        <span className="doc-type">{getDocumentLabel(containerFormat, documentType)}</span>
        <span className="part-count">{partCount} parts</span>
      </div>

      <div
        className="tree-content"
        role="tree"
        aria-label={`${getDocumentLabel(containerFormat, documentType)} 파트 트리`}
        onKeyDown={handleKeyDown}
      >
        {visibleRows.map((row) => (
          <TreeRow
            key={row.node.path}
            row={row}
            selectedPart={selectedPart}
            focusedPath={activeFocusPath}
            expanded={expanded.has(row.node.path)}
            registerRef={registerRef}
            onActivate={activate}
            onFocusRow={setFocusedPath}
          />
        ))}
      </div>
    </div>
  )
}
