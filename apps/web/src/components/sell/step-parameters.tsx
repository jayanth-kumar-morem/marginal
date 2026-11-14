'use client';

/**
 * Step 3: the parameters (SDD §3.24's `listing.toml`, as a form).
 *
 * Every field here is one the seller decides; everything the deployment or the appraiser decides is
 * shown read-only beside them, because a form that pretends a fixed value is a choice is lying. The
 * last thing the step does is ask `marginal-core` whether the spec is admissible —
 * `validate_spec`, the very function `create_listing` runs — so a refusal costs nothing and arrives
 * with its own code.
 */
import { Button } from '@/components/ui/button';
import { Done, Problem, SelectField, SwitchField, TextField } from '@/components/sell/fields';
import { DISCLOSURE_POLICIES, KNOWLEDGE_APPRAISER, type SellForm } from '@/lib/sell';

const PRIVACIES = ['Sealed', 'Open'] as const;

export function StepParameters({
  form,
  token,
  checking,
  verdict,
  onChange,
  onCheck,
}: {
  form: SellForm;
  token: string;
  checking: boolean;
  verdict: { readonly ok: boolean; readonly message: string } | null;
  onChange: (form: SellForm) => void;
  onCheck: () => void;
}) {
  const set = <K extends keyof SellForm>(key: K, value: SellForm[K]): void =>
    onChange({ ...form, [key]: value });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="asset class" value="Knowledge" readOnly hint="The only class M1 runs." />
        <TextField
          label="appraiser"
          value={KNOWLEDGE_APPRAISER}
          readOnly
          hint="Its output schema is the appraiser's, not yours."
        />
        <TextField
          label="settlement token"
          value={token === '' ? 'none configured' : token}
          readOnly
          hint="From the deploy manifest; clearing allow-lists it."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="category"
          value={form.category}
          onChange={(value) => set('category', value)}
          hint="A governance category id. Categories decide which identity tier a buyer needs."
        />
        <TextField
          label="licence class"
          value={form.licenceClass}
          onChange={(value) => set('licenceClass', value)}
          hint="What the buyer may do with the good once delivered."
        />
        <TextField
          label="ask (R1, posted)"
          value={form.ask}
          onChange={(value) => set('ask', value)}
          hint="In whole tokens. R1 is the only rule built; the price paid is this ask scaled by what the appraisal measured."
        />
        <TextField
          label="copies"
          value={form.maxCopies}
          onChange={(value) => set('maxCopies', value)}
          hint="How many buyers may ever take delivery."
        />
        <TextField
          label="leakage budget (bits)"
          value={form.budgetBits}
          onChange={(value) => set('budgetBits', value)}
          hint="The verdicts this listing can ever emit, in bits. When it is spent the contract refuses new appraisals."
        />
        <TextField
          label="π per bit"
          value={form.pricePerBit}
          onChange={(value) => set('pricePerBit', value)}
          hint="What you are paid per bit debited. SDD §3.24's default is half the ask over the budget."
        />
        <TextField
          label="judgement floor ℓ (%)"
          value={form.lFloorPercent}
          onChange={(value) => set('lFloorPercent', value)}
          hint="The share of the measured value judges can never take away. Stored as basis points."
        />
        <TextField
          label="challenge window (blocks)"
          value={form.challengeWindowBlocks}
          onChange={(value) => set('challengeWindowBlocks', value)}
          hint="How long a buyer has to dispute before proceeds are released."
        />
        <TextField
          label="delivery deadline (blocks)"
          value={form.deliveryDeadlineBlocks}
          onChange={(value) => set('deliveryDeadlineBlocks', value)}
          hint="After this, anyone may refund the buyer: the deadline is a height, not a clock."
        />
        <SelectField
          label="privacy default"
          value={form.privacy}
          options={PRIVACIES}
          onChange={(value) => set('privacy', value)}
          hint="Sealed publishes the outcome and commits to the components; Open publishes the components, and debits more."
        />
        <SelectField
          label="disclosure policy"
          value={form.disclosure}
          options={DISCLOSURE_POLICIES}
          onChange={(value) => set('disclosure', value)}
          hint="Who may see a sealed verdict's opening, and when."
        />
      </div>

      <SwitchField
        label="external judges allowed"
        checked={form.externalJudges}
        onChange={(value) => set('externalJudges', value)}
        hint="Judges can only take value off what the measurement found, never add to it."
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" disabled={checking} onClick={onCheck}>
          {checking ? 'Asking the core…' : 'Check with the core'}
        </Button>
        <p className="text-xs text-muted-foreground">
          `validate_spec` is the contract&rsquo;s own check, run here before any gas is paid.
        </p>
      </div>
      {verdict === null ? null : verdict.ok ? (
        <Done>{verdict.message}</Done>
      ) : (
        <Problem>{verdict.message}</Problem>
      )}
    </div>
  );
}
