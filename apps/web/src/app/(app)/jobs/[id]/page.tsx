import Link from 'next/link';
import { notFound } from 'next/navigation';

import { JobActions } from '@/components/jobs/job-actions';
import { ReplayPanel } from '@/components/jobs/replay-panel';
import { Row, Rows } from '@/components/listings/detail-rows';
import { JobStateBadge } from '@/components/listings/status-badge';
import { LoadError } from '@/components/load-error';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { blockHeight, chainClient } from '@/lib/chain';
import { loadConfig } from '@/lib/config.server';
import { account, bits, height, short, tokens } from '@/lib/format';
import { buckets, jobActions, loadJob, outcomeNote } from '@/lib/jobs';
import { simulatedElements, simulatedSummary } from '@/lib/simulated';

export const metadata = { title: 'Job' };
export const dynamic = 'force-dynamic';

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId) || jobId < 1) notFound();

  const config = loadConfig();
  const chain = chainClient(config.rpcUrl);
  let loaded: Awaited<ReturnType<typeof loadJob>>;
  try {
    loaded = await loadJob(chain, config.clearing, jobId);
  } catch (error) {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-8">
        <LoadError error={error} rpcUrl={config.rpcUrl} />
      </main>
    );
  }
  if (loaded === null) notFound();

  const { job, settlement } = loaded;
  const now = await blockHeight(config.rpcUrl).catch(() => job.requested_height);
  const actions = jobActions(job, now);
  const flags = settlement === null ? 0 : settlement.simulated_flags;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-2xl font-semibold tracking-tight">Job {job.id}</h2>
            <JobStateBadge state={job.state} />
            <Badge variant="outline" className="font-mono text-[10px]">
              {job.privacy === 'Sealed' ? 'Sealed' : 'Scored (open)'}
            </Badge>
          </div>
          <p className="pt-1 text-sm text-muted-foreground">
            {job.kind} of{' '}
            <Link href={`/listing/${job.listing_id}`} className="underline">
              listing {job.listing_id}v{job.listing_version}
            </Link>
            {job.buyer === null ? '' : ` for ${account(job.buyer)}`}
          </p>
          <p className="pt-1 text-sm">{outcomeNote(settlement)}</p>
        </div>
        <JobActions
          clearing={config.clearing}
          jobId={job.id}
          approve={actions.approve}
          refund={actions.refund}
        />
      </div>

      {flags !== 0 && (
        <Card className="border-brand-primary/30 bg-brand-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{simulatedSummary(flags)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs text-muted-foreground">
            {simulatedElements(flags).map((element) => (
              <p key={element.label}>
                <span className="font-mono">{element.label}</span> — {element.detail}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">State</CardTitle>
            <CardDescription>
              A job is a record with a deadline. Past its deadline, anyone can refund the buyer —
              no operator action needed (D11).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Rows>
              <Row label="state">{job.state}</Row>
              <Row label="requested">block {height(job.requested_height)}</Row>
              <Row label="deadline" note={now > job.deadline_height ? 'Passed.' : undefined}>
                block {height(job.deadline_height)}
              </Row>
              <Row label="chain head">block {height(now)}</Row>
              <Row label="commitment" note="What KeyPolicy and the room agreed the job was.">
                {short(job.job_commitment, 10)}
              </Row>
              <Row label="rooms">
                {job.assigned.length === 0
                  ? 'none assigned'
                  : job.assigned.map((key) => (
                      <div key={key}>
                        <Link href="/rooms" className="hover:underline">
                          {short(key, 10)}
                        </Link>
                      </div>
                    ))}
              </Row>
              <Row label="max debit" note="Reserved before the room ran; the debit cannot exceed it.">
                {bits(job.max_debit_mbits)}
              </Row>
            </Rows>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Money</CardTitle>
            <CardDescription>
              Every figure is the contract&rsquo;s own. Conservation is checked on every settlement
              (AC-4), and the verifier re-checks it from public data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Rows>
              {buckets(job).map((bucket) => (
                <Row key={bucket.label} label={bucket.label}>
                  {tokens(bucket.amount)}
                </Row>
              ))}
              {settlement !== null && (
                <>
                  <Row label="price">{tokens(settlement.price)}</Row>
                  <Row label="refund">{tokens(settlement.refund)}</Row>
                  <Row label="leakage debit">{bits(settlement.leakage_debit_mbits)}</Row>
                  <Row label="seller's π">{tokens(settlement.leakage_comp)}</Row>
                  <Row label="payout">{settlement.payout}</Row>
                </>
              )}
            </Rows>
          </CardContent>
        </Card>
      </div>

      {settlement !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Proof</CardTitle>
            <CardDescription>
              The certificate and the replay. Nothing here is taken on trust: the verifier recomputes
              the price, the conservation and the audit chain from the chain itself (D2).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Rows>
              <Row label="certificates">
                {settlement.cert_hashes.map((hash) => (
                  <div key={hash}>{short(hash, 12)}</div>
                ))}
              </Row>
              <Row label="delivery">
                {settlement.delivery_commitment === null
                  ? 'nothing was delivered'
                  : short(settlement.delivery_commitment, 12)}
              </Row>
              <Row label="receipt">
                {settlement.delivery_receipt === null
                  ? 'not submitted'
                  : short(settlement.delivery_receipt, 12)}
              </Row>
              {settlement.components_commitment !== null && (
                <Row
                  label="scores"
                  note="Sealed mode: the scores stayed in the room, and this is what a later opening is replayed against."
                >
                  {short(settlement.components_commitment, 12)}
                </Row>
              )}
              <Row label="audit seq">{settlement.audit_seq}</Row>
            </Rows>
            <ReplayPanel jobId={job.id} />
          </CardContent>
        </Card>
      )}
    </main>
  );
}
