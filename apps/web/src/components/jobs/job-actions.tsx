'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useWallet } from '@/components/wallet';
import { errorCode } from '@/lib/chain';

/**
 * The two calls a page can make on a job, both signed by the viewer's own wallet.
 *
 * `approve_parked` is D5's button: an agent key hit its cap, the job was parked, and only a
 * non-agent key can let it through. `refund_expired` is D11's: once the deadline has passed anyone
 * may call it, which is the point — the buyer does not depend on the operator to be made whole.
 */
export function JobActions({
  clearing,
  jobId,
  approve,
  refund,
}: {
  clearing: string;
  jobId: number;
  approve: boolean;
  refund: boolean;
}) {
  const wallet = useWallet();
  const [busy, setBusy] = useState<string | null>(null);

  const send = (method: string, label: string) => {
    setBusy(method);
    wallet
      .send({ contract: clearing, method, args: { job_id: String(jobId) } })
      .then((hash) => toast.success(`${label} sent`, { description: hash }))
      .catch((error: unknown) => toast.error(label, { description: errorCode(error) }))
      .finally(() => setBusy(null));
  };

  if (!approve && !refund) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {approve && (
        <Button
          size="sm"
          disabled={wallet.accountId === null || busy !== null}
          onClick={() => send('approve_parked', 'Approve')}
        >
          {busy === 'approve_parked' ? 'Approving…' : 'Approve this job'}
        </Button>
      )}
      {refund && (
        <Button
          size="sm"
          variant="outline"
          disabled={wallet.accountId === null || busy !== null}
          onClick={() => send('refund_expired', 'Refund')}
        >
          {busy === 'refund_expired' ? 'Refunding…' : 'Refund (deadline passed)'}
        </Button>
      )}
      {wallet.accountId === null && (
        <p className="self-center text-xs text-muted-foreground">
          Connect a wallet to sign. Anyone may refund an expired job.
        </p>
      )}
    </div>
  );
}
