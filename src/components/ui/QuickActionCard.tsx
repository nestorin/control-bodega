import type { MouseEventHandler } from "react"

interface QuickActionCardProps {
  title: string
  description: string
  iconSrc: string
  iconBackgroundClassName: string
  onClick?: MouseEventHandler<HTMLButtonElement>
}

/** Responsive dashboard action card; behavior remains owned by the screen. */
export function QuickActionCard({
  title,
  description,
  iconSrc,
  iconBackgroundClassName,
  onClick,
}: QuickActionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-white shadow-[0px_8px_12px_rgba(22,52,63,0.08)] flex flex-col items-start p-4 md:p-5 rounded-[20px] cursor-pointer hover:shadow-[0px_12px_20px_rgba(22,52,63,0.12)] transition-shadow text-left touch-target"
    >
      <div className="flex gap-3 md:gap-[14px] items-center w-full">
        <div
          className={`${iconBackgroundClassName} flex flex-col items-center justify-center rounded-[14px] size-10 md:size-12 flex-shrink-0`}
        >
          <img alt="" className="size-5 md:size-[22px]" src={iconSrc} />
        </div>
        <div className="flex flex-col gap-1 items-start min-w-0">
          <p
            className="text-[#172126] text-base md:text-lg truncate"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
          >
            {title}
          </p>
          <p
            className="text-[#607078] text-sm md:text-[13px]"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
          >
            {description}
          </p>
        </div>
      </div>
    </button>
  )
}
