'use client';

import { useCallback, useRef, useState } from 'react';
import JSZip from 'jszip';
import { IconCheck, IconAlertTriangle, IconDownload, IconUpload } from '@tabler/icons-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  EXPORT_FILES,
  exportFiles,
  exportName,
  type AuditExport,
  type Reverification,
} from '@/lib/compliance';
import { short } from '@/lib/format';

/** The zip's own file names, in the order a reader should open them. */
const NAMES = [
  EXPORT_FILES.manifest,
  EXPORT_FILES.entries,
  EXPORT_FILES.settlements,
  EXPORT_FILES.listings,
  EXPORT_FILES.certificates,
] as const;

async function buildZip(data: AuditExport): Promise<Blob> {
  const zip = new JSZip();
  for (const file of exportFiles(data)) zip.file(file.name, file.text);
  return zip.generateAsync({ type: 'blob' });
}

function save(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  // In the document and revoked on a timer: Firefox ignores a click on a detached anchor, and
  // revoking the URL in the same tick cancels the download before it has started.
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Reads the five files out of a zip the officer loaded back in. */
async function readZip(file: File): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const files: Record<string, string> = {};
  for (const name of NAMES) {
    const entry = zip.file(name);
    if (entry !== null) files[name] = await entry.async('string');
  }
  return files;
}

/**
 * The export and its re-verification (DRC-8: "the audit export re-verifies"; SPEC SC-22).
 *
 * The export is built from views alone — the audit entries, the settlement records, the listings'
 * public metadata and the certificate hashes — which is exactly why it re-verifies without a
 * signature from us. Loading it back in walks the chain again, folds the export's own entries into
 * a head, and names any entry that no longer matches. A chain that has moved on since the export
 * is reported as such rather than as a failure, because on a live deployment it always will have.
 *
 * The zip is assembled here in the browser; what the route handler supplies is the chain data and
 * `marginal-core`'s hash step, neither of which can run in a page.
 */
export function AuditExportCard() {
  const [data, setData] = useState<AuditExport | null>(null);
  const [busy, setBusy] = useState<'export' | 'verify' | null>(null);
  const [report, setReport] = useState<Reverification | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const build = useCallback(() => {
    setBusy('export');
    void fetch('/api/compliance?op=export')
      .then(async (response) => {
        const body = (await response.json()) as { export?: AuditExport; error?: string };
        if (body.export === undefined) throw new Error(body.error ?? 'the export was refused');
        setData(body.export);
        save(await buildZip(body.export), exportName(body.export.manifest));
        toast.success('Audit export downloaded', {
          description: `${body.export.manifest.entries} audit entries, ${body.export.manifest.settlements} settlements, ${body.export.manifest.certificates} certificate hashes. Load it back in below to re-verify it.`,
        });
      })
      .catch((error: unknown) => {
        toast.error('The export could not be built', {
          description: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => setBusy(null));
  }, []);

  const verify = useCallback((file: File) => {
    setBusy('verify');
    setReport(null);
    void readZip(file)
      .then(async (files) => {
        const response = await fetch('/api/compliance', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ files }),
        });
        const body = (await response.json()) as { report?: Reverification; error?: string };
        if (body.report === undefined) throw new Error(body.error ?? 'that is not an export');
        setReport(body.report);
      })
      .catch((error: unknown) => {
        toast.error('That export did not re-verify', {
          description: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => setBusy(null));
  }, []);

  return (
    <div className="space-y-4">
      <Separator />
      <div>
        <h3 className="font-display text-sm font-semibold tracking-tight">Audit export</h3>
        <p className="pt-1 text-sm text-muted-foreground">
          A zip holding the audit entries, the settlement records, the listings&rsquo; public
          metadata and the certificate hashes, with a{' '}
          <span className="font-mono text-xs">manifest.json</span> naming the chain, the clearing
          account, the published head and the head recomputed from the entries. Every byte of it
          came from a contract view, so anyone can check it against the chain &mdash; including this
          page.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={build} disabled={busy !== null} className="rounded-md">
          <IconDownload className="mr-1 size-4" />
          {busy === 'export' ? 'Building…' : 'Build and download'}
        </Button>
        <Button
          variant="outline"
          disabled={busy !== null}
          className="rounded-md"
          onClick={() => picker.current?.click()}
        >
          <IconUpload className="mr-1 size-4" />
          {busy === 'verify' ? 'Re-verifying…' : 'Re-verify an export'}
        </Button>
        <input
          ref={picker}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file !== undefined) verify(file);
          }}
        />
        {data === null ? null : (
          <span className="font-mono text-xs text-muted-foreground">
            last export: head {short(data.manifest.head, 8)} at sequence {data.manifest.head_seq}
          </span>
        )}
      </div>

      {report === null ? null : (
        <div
          className={`space-y-2 rounded-lg border px-4 py-3 ${
            report.holds ? 'border-brand-primary/40 bg-brand-primary/10' : 'border-amber-600/40'
          }`}
        >
          <p className="flex items-center gap-2 text-sm font-medium">
            {report.holds ? (
              <IconCheck className="size-4 text-brand-primary" />
            ) : (
              <IconAlertTriangle className="size-4 text-amber-600" />
            )}
            {report.holds
              ? 'This export re-verifies against the chain.'
              : 'This export does not match the chain.'}
          </p>
          <dl className="grid gap-x-6 gap-y-1 font-mono text-xs sm:grid-cols-2">
            <Pair label="taken" value={report.manifest.exported_at} />
            <Pair label="clearing" value={report.manifest.clearing} />
            <Pair label="entries" value={String(report.manifest.entries)} />
            <Pair label="export head" value={short(report.manifest.head, 8)} />
            <Pair label="recomputed now" value={short(report.recomputed, 8)} />
            <Pair
              label="chain head"
              value={`${short(report.chainHead.head, 8)} at ${report.chainHead.seq}`}
            />
          </dl>
          {report.advanced ? (
            <p className="text-xs text-muted-foreground">
              The chain has reached sequence {report.chainHead.seq} since this export was taken at{' '}
              {report.manifest.head_seq}. Expected on a live deployment: the entries this export
              covers are checked, and the later ones are simply not in it.
            </p>
          ) : null}
          {report.mismatches.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Every entry in the export is still exactly what the chain says, and folding them gives
              the head the export recorded. What that settles is the audit chain: each entry commits
              to its event&rsquo;s payload, so an entry that still matches is an event that was not
              edited. Recomputing a settlement&rsquo;s own figures from the room&rsquo;s components
              is a different check, and <span className="font-mono">/verify</span> is where it runs.
            </p>
          ) : (
            <ul className="space-y-1 text-xs">
              {report.mismatches.slice(0, 20).map((mismatch) => (
                <li key={`${mismatch.seq}-${mismatch.problem}`} className="font-mono">
                  seq {mismatch.seq}: {mismatch.problem}
                </li>
              ))}
              {report.mismatches.length > 20 ? (
                <li className="text-muted-foreground">
                  &hellip; and {report.mismatches.length - 20} more.
                </li>
              ) : null}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-all">{value}</dd>
    </div>
  );
}
