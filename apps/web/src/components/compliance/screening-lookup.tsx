'use client';

import { useCallback, useEffect, useState } from 'react';
import { IconSearch } from '@tabler/icons-react';

import { Row, Rows } from '@/components/listings/detail-rows';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { short, when } from '@/lib/format';

/** `GET /v1/health` on the compliance service. */
interface Health {
  readonly issuer_key?: string;
  readonly compliance_key?: string;
  readonly label?: string;
  readonly list_version?: string;
  readonly list_entries?: number;
}

/** One decision the service recorded about a subject (`services/compliance/src/store.ts`). */
interface Screening {
  readonly subject: string;
  readonly routeHash: string;
  readonly screeningId: string;
  readonly blocked: boolean;
  readonly listVersion: string;
  readonly at: number;
}

type Reached<T> = ({ reachable: true } & T) | { reachable: false; error: string };

async function ask<T>(query: string): Promise<Reached<T>> {
  const response = await fetch(`/api/compliance?${query}`);
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = (body as { error?: unknown }).error;
    return { reachable: false, error: typeof message === 'string' ? message : 'the app refused' };
  }
  return body as Reached<T>;
}

/**
 * The compliance service's own state, and the decisions it holds about one subject (§3.20).
 *
 * The service is its own deploy because it holds the only two keys in the system that can grant
 * anything, so on most machines it is simply not running — and that is a sentence this card has to
 * be able to say. Everything goes through `/api/compliance`, which keeps the browser same-origin:
 * the service sends no CORS headers, and the page&rsquo;s CSP would refuse it anyway.
 */
export function ScreeningLookup({ endpoint }: { endpoint: string }) {
  const [health, setHealth] = useState<Reached<{ body: Health }> | null>(null);
  const [subject, setSubject] = useState('');
  const [screenings, setScreenings] = useState<Reached<{ body: { screenings: Screening[] } }> | null>(
    null,
  );
  const [looking, setLooking] = useState(false);

  useEffect(() => {
    let live = true;
    void ask<{ body: Health }>('op=service').then((answer) => {
      if (live) setHealth(answer);
    });
    return () => {
      live = false;
    };
  }, []);

  const look = useCallback(() => {
    setLooking(true);
    setScreenings(null);
    void ask<{ body: { screenings: Screening[] } }>(
      `op=screenings&subject=${encodeURIComponent(subject)}`,
    ).then((answer) => {
      setScreenings(answer);
      setLooking(false);
    });
  }, [subject]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">The sanctions list in use</CardTitle>
        <CardDescription>
          The real OFAC SDN list, read by the compliance service and cited by version in every
          payout decision it signs. A listed address is recorded as blocked and the money stays
          claimable; nothing is seized, and the decision is in the audit chain below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {health === null ? (
          <p className="text-sm text-muted-foreground">Asking the compliance service&hellip;</p>
        ) : health.reachable ? (
          <Rows>
            <Row label="list version" note="SHA-256 of the SDN file the service read.">
              {short(health.body.list_version ?? '—', 10)}
            </Row>
            <Row label="addresses" mono={false}>
              <span className="font-mono text-xs tabular-nums">
                {(health.body.list_entries ?? 0).toLocaleString('en-US')}
              </span>
              <Badge variant="outline" className="ml-2 font-mono text-[10px] uppercase">
                {health.body.label ?? 'demo'}
              </Badge>
            </Row>
            <Row label="issuer key" note="Signs nullifier credentials (D4).">
              {short(health.body.issuer_key ?? '—', 10)}
            </Row>
            <Row label="compliance key" note="Signs payout approvals. A different key, because it grants differently.">
              {short(health.body.compliance_key ?? '—', 10)}
            </Row>
          </Rows>
        ) : (
          <div className="space-y-1 rounded-lg border border-dashed border-border px-4 py-3">
            <p className="text-sm">The compliance service did not answer.</p>
            <p className="font-mono text-xs text-muted-foreground">endpoint: {endpoint}</p>
            <p className="font-mono text-xs text-muted-foreground">error: {health.error}</p>
            <p className="pt-1 text-xs text-muted-foreground">
              It is a separate deploy on purpose: it holds the issuer and compliance keys, and
              nothing else in the system holds either. The holds and outcomes above came from the
              chain and are unaffected.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="screening-subject">Decisions about a subject</Label>
          <div className="flex gap-2">
            <Input
              id="screening-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="desk.testnet"
              autoComplete="off"
              spellCheck={false}
              className="rounded-md font-mono text-xs"
            />
            <Button
              variant="outline"
              onClick={look}
              disabled={subject === '' || looking}
              className="rounded-md"
            >
              <IconSearch className="mr-1 size-4" />
              Look up
            </Button>
          </div>
          {screenings === null ? null : screenings.reachable ? (
            screenings.body.screenings.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                The service has recorded no decision about {subject}.
              </p>
            ) : (
              <ul className="divide-y divide-border/60 text-xs">
                {screenings.body.screenings.map((screening) => (
                  <li key={screening.screeningId} className="flex items-center gap-3 py-2">
                    <Badge
                      variant="outline"
                      className={`font-mono text-[10px] uppercase ${
                        screening.blocked
                          ? 'border-brand-primary/40 bg-brand-primary/10 text-brand-primary'
                          : 'border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {screening.blocked ? 'blocked' : 'cleared'}
                    </Badge>
                    <span className="font-mono text-muted-foreground">
                      {short(screening.screeningId, 8)}
                    </span>
                    <span className="font-mono text-muted-foreground">
                      list {short(screening.listVersion, 6)}
                    </span>
                    <span className="ml-auto font-mono text-muted-foreground">
                      {when(screening.at)}
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <p className="font-mono text-xs text-muted-foreground">error: {screenings.error}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
