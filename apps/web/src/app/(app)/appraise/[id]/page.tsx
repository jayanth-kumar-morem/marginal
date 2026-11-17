import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AppraiseForm } from '@/components/appraise/appraise-form';
import { ListingSummary } from '@/components/appraise/listing-summary';
import { LoadError } from '@/components/load-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { pageChain } from '@/lib/chain';
import { loadConfig } from '@/lib/config.server';
import { loadListing, statusNote } from '@/lib/listings';
import type { ClearingConfig } from '@/lib/records';

export const metadata = { title: 'Appraise' };
export const dynamic = 'force-dynamic';

/**
 * `/appraise/[id]` (E13.4, D1, D8, D10; SDD §3.23).
 *
 * "Upload notes, write the stated need, choose budget and mode (blind or scored, with the debit and
 * cost shown), seal, request." The listing and the fee schedule are read here, on the server,
 * because they are public; the buyer's own context, balance and signature stay in the browser.
 *
 * A listing that cannot be appraised is offered nothing at all — `statusNote` says which state it
 * is in and why, in the words of §3.5's state machine.
 */
export default async function AppraisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listingId = Number(id);
  if (!Number.isInteger(listingId) || listingId < 1) notFound();

  const config = loadConfig();
  const chain = pageChain(config.rpcUrl);
  const loaded = await Promise.all([
    loadListing(chain, config.clearing, listingId),
    chain.view<ClearingConfig>(config.clearing, 'config'),
  ]).catch((error: unknown) => error as Error);

  if (loaded instanceof Error) {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-8">
        <LoadError error={loaded} rpcUrl={config.rpcUrl} />
      </main>
    );
  }
  const [row, clearing] = loaded;
  if (row === null) notFound();

  const { listing, leakage } = row;
  const status = statusNote(listing.status);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          Appraise listing {listing.id}
        </h2>
        <p className="pt-1 text-sm text-muted-foreground">
          Your own context, measured against this good inside an attested room. You pay for what you
          learn; the seller is paid for the bits it took to tell you.
        </p>
      </div>

      <ListingSummary listing={listing} leakage={leakage} />

      {!status.appraisable || leakage === null ? (
        <Card className="border-brand-primary/30">
          <CardHeader>
            <CardTitle className="text-base">This listing cannot be appraised</CardTitle>
            <CardDescription>
              {leakage === null
                ? 'It has no leakage account, so there is no budget to draw an appraisal from.'
                : status.note}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Nothing is offered here until the listing is{' '}
              <span className="font-mono">Active</span>: a request would be refused on chain
              (E_LISTING_NOT_ACTIVE), and a form that pretended otherwise would be the wrong kind of
              demo.
            </p>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/listing/${listing.id}`}>See the listing</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/listings">Back to the market</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <AppraiseForm
          clearing={config.clearing}
          rpcUrl={config.rpcUrl}
          listing={listing}
          leakage={leakage}
          feeBps={clearing.fees.clearing_fee_buyer_bps}
        />
      )}
    </main>
  );
}
