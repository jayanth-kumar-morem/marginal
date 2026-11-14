/**
 * Manifest-driven configuration (E13.1, SDD §3.24: `up.sh` "prints a manifest that the web app and
 * verifiers read").
 *
 * The app never hard-codes an account. Everything it talks to comes from the deploy manifest —
 * which is gitignored, because it is produced per run — with environment variables as the override
 * for anything the manifest does not carry (the three service URLs). `configFrom` is pure so it can
 * be tested; reading the file is `config.server.ts`'s job.
 */

/** Which contracts and services this deployment has, and where they are. */
export interface WebConfig {
  readonly profile: string;
  readonly network: string;
  readonly chainId: string;
  readonly rpcUrl: string;
  readonly clearing: string;
  readonly keypolicy: string;
  readonly token: string;
  readonly gov: string;
  readonly faucet: string;
  /** The gateway, for blobs, replay and the 1Click dry quote (E11.2). */
  readonly gateway: string;
  /** The compliance service, for credentials and payout approvals (E11.4). */
  readonly compliance: string;
  /** Where a browser wallet can sign, or `null` on a network no wallet knows (the sandbox). */
  readonly walletUrl: string | null;
  /** `config()`'s policy version, so a page can say which policy produced a record. */
  readonly policyVersion: number;
  /** Whether anything in this deployment is simulated, from the on-chain profile (DRC-12). */
  readonly simulatedProfile: boolean;
}

/** The part of the deploy manifest the app reads (`scripts/src/deploy.ts`'s `Manifest`). */
export interface Manifest {
  readonly profile?: string;
  readonly network?: string;
  readonly chain_id?: string;
  readonly rpc?: readonly string[];
  readonly accounts?: { readonly gov?: string; readonly faucet?: string };
  readonly contracts?: Record<string, { readonly account?: string } | undefined>;
  readonly config?: {
    readonly clearing?: {
      readonly policy_version?: number;
      /** Clearing's `ProfileConfig`: `profile` names the deployment, `gov_profile` the governance. */
      readonly profile?: { readonly profile?: string; readonly gov_profile?: string };
    };
  };
}

/** Where a browser wallet lives, per network. The sandbox has none. */
export function walletFor(network: string): string | null {
  if (network === "mainnet") return "https://app.mynearwallet.com";
  if (network === "testnet") return "https://testnet.mynearwallet.com";
  return null;
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value !== "" ? value : fallback;
}

/**
 * The configuration, from a manifest and an environment. Every field has an environment override,
 * so a deployment can point the app at a running stack without regenerating anything.
 *
 * It refuses rather than guesses: without a clearing account there is nothing to show, and a page
 * that silently read the wrong contract would be worse than a page that says so.
 */
export function configFrom(env: Record<string, string | undefined>, manifest?: Manifest): WebConfig {
  const contracts = manifest?.contracts ?? {};
  const network = text(env.MARGINAL_NETWORK, text(manifest?.network, "testnet"));
  const clearing = text(env.MARGINAL_CLEARING, text(contracts.clearing?.account, ""));
  const keypolicy = text(env.MARGINAL_KEYPOLICY, text(contracts.keypolicy?.account, ""));
  if (clearing === "" || keypolicy === "") {
    throw new Error(
      "config: no clearing or keypolicy account. Point MARGINAL_MANIFEST at a deploy manifest, " +
        "or set MARGINAL_CLEARING and MARGINAL_KEYPOLICY.",
    );
  }
  const onChain = manifest?.config?.clearing?.profile;
  return {
    profile: text(env.MARGINAL_PROFILE, text(onChain?.profile, text(manifest?.profile, network))),
    network,
    chainId: text(env.MARGINAL_CHAIN_ID, text(manifest?.chain_id, network)),
    rpcUrl: text(env.MARGINAL_RPC_URL, text(manifest?.rpc?.[0], "https://test.rpc.fastnear.com")),
    clearing,
    keypolicy,
    token: text(env.MARGINAL_TOKEN, text(contracts.musdc?.account, "")),
    gov: text(env.MARGINAL_GOV, text(manifest?.accounts?.gov, "")),
    faucet: text(env.MARGINAL_FAUCET, text(manifest?.accounts?.faucet, "")),
    gateway: text(env.MARGINAL_GATEWAY_URL, "http://127.0.0.1:8081"),
    compliance: text(env.MARGINAL_COMPLIANCE_URL, "http://127.0.0.1:8083"),
    walletUrl: walletFor(network),
    policyVersion: manifest?.config?.clearing?.policy_version ?? 0,
    // The profile is declared on-chain so a reader knows which one produced a record (§6.3 rule 2).
    // Anything but a production governance profile can contain simulated elements, and says so.
    simulatedProfile: text(onChain?.gov_profile, "demo") !== "production",
  };
}
