import { Progress } from '@/components/ui/progress';
import { bits, leakageUsedPercent, tokens } from '@/lib/format';
import type { Leakage } from '@/lib/records';

/**
 * The leakage meter (E13.3, D4): spent, reserved and budget, in the millibits the contract accounts
 * in (§3.8). Reserved bits are already committed to jobs in flight, so they count against the
 * budget here as they do on chain — which is why a listing can refuse an appraisal while its
 * *spent* total still looks small.
 */
export function LeakageMeter({ leakage, compact = false }: { leakage: Leakage; compact?: boolean }) {
  const used = leakageUsedPercent(leakage);
  return (
    <div className={compact ? 'w-40' : 'space-y-2'}>
      <Progress value={used} className="h-1.5" />
      {compact ? (
        <p className="pt-1 font-mono text-[10px] text-muted-foreground">
          {bits(leakage.spent_mbits)} spent · {bits(leakage.remaining_mbits)} left
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs sm:grid-cols-4">
          <Cell label="spent" value={bits(leakage.spent_mbits)} />
          <Cell label="reserved" value={bits(leakage.reserved_mbits)} />
          <Cell label="remaining" value={bits(leakage.remaining_mbits)} />
          <Cell label="budget" value={bits(leakage.budget_mbits)} />
          <Cell label="π per bit" value={tokens(leakage.price_per_bit)} />
        </dl>
      )}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
