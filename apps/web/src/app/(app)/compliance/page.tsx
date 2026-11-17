/**
 * `/compliance` (E13.7, demo surface D8, checked by DRC-8; SPEC SC-22).
 *
 * The compliance officer's page, and the one page on which Marginal has to show its work. Three
 * sections, in the order the control actually happens: what was **stopped** before anything could
 * be measured, what the officer can **open** of a purchase the desk made, and the **audit chain**
 * that ties the two to the contract — walked and refolded here rather than quoted.
 *
 * The audit fold runs on the server, because `marginal-core`'s `audit_step` is wasm loaded through
 * `node:fs`. Everything the browser needs afterwards goes through `/api/compliance`.
 */
import { AuditChain } from '@/components/compliance/audit-chain';
import { CopyDecrypt } from '@/components/compliance/copy-decrypt';
import { HoldsPanel } from '@/components/compliance/holds-panel';
import { ScreeningLookup } from '@/components/compliance/screening-lookup';
import { LoadError } from '@/components/load-error';
import { call } from '@marginal/core-wasm';

import { pageChain } from '@/lib/chain';
import {
  AUDIT_PAGE,
  checkAudit,
  complianceCopies,
  heldListings,
  restrictedJobs,
  type AuditStep,
} from '@/lib/compliance';
import { loadConfig } from '@/lib/config.server';
import { loadJobs } from '@/lib/jobs';
import { loadListings } from '@/lib/listings';

export const metadata = { title: 'Compliance' };
/**
 * Never cached by Next: a control shown from a cache is a control nobody can rely on. Its views do
 * come through `pageChain`, which keeps an answer for a few blocks so the audit walk does not spend
 * a public RPC's allowance on every visit; the heads it compares are read in that same window.
 */
export const dynamic = 'force-dynamic';

/** The one hash step, from the implementation the contract itself uses (SDD §3.10). */
const step: AuditStep = (prevHead, entry) =>
  call('audit_step', { prev_head: prevHead, entry }) as string;

export default async function CompliancePage() {
  const config = loadConfig();
  const chain = pageChain(config.rpcUrl);
  // `allSettled`, so one view that refuses does not blank the other two sections: a page that
  // cannot reach the chain should still say which part of it is missing.
  const [listings, jobs, audit] = await Promise.allSettled([
    loadListings(chain, config.clearing),
    loadJobs(chain, config.clearing),
    checkAudit(chain, config.clearing, step, AUDIT_PAGE),
  ]);

  const listingRows = listings.status === 'fulfilled' ? listings.value : [];
  const jobRows = jobs.status === 'fulfilled' ? jobs.value : [];
  const refused = [listings, jobs, audit].filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">Compliance</h2>
        <p className="max-w-3xl pt-1 text-sm text-muted-foreground">
          What was held, what was restricted, what the compliance key can open, and the hash-chained
          audit trail behind all three. Nothing here needs the content of a good: the controls run on
          commitments, screening reports and settlement records, so a regulator can be shown the
          controls without Marginal ever having seen what was sold.
        </p>
      </div>

      {refused.length === 0 ? null : (
        <LoadError error={refused[0]?.reason} rpcUrl={config.rpcUrl} />
      )}

      <HoldsPanel held={heldListings(listingRows)} restricted={restrictedJobs(jobRows)} />

      <ScreeningLookup endpoint={config.compliance} />

      <CopyDecrypt jobs={complianceCopies(jobRows).map((row) => row.job)} />

      {audit.status === 'fulfilled' ? (
        <AuditChain check={audit.value} clearing={config.clearing} chainId={config.chainId} />
      ) : null}
    </main>
  );
}
