import { Badge } from '@/components/ui/badge';
import { statusNote } from '@/lib/listings';

/** A listing's state, coloured by what it means for a buyer (§3.5's listing state machine). */
export function StatusBadge({ status }: { status: string }) {
  const { appraisable } = statusNote(status);
  const tone =
    status === 'Held'
      ? 'border-brand-primary/40 bg-brand-primary/10 text-brand-primary'
      : status === 'Exhausted' || status === 'SoldOut'
        ? 'border-muted-foreground/30 bg-muted text-muted-foreground'
        : appraisable
          ? 'border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400'
          : 'border-amber-600/40 bg-amber-600/10 text-amber-700 dark:text-amber-400';
  return (
    <Badge variant="outline" className={`font-mono text-[10px] uppercase ${tone}`}>
      {status}
    </Badge>
  );
}

/** A job's state, on the same scale: terminal-good, terminal-neutral, in-flight. */
export function JobStateBadge({ state }: { state: string }) {
  const tone =
    state === 'Deal' || state === 'Final'
      ? 'border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400'
      : state === 'Timeout' || state === 'Revoked' || state === 'DeliveryFailure'
        ? 'border-brand-primary/40 bg-brand-primary/10 text-brand-primary'
        : state === 'NoDeal' || state === 'Restricted' || state === 'InputRejected'
          ? 'border-muted-foreground/30 bg-muted text-muted-foreground'
          : 'border-sky-600/40 bg-sky-600/10 text-sky-700 dark:text-sky-400';
  return (
    <Badge variant="outline" className={`font-mono text-[10px] uppercase ${tone}`}>
      {state}
    </Badge>
  );
}
