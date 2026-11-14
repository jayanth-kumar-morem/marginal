import Link from 'next/link';

import { Row, Rows } from '@/components/listings/detail-rows';
import { LeakageMeter } from '@/components/listings/leakage-meter';
import { StatusBadge } from '@/components/listings/status-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { account, percent, tokens } from '@/lib/format';
import { priceLine, statusNote, teaser } from '@/lib/listings';
import type { Leakage, Listing } from '@/lib/records';

/**
 * What is being appraised (E13.4, D1). Public metadata only: the good itself is sealed to a key no
 * one holds outside an attested room, and this page never sees it.
 */
export function ListingSummary({
  listing,
  leakage,
}: {
  listing: Listing;
  leakage: Leakage | null;
}) {
  const price = priceLine(listing);
  const status = statusNote(listing.status);
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Link href={`/listing/${listing.id}`} className="hover:underline">
              Listing {listing.id}
            </Link>
            <span className="font-mono text-xs text-muted-foreground">v{listing.version}</span>
            <StatusBadge status={listing.status} />
          </CardTitle>
          <span className="font-mono text-xs text-muted-foreground">{listing.appraiser}</span>
        </div>
        <CardDescription>
          {teaser(listing)} · {status.note}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <Rows>
          <Row label="ask" note="R1: a deal at exactly the ask, or no deal.">
            {price.ask === null ? price.rule : tokens(price.ask)}
          </Row>
          <Row label="judgement floor" note="A judge can only discount from here (AC-41).">
            {percent(listing.l_floor_bps)}
          </Row>
          <Row label="seller">{account(listing.seller)}</Row>
          <Row label="token">{account(listing.token)}</Row>
          <Row label="copies">
            {listing.copies} of {listing.max_copies} sold
          </Row>
        </Rows>
        <div>
          <p className="pb-2 text-xs text-muted-foreground">
            The leakage budget this appraisal draws on. When it is gone the contract refuses new
            appraisals (D4).
          </p>
          {leakage === null ? (
            <p className="text-sm text-muted-foreground">No leakage account.</p>
          ) : (
            <LeakageMeter leakage={leakage} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
