'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { ContextFields } from '@/components/appraise/context-fields';
import { ModeChoice } from '@/components/appraise/mode-choice';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWallet } from '@/components/wallet';
import {
  askApi,
  buildRequest,
  findNewJob,
  judgeChoices,
  loadBalance,
  parseTokens,
  randomKeyHex,
  requestProblems,
  type Privacy,
  type Quotes,
} from '@/lib/appraise';
import { chainClient, errorCode } from '@/lib/chain';
import { amount, tokens } from '@/lib/format';
import type { Leakage, Listing } from '@/lib/records';
import { postedAsk } from '@/lib/records';

/** 100 TGas: `request_appraisal` reserves leakage, funds five buckets and assigns rooms. */
const GAS = '100000000000000';

/**
 * The buyer's side of an appraisal (E13.4, D1, D8, D10; SDD §3.23).
 *
 * The order is the one §3.23 sets out: the context and the need, the budget, the privacy mode with
 * its real debit and cost, then seal and request. Nothing is signed until every refusal the
 * contract would make has been checked here first and shown in the contract's own words.
 *
 * `request_appraisal` is not payable: it is funded from the buyer's escrow balance inside clearing,
 * which is why the balance is read and shown next to the budget.
 */
export function AppraiseForm({
  clearing,
  rpcUrl,
  listing,
  leakage,
  feeBps,
}: {
  clearing: string;
  rpcUrl: string;
  listing: Listing;
  leakage: Leakage;
  feeBps: number;
}) {
  const wallet = useWallet();
  const router = useRouter();
  const ask = postedAsk(listing.rule);

  const [notes, setNotes] = useState('');
  const [restricted, setRestricted] = useState('');
  const [need, setNeed] = useState('');
  const [budgetText, setBudgetText] = useState(ask === null ? '' : amount(ask));
  const [privacy, setPrivacy] = useState<Privacy>('Sealed');
  const [nJudges, setNJudges] = useState(0);
  const [quotes, setQuotes] = useState<Quotes | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const budget = parseTokens(budgetText);
  // The debit does not depend on the budget, so a half-typed figure still gets a real preview.
  const quoteBudget = budget ?? ask ?? '0';

  useEffect(() => {
    let live = true;
    askApi<Quotes>({
      op: 'quote',
      input: {
        appraiser: listing.appraiser,
        schema_hash: listing.schema_hash,
        rule: listing.rule,
        budget: quoteBudget,
        n_judges: nJudges,
        price_per_bit: leakage.price_per_bit,
        clearing_fee_buyer_bps: feeBps,
      },
    })
      .then((both) => {
        if (!live) return;
        setQuotes(both);
        setQuoteError(null);
      })
      .catch((error: unknown) => {
        if (live) setQuoteError(errorCode(error));
      });
    return () => {
      live = false;
    };
  }, [listing, quoteBudget, nJudges, leakage.price_per_bit, feeBps]);

  useEffect(() => {
    const buyer = wallet.accountId;
    if (buyer === null) {
      setBalance(null);
      return;
    }
    let live = true;
    loadBalance(chainClient(rpcUrl), clearing, buyer, listing.token)
      .then((held) => {
        if (live) setBalance(held);
      })
      .catch(() => {
        if (live) setBalance(null);
      });
    return () => {
      live = false;
    };
  }, [wallet.accountId, rpcUrl, clearing, listing.token]);

  const quote = privacy === 'Open' ? (quotes?.open ?? null) : (quotes?.sealed ?? null);
  const unpriceable = quotes !== null && privacy === 'Open' && quotes.open === null;
  const problems = [
    ...requestProblems({
      connected: wallet.accountId !== null,
      budget,
      ask,
      quote,
      remainingMbits: leakage.remaining_mbits,
      balance,
    }),
    ...(unpriceable ? ['Choose Sealed: this build cannot price an open verdict here.'] : []),
    ...(quoteError === null ? [] : [`The quote was refused: ${quoteError}.`]),
  ];

  const submit = () => {
    const buyer = wallet.accountId;
    if (buyer === null || budget === null) return;
    setBusy(true);
    const request = buildRequest({
      listing,
      budget,
      privacy,
      nJudges,
      // TODO(E12.1): placeholders until `sdk/ts/src/crypto.ts` seals the context and the delivery.
      deliveryPk: randomKeyHex(),
      contextAuthPk: randomKeyHex(),
    });
    askApi<{ base64: string }>({ op: 'encode', request })
      .then((encoded) =>
        wallet.send({
          contract: clearing,
          method: 'request_appraisal',
          args: { request: encoded.base64 },
          gas: GAS,
        }),
      )
      .then((hash) => {
        toast.success('Request signed', { description: hash });
        return findNewJob(chainClient(rpcUrl), clearing, listing.id, buyer);
      })
      .then((id) => {
        if (id === null) {
          toast.error('No job to open yet', {
            description:
              'The newest job is not this request: an agent cap may have blocked it (the attempt is on the audit chain), or another buyer got in first.',
          });
          router.push('/jobs');
          return;
        }
        router.push(`/jobs/${id}`);
      })
      .catch((error: unknown) => {
        toast.error('request_appraisal', { description: errorCode(error) });
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What you bring</CardTitle>
          <CardDescription>
            Your context and your need are what the good is measured against. They are sealed to the
            room&rsquo;s attested key and no one else ever holds them, including this app&rsquo;s
            server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ContextFields
            notes={notes}
            restricted={restricted}
            need={need}
            onNotes={setNotes}
            onRestricted={setRestricted}
            onNeed={setNeed}
            disabled={busy}
          />
          <p className="border border-amber-600/40 bg-amber-600/10 p-3 text-xs text-amber-800 dark:text-amber-300">
            In this build the request carries no context envelope yet: the sealing arrives with the
            SDK (E12.1), so these three fields stay in your browser and the room scores without them.
            Everything else on this page is the real transaction.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Budget</CardTitle>
            <CardDescription>
              B, the most the good can be priced at. The job is funded from your escrow balance
              inside clearing, not from an attached deposit.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="budget">Budget</Label>
              <Input
                id="budget"
                inputMode="decimal"
                value={budgetText}
                disabled={busy}
                onChange={(event) => setBudgetText(event.target.value)}
              />
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs">
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">ask</dt>
                <dd className="tabular-nums">{ask === null ? '—' : tokens(ask)}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  your escrow
                </dt>
                <dd className="tabular-nums">{balance === null ? '—' : tokens(balance)}</dd>
              </div>
            </dl>
            {wallet.accountId !== null && balance !== null && (
              <p className="text-xs text-muted-foreground">
                Top up at <span className="font-mono">deposit</span> on clearing before requesting if
                the escrow is short.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Privacy and leakage</CardTitle>
            <CardDescription>
              Every appraisal reveals something and pays the seller π per bit. This is the debit
              before you sign, not after.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ModeChoice
              quotes={quotes}
              privacy={privacy}
              onChange={setPrivacy}
              remainingMbits={leakage.remaining_mbits}
            />
            <div className="space-y-2">
              <Label htmlFor="judges">Judges</Label>
              <div className="flex gap-2">
                {judgeChoices(listing).map((count) => (
                  <Button
                    key={count}
                    type="button"
                    size="sm"
                    variant={count === nJudges ? 'default' : 'outline'}
                    disabled={busy}
                    onClick={() => setNJudges(count)}
                  >
                    {count}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {listing.external_judges_allowed
                  ? 'A judge can only take value off what the measurement found (AC-41). In Scored (open) mode each judge publishes a factor, so each one is debited.'
                  : 'The seller does not allow external judges on this listing.'}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Escrow needed excludes the appraiser&rsquo;s compute fee, which comes from
              clearing&rsquo;s registry and no view exposes.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Seal and request</CardTitle>
            <CardDescription>
              Signed by your own wallet. The contract re-checks everything below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {problems.length > 0 && (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {problems.map((problem) => (
                  <li key={problem}>· {problem}</li>
                ))}
              </ul>
            )}
            <Button
              className="w-full"
              disabled={busy || problems.length > 0 || quote === null}
              onClick={submit}
            >
              {busy ? 'Sealing and requesting…' : 'Seal and request'}
            </Button>
            {wallet.accountId === null && wallet.available && (
              <Button variant="outline" className="w-full" onClick={wallet.connect}>
                Connect a wallet
              </Button>
            )}
            {!wallet.available && (
              <p className="text-xs text-muted-foreground">
                No browser wallet knows this network, so this page is read-only here. Use the
                testnet deployment to sign.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
