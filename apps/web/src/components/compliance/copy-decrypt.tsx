'use client';

import { useCallback, useState } from 'react';
import { IconLock, IconLockOpen2, IconTrash } from '@tabler/icons-react';
import { toast } from 'sonner';

import { fromHex, openDelivery } from '@marginal/sdk';

import { Row, Rows } from '@/components/listings/detail-rows';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { account, short } from '@/lib/format';
import type { SealedDelivery } from '@/lib/compliance';
import type { Job } from '@/lib/records';

/** A 32-byte secret key as the officer holds it: 64 characters of hex, nothing else. */
const KEY_HEX = /^[0-9a-f]{64}$/;

type Opened =
  | { readonly state: 'idle' }
  | { readonly state: 'opening' }
  | { readonly state: 'failed'; readonly error: string }
  | { readonly state: 'opened'; readonly dek: string; readonly listingVersion: number };

type Fetched =
  | { readonly state: 'idle' }
  | { readonly state: 'loading' }
  | { readonly state: 'failed'; readonly error: string }
  | { readonly state: 'ready'; readonly delivery: SealedDelivery };

async function fetchDelivery(jobId: number): Promise<Fetched> {
  const response = await fetch(`/api/compliance?op=delivery&job=${jobId}`);
  const body = (await response.json()) as
    | { reachable: true; delivery: SealedDelivery }
    | { reachable: false; error: string }
    | { error: string };
  if ('delivery' in body) return { state: 'ready', delivery: body.delivery };
  return { state: 'failed', error: body.error };
}

/**
 * Section 2 of `/compliance` (D8, DRC-8; SDD §3.19, AC-55).
 *
 * A delivery is one ephemeral key and one sealed entry per recipient. When the buyer asked for a
 * compliance copy, the room sealed `DEK_g` to the compliance public key as a second entry — the
 * buyer first, the compliance copy second, in that order, because the order is part of `h_D` and
 * the verdict committed to it. So the officer opens the desk&rsquo;s purchase with the compliance
 * key alone; the buyer&rsquo;s own key is never involved and Marginal never holds either.
 *
 * The pasted key stays in this component. It is never put in a URL, never sent to the route
 * handler and never logged: the route handler&rsquo;s only job here is to fetch the sealed bundle
 * from the gateway, which is public by construction — without a key it is noise.
 */
export function CopyDecrypt({ jobs }: { jobs: readonly Job[] }) {
  const [key, setKey] = useState('');
  const [selected, setSelected] = useState<number | null>(jobs[0]?.id ?? null);
  const [fetched, setFetched] = useState<Fetched>({ state: 'idle' });
  const [opened, setOpened] = useState<Opened>({ state: 'idle' });

  const job = jobs.find((candidate) => candidate.id === selected) ?? null;
  const valid = KEY_HEX.test(key);

  const load = useCallback((jobId: number) => {
    setSelected(jobId);
    setFetched({ state: 'loading' });
    void fetchDelivery(jobId).then(setFetched);
  }, []);

  /**
   * Opens the compliance entry with `@marginal/sdk`'s `openDelivery` — the same derivation the room
   * runs in `room/src/crypto/delivery.ts`, and the only implementation of it on this side. What it
   * yields is `DEK_g`, the key to the good, which is why the pasted key never leaves this tab.
   */
  const open = useCallback(() => {
    if (!KEY_HEX.test(key) || job === null || fetched.state !== 'ready') return;
    setOpened({ state: 'opening' });
    void (async () => {
      try {
        const payload = await openDelivery(
          fetched.delivery,
          fromHex(key),
          fromHex(job.job_commitment),
        );
        setOpened({
          state: 'opened',
          dek: Array.from(payload.dek)
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join(''),
          listingVersion: payload.listingVersion,
        });
        toast.success('The compliance copy opened', {
          description:
            'This is the key to the good, not the good: fetch the listing’s ciphertext to read it, and check it against the commitment the listing published.',
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        setOpened({ state: 'failed', error: message });
        toast.error('The copy did not open', { description: message });
      }
    })();
  }, [fetched, job, key]);

  if (jobs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compliance-copy decrypt</CardTitle>
          <CardDescription>
            No job on this deployment carries a compliance copy. A buyer opts in per appraisal by
            naming a compliance public key in the request, and the room then seals{' '}
            <span className="font-mono text-xs">DEK_g</span> to it as a second delivery entry
            alongside their own.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Compliance-copy decrypt</CardTitle>
        <CardDescription>
          The desk&rsquo;s purchase, delivered sealed to the compliance key as well as the
          buyer&rsquo;s. The key you paste stays in this browser: it is never sent anywhere, and
          what is fetched is the sealed bundle, which is public.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-2">
          {jobs.map((candidate) => (
            <Button
              key={candidate.id}
              variant={candidate.id === selected ? 'default' : 'outline'}
              size="sm"
              className="rounded-md font-mono text-xs"
              onClick={() => load(candidate.id)}
            >
              job {candidate.id}
              <span className="pl-2 opacity-70">
                {candidate.buyer === null ? '—' : account(candidate.buyer, 16)}
              </span>
            </Button>
          ))}
        </div>

        <div className="space-y-2">
          <Label htmlFor="compliance-key">Compliance secret key (32 bytes, hex)</Label>
          <div className="flex gap-2">
            <Input
              id="compliance-key"
              type="password"
              value={key}
              onChange={(event) => setKey(event.target.value.trim().toLowerCase())}
              placeholder="64 hex characters"
              autoComplete="off"
              spellCheck={false}
              className="rounded-md font-mono text-xs"
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Forget the key"
              className="rounded-md"
              onClick={() => setKey('')}
            >
              <IconTrash className="size-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {key === ''
              ? 'Nothing is held yet.'
              : valid
                ? 'That is a well-formed X25519 secret key. It is held in this tab only, and forgotten when you close it.'
                : `That is ${key.length} characters; a secret key is 64 of 0-9a-f.`}
          </p>
        </div>

        {job === null ? null : (
          <Rows>
            <Row label="job commitment" note="Bound into the sealing as additional data (§3.19).">
              {short(job.job_commitment, 10)}
            </Row>
            <Row label="buyer key">{short(job.delivery_pk, 10)}</Row>
            <Row label="compliance key" note="The second recipient, when the buyer asked for one.">
              {job.compliance_pk === null ? '—' : short(job.compliance_pk, 10)}
            </Row>
          </Rows>
        )}

        {fetched.state === 'idle' ? (
          <p className="text-sm text-muted-foreground">
            Pick a job above to fetch its sealed delivery from the gateway.
          </p>
        ) : fetched.state === 'loading' ? (
          <p className="text-sm text-muted-foreground">Fetching the sealed delivery&hellip;</p>
        ) : fetched.state === 'failed' ? (
          <div className="space-y-1 rounded-lg border border-dashed border-border px-4 py-3">
            <p className="text-sm">The gateway did not serve this delivery.</p>
            <p className="font-mono text-xs text-muted-foreground">error: {fetched.error}</p>
            <p className="pt-1 text-xs text-muted-foreground">
              The gateway is untrusted and holds only sealed objects, so it is safe for it to be
              missing: the delivery can be produced again by any room holding the listing key.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <Rows>
              <Row label="ephemeral key" note="Derived from the listing key and the job commitment, so any room reproduces it.">
                {short(fetched.delivery.eph_pk, 10)}
              </Row>
            </Rows>
            <ul className="divide-y divide-border/60 text-xs">
              {fetched.delivery.entries.map((row, index) => {
                const mine = job !== null && row.recipient === job.compliance_pk;
                return (
                  <li key={row.recipient} className="flex items-center gap-3 py-2">
                    <Badge
                      variant="outline"
                      className={`font-mono text-[10px] uppercase ${
                        mine
                          ? 'border-brand-primary/40 bg-brand-primary/10 text-brand-primary'
                          : 'border-muted-foreground/30 bg-muted text-muted-foreground'
                      }`}
                    >
                      {mine ? 'compliance copy' : `recipient ${index}`}
                    </Badge>
                    <span className="font-mono text-muted-foreground">
                      {short(row.recipient, 8)}
                    </span>
                    <span className="ml-auto font-mono text-muted-foreground">
                      {row.ciphertext.length / 2} sealed bytes
                    </span>
                  </li>
                );
              })}
            </ul>
            <Button
              onClick={open}
              disabled={!valid || opened.state === 'opening'}
              className="rounded-md"
            >
              {valid ? (
                <IconLockOpen2 className="mr-1 size-4" />
              ) : (
                <IconLock className="mr-1 size-4" />
              )}
              {opened.state === 'opening' ? 'Opening…' : 'Open the compliance copy'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Opening runs the SDK&rsquo;s <span className="font-mono">openDelivery</span> in this
              tab — the same derivation the room ran when it sealed the entry. This page holds no
              second implementation of the sealing format.
            </p>
            {opened.state === 'failed' && (
              <p className="font-mono text-xs text-brand-primary">{opened.error}</p>
            )}
            {opened.state === 'opened' && (
              <Rows>
                <Row
                  label="DEK_g"
                  note="The key to the good itself. Fetch the listing's ciphertext to read it, and check it against the commitment the listing published (§3.19)."
                >
                  {short(opened.dek, 10)}
                </Row>
                <Row label="listing version" note="Which version of the listing this key opens.">
                  {opened.listingVersion}
                </Row>
              </Rows>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
