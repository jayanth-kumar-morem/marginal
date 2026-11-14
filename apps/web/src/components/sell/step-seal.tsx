'use client';

/**
 * Step 5: seal and upload (SDD §3.19, §3.12.4).
 *
 * The good is encrypted under a fresh `DEK_g` with XChaCha20-Poly1305, and `DEK_g ‖ salt` is sealed
 * to the listing's `pk_L` in a libsodium sealed box. Both objects go to the gateway at the keys the
 * room reads — `listings/{id}/v{version}/good` and `.../dek` — and the listing publishes the
 * ciphertext's SHA-256, so a gateway that served different bytes would be caught by the room before
 * it decrypted anything.
 *
 * It cannot run before step 4's provisioning has finished: there is no `pk_L` to seal to until a
 * room has derived one, and a good sealed to anything else could never be opened.
 */
import { Row, Rows } from '@/components/listings/detail-rows';
import { Button } from '@/components/ui/button';
import { Done, Mono, Problem } from '@/components/sell/fields';
import { short } from '@/lib/format';

export interface SealedObject {
  readonly goodKey: string;
  readonly dekKey: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly sizeClass: number;
}

export function StepSeal({
  provisioned,
  sealed,
  busy,
  problem,
  onSeal,
}: {
  provisioned: boolean;
  sealed: SealedObject | null;
  busy: boolean;
  problem: string | null;
  onSeal: () => void;
}) {
  return (
    <div className="space-y-4">
      {provisioned ? null : (
        <p className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Blocked on step 4. The DEK is sealed to the listing&rsquo;s <span className="font-mono">pk_L</span>,
          which exists only once a room has finished provisioning the key — until then there is
          nothing to seal to.
        </p>
      )}

      <Button size="sm" disabled={!provisioned || busy} onClick={onSeal}>
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
              {sealed.bytes.toLocaleString('en-US')} bytes · class {sealed.sizeClass}
            </Row>
          </Rows>
          <Done>
            Uploaded. Only a room holding the listing key can open either object; this tab kept no
            copy of the DEK, and the gateway never saw the plaintext.
          </Done>
        </>
      )}
      {problem === null ? null : <Problem>{problem}</Problem>}
    </div>
  );
}
