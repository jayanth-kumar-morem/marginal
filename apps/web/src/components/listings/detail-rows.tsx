import { cn } from '@/lib/utils';

/** A definition list for a record's fields: label left, monospace value right (§3.23's KV grid). */
export function Rows({ children }: { children: React.ReactNode }) {
  return <dl className="divide-y divide-border/60">{children}</dl>;
}

export function Row({
  label,
  children,
  mono = true,
  note,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
  note?: string;
}) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-4 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 break-words', mono && 'font-mono text-xs')}>
        {children}
        {note ? <p className="pt-1 font-sans text-xs text-muted-foreground">{note}</p> : null}
      </dd>
    </div>
  );
}
