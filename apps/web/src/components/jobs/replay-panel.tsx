'use client';

import { useState } from 'react';
import { IconCheck, IconX } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/** One check `replay-ts` ran, and what it found. */
export interface ReplayCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface ReplayReport {
  readonly job_id: number;
  readonly ok: boolean;
  readonly checks: readonly ReplayCheck[];
}

/**
 * Re-checks one settlement from public chain data (D2, and DRC-1's "both certificates verify").
 *
 * The work happens in `@marginal/replay-ts` behind `/api/replay/[jobId]`, so the browser never has
 * to hold `marginal-core`'s wasm, and the same verifier answers the gateway's `/v1/replay/:id`.
 */
export function ReplayPanel({ jobId }: { jobId: number }) {
  const [report, setReport] = useState<ReplayReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = () => {
    setBusy(true);
    setError(null);
    fetch(`/api/replay/${jobId}`)
      .then(async (response) => {
        const body = (await response.json()) as ReplayReport & { error?: string };
        if (!response.ok) throw new Error(body.error ?? `the verifier answered ${response.status}`);
        setReport(body);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" onClick={run} disabled={busy}>
          {busy ? 'Replaying…' : 'Verify this settlement'}
        </Button>
        {report !== null && (
          <Badge
            variant="outline"
            className={
              report.ok
                ? 'border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400'
                : 'border-brand-primary/40 bg-brand-primary/10 text-brand-primary'
            }
          >
            {report.ok ? 'every check passed' : 'a check failed'}
          </Badge>
        )}
      </div>
      {error !== null && <p className="font-mono text-xs text-brand-primary">{error}</p>}
      {report !== null && (
        <ul className="space-y-1">
          {report.checks.map((check) => (
            <li key={check.name} className="flex items-start gap-2 text-xs">
              {check.ok ? (
                <IconCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
              ) : (
                <IconX className="mt-0.5 size-3.5 shrink-0 text-brand-primary" />
              )}
              <span className="font-mono">{check.name}</span>
              <span className="text-muted-foreground">{check.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
