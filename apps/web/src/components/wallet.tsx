'use client';

/**
 * The NEAR wallet (E13.1; SDD §3.2 "Next.js, NEAR wallet selector").
 *
 * Every state change is signed by the person's own wallet. The app builds a transaction
 * *descriptor* — contract, method, arguments, deposit, gas — and hands it here; no key, seed or
 * signature ever reaches the server, and the server never acts on a user's behalf.
 *
 * On a network no browser wallet knows (the local sandbox) `walletUrl` is null, so there is no
 * wallet to connect. On that network, and only there, the sandbox dev signer (E14.4,
 * `lib/devsigner.ts`) stands in: the operator pastes an account's key out of
 * `deploy/.keys/<profile>.json`, it stays in that browser, and `send()` keeps the shape below so no
 * page changes. It is a development aid — SDD §1.6's bar is a browser wallet on testnet — and
 * `DevSignerPanel` says so wherever the connect state shows. Everywhere else this file is the
 * wallet path, unchanged.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { FunctionCallAction, WalletSelector } from '@near-wallet-selector/core';
import { setupWalletSelector } from '@near-wallet-selector/core';
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet';
import { setupModal, type WalletSelectorModal } from '@near-wallet-selector/modal-ui';

import { DevSignerPanel } from '@/components/dev-signer';
import type { WebConfig } from '@/lib/config';
import {
  DEFAULT_GAS,
  type DevIdentity,
  type DevKeyStorage,
  type TxDescriptor,
  clearDevKey,
  devKeyStorage,
  devSignerAllowed,
  loadDevKey,
  sendWithDevKey,
} from '@/lib/devsigner';

/** A call the page wants signed. The SDK's builders return exactly this shape. */
export type TxRequest = TxDescriptor;

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
  const hasWallet = config.walletUrl !== null;
  // The dev signer is permitted on a local sandbox only, and `devSignerAllowed` is what decides it.
  const dev = devSignerAllowed(config);
  const available = hasWallet || dev;
  const [storage] = useState<DevKeyStorage | null>(() => devKeyStorage());
  const [identity, setIdentity] = useState<DevIdentity | null>(null);
  const [asking, setAsking] = useState(false);

  // The key this browser already holds, if any. It is read after mount, because `localStorage` does
  // not exist while this renders on the server, and exactly once: `loadDevKey` returns a fresh
  // object every time, so repeating it would be a render loop. `loadDevKey` refuses off a sandbox.
  const read = useRef(false);
  useEffect(() => {
    if (read.current) return;
    read.current = true;
    setIdentity(loadDevKey(config, storage));
  }, [config, storage]);

  useEffect(() => {
    if (!hasWallet) return;
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
  }, [hasWallet, config.clearing, config.network, config.walletUrl]);

  const send = useCallback(
    async (request: TxRequest): Promise<string> => {
      if (dev) {
        if (identity === null) throw new Error('no sandbox dev key is loaded');
        return sendWithDevKey(config, identity, request);
      }
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
    [config, dev, identity, selector],
  );

  const value = useMemo<WalletState>(
    () => ({
      accountId: dev ? (identity?.accountId ?? null) : accountId,
      available,
      ready: dev || selector !== null,
      connect: () => (dev ? setAsking(true) : modal?.show()),
      disconnect: async () => {
        if (dev) {
          clearDevKey(storage);
          setIdentity(null);
          return;
        }
        const wallet = await selector?.wallet();
        await wallet?.signOut();
        setAccountId(null);
      },
      send,
    }),
    [accountId, available, dev, identity, modal, selector, send, storage],
  );

  return (
    <WalletContext.Provider value={value}>
      {children}
      {dev && (
        <DevSignerPanel
          config={config}
          storage={storage}
          identity={identity}
          asking={asking}
          onAsk={() => setAsking(true)}
          onClose={() => setAsking(false)}
          onUse={(next) => {
            // `acceptDevKey` has already proved the key against the node and kept it here.
            setIdentity(next);
            setAsking(false);
          }}
          onForget={() => {
            clearDevKey(storage);
            setIdentity(null);
          }}
        />
      )}
    </WalletContext.Provider>
  );
}

/** The wallet, from anywhere under the provider. */
export function useWallet(): WalletState {
  const state = useContext(WalletContext);
  if (state === null) throw new Error('useWallet must be used inside WalletProvider');
  return state;
}
