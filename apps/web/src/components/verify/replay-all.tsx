'use client';

import { useState } from 'react';
import { IconCheck, IconMinus, IconX } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Check {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
  readonly unchecked?: boolean;
}

interface Report {
  readonly job_id: number;
  readonly ok: boolean;
  readonly checks: readonly Check[];
}

/**
 * The replay explorer (D2): re-checks every settlement this deployment has, from public chain data,
 * and shows each check by name. DRC-2 asks for "OK for 100% of settlements" — so the page shows the
 * count, not a green tick, and a check that could not be run from a view is marked as such rather
 * than counted as a pass.
 */
export function ReplayAll({ jobIds }: { jobIds: readonly number[] }) {
  const [reports, setReports] = useState<Record<number, Report | string>>({});
  const [busy, setBusy] = useState(false);

  const one = async (jobId: number) => {
    const response = await fetch(`/api/replay/${jobId}`);
    const body = (await response.json()) as Report & { error?: string };
    setReports((all) => ({ ...all, [jobId]: response.ok ? body : (body.error ?? 'failed') }));
  };

  const all = () => {
    setBusy(true);
    // In sequence, because each replay walks the whole audit log and the point is the result, not
    // the speed.
    jobIds
      .reduce((chain, jobId) => chain.then(() => one(jobId)), Promise.resolve())
      .finally(() => setBusy(false));
  };

  const done = jobIds.filter((id) => typeof reports[id] === 'object');
  const good = done.filter((id) => (reports[id] as Report).ok);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={all} disabled={busy || jobIds.length === 0}>
          {busy ? 'Replaying…' : `Replay ${jobIds.length} settlement${jobIds.length === 1 ? '' : 's'}`}
        </Button>
        {done.length > 0 && (
          <Badge
            variant="outline"
            className={
              good.length === done.length
                ? 'border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400'
                : 'border-brand-primary/40 bg-brand-primary/10 text-brand-primary'
            }
          >
            {good.length} of {done.length} re-verified
          </Badge>
        )}
      </div>

      {done.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Job</TableHead>
              <TableHead>Checks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {done.map((jobId) => {
              const report = reports[jobId] as Report;
              return (
                <TableRow key={jobId}>
                  <TableCell className="align-top font-mono text-xs">{jobId}</TableCell>
                  <TableCell>
                    <ul className="space-y-1">
                      {report.checks.map((check) => (
                        <li key={check.name} className="flex items-start gap-2 text-xs">
                          {check.unchecked === true ? (
                            <IconMinus className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          ) : check.ok ? (
                            <IconCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                          ) : (
                            <IconX className="mt-0.5 size-3.5 shrink-0 text-brand-primary" />
                          )}
                          <span className="min-w-40 font-mono">{check.name}</span>
                          <span className="text-muted-foreground">{check.detail}</span>
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {jobIds.filter((id) => typeof reports[id] === 'string').map((id) => (
        <p key={id} className="font-mono text-xs text-brand-primary">
          job {id}: {reports[id] as string}
        </p>
      ))}
    </div>
  );
}
