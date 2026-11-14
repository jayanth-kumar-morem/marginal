import Link from 'next/link';

import { JobStateBadge } from '@/components/listings/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { account, bits, height, tokens } from '@/lib/format';
import type { JobRow } from '@/lib/jobs';

/** Every job this deployment has run, newest first. */
export function JobsTable({ rows }: { rows: readonly JobRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">#</TableHead>
          <TableHead>Kind</TableHead>
          <TableHead>Listing</TableHead>
          <TableHead>Buyer</TableHead>
          <TableHead>Mode</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Debit</TableHead>
          <TableHead className="w-28">State</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ job, settlement }) => (
          <TableRow key={job.id}>
            <TableCell className="font-mono text-xs">
              <Link href={`/jobs/${job.id}`} className="hover:underline">
                {job.id}
              </Link>
            </TableCell>
            <TableCell className="text-xs">{job.kind}</TableCell>
            <TableCell className="font-mono text-xs">
              <Link href={`/listing/${job.listing_id}`} className="hover:underline">
                {job.listing_id}v{job.listing_version}
              </Link>
            </TableCell>
            <TableCell className="font-mono text-xs">
              {job.buyer === null ? '—' : account(job.buyer)}
            </TableCell>
            <TableCell className="text-xs">
              {job.privacy === 'Sealed' ? 'Sealed' : 'Scored (open)'}
            </TableCell>
            <TableCell className="text-right font-mono text-xs tabular-nums">
              {settlement === null ? '—' : tokens(settlement.price)}
            </TableCell>
            <TableCell className="text-right font-mono text-xs tabular-nums">
              {settlement === null
                ? `≤ ${bits(job.max_debit_mbits)}`
                : bits(settlement.leakage_debit_mbits)}
            </TableCell>
            <TableCell>
              <JobStateBadge state={job.state} />
              <div className="pt-1 font-mono text-[10px] text-muted-foreground">
                due {height(job.deadline_height)}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
