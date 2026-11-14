import { IconCheck, IconAlertTriangle } from '@tabler/icons-react';

import { AuditExportCard } from '@/components/compliance/audit-export';
import { Row, Rows } from '@/components/listings/detail-rows';
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
import type { AuditCheck } from '@/lib/compliance';
import { height, short } from '@/lib/format';

/** The last few entries, so the reader sees what the chain is made of rather than only its head. */
const TAIL = 12;

/**
 * Section 3 of `/compliance` (D8, DRC-8; SDD §3.10, AC-37, SPEC SC-22).
 *
 * Every state-changing call on clearing appends an entry and folds it into a head, so a change to
 * any past entry breaks every head after it. This card does the folding itself: it walks
 * `get_audit` to the end, recomputes the chain with `marginal-core`'s own `audit_step`, and
 * compares the result with `audit_head()`. The contract's answer is shown beside the recomputed
 * one rather than instead of it, because the whole point is that a reader does not have to take it.
 */
export function AuditChain({ check, clearing, chainId }: {
  check: AuditCheck;
  clearing: string;
  chainId: string;
}) {
  const tail = check.entries.slice(-TAIL);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {check.holds ? (
            <IconCheck className="size-4 text-brand-primary" />
          ) : (
            <IconAlertTriangle className="size-4 text-amber-600" />
          )}
          Audit chain
        </CardTitle>
        <CardDescription>
          {check.entries.length === 0
            ? 'This deployment has no audit entries yet, so the head is still genesis. The chain holds trivially; it will have something to say once a listing or a job moves.'
            : check.holds
              ? `All ${check.entries.length.toLocaleString('en-US')} entries were walked from sequence 1 and folded back into the head the contract published. Changing any one of them would change every head after it.`
              : 'The recomputed head does not match the one the contract published. That is either a view that paged wrongly or a chain that does not hold, and neither should be passed over.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Rows>
          <Row label="clearing" note={`chain ${chainId}`}>
            {clearing}
          </Row>
          <Row label="entries" mono={false}>
            <span className="font-mono text-xs tabular-nums">
              {check.entries.length.toLocaleString('en-US')} of {check.head.seq.toLocaleString('en-US')}
            </span>
          </Row>
          <Row label="published head" note="clearing.audit_head()">
            {short(check.head.head, 12)}
          </Row>
          <Row label="recomputed head" note="Folded here from every entry, with marginal-core's audit_step.">
            <span className={check.holds ? 'text-brand-primary' : 'text-amber-700 dark:text-amber-400'}>
              {short(check.recomputed, 12)}
            </span>
          </Row>
          {check.missing.length === 0 ? null : (
            <Row label="missing" note="Sequences the view did not return. A gap breaks the fold.">
              {check.missing.slice(0, 20).join(', ')}
              {check.missing.length > 20 ? ` … (${check.missing.length} in all)` : ''}
            </Row>
          )}
        </Rows>

        {tail.length === 0 ? null : (
          <div className="overflow-hidden rounded-lg border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">seq</TableHead>
                  <TableHead>event</TableHead>
                  <TableHead className="w-20">subject</TableHead>
                  <TableHead className="w-28 text-right">height</TableHead>
                  <TableHead>payload hash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tail.map((entry) => (
                  <TableRow key={entry.seq}>
                    <TableCell className="font-mono text-xs text-muted-foreground tabular-nums">
                      {entry.seq}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{entry.kind}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground tabular-nums">
                      {entry.subject_id}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground tabular-nums">
                      {height(entry.height)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {short(entry.payload_hash, 8)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <AuditExportCard />
      </CardContent>
    </Card>
  );
}
