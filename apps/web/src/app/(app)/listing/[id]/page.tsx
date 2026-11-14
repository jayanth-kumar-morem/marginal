import Link from 'next/link';
import { notFound } from 'next/navigation';

import { LeakageMeter } from '@/components/listings/leakage-meter';
import { Row, Rows } from '@/components/listings/detail-rows';
import { StatusBadge } from '@/components/listings/status-badge';
import { LoadError } from '@/components/load-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { chainClient } from '@/lib/chain';
import { loadConfig } from '@/lib/config.server';
import { loadListing, loadPins, pinNote, priceLine, statusNote, teaser } from '@/lib/listings';
import { account, height, percent, short, tokens } from '@/lib/format';

export const metadata = { title: 'Listing' };
export const dynamic = 'force-dynamic';

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listingId = Number(id);
  if (!Number.isInteger(listingId) || listingId < 1) notFound();

  const config = loadConfig();
  const chain = chainClient(config.rpcUrl);
  let loaded: Awaited<ReturnType<typeof loadListing>>;
  try {
    loaded = await loadListing(chain, config.clearing, listingId);
  } catch (error) {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-8">
        <LoadError error={error} rpcUrl={config.rpcUrl} />
      </main>
    );
  }
  if (loaded === null) notFound();

  const { listing, leakage } = loaded;
  const pins = await loadPins(chain, config.keypolicy, listing).catch(() => null);
  const price = priceLine(listing);
  const status = statusNote(listing.status);
  const pinned = pinNote(pins);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              Listing {listing.id}
            </h2>
            <span className="font-mono text-sm text-muted-foreground">v{listing.version}</span>
            <StatusBadge status={listing.status} />
          </div>
          <p className="pt-1 text-sm text-muted-foreground">{teaser(listing)}</p>
          <p className="pt-1 text-sm">{status.note}</p>
        </div>
        <Button asChild disabled={!status.appraisable}>
          <Link href={status.appraisable ? `/appraise/${listing.id}` : '/listings'}>
            {status.appraisable ? 'Appraise this' : 'Not appraisable'}
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Price</CardTitle>
            <CardDescription>
              What the buyer pays if their own appraisal clears the rule. The price is the
              contract&rsquo;s, recomputed from the room&rsquo;s signed numbers (AC-1).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Rows>
              <Row label="rule">{price.rule === 'Posted' ? 'R1 · posted price' : price.rule}</Row>
              <Row label="ask">{price.ask === null ? '—' : tokens(price.ask)}</Row>
              <Row label="token">{account(listing.token)}</Row>
              <Row label="judgement floor" note="A judge can only discount from here (AC-41).">
                {percent(listing.l_floor_bps)}
              </Row>
              <Row label="external judges">
                {listing.external_judges_allowed ? 'allowed by the seller' : 'not allowed'}
              </Row>
              <Row label="copies">
                {listing.copies} of {listing.max_copies} sold
              </Row>
            </Rows>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leakage budget</CardTitle>
            <CardDescription>
              Every appraisal reveals something, so every appraisal debits bits and pays the seller
              π per bit. When the budget is gone the contract refuses new appraisals (D4).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {leakage === null ? (
              <p className="text-sm text-muted-foreground">No leakage account.</p>
            ) : (
              <LeakageMeter leakage={leakage} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">The good</CardTitle>
            <CardDescription>
              Public metadata only. The good itself is sealed to a key no one holds outside an
              attested room.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Rows>
              <Row label="seller">{account(listing.seller)}</Row>
              <Row label="appraiser">{listing.appraiser}</Row>
              <Row label="asset class">{listing.asset_class}</Row>
              <Row label="category">{listing.category}</Row>
              <Row label="value class">{listing.value_class}</Row>
              <Row label="commitment" note="SHA-256(salt ‖ canonical good).">
                {short(listing.good_commitment, 10)}
              </Row>
              <Row label="ciphertext">{short(listing.ciphertext.sha256, 10)}</Row>
              <Row label="schema">{short(listing.schema_hash, 10)}</Row>
              <Row label="disclosure">{listing.disclosure_policy}</Row>
            </Rows>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Keys and pins</CardTitle>
            <CardDescription>
              Which code may open this good. A seller&rsquo;s pins hold until the seller opts in to a
              new build (SC-20).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Rows>
              <Row label="key mode">
                {listing.key_mode}
                {listing.key_mode === 'Ckd' ? ' · MPC chain key derivation' : ''}
              </Row>
              <Row label="key path">{short(listing.key_path_hash, 10)}</Row>
              <Row label="listing key">{listing.pk_l === null ? 'not provisioned yet' : short(listing.pk_l, 10)}</Row>
              <Row
                label="pins"
                note={
                  pinned.follows
                    ? 'Follows governance: any measurement set governance approves may open it.'
                    : 'Only these measurements may open it.'
                }
              >
                {pinned.follows
                  ? 'FollowGovernance'
                  : pinned.hashes.map((hash) => <div key={hash}>{short(hash, 10)}</div>)}
              </Row>
              <Row label="windows" mono={false}>
                <span className="font-mono text-xs">
                  challenge {height(listing.challenge_window_blocks)} blocks · delivery{' '}
                  {height(listing.delivery_deadline_blocks)} blocks
                </span>
              </Row>
              <Row label="published">
                {listing.publish_height === null
                  ? 'not published yet'
                  : `block ${height(listing.publish_height)}`}
              </Row>
            </Rows>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
