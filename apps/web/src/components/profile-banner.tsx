import { IconAlertTriangle } from '@tabler/icons-react';

import type { WebConfig } from '@/lib/config';
import { profileBanner } from '@/lib/simulated';

/**
 * DRC-12's banner, and SDD §6.3 rule 1. The text is derived from the profile the contracts declare
 * on-chain, never from a constant in the UI, so it cannot drift from what actually produced a
 * record. Per-record flags are shown on the record itself.
 */
export function ProfileBanner({ config }: { config: WebConfig }) {
  const text = profileBanner(config);
  if (text === null) return null;
  return (
    <div className="flex items-start gap-2 border-b border-brand-primary/25 bg-brand-primary/5 px-6 py-2 text-xs text-muted-foreground">
      <IconAlertTriangle className="mt-px size-3.5 shrink-0 text-brand-primary" />
      <p>{text}</p>
    </div>
  );
}
