import Link from 'next/link';

import { JobsTable } from '@/components/jobs/jobs-table';
import { LoadError } from '@/components/load-error';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { chainClient } from '@/lib/chain';
import { loadConfig } from '@/lib/config.server';
import { loadJobs } from '@/lib/jobs';

export const metadata = { title: 'Jobs' };
export const dynamic = 'force-dynamic';

export default async function JobsPage() {
  const config = loadConfig();
  let rows: Awaited<ReturnType<typeof loadJobs>> | Error;
  try {
    rows = await loadJobs(chainClient(config.rpcUrl), config.clearing);
  } catch (error) {
    rows = error instanceof Error ? error : new Error(String(error));
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8">
      <div className="pb-6">
        <h2 className="font-display text-2xl font-semibold tracking-tight">Jobs</h2>
        <p className="pt-1 text-sm text-muted-foreground">
          Every appraisal, provisioning and screening job this clearing contract has run. A job is a
          state record with a deadline, so nothing here depends on a transaction staying open.
        </p>
      </div>

      {rows instanceof Error ? (
        <LoadError error={rows} rpcUrl={config.rpcUrl} />
      ) : rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No jobs yet</CardTitle>
            <CardDescription>
              Request an appraisal from a listing in the{' '}
              <Link href="/listings" className="underline">
                market
              </Link>
              .
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <CardContent className="p-0">
            <JobsTable rows={rows} />
          </CardContent>
        </Card>
      )}
    </main>
  );
}
