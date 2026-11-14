import Link from 'next/link';

import { Row, Rows } from '@/components/listings/detail-rows';
import { LoadError } from '@/components/load-error';
import { ReplayAll } from '@/components/verify/replay-all';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { chainClient } from '@/lib/chain';
import { loadConfig } from '@/lib/config.server';
import { height, short, when } from '@/lib/format';
import { loadJobs } from '@/lib/jobs';
import { loadRoom, modeNote } from '@/lib/rooms';
import { simulatedSummary } from '@/lib/simulated';

export const metadata = { title: 'Verify' };
export const dynamic = 'force-dynamic';

export default async function VerifyPage() {
  const config = loadConfig();
  const chain = chainClient(config.rpcUrl);
  let jobs: Awaited<ReturnType<typeof loadJobs>> | Error;
  try {
    jobs = await loadJobs(chain, config.clearing);
  } catch (error) {
    jobs = error instanceof Error ? error : new Error(String(error));
  }

  if (jobs instanceof Error) {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-8">
        <LoadError error={jobs} rpcUrl={config.rpcUrl} />
      </main>
    );
  }

  const settled = jobs.filter((row) => row.settlement !== null);
  // The certificate walk starts from a settled job's room: room key → KeyPolicy's attestation →
  // the quote it was verified from → the measurement governance approved.
  const first = settled.find((row) => row.job.assigned.length > 0);
  const roomKey = first?.job.assigned[0];
  const room =
    roomKey === undefined
      ? null
      : await loadRoom(chain, config.clearing, config.keypolicy, roomKey).catch(() => null);
  const mode = modeNote(room?.attestation?.mode ?? null);
  const flagged = settled.filter((row) => (row.settlement?.simulated_flags ?? 0) !== 0);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">Verify</h2>
        <p className="pt-1 text-sm text-muted-foreground">
          Every settlement, re-checked from public chain data with the same{' '}
          <span className="font-mono">marginal-core</span> the contract ran. Nothing here is taken
          from us: the only inputs are four contract views, and anyone can run the same verifier.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Replay explorer</CardTitle>
          <CardDescription>
            {settled.length === 0
              ? 'No settlement to replay yet.'
              : `${settled.length} settlement${settled.length === 1 ? '' : 's'} on ${config.clearing}. A check marked with a dash is one four views cannot give — the verifier says so rather than counting it as a pass.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReplayAll jobIds={settled.map((row) => row.job.id)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Certificate to quote</CardTitle>
          <CardDescription>
            A forget certificate names the room that issued it; the room&rsquo;s key names an
            attestation record; the record names the TDX quote it was verified from and the
            measurement governance approved. That is the whole chain from a settlement to silicon.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {first === undefined || room === null ? (
            <p className="text-sm text-muted-foreground">
              No settled job has a room assigned yet, so there is no certificate to walk.
            </p>
          ) : (
            <Rows>
              <Row label="settlement">
                <Link href={`/jobs/${first.job.id}`} className="hover:underline">
                  job {first.job.id} · {first.settlement?.outcome}
                </Link>
              </Row>
              <Row label="certificate">
                {(first.settlement?.cert_hashes ?? []).map((hash) => (
                  <div key={hash}>{short(hash, 12)}</div>
                ))}
              </Row>
              <Row label="room key">
                <Link href="/rooms" className="hover:underline">
                  {short(room.key, 12)}
                </Link>
              </Row>
              <Row label="attestation mode" note={mode.note}>
                <Badge
                  variant="outline"
                  className={
                    mode.real
                      ? 'border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400'
                      : 'border-brand-primary/40 bg-brand-primary/10 text-brand-primary'
                  }
                >
                  {room.attestation?.mode ?? 'none'}
                </Badge>
              </Row>
              <Row label="quote">
                {room.attestation === null ? '—' : short(room.attestation.quote_hash, 12)}
              </Row>
              <Row label="collateral">
                {room.attestation === null ? '—' : short(room.attestation.collateral_hash, 12)}
              </Row>
              <Row label="measurement">
                {room.attestation === null ? '—' : short(room.attestation.measurement_hash, 12)}
              </Row>
              <Row label="compose hash" note="Reproducible from the git tag the image was built at.">
                {room.attestation === null
                  ? '—'
                  : short(room.attestation.measurement.compose_hash, 12)}
              </Row>
              <Row label="verified">
                {room.attestation === null
                  ? '—'
                  : `block ${height(room.attestation.verified_height)}, expires ${when(room.attestation.expires_at)}`}
              </Row>
            </Rows>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Simulated elements</CardTitle>
          <CardDescription>
            Counted from the chain, not from a list we keep (DRC-12). A verifier reports these the
            same way, which is why the README&rsquo;s real-versus-simulated table is generated from
            them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {settled.length === 0 ? (
            <p className="text-muted-foreground">Nothing has settled yet.</p>
          ) : flagged.length === 0 ? (
            <p className="text-muted-foreground">
              No settlement on {config.clearing} carries a simulated flag.
            </p>
          ) : (
            flagged.map((row) => (
              <p key={row.job.id}>
                <Link href={`/jobs/${row.job.id}`} className="font-mono underline">
                  job {row.job.id}
                </Link>{' '}
                — {simulatedSummary(row.settlement?.simulated_flags ?? 0)}
              </p>
            ))
          )}
        </CardContent>
      </Card>
    </main>
  );
}
