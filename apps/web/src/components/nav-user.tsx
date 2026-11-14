'use client';

import { IconLogout, IconWallet } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar';
import { useWallet } from '@/components/wallet';
import { account } from '@/lib/format';

/**
 * Who is signed in: a NEAR account, or nobody. There is no account system of our own — the wallet
 * is the identity, and the contracts only ever see an account id.
 */
export function NavUser() {
  const wallet = useWallet();
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {wallet.accountId === null ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            disabled={!wallet.available || !wallet.ready}
            onClick={wallet.connect}
          >
            <IconWallet className="mr-2 size-4" />
            {wallet.available ? 'Connect wallet' : 'No wallet on this network'}
          </Button>
        ) : (
          <div className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-accent/10">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary">
              <IconWallet className="size-4" />
            </span>
            <div className="grid min-w-0 flex-1 text-left leading-tight">
              <span className="truncate font-mono text-xs font-medium text-foreground">
                {account(wallet.accountId)}
              </span>
              <span className="truncate text-[10px] text-muted-foreground">connected</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Disconnect"
              className="size-7"
              onClick={() => void wallet.disconnect()}
            >
              <IconLogout className="size-3.5" />
            </Button>
          </div>
        )}
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
