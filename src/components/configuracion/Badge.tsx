/**
 * Badge — Simple colored badge for validation/status
 */

interface BadgeProps {
  label: string;
  color?: 'green' | 'gray' | 'blue' | 'amber' | 'red';
  className?: string;
}

const COLOR_MAP: Record<NonNullable<BadgeProps['color']>, { bg: string; text: string }> = {
  green: { bg: '#e2f5ec', text: '#16845b' },
  gray: { bg: '#f0f4f5', text: '#607078' },
  blue: { bg: '#e8eef6', text: '#3276a8' },
  amber: { bg: '#fff3cd', text: '#856404' },
  red: { bg: '#fdecea', text: '#c0392b' },
};

export function Badge({ label, color = 'gray', className = '' }: BadgeProps) {
  const c = COLOR_MAP[color ?? 'gray'];
  
  return (
    <span
      className={`inline-flex items-center px-[8px] py-[3px] rounded-full text-[10px] font-bold shrink-0 ${className}`}
      style={{
        background: c.bg,
        color: c.text,
        fontFamily: "'Inter',sans-serif",
      }}
    >
      {label}
    </span>
  );
}