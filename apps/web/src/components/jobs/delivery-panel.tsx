'use client';

import { useState } from 'react';
import { IconCheck, IconLock } from '@tabler/icons-react';
import { fromHex, getDeliveryKey, openDelivery, openGood, type Delivery } from '@marginal/sdk';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { short } from '@/lib/format';

interface Bundle {
  readonly delivery: Delivery;
  readonly objectHex: string;
}

/**
 * The buyer's decrypt-and-check (SDD §3.19, D1, DRC-1).
 *
 * Two things happen here, and the second is the one that matters. The delivered entry opens with
 * the buyer's own key, which proves the room delivered; then the good it unwraps is checked against
 * the commitment the listing published, which proves it is the good that was appraised and sold.
 * A delivery that decrypts but commits to something else is a failure, and this says so.
 *
 * Everything cryptographic is `@marginal/sdk` in this tab. The key is never sent anywhere — not to
 * the server, not into a URL — and the plaintext is never posted back.
 */
export function DeliveryPanel({
  jobId,
  listingId,
  listingVersion,
  jobCommitment,
  goodCommitment,
}: {
  jobId: number;
  listingId: number;
  listingVersion: number;
  jobCommitment: string;
  goodCommitment: string;
}) {
  const [keyHex, setKeyHex] = useState('');
  const [good, setGood] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = () => {
    setBusy(true);
    setError(null);
    setGood(null);
    void (async () => {
      try {
        // The key a buyer kept when they requested the appraisal, or one they still hold.
        const stored = await getDeliveryKey(jobId);
        const secret = keyHex.trim() === '' ? stored : fromHex(keyHex.trim());
        if (secret === null) {
          throw new Error(
            'this browser holds no delivery key for this job — paste the one you kept',
          );
        }
        const response = await fetch(
          `/api/delivery?job=${jobId}&listing=${listingId}&version=${listingVersion}`,
        );
        const body = (await response.json()) as { ok?: Bundle; error?: string };
        if (body.ok === undefined) throw new Error(body.error ?? 'the delivery could not be read');
        const payload = await openDelivery(body.ok.delivery, secret, fromHex(jobCommitment));
        setGood(await openGood(fromHex(body.ok.objectHex), payload, goodCommitment));
      } catch (failure: unknown) {
        setError(failure instanceof Error ? failure.message : String(failure));
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1 space-y-1.5">
          <Label htmlFor="delivery-key" className="text-xs">
            Delivery key
          </Label>
          <Input
            id="delivery-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="leave empty to use the key this browser kept"
            value={keyHex}
            onChange={(event) => setKeyHex(event.target.value)}
            className="font-mono text-xs"
          />
        </div>
        <Button size="sm" variant="outline" onClick={open} disabled={busy}>
          {busy ? 'Opening…' : 'Open and check'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        The key stays in this tab. Losing it means losing the delivery: there is no escrow of buyer
        keys, and the room cannot deliver again to a key it has never seen.
      </p>

      {error !== null && (
        <p className="font-mono text-xs text-brand-primary">
          <IconLock className="mr-1 inline size-3.5" />
          {error}
        </p>
      )}

      {good !== null && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
            >
              <IconCheck className="mr-1 size-3.5" />
              commitment checks out
            </Badge>
            <span className="font-mono text-[10px] text-muted-foreground">
              SHA-256(salt ‖ good) = {short(goodCommitment, 10)}
            </span>
          </div>
          <pre className="max-h-96 overflow-auto rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
            {good}
          </pre>
        </div>
      )}
    </div>
  );
}
