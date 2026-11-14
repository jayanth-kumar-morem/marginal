import Link from 'next/link';

import { JobStateBadge, StatusBadge } from '@/components/listings/status-badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { account, bits, tokens } from '@/lib/format';
import { exactlyOneBit, type RestrictedJob } from '@/lib/compliance';
import { teaser } from '@/lib/listings';
import type { ListingRow } from '@/lib/listings';

/**
 * Section 1 of `/compliance` (D8, DRC-8): what was stopped, and what it cost.
 *
 * The two halves are different mechanisms and the page says so rather than lumping them together.
 * A **hold** is the operator's: an MNPI-flagged listing sits in `Held` and no appraisal can be
 * requested against it at all, so nothing was measured and nothing leaked. A **restricted
 * outcome** is the buyer's own: their restricted list matched inside the room, and the only thing
 * that came out is that it matched — one bit, which the contract debits so the reveal is paid for.
 */
export function HoldsPanel({
  held,
  restricted,
}: {
  held: readonly ListingRow[];
  restricted: readonly RestrictedJob[];
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Holds before appraisal</CardTitle>
          <CardDescription>
            A listing in <span className="font-mono text-xs">Held</span> refuses every appraisal
            request on chain, so no room ever read it. The hold is set by the screening result the
            seller&rsquo;s room reported, and only governance can clear it.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {held.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              Nothing is held on this deployment. The MNPI fixture listing is what puts a listing
              here, and it is published by the demo corpus rather than by hand.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">#</TableHead>
                  <TableHead>Good</TableHead>
                  <TableHead>Seller</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {held.map(({ listing }) => (
                  <TableRow key={`${listing.id}v${listing.version}`}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      <Link href={`/listing/${listing.id}`} className="underline">
                        {listing.id}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs">{teaser(listing)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {account(listing.seller)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={listing.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Restricted outcomes</CardTitle>
          <CardDescription>
            The buyer&rsquo;s restricted list matched inside the room. The verdict reveals that and
            nothing else, and the contract debits exactly one bit of the listing&rsquo;s leakage
            budget for it.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {restricted.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              No job on this deployment ended restricted. A fund&rsquo;s restricted list is uploaded
              with the appraisal request, so this fills in once the demo desk appraises a name it
              holds.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Job</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Refund</TableHead>
                  <TableHead className="w-24">State</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {restricted.map(({ job, settlement }) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      <Link href={`/jobs/${job.id}`} className="underline">
                        {job.id}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {job.buyer === null ? '—' : account(job.buyer)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono text-xs tabular-nums ${
                        exactlyOneBit(settlement)
                          ? 'text-brand-primary'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}
                      title={
                        exactlyOneBit(settlement)
                          ? 'Exactly one bit, as a restricted outcome should be.'
                          : 'More than one bit: this did not come from a restricted match alone.'
                      }
                    >
                      {bits(settlement.leakage_debit_mbits)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {tokens(settlement.refund)}
                    </TableCell>
                    <TableCell>
                      <JobStateBadge state={job.state} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
