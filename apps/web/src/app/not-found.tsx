import Link from 'next/link';

import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">404</p>
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        There is no such record
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Every page here is a view of chain state. A listing, job or room that the contract does not
        hold has no page — which is the same answer a verifier would give.
      </p>
      <Button asChild variant="outline">
        <Link href="/listings">Back to the market</Link>
      </Button>
    </main>
  );
}
