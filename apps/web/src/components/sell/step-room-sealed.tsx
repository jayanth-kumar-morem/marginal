'use client';

/**
 * Step 6 under the RoomSealed fallback (SDD §3.12.7).
 *
 * There is nothing to pin: no listing key is derived and no key is released, so KeyPolicy has no
 * measurement set to match a release against. What belongs here instead is the disclosure §3.12.7
 * makes a condition of using the mode at all — "limitations, disclosed whenever the mode is used" —
 * so this is the last step before the seller signs `publish_listing`, and it is a wall of plain
 * words rather than a footnote.
 *
 * The words themselves are `lib/sell.ts`'s {@link roomSealedDisclosure}, because they are bound by
 * AC-29 and so are tested rather than typed here.
 */
import { Row, Rows } from '@/components/listings/detail-rows';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Done, Mono, Problem } from '@/components/sell/fields';
import { short } from '@/lib/format';
import { roomSealedDisclosure, type SealTarget } from '@/lib/sell';

export function StepRoomSealed({
  keypolicy,
  target,
  problem,
  acknowledged,
  onAcknowledge,
}: {
  keypolicy: string;
  target: SealTarget | null;
  problem: string | null;
  acknowledged: boolean;
  onAcknowledge: () => void;
}) {
  if (target === null) {
    return (
      <div className="space-y-4">
        <p className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          This deployment releases keys under the RoomSealed fallback, which needs exactly one
          attested room to seal to. Until one is found there is nothing to disclose and nothing to
          publish.
        </p>
        {problem === null ? null : <Problem>{problem}</Problem>}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <Rows>
        <Row label="room" note="The one room this listing is bound to. No other can open it.">
          <Mono>{short(target.roomKey, 12)}</Mono>
        </Row>
        <Row label="box_pk" note="The X25519 key DEK_g was sealed to, from KeyPolicy's record.">
          <Mono>{short(target.publicKey, 12)}</Mono>
        </Row>
        <Row label="quote hash" note="Compare it with this room's record on /rooms.">
          <span className="flex flex-wrap items-center gap-2">
            <Mono>{short(target.quoteHash, 12)}</Mono>
            <Badge variant={target.attestationMode === 'OnChainDcap' ? 'outline' : 'destructive'}>
              {target.attestationMode}
            </Badge>
          </span>
        </Row>
        <Row label="measurement" note="The measurement set hash the same record carries.">
          <Mono>{short(target.measurementHash, 12)}</Mono>
        </Row>
        <Row label="attestation expires" note="Unix seconds, from KeyPolicy's own record.">
          {target.expiresAt}
        </Row>
      </Rows>

      <div className="space-y-2 rounded-md border border-amber-600/40 bg-amber-600/10 px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
          What RoomSealed costs you
        </p>
        {roomSealedDisclosure(target).map((limitation) => (
          <div key={limitation.title} className="space-y-0.5">
            <p className="text-xs font-medium">{limitation.title}</p>
            <p className="text-xs text-muted-foreground">{limitation.detail}</p>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          <Mono>{keypolicy}</Mono> stores no pins for this listing: under this mode it releases no
          key, so there is nothing for a pin to match.
        </p>
      </div>

      <Button size="sm" variant="outline" disabled={acknowledged} onClick={onAcknowledge}>
        {acknowledged ? 'Understood' : 'I understand these limitations'}
      </Button>
      {acknowledged ? <Done>On to publishing, straight from Draft.</Done> : null}
      {problem === null ? null : <Problem>{problem}</Problem>}
    </div>
  );
}
