interface CloseButtonProps {
  onClick: () => void
  /** 접근성용 라벨 (필수) */
  ariaLabel: string
  className?: string
}

/**
 * 패널 공용 닫기 버튼. 최소 24x24 타깃, 일관된 글리프(×)와 포커스 표시를 보장한다. (P2-4)
 */
export function CloseButton({ onClick, ariaLabel, className }: CloseButtonProps) {
  return (
    <button
      type="button"
      className={`close-button${className ? ` ${className}` : ''}`}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      ×
    </button>
  )
}
