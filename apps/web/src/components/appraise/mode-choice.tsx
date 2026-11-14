'use client';

import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { bits, tokens } from '@/lib/format';
import type { Privacy, Quote, Quotes } from '@/lib/appraise';

/**
 * The privacy choice, with the debit it costs (E13.4, D10; SDD §3.8, §3.17).
 *
 * Both figures are on screen before anything is signed, because the choice is only legible if the
 * buyer can see what each one leaks and what the bits cost: `Scored (open)` publishes the quantised
 * components and every judge factor, so it debits their alphabets; `Sealed` publishes one bit, the
 * outcome, and debits exactly that. §3.8 is explicit that blind mode with `Open` is still a real
 * debit and the UI must show it, which is why there is no "free" option here.
 */
export function ModeChoice({
  quotes,
  privacy,
  onChange,
  remainingMbits,
}: {
  quotes: Quotes | null;
  privacy: Privacy;
  onChange: (next: Privacy) => void;
  remainingMbits: number;
}) {
  return (
    <RadioGroup
      value={privacy}
      onValueChange={(next) => onChange(next as Privacy)}
      className="gap-3"
    >
      <Choice
        value="Open"
        id="privacy-open"
        title="Scored (open)"
        note="The quantised components and each judge factor go on chain with the verdict, so anyone can recompute the price. Every published symbol is debited."
        quote={quotes?.open ?? null}
        unavailable={quotes !== null && quotes.open === null}
        remainingMbits={remainingMbits}
        selected={privacy === 'Open'}
      />
      <Choice
        value="Sealed"
        id="privacy-sealed"
        title="Sealed"
        note="Only the outcome bit is published. The components stay inside the room, opened later only under the listing’s disclosure policy."
        quote={quotes?.sealed ?? null}
        unavailable={false}
        remainingMbits={remainingMbits}
        selected={privacy === 'Sealed'}
      />
    </RadioGroup>
  );
}

function Choice({
  value,
  id,
  title,
  note,
  quote,
  unavailable,
  remainingMbits,
  selected,
}: {
  value: Privacy;
  id: string;
  title: string;
  note: string;
  quote: Quote | null;
  unavailable: boolean;
  remainingMbits: number;
  selected: boolean;
}) {
  const overBudget = quote !== null && quote.debit_mbits > remainingMbits;
  return (
    <div
      className={`flex gap-3 border p-3 ${
        selected ? 'border-brand-primary/40 bg-brand-primary/10' : 'border-border'
      }`}
    >
      <RadioGroupItem value={value} id={id} disabled={unavailable} className="mt-1" />
      <div className="min-w-0 space-y-1">
        <Label htmlFor={id} className="cursor-pointer text-sm">
          {title}
        </Label>
        <p className="text-xs text-muted-foreground">{note}</p>
        {unavailable ? (
          <p className="font-mono text-xs text-amber-700 dark:text-amber-400">
            This build cannot prove this listing&rsquo;s output schema, so the open debit cannot be
            shown. Sealed debits one bit whatever the schema is.
          </p>
        ) : quote === null ? (
          <p className="font-mono text-xs text-muted-foreground">debit —</p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 font-mono text-xs sm:grid-cols-3">
            <Figure label="debit" value={bits(quote.debit_mbits)} warn={overBudget} />
            <Figure label="bits cost" value={tokens(quote.comp)} warn={false} />
            <Figure label="escrow needed" value={tokens(quote.total)} warn={false} />
          </dl>
        )}
      </div>
    </div>
  );
}

function Figure({ label, value, warn }: { label: string; value: string; warn: boolean }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`tabular-nums ${warn ? 'text-brand-primary' : ''}`}>{value}</dd>
    </div>
  );
}
