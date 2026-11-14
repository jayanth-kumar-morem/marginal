'use client';

/**
 * Step 2: canonicalisation and the commitment (SDD §3.23, §3.4).
 *
 * Two things are shown, and both are local. The **claims** are the sentences `knowledge@1` will
 * score a buyer's context against — the same split the room makes, so the seller can see what the
 * appraiser will see, while the preview itself is never sent anywhere. The **commitment** is
 * `SHA-256(salt ‖ canonical text)`, which is what the listing publishes and what the room re-derives
 * from the good it decrypts: if they differ, the room refuses the job rather than appraising
 * something else.
 */
import { Row, Rows } from '@/components/listings/detail-rows';
import { Mono } from '@/components/sell/fields';
import { short } from '@/lib/format';

export function StepCanonical({
  name,
  canonical,
  claims,
  saltHex,
  commitment,
}: {
  name: string;
  canonical: string;
  claims: readonly string[];
  saltHex: string;
  commitment: string;
}) {
  const bytes = new TextEncoder().encode(canonical).length;
  return (
    <div className="space-y-4">
      <Rows>
        <Row label="file">{name}</Row>
        <Row label="canonical size" note="What the commitment covers, after normalisation.">
          {bytes.toLocaleString('en-US')} bytes
        </Row>
        <Row label="claims" note="Sentences of five words or more, headings and list markers removed.">
          {claims.length}
        </Row>
        <Row label="salt" note="Fresh, so the commitment does not reveal whether two goods are the same.">
          {short(saltHex, 10)}
        </Row>
        <Row label="good_commitment" note="SHA-256(salt ‖ canonical text). This is what gets published.">
          <Mono>{commitment}</Mono>
        </Row>
      </Rows>

      <div>
        <p className="pb-2 text-xs uppercase tracking-wide text-muted-foreground">
          First claims (local only)
        </p>
        {claims.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No sentence in this document is long enough to be a claim, so `knowledge@1` would
            measure nothing and the good would price at zero. That is an answer, not an error —
            but it is probably not the document you meant to sell.
          </p>
        ) : (
          <ol className="space-y-1 text-xs text-muted-foreground">
            {claims.slice(0, 5).map((claim, index) => (
              <li key={claim} className="flex gap-2">
                <span className="font-mono">{index + 1}.</span>
                <span className="line-clamp-2">{claim}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="pt-2 text-xs text-muted-foreground">
          This preview is computed in the browser and is not sent anywhere.
        </p>
      </div>
    </div>
  );
}
