'use client';

/**
 * The small controls `/sell`'s steps are built from (E13.2).
 *
 * They exist so each step reads as the decision it is asking for rather than as markup, and so
 * every field can carry the one line of explanation a seller needs next to it. There is no
 * validation here: the parsing and the refusals are `lib/sell.ts`'s, and the core's.
 */
import type { ReactNode } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

/** A labelled row, with the reason for the field under it. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
      {hint === undefined ? null : <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function TextField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  readOnly = false,
}: {
  label: string;
  hint?: ReactNode;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      <Input
        value={value}
        placeholder={placeholder}
        readOnly={readOnly}
        className={readOnly ? 'font-mono text-xs text-muted-foreground' : 'font-mono text-xs'}
        onChange={(event) => onChange?.(event.currentTarget.value)}
      />
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: ReactNode;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger className="font-mono text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option} className="font-mono text-xs">
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function SwitchField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-border/60 p-3">
      <div className="space-y-1">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
        {hint === undefined ? null : <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/** A hash, key or argument, shown whole where it can be checked and elided where it cannot. */
export function Mono({ children }: { children: ReactNode }) {
  return <span className="break-all font-mono text-xs">{children}</span>;
}

/** What went wrong, in the words the core or the chain used. */
export function Problem({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      {children}
    </p>
  );
}

/** Something that has happened, and is checkable. */
export function Done({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-emerald-600/40 bg-emerald-600/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
      {children}
    </p>
  );
}
