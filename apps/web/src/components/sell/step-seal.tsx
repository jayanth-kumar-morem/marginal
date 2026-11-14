'use client';

/**
 * Step 5: seal and upload (SDD §3.19, §3.12.4).
 *
 * The good is encrypted under a fresh `DEK_g` with XChaCha20-Poly1305, and `DEK_g ‖ salt` is sealed
 * to one X25519 key in a libsodium sealed box. Both objects go to the gateway at the keys the room
 * reads — `listings/{id}/v{version}/good` and `.../dek` — and the listing publishes the
 * ciphertext's SHA-256, so a gateway that served different bytes would be caught by the room before
 * it decrypted anything.
 *
 * Which key depends on the deployment's mode, and `lib/sell.ts`'s `sealPublicKey` is the one place
 * that decides: the listing's `pk_L` under CKD, which exists only once a room has provisioned it,
 * or the attested room's own `box_pk` under RoomSealed (§3.12.7). A good sealed to anything else
 * could never be opened, which is why this step is blocked until there is a key.
 */
import { Row, Rows } from '@/components/listings/detail-rows';
import { Button } from '@/components/ui/button';
import { Done, Mono, Problem } from '@/components/sell/fields';
import { short } from '@/lib/format';
import type { KeyMode } from '@/lib/records';
import type { Sealed } from '@/lib/sell';

export function StepSeal({
  keyMode,
  sealTo,
  sealed,
  busy,
  problem,
  onSeal,
}: {
  keyMode: KeyMode;
  /** The public key this good will be sealed to, or null while there is none. */
  sealTo: string | null;
  sealed: Sealed | null;
  busy: boolean;
  problem: string | null;
  onSeal: () => void;
}) {
  return (
    <div className="space-y-4">
      {sealTo === null ? (
        <p className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {keyMode === 'Ckd' ? (
            <>
              Blocked on step 4. The DEK is sealed to the listing&rsquo;s{' '}
              <span className="font-mono">pk_L</span>, which exists only once a room has finished
              provisioning the key — until then there is nothing to seal to.
            </>
          ) : (
            <>
              Blocked on the room check. Under the RoomSealed fallback the DEK is sealed to one
              attested room&rsquo;s <span className="font-mono">box_pk</span>, and this deployment
              has no single eligible room to seal to yet.
            </>
          )}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Sealing to <span className="break-all font-mono">{sealTo}</span> —{' '}
          {keyMode === 'Ckd' ? "the listing's own pk_L" : "the room's attested box_pk"}.
        </p>
      )}

      <Button size="sm" disabled={sealTo === null || busy} onClick={onSeal}>
        {busy ? 'Sealing…' : 'Seal and upload'}
      </Button>

      {sealed === null ? null : (
        <>
          <Rows>
            <Row label="ciphertext" note="The object the room fetches and hashes before decrypting.">
              {sealed.goodKey}
            </Row>
            <Row label="wrapped key" note="A sealed box holding DEK_g and the commitment salt.">
              {sealed.dekKey}
            </Row>
            <Row label="sha256">
              <Mono>{short(sealed.sha256, 12)}</Mono>
            </Row>
            <Row label="size" note="size_class is the power-of-two bucket the listing publishes.">
              {sealed.bytes.toLocaleString('en-US')} bytes · class {sealed.ciphertext.size_class}
            </Row>
          </Rows>
          <Done>
            Uploaded.{' '}
            {keyMode === 'Ckd'
              ? 'Only a room holding the listing key can open either object'
              : 'Only the one room this was sealed to can open either object'}
            : the DEK was never written down anywhere, and the gateway only ever saw ciphertext.
          </Done>
        </>
      )}
      {problem === null ? null : <Problem>{problem}</Problem>}
    </div>
  );
}
