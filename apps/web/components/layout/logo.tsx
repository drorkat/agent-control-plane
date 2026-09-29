import { cn } from '@/lib/utils';

/**
 * The product mark: a gradient squircle with a "control node" glyph.
 * Size is controlled via className (e.g. `size-9`).
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-primary to-violet-500 text-white shadow-sm ring-1 ring-inset ring-white/15',
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-[58%]">
        <path
          d="M12 2.75v3.25M12 18v3.25M2.75 12H6M18 12h3.25"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <circle cx="12" cy="12" r="4.15" stroke="currentColor" strokeWidth="1.9" />
        <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      </svg>
    </span>
  );
}
