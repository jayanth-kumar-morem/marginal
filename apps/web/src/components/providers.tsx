'use client';

import { ThemeProvider } from 'next-themes';

import { Toaster } from '@/components/ui/sonner';
import { WalletProvider } from '@/components/wallet';
import type { WebConfig } from '@/lib/config';

/**
 * Everything the tree needs on the client: the theme (the tokens in `globals.css` define both modes,
 * so this is what makes dark mode real), the wallet, and one toaster.
 *
 * `config` is read on the server from the deploy manifest and passed down, so the browser never
 * guesses which contracts it is talking to.
 */
export function Providers({
  config,
  children,
}: {
  config: WebConfig;
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <WalletProvider config={config}>
        {children}
        <Toaster closeButton richColors />
      </WalletProvider>
    </ThemeProvider>
  );
}
