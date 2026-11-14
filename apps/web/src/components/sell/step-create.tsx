'use client';

/**
 * Step 4: `create_listing`, then `begin_provisioning` (SDD §3.4, §3.12.3).
 *
 * The listing is created in `Draft` with no commitment and no ciphertext — those arrive with
 * `publish_listing` in step 7. `begin_provisioning` then opens a provisioning job for a room, and
 * the listing sits in `Provisioning` until that room reports the listing key it derived through
 * MPC CKD. **This page cannot do that for it**: the key is derived inside an attested room from a
 * key the MPC network holds, and clearing will only accept the report under the room's own
 * signature. So this step ends by waiting, and says so.
 */
import { Row, Rows } from '@/components/listings/detail-rows';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Done, Mono, Problem } from '@/components/sell/fields';
import { short } from '@/lib/format';
import { statusNote } from '@/lib/listings';
import type { Listing } from '@/lib/records';
import { near } from '@/lib/format';

export function StepCreate({
  clearing,
  specBase64,
  listing,
  busy,
  problem,
  signable,
  listingFee,
  onCreate,
  onProvision,
  onRefresh,
}: {
  clearing: string;
  specBase64: string | null;
  listing: Listing | null;
  busy: string | null;
  problem: string | null;
  signable: boolean;
  listingFee: string;
  onCreate: () => void;
  onProvision: () => void;
  onRefresh: () => void;
}) {
  const status = listing === null ? null : statusNote(listing.status);
  return (
    <div className="space-y-4">
      <Rows>
        <Row label="contract">{clearing}</Row>
        <Row label="method">create_listing</Row>
        <Row label="storage deposit" note="Clearing charges the storage a listing costs it.">
          {near(listingFee)}
        </Row>
        <Row label="spec" note="Borsh of a core ListingSpec, base64. Built by the core, never by this page.">
          {specBase64 === null ? '—' : <Mono>{short(specBase64, 18)}</Mono>}
        </Row>
      </Rows>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!signable || specBase64 === null || busy !== null} onClick={onCreate}>
          {busy === 'create' ? 'Creating…' : 'Create the listing'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!signable || listing === null || busy !== null}
          onClick={onProvision}
        >
          {busy === 'provision' ? 'Asking…' : 'Begin provisioning'}
        </Button>
        <Button size="sm" variant="ghost" disabled={listing === null || busy !== null} onClick={onRefresh}>
          Refresh
        </Button>
      </div>

      {listing === null ? null : (
        <Rows>
          <Row label="listing id">
            <span className="flex flex-wrap items-center gap-2">
              <Mono>{listing.id}</Mono>
              <Badge variant="outline">{listing.status}</Badge>
            </span>
          </Row>
          <Row label="version">{listing.version}</Row>
          <Row label="key path" note="The CKD path the listing key is derived at.">
            {short(listing.key_path_hash, 10)}
          </Row>
          <Row label="pk_L" note="The listing key's public half, written by the room's report.">
            {listing.pk_l === null ? 'not provisioned yet' : <Mono>{listing.pk_l}</Mono>}
          </Row>
        </Rows>
      )}

      {status === null ? null : <p className="text-xs text-muted-foreground">{status.note}</p>}
      {listing?.pk_l === null ? (
        <p className="text-xs text-muted-foreground">
          Waiting on a room. The listing key is derived inside an attested room through MPC chain
          key derivation, and clearing accepts the result only under that room&rsquo;s signature —
          so nothing this page does can move the listing on. Refresh to see when it lands. With no
          eligible room registered, <span className="font-mono">begin_provisioning</span> has no
          room to assign and refuses: <span className="font-mono">/rooms</span> says whether there
          is one.
        </p>
      ) : null}
      {listing?.pk_l === null || listing === null ? null : (
        <Done>The room has reported its key, so the good can be sealed to it.</Done>
      )}
      {problem === null ? null : <Problem>{problem}</Problem>}
      {signable ? null : (
        <p className="text-xs text-muted-foreground">
          No browser wallet signs for this network, so this step cannot be sent from here.
        </p>
      )}
    </div>
  );
}
