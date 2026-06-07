import { useCallback, useRef } from 'react'

interface ResizeHandleProps {
  /** 분리자 방향. 'vertical' = 좌우 패널 사이(너비 조절), 'horizontal' = 상하 패널 사이(높이 조절) */
  orientation: 'vertical' | 'horizontal'
  /** 드래그/키보드로 발생한 이동량(px). vertical은 deltaX, horizontal은 deltaY 부호 그대로 전달 */
  onResize: (deltaPx: number) => void
  ariaLabel: string
  /** 키보드 한 스텝 이동량(px) */
  step?: number
}

/**
 * WAI-ARIA separator 패턴을 따르는 리사이즈 핸들.
 * 포인터 드래그와 키보드(화살표) 모두 지원한다. (P1-3)
 */
export function ResizeHandle({ orientation, onResize, ariaLabel, step = 16 }: ResizeHandleProps) {
  const lastRef = useRef<number | null>(null)
  const isVertical = orientation === 'vertical'

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      lastRef.current = isVertical ? event.clientX : event.clientY
    },
    [isVertical]
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (lastRef.current === null) return
      const current = isVertical ? event.clientX : event.clientY
      const delta = current - lastRef.current
      if (delta !== 0) {
        onResize(delta)
        lastRef.current = current
      }
    },
    [isVertical, onResize]
  )

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    lastRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const decrease = isVertical ? 'ArrowLeft' : 'ArrowUp'
      const increase = isVertical ? 'ArrowRight' : 'ArrowDown'
      if (event.key === decrease) {
        event.preventDefault()
        onResize(-step)
      } else if (event.key === increase) {
        event.preventDefault()
        onResize(step)
      }
    },
    [isVertical, onResize, step]
  )

  return (
    <div
      className={`resize-handle resize-handle--${orientation}`}
      role="separator"
      aria-orientation={isVertical ? 'vertical' : 'horizontal'}
      aria-label={ariaLabel}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
    />
  )
}
