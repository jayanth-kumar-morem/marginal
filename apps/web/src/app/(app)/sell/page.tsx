/**
 * `/sell` (E13.2, D1 and D7; SDD §3.23).
 *
 * The page is a server component: it reads what the wizard needs to tell the truth about this
 * deployment — the settlement token, the two storage fees, KeyPolicy's pins fee and the measurement
 * hashes of the rooms that are registered right now — and hands the wizard three server actions.
 *
 * The actions exist because of the app's own content-security policy: `connect-src 'self'` means a
 * page holding a seller's plaintext cannot open a connection anywhere but back here, so the chain
 * reads and the 1Click proxy run on the server and are reached by a same-origin POST. The seller's
 * wallet still signs every state change in the browser, and the plaintext never leaves it.
 */
import { SellWizard, type ActionResult, type SellFees } from '@/components/sell/sell-wizard';
import { Button } from '@/components/ui/button';
import { chainClient } from '@/lib/chain';
import { loadConfig } from '@/lib/config.server';
import { loadListing } from '@/lib/listings';
import type { Listing } from '@/lib/records';
import { loadRooms } from '@/lib/rooms';
import {
  dryQuote,
  newestListing,
  pinsFee,
  quoteAmount,
  quoteRequest,
  roomSealTarget,
  type PayoutQuoteInput,
  type SealTarget,
} from '@/lib/sell';
import Link from 'next/link';

export const metadata = { title: 'Sell' };
/** Nothing here may be cached: a listing's status and a room's measurement both change. */
export const dynamic = 'force-dynamic';

/**
 * The storage deposits, from `contracts/clearing/src/fees.rs`. They are read from the chain below
 * and these are the fallback, so a chain that cannot be reached does not leave the buttons dead.
 */
const LISTING_FEE = '30000000000000000000000';
const PUBLISH_FEE = '20000000000000000000000';

/** One listing, by id. */
async function readListingAction(id: number): Promise<ActionResult<Listing | null>> {
  'use server';
  const config = loadConfig();
  try {
    const row = await loadListing(chainClient(config.rpcUrl), config.clearing, id);
    return { ok: row === null ? null : row.listing };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** The newest listing an account owns: how the id of a just-created listing is found. */
async function findListingAction(seller: string): Promise<ActionResult<Listing | null>> {
  'use server';
  const config = loadConfig();
  try {
    return { ok: await newestListing(chainClient(config.rpcUrl), config.clearing, seller) };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The one attested room a RoomSealed listing may be sealed to (SDD §3.12.7).
 *
 * It is a server action for the same reason the chain reads are: the page's CSP lets a tab holding
 * a seller's plaintext open connections back here and nowhere else. The clock is this server's,
 * because KeyPolicy's `expires_at` is in unix seconds — clearing's own `check_room` is asked too,
 * and that one uses the chain's clock.
 */
async function sealTargetAction(): Promise<ActionResult<SealTarget>> {
  'use server';
  const config = loadConfig();
  try {
    return {
      ok: await roomSealTarget(
        chainClient(config.rpcUrl),
        config.clearing,
        config.keypolicy,
        Math.floor(Date.now() / 1000),
      ),
    };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * A 1Click dry quote, through the gateway's proxy (which forces `dry: true`). The reply is read for
 * the one number the seller is shown and then dropped: nothing about it is stored here, in the
 * gateway, or on chain (1Click ToS §4.1(e)).
 */
async function quoteAction(input: PayoutQuoteInput): Promise<ActionResult<string | null>> {
  'use server';
  const config = loadConfig();
  try {
    return { ok: quoteAmount(await dryQuote(config.gateway, quoteRequest(input))) };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export default async function SellPage() {
  const config = loadConfig();
  const chain = chainClient(config.rpcUrl);

  const schedule = await chain
    .view<{ fee_schedule?: { listing?: string; publish?: string } }>(config.clearing, 'config')
    .catch(() => null);
  const pins = await pinsFee(chain, config.keypolicy).catch(() => null);
  const rooms = await loadRooms(chain, config.clearing, config.keypolicy).catch(() => []);

  const fees: SellFees = {
    listing: schedule?.fee_schedule?.listing ?? LISTING_FEE,
    publish: schedule?.fee_schedule?.publish ?? PUBLISH_FEE,
    pins,
  };
  const measurements = [
    ...new Set(
      rooms
        .map((room) => room.attestation?.measurement_hash)
        .filter((hash): hash is string => hash !== undefined),
    ),
  ];

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">Sell</h2>
          <p className="pt-1 text-sm text-muted-foreground">
            A good is priced by what it adds to the buyer who appraises it, so a seller publishes a
            commitment and a sealed object rather than the thing itself. This wizard does that in
            the browser, and shows every argument before it is signed.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/listings">See the market</Link>
        </Button>
      </div>

      <SellWizard
        clearing={config.clearing}
        keypolicy={config.keypolicy}
        keyMode={config.keyMode}
        token={config.token}
        fees={fees}
        measurements={measurements}
        readListing={readListingAction}
        findListing={findListingAction}
        findSealTarget={sealTargetAction}
        askQuote={quoteAction}
      />
    </main>
  );
}
