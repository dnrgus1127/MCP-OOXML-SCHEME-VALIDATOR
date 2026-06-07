import { Fragment, type ReactNode, useCallback, useRef, useState } from 'react'
import { ResizeHandle } from './ResizeHandle'

export interface StackPanel {
  key: string
  /** 리사이즈 핸들 aria-label에 쓰일 사람용 이름 */
  label: string
  node: ReactNode
}

const MIN_PANEL_HEIGHT = 96

/**
 * 세로로 적층된 패널들을 드래그/키보드로 높이 배분할 수 있는 스택. (P1-3)
 *
 * 모델: 마지막 패널은 남은 공간을 채우고(flex), 그 위 패널들은 사용자가 핸들을
 * 조작하면 픽셀 높이로 고정된다. 고정 전에는 동일 비율로 공간을 나눈다.
 */
export function ResizablePanelStack({ panels }: { panels: StackPanel[] }) {
  const [heights, setHeights] = useState<Record<string, number>>({})
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const panelCount = panels.length

  const setPanelRef = useCallback((key: string, el: HTMLDivElement | null) => {
    if (el) panelRefs.current.set(key, el)
    else panelRefs.current.delete(key)
  }, [])

  const resizePanel = useCallback(
    (key: string, delta: number) => {
      setHeights((current) => {
        const base = current[key] ?? panelRefs.current.get(key)?.offsetHeight ?? MIN_PANEL_HEIGHT
        const containerH = containerRef.current?.clientHeight ?? Number.POSITIVE_INFINITY
        const maxH = Math.max(MIN_PANEL_HEIGHT, containerH - MIN_PANEL_HEIGHT * (panelCount - 1))
        const next = Math.min(maxH, Math.max(MIN_PANEL_HEIGHT, base + delta))
        return { ...current, [key]: next }
      })
    },
    [panelCount]
  )

  return (
    <div className="resizable-stack" ref={containerRef}>
      {panels.map((panel, index) => {
        const isLast = index === panels.length - 1
        const fixed = heights[panel.key]
        const style =
          isLast || fixed === undefined
            ? { flex: '1 1 0', minHeight: MIN_PANEL_HEIGHT }
            : { flex: `0 0 ${fixed}px`, minHeight: MIN_PANEL_HEIGHT }

        return (
          <Fragment key={panel.key}>
            <div
              className="resizable-stack-panel"
              style={style}
              ref={(el) => setPanelRef(panel.key, el)}
            >
              {panel.node}
            </div>
            {!isLast && (
              <ResizeHandle
                orientation="horizontal"
                ariaLabel={`${panel.label} 높이 조절`}
                onResize={(delta) => resizePanel(panel.key, delta)}
              />
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
