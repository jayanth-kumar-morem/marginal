import { IconCheck, IconX } from '@tabler/icons-react';

import { Row, Rows } from '@/components/listings/detail-rows';
import { LoadError } from '@/components/load-error';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { chainClient } from '@/lib/chain';
import { loadConfig } from '@/lib/config.server';
import { height, short, when } from '@/lib/format';
import { RTMR3_EVENTS, loadRooms, modeNote } from '@/lib/rooms';

export const metadata = { title: 'Rooms' };
export const dynamic = 'force-dynamic';

export default async function RoomsPage() {
  const config = loadConfig();
  const chain = chainClient(config.rpcUrl);
  let rooms: Awaited<ReturnType<typeof loadRooms>> | Error;
  try {
    rooms = await loadRooms(chain, config.clearing, config.keypolicy);
  } catch (error) {
    rooms = error instanceof Error ? error : new Error(String(error));
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">Rooms</h2>
        <p className="pt-1 text-sm text-muted-foreground">
          The attested programs this deployment will release a key to. A room is eligible only while
          its attestation is current, so this list is what could open a good right now — not what
          ever could.
        </p>
      </div>

      {rooms instanceof Error ? (
        <LoadError error={rooms} rpcUrl={config.rpcUrl} />
      ) : rooms.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No eligible room</CardTitle>
            <CardDescription>
              No room is registered and current on {config.keypolicy}. Until one is, no key can be
              released and no listing can be appraised.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        rooms.map((row) => {
          const mode = modeNote(row.attestation?.mode ?? row.room?.mode ?? null);
          const events = row.attestation === null ? [] : RTMR3_EVENTS;
          return (
            <Card key={row.key}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="font-mono text-sm">{short(row.key, 12)}</CardTitle>
                  <Badge
                    variant="outline"
                    className={
                      mode.real
                        ? 'border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400'
                        : 'border-brand-primary/40 bg-brand-primary/10 text-brand-primary'
                    }
                  >
                    {row.attestation?.mode ?? row.room?.mode ?? 'unattested'}
                  </Badge>
                  {row.room !== null && (
                    <Badge variant="outline" className="font-mono text-[10px]">
                      class {row.room.class}
                    </Badge>
                  )}
                </div>
                <CardDescription>{mode.note}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 lg:grid-cols-2">
                <Rows>
                  <Row label="box key">{short(row.key, 10)}</Row>
                  <Row label="PPID hash" note="The platform the TEE ran on, hashed.">
                    {row.attestation === null ? '—' : short(row.attestation.ppid_hash, 10)}
                  </Row>
                  <Row label="TCB status">
                    {row.attestation === null ? '—' : row.attestation.tcb_status}
                  </Row>
                  <Row label="quote">
                    {row.attestation === null ? '—' : short(row.attestation.quote_hash, 10)}
                  </Row>
                  <Row label="collateral">
                    {row.attestation === null ? '—' : short(row.attestation.collateral_hash, 10)}
                  </Row>
                  <Row label="verified">
                    {row.attestation === null
                      ? '—'
                      : `block ${height(row.attestation.verified_height)}`}
                  </Row>
                  <Row label="expires" note="A room re-registers every 24 hours.">
                    {row.attestation === null ? '—' : when(row.attestation.expires_at)}
                  </Row>
                  <Row label="eligible">
                    {row.denyReasons.length === 0
                      ? 'yes'
                      : row.denyReasons.map((reason) => <div key={reason}>{reason}</div>)}
                  </Row>
                </Rows>

                <div className="space-y-4">
                  <div>
                    <p className="pb-2 text-xs uppercase tracking-wide text-muted-foreground">
                      Measurement
                    </p>
                    <Rows>
                      <Row label="MRTD">
                        {row.attestation === null ? '—' : short(row.attestation.measurement.mrtd, 8)}
                      </Row>
                      <Row label="RTMR0">
                        {row.attestation === null ? '—' : short(row.attestation.measurement.rtmr0, 8)}
                      </Row>
                      <Row label="RTMR1">
                        {row.attestation === null ? '—' : short(row.attestation.measurement.rtmr1, 8)}
                      </Row>
                      <Row label="RTMR2">
                        {row.attestation === null ? '—' : short(row.attestation.measurement.rtmr2, 8)}
                      </Row>
                      <Row
                        label="compose hash"
                        note="The image and its compose file, reproducible from the git tag."
                      >
                        {row.attestation === null
                          ? '—'
                          : short(row.attestation.measurement.compose_hash, 8)}
                      </Row>
                      <Row label="key provider">
                        {row.attestation === null
                          ? '—'
                          : short(row.attestation.measurement.key_provider_digest, 8)}
                      </Row>
                    </Rows>
                  </div>

                  <div>
                    <p className="pb-2 text-xs uppercase tracking-wide text-muted-foreground">
                      RTMR3 events
                    </p>
                    {events.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No attestation record, so no event log.
                      </p>
                    ) : (
                      <ul className="space-y-0.5">
                        {events.map((event) => (
                          <li key={event} className="flex items-center gap-2 font-mono text-xs">
                            {mode.real ? (
                              <IconCheck className="size-3.5 text-emerald-600" />
                            ) : (
                              <IconX className="size-3.5 text-brand-primary" />
                            )}
                            {event}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="pt-2 text-xs text-muted-foreground">
                      The order is dstack&rsquo;s own. <span className="font-mono">key-provider</span>{' '}
                      is the one that matters: it proves the room booted with no KMS, so no one
                      outside the enclave ever held the key.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </main>
  );
}
