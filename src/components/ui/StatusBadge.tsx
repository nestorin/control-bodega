interface StatusBadgeProps {
  label: string;
  indicatorSrc: string;
  className?: string;
  labelClassName?: string;
  backgroundColor?: string;
  labelColor?: string;
}

/** Consistent status treatment for cards and dashboard summaries. */
export function StatusBadge({
  label,
  indicatorSrc,
  className = "",
  labelClassName = "",
  backgroundColor,
  labelColor,
}: StatusBadgeProps) {
  return (
    <div
      className={`bg-[#e2f5ec] flex gap-[7px] items-center px-[11px] py-[7px] rounded-full flex-shrink-0 ${className}`}
      style={backgroundColor ? { backgroundColor } : undefined}
    >
      <img alt="" className="size-[7px]" src={indicatorSrc} />
      <p
        className={`font-bold text-[#16845b] text-sm md:text-[13px] whitespace-nowrap ${labelClassName}`}
        style={{
          fontFamily: "'Inter', sans-serif",
          fontWeight: 700,
          ...(labelColor ? { color: labelColor } : {}),
        }}
      >
        {label}
      </p>
    </div>
  );
}
