import type { HTMLAttributes, ReactNode } from "react"

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

/** Shared surface used by dashboard cards while preserving the visual system. */
export function Panel({ children, className = "", ...props }: PanelProps) {
  return (
    <div
      className={`bg-white shadow-[0px_8px_12px_rgba(22,52,63,0.08)] rounded-[20px] ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
