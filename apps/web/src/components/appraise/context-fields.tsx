'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { parseRestricted } from '@/lib/appraise';

/**
 * What the buyer brings to the appraisal (E13.4, D1 and D8).
 *
 * Three fields, because the room takes three things: the buyer's own context (what they already
 * know), their restricted list (terms they may not receive at all), and the one line saying what
 * they need. The restricted list is D8's demonstration — a fund's list matches before anything is
 * measured and the job settles `Restricted`, having revealed one bit.
 *
 * Nothing here is sent yet: see the note under the fields and `TODO(E12.1)` in `lib/appraise.ts`.
 */
export function ContextFields({
  notes,
  restricted,
  need,
  onNotes,
  onRestricted,
  onNeed,
  disabled,
}: {
  notes: string;
  restricted: string;
  need: string;
  onNotes: (next: string) => void;
  onRestricted: (next: string) => void;
  onNeed: (next: string) => void;
  disabled: boolean;
}) {
  const terms = parseRestricted(restricted);
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="need">The stated need</Label>
        <Input
          id="need"
          value={need}
          disabled={disabled}
          placeholder="What you are trying to find out, in one line"
          onChange={(event) => onNeed(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          The room scores the good against this, not against a prompt it wrote itself (§3.15.1).
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Your context</Label>
        <Textarea
          id="notes"
          value={notes}
          disabled={disabled}
          rows={8}
          placeholder="Paste what you already know: one claim per line."
          onChange={(event) => onNotes(event.target.value)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Input
            id="notes-file"
            type="file"
            accept=".txt,.md,.jsonl,.json,.csv"
            disabled={disabled}
            className="h-9 max-w-xs text-xs"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) void file.text().then((text) => onNotes(text));
            }}
          />
          <p className="font-mono text-xs text-muted-foreground">
            {notes.length} characters · {notes.split('\n').filter((line) => line.trim() !== '').length}{' '}
            lines
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Novelty is measured against this: a claim you already hold is worth nothing, however good
          it is. The file is read in your browser.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="restricted">Restricted list</Label>
        <Textarea
          id="restricted"
          value={restricted}
          disabled={disabled}
          rows={3}
          placeholder="Comma- or newline-separated terms you may not receive"
          onChange={(event) => onRestricted(event.target.value)}
        />
        <p className="font-mono text-xs text-muted-foreground">{terms.length} terms</p>
        <p className="text-xs text-muted-foreground">
          Checked inside the room before the good is measured. A match settles the job
          <span className="font-mono"> Restricted</span>: you learn one bit, the seller is paid for
          that bit, and the good itself is forgotten under attestation (D8).
        </p>
      </div>
    </div>
  );
}
