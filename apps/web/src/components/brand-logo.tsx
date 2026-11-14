import { cn } from '@/lib/utils';

type BrandLogoProps = {
  /** Tagline displayed beneath the wordmark. Set to `null` to hide. */
  tagline?: string | null;
  /** Render only the mark — used in collapsed sidebars. */
  markOnly?: boolean;
  className?: string;
  taglineClassName?: string;
};

/**
 * The brand lockup: a wordmark, not an image.
 *
 * It is drawn in type and CSS so that it needs no asset, no `next/image` optimiser pass and no
 * second file for dark mode — the tokens in `globals.css` already invert. The mark is the slope of
 * the thing being priced: value at the margin.
 */
export function BrandLogo({
  tagline = 'confidential exchange',
  markOnly = false,
  className,
  taglineClassName,
}: BrandLogoProps) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="size-7 shrink-0 text-brand-primary"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
      >
        {/* A marginal-value curve: steep at first, then flat. */}
        <path d="M3 20C6.5 20 9 16 11 11.5 13 7 15.5 4 21 4" />
        <path d="M3 20h18" className="opacity-30" />
      </svg>
      {!markOnly && (
        <div className="grid min-w-0 leading-none">
          <span className="font-display truncate text-[17px] font-semibold tracking-tight">
            Marginal
          </span>
          {tagline !== null && (
            <span
              className={cn(
                'truncate pt-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground',
                taglineClassName,
              )}
            >
              {tagline}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
