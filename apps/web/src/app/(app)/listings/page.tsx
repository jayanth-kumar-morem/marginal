import Link from 'next/link';

import { ListingsTable } from '@/components/listings/listings-table';
import { LoadError } from '@/components/load-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { pageChain } from '@/lib/chain';
import { loadConfig } from '@/lib/config.server';
import { loadListings } from '@/lib/listings';

export const metadata = { title: 'Listings' };
/** Always read the chain: a market page cached for a minute is a market page that lies. */
export const dynamic = 'force-dynamic';

export default async function ListingsPage() {
  const config = loadConfig();
  let rows: Awaited<ReturnType<typeof loadListings>> | Error;
  try {
    rows = await loadListings(pageChain(config.rpcUrl), config.clearing);
  } catch (error) {
    rows = error instanceof Error ? error : new Error(String(error));
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-6">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">Market</h2>
          <p className="pt-1 text-sm text-muted-foreground">
            Sealed goods, priced by what they add to the buyer who appraises them. Nothing here
            reveals a good: these are the public metadata the contract stores.
          </p>
        </div>
        <Button asChild>
          <Link href="/sell">List a good</Link>
        </Button>
      </div>

      {rows instanceof Error ? (
        <LoadError error={rows} rpcUrl={config.rpcUrl} />
      ) : rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No listings yet</CardTitle>
            <CardDescription>
              This deployment&rsquo;s clearing contract ({config.clearing}) holds no published
              listing. Publish one from <Link href="/sell" className="underline">Sell</Link>, or run
              the demo fixtures.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <CardContent className="p-0">
            <ListingsTable rows={rows} />
          </CardContent>
        </Card>
      )}
    </main>
  );
}
