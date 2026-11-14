'use client';

/**
 * Step 7: the payout route and `publish_listing` (SDD §3.4, §3.9.4, D7).
 *
 * Publishing is what binds the listing to the good: the commitment from step 2, the ciphertext from
 * step 5, and the route the proceeds take. Clearing then opens a screening job, and the listing is
 * `Active` only once the room reports a pass.
 *
 * The cross-chain route is `DryQuote`, and it is exactly what its name says. The proceeds are paid
 * on NEAR; the foreign leg is a swap the seller's own wallet signs, because clearing never
 * originates a cross-chain swap for a seller (DR-12). The quote shown is **indicative, displayed
 * and never stored** — 1Click's terms forbid keeping their data (ToS §4.1(e)) — and a stale quote
 * shown as current would misprice a payout. If 1Click cannot be reached, this says so rather than
 * showing a number.
 */
import { Row, Rows } from '@/components/listings/detail-rows';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Done, Mono, Problem, TextField } from '@/components/sell/fields';
import { near, short } from '@/lib/format';

export interface PayoutChoice {
  readonly route: 'NearAccount' | 'DryQuote';
  readonly account: string;
  readonly chain: string;
  readonly asset: string;
  readonly address: string;
  /** The destination asset's Intents id, which only the seller can supply. */
  readonly destinationAsset: string;
}

export function StepPublish({
  clearing,
  payout,
  publishFee,
  publishBase64,
  quote,
  quoting,
  quoteProblem,
  busy,
  problem,
  published,
  signable,
  onPayout,
  onQuote,
  onPublish,
}: {
  clearing: string;
  payout: PayoutChoice;
  publishFee: string;
  publishBase64: string | null;
  quote: string | null;
  quoting: boolean;
  quoteProblem: string | null;
  busy: boolean;
  problem: string | null;
  published: boolean;
  signable: boolean;
  onPayout: (payout: PayoutChoice) => void;
  onQuote: () => void;
  onPublish: () => void;
}) {
  const dry = payout.route === 'DryQuote';
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={dry ? 'outline' : 'default'}
          onClick={() => onPayout({ ...payout, route: 'NearAccount' })}
        >
          Pay out on NEAR
        </Button>
        <Button
          size="sm"
          variant={dry ? 'default' : 'outline'}
          onClick={() => onPayout({ ...payout, route: 'DryQuote' })}
        >
          Pay out to another chain
        </Button>
      </div>

      {dry ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              label="chain"
              value={payout.chain}
              onChange={(value) => onPayout({ ...payout, chain: value })}
            />
            <TextField
              label="asset"
              value={payout.asset}
              onChange={(value) => onPayout({ ...payout, asset: value })}
            />
            <TextField
              label="your address"
              value={payout.address}
              onChange={(value) => onPayout({ ...payout, address: value })}
              hint="Your own wallet on that chain. It is recorded in the listing's route."
            />
          </div>
          <TextField
            label="destination asset id (1Click)"
            value={payout.destinationAsset}
            onChange={(value) => onPayout({ ...payout, destinationAsset: value })}
            placeholder="nep141:…"
            hint="1Click names assets by their Intents id. This app does not guess one: a quote for the wrong token would be a confidently wrong price."
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="outline" disabled={quoting} onClick={onQuote}>
              {quoting ? 'Asking 1Click…' : 'Get a dry quote'}
            </Button>
            {quote === null ? null : (
              <span className="flex items-center gap-2 text-sm">
                <Mono>{quote}</Mono>
                <Badge variant="outline">displayed, never stored</Badge>
              </span>
            )}
          </div>
          {quoteProblem === null ? null : <Problem>{quoteProblem}</Problem>}
          <p className="text-xs text-muted-foreground">
            The address above is the one you gave. Deriving a payout address from the MPC network
            (the <span className="font-mono">ChainSig</span> route) is the mainnet canary&rsquo;s,
            not this demo&rsquo;s, so nothing here claims to have derived it.
          </p>
        </div>
      ) : (
        <TextField
          label="NEAR account"
          value={payout.account}
          onChange={(value) => onPayout({ ...payout, account: value })}
          hint="Proceeds are transferred to this account in the settlement token."
        />
      )}

      <Rows>
        <Row label="contract">{clearing}</Row>
        <Row label="method">publish_listing</Row>
        <Row label="storage deposit">{near(publishFee)}</Row>
        <Row label="publish" note="Borsh of a core PublishSpec, base64.">
          {publishBase64 === null ? '—' : <Mono>{short(publishBase64, 18)}</Mono>}
        </Row>
      </Rows>

      <Button size="sm" disabled={!signable || busy} onClick={onPublish}>
        {busy ? 'Publishing…' : 'Publish the listing'}
      </Button>
      {published ? (
        <Done>
          Published. Clearing has opened a screening job; the listing goes `Active` when the room
          reports a pass, and `Held` if it does not.
        </Done>
      ) : null}
      {problem === null ? null : <Problem>{problem}</Problem>}
    </div>
  );
}
