'use client';

/**
 * Step 6: the pins (SDD §3.12.2, DRC-3).
 *
 * Pins are the seller's answer to "which programs may ever open this good". Either the listing
 * follows governance — whatever measurement set the registry has approved, now and later — or it
 * names measurement hashes explicitly, and KeyPolicy releases the key to nothing else.
 *
 * Getting a hash wrong makes the listing **unreleasable**, never unsafe: KeyPolicy denies a release
 * it cannot match, so a typo costs a sale and not a secret. The hashes offered below are the ones
 * this deployment's rooms actually registered; `room/image/MEASUREMENTS.md` is how a seller
 * reproduces one from the git tag without trusting anybody.
 */
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Done, Mono, Problem, SwitchField } from '@/components/sell/fields';
import { near, short } from '@/lib/format';

export function StepPins({
  keypolicy,
  follow,
  hashes,
  measured,
  fee,
  busy,
  problem,
  done,
  signable,
  onFollow,
  onHashes,
  onSet,
}: {
  keypolicy: string;
  follow: boolean;
  hashes: string;
  measured: readonly string[];
  fee: string | null;
  busy: boolean;
  problem: string | null;
  done: boolean;
  signable: boolean;
  onFollow: (follow: boolean) => void;
  onHashes: (hashes: string) => void;
  onSet: () => void;
}) {
  return (
    <div className="space-y-4">
      <SwitchField
        label="follow governance"
        checked={follow}
        onChange={onFollow}
        hint="On: whatever measurement set the registry approves. Off: only the hashes below."
      />

      {follow ? null : (
        <div className="space-y-2">
          <Textarea
            value={hashes}
            rows={3}
            placeholder="one 32-byte measurement hash per line, lower-case hex"
            className="font-mono text-xs"
            onChange={(event) => onHashes(event.currentTarget.value)}
          />
          {measured.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No room is registered on {keypolicy} right now, so there is no measurement hash to
              offer. Pinning one you cannot see registered is still valid — it just means no room
              can open the good until a matching one appears.
            </p>
          ) : (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Registered right now:</p>
              {measured.map((hash) => (
                <button
                  key={hash}
                  type="button"
                  className="block w-full rounded-md border border-border/60 px-2 py-1 text-left font-mono text-xs hover:bg-muted/50"
                  onClick={() => onHashes(hash)}
                >
                  {short(hash, 16)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" disabled={!signable || busy || fee === null} onClick={onSet}>
          {busy ? 'Setting…' : 'Set pins'}
        </Button>
        <p className="text-xs text-muted-foreground">
          {fee === null ? (
            'KeyPolicy did not answer, so its storage fee is unknown and nothing will be sent.'
          ) : (
            <>
              <Mono>{keypolicy}</Mono> charges {near(fee)} of storage, read from its own{' '}
              <span className="font-mono">config()</span>.
            </>
          )}
        </p>
      </div>
      {done ? <Done>Pins stored for this listing version.</Done> : null}
      {problem === null ? null : <Problem>{problem}</Problem>}
    </div>
  );
}
