import { IconPlugConnectedX } from '@tabler/icons-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { errorCode } from '@/lib/chain';

/**
 * What a page shows when a view did not answer. The contract's own code is shown when there is one
 * (`E_BUDGET_EXHAUSTED` is information, not a failure), and the endpoint is named, because the
 * commonest cause is an RPC that is not running.
 */
export function LoadError({ error, rpcUrl }: { error: unknown; rpcUrl: string }) {
  return (
    <Card className="border-brand-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <IconPlugConnectedX className="size-4 text-brand-primary" />
          The chain did not answer
        </CardTitle>
        <CardDescription>
          Nothing on this page is cached, so there is nothing to show without a view call.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1 font-mono text-xs text-muted-foreground">
        <p>rpc: {rpcUrl}</p>
        <p>error: {errorCode(error)}</p>
      </CardContent>
    </Card>
  );
}
