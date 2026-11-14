'use client';

/**
 * The NEAR wallet (E13.1; SDD §3.2 "Next.js, NEAR wallet selector").
 *
 * Every state change is signed by the person's own wallet. The app builds a transaction
 * *descriptor* — contract, method, arguments, deposit, gas — and hands it here; no key, seed or
 * signature ever reaches the server, and the server never acts on a user's behalf.
 *
 * On a network no browser wallet knows (the local sandbox) `walletUrl` is null, the provider stays
 * unavailable, and the pages fall back to read-only with a line saying why.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { FunctionCallAction, WalletSelector } from '@near-wallet-selector/core';
import { setupWalletSelector } from '@near-wallet-selector/core';
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet';
import { setupModal, type WalletSelectorModal } from '@near-wallet-selector/modal-ui';

import type { WebConfig } from '@/lib/config';

/** A call the page wants signed. The SDK's builders return exactly this shape. */
export interface TxRequest {
  readonly contract: string;
  readonly method: string;
  readonly args: Record<string, unknown>;
  /** Yocto-NEAR, as a decimal string. */
  readonly deposit?: string;
  /** Gas, as a decimal string of gas units. */
  readonly gas?: string;
}

interface WalletState {
  /** The signed-in account, or null when nobody is connected. */
  readonly accountId: string | null;
  /** Whether this network has a wallet at all. */
  readonly available: boolean;
  readonly ready: boolean;
  connect(): void;
  disconnect(): Promise<void>;
  /** Signs and sends one call, returning the transaction hash. */
  send(request: TxRequest): Promise<string>;
}

const DEFAULT_GAS = '100000000000000';

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({
  config,
  children,
}: {
  config: WebConfig;
  children: React.ReactNode;
}) {
  const [selector, setSelector] = useState<WalletSelector | null>(null);
  const [modal, setModal] = useState<WalletSelectorModal | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const available = config.walletUrl !== null;

  useEffect(() => {
    if (!available) return;
    let live = true;
    void setupWalletSelector({
      network: config.network === 'mainnet' ? 'mainnet' : 'testnet',
      modules: [setupMyNearWallet({ walletUrl: config.walletUrl ?? undefined })],
    }).then((made) => {
      if (!live) return;
      setSelector(made);
      setModal(setupModal(made, { contractId: config.clearing }));
      const account = made.store.getState().accounts.find((one) => one.active);
      setAccountId(account?.accountId ?? null);
      made.store.observable.subscribe((state) => {
        if (live) setAccountId(state.accounts.find((one) => one.active)?.accountId ?? null);
      });
    });
    return () => {
      live = false;
    };
  }, [available, config.clearing, config.network, config.walletUrl]);

  const send = useCallback(
    async (request: TxRequest): Promise<string> => {
      if (selector === null) throw new Error('no wallet is connected');
      const wallet = await selector.wallet();
      const action: FunctionCallAction = {
        type: 'FunctionCall',
        params: {
          methodName: request.method,
          args: request.args,
          gas: request.gas ?? DEFAULT_GAS,
          deposit: request.deposit ?? '0',
        },
      };
      // wallet-selector 10.1.4 types `Action` as near-api-js's `Action` *class*, while every
      // wallet implementation — and the project's own documentation — takes this plain descriptor.
      // The cast is to that upstream mismatch, not to `any`: the shape above is checked by
      // `FunctionCallAction`.
      const outcome = await wallet.signAndSendTransaction({
        receiverId: request.contract,
        actions: [action as unknown as Parameters<typeof wallet.signAndSendTransaction>[0]['actions'][number]],
      });
      return outcome?.transaction_outcome?.id ?? '';
    },
    [selector],
  );

  const value = useMemo<WalletState>(
    () => ({
      accountId,
      available,
      ready: selector !== null,
      connect: () => modal?.show(),
      disconnect: async () => {
        const wallet = await selector?.wallet();
        await wallet?.signOut();
        setAccountId(null);
      },
      send,
    }),
    [accountId, available, modal, selector, send],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

/** The wallet, from anywhere under the provider. */
export function useWallet(): WalletState {
  const state = useContext(WalletContext);
  if (state === null) throw new Error('useWallet must be used inside WalletProvider');
  return state;
}
