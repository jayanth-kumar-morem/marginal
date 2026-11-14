'use client';

/**
 * The sandbox dev signer's face (E14.4).
 *
 * Rendering only: every decision — whether the dev signer is allowed at all, what a key must look
 * like, where it is kept, what the words say — is `lib/devsigner.ts`'s and is covered there. This
 * is the bar that makes it unmistakable, and the one form that takes a key.
 */
import { useState } from 'react';
import { IconAlertTriangle, IconKey } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorCode } from '@/lib/chain';
import {
  DEV_SIGNER_BANNER,
  DEV_SIGNER_NOTE,
  DEV_SIGNER_TITLE,
  type DevIdentity,
  type DevKeyStorage,
  type DevSignerConfig,
  acceptDevKey,
} from '@/lib/devsigner';

export function DevSignerPanel({
  config,
  storage,
  identity,
  asking,
  onAsk,
  onClose,
  onUse,
  onForget,
}: {
  config: DevSignerConfig;
  storage: DevKeyStorage | null;
  identity: DevIdentity | null;
  asking: boolean;
  onAsk: () => void;
  onClose: () => void;
  onUse: (identity: DevIdentity) => void;
  onForget: () => void;
}) {
  const [account, setAccount] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    acceptDevKey(config, storage, { account, key: secret })
      .then((next) => {
        setSecret('');
        onUse(next);
      })
      .catch((reason: unknown) => setError(errorCode(reason)))
      .finally(() => setBusy(false));
  };

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-foreground backdrop-blur">
        <span className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
          <IconAlertTriangle className="size-3.5 shrink-0" />
          {DEV_SIGNER_TITLE}
        </span>
        <p className="min-w-0 flex-1 text-muted-foreground">{DEV_SIGNER_BANNER}</p>
        {identity === null ? (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onAsk}>
            <IconKey className="mr-1.5 size-3.5" />
            Paste a sandbox key
          </Button>
        ) : (
          <span className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-foreground">{identity.accountId}</span>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onForget}>
              Forget this key
            </Button>
          </span>
        )}
      </div>

      <Dialog open={asking} onOpenChange={(open) => (open ? onAsk() : onClose())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconAlertTriangle className="size-4 text-amber-500" />
              {DEV_SIGNER_TITLE}
            </DialogTitle>
            <DialogDescription>{DEV_SIGNER_NOTE}</DialogDescription>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={submit}>
            <div className="grid gap-1.5">
              <Label htmlFor="dev-signer-account">Account</Label>
              <Input
                id="dev-signer-account"
                autoComplete="off"
                spellCheck={false}
                placeholder="gov.sandbox"
                value={account}
                onChange={(event) => setAccount(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="dev-signer-key">Secret key</Label>
              <Input
                id="dev-signer-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="ed25519:…"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
              />
            </div>
            {error !== null && <p className="text-xs text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Checking…' : 'Use this key'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
