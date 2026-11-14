import Link from 'next/link';

import { LeakageMeter } from '@/components/listings/leakage-meter';
import { StatusBadge } from '@/components/listings/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { account, tokens } from '@/lib/format';
import { priceLine, teaser, type ListingRow } from '@/lib/listings';

/** The market. One row per listing version, with the two numbers a buyer decides on. */
export function ListingsTable({ rows }: { rows: readonly ListingRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">#</TableHead>
          <TableHead>Good</TableHead>
          <TableHead>Seller</TableHead>
          <TableHead>Appraiser</TableHead>
          <TableHead className="text-right">Ask</TableHead>
          <TableHead>Leakage</TableHead>
          <TableHead className="w-24">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ listing, leakage }) => {
          const price = priceLine(listing);
          return (
            <TableRow key={`${listing.id}v${listing.version}`}>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {listing.id}
                <span className="opacity-60">v{listing.version}</span>
              </TableCell>
              <TableCell className="font-medium">
                <Link href={`/listing/${listing.id}`} className="hover:underline">
                  {listing.category}
                </Link>
                <div className="text-xs text-muted-foreground">{teaser(listing)}</div>
              </TableCell>
              <TableCell className="font-mono text-xs">{account(listing.seller)}</TableCell>
              <TableCell className="font-mono text-xs">{listing.appraiser}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {price.ask === null ? (
                  <span className="text-muted-foreground">{price.rule}</span>
                ) : (
                  tokens(price.ask)
                )}
              </TableCell>
              <TableCell>
                {leakage === null ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : (
                  <LeakageMeter leakage={leakage} compact />
                )}
              </TableCell>
              <TableCell>
                <StatusBadge status={listing.status} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
