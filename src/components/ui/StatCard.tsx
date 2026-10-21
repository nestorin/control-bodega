import type { ReactNode } from "react"

interface StatCardProps {
  value: ReactNode
  label: string
  valueClassName?: string
}

/** Compact metric used inside responsive summary panels. */
export function StatCard({
  value,
  label,
  valueClassName = "text-[#16343f]",
}: StatCardProps) {
  return (
    <div className="flex flex-col gap-0.5 items-start">
      <p
        className={`font-extrabold ${valueClassName} text-2xl md:text-[32px]`}
        style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
      >
        {value}
      </p>
      <p
        className="text-[#607078] text-sm md:text-[13px]"
        style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
      >
        {label}
      </p>
    </div>
  )
}
