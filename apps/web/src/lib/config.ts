/**
 * Manifest-driven configuration (E13.1, SDD §3.24: `up.sh` "prints a manifest that the web app and
 * verifiers read").
 *
 * The app never hard-codes an account. Everything it talks to comes from the deploy manifest —
 * which is gitignored, because it is produced per run — with environment variables as the override
 * for anything the manifest does not carry (the three service URLs). `configFrom` is pure so it can
 * be tested; reading the file is `config.server.ts`'s job.
 */
import type { KeyMode } from "./records";

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
  /** How this deployment releases listing keys (SDD §2.7's profile table, §3.12.7). */
  readonly keyMode: KeyMode;
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
 * Which key-release mode a profile's listings use, from SDD §2.7's profile table.
 *
 * `Ckd` is the real mode and the answer everywhere but three profiles: it needs the MPC signer
 * contract, which exists on testnet and mainnet. `local` and `sandbox` have no MPC network to
 * call, so the table gives them the `RoomSealed` fallback (§3.12.7) — the only mode a throwaway
 * node can actually run end to end. `testnet-sim` has the network but not the room: MPC CKD
 * releases a key to an attested room, and a simulated room has no attestation to release it to.
 *
 * An unknown profile, or a manifest that carries no profile at all, gets `Ckd`. The mode is a
 * promise to the seller about who can ever open the good, and the weaker promise is never the safe
 * guess: a Ckd listing on a deployment that cannot provision stalls in `Provisioning`, which is
 * visible, whereas a RoomSealed listing nobody asked for is bound to one room forever.
 */
export function keyModeFor(profile: string): KeyMode {
  return profile === "sandbox" || profile === "local" || profile === "testnet-sim" ? "RoomSealed" : "Ckd";
}

/**
 * The mode, with `MARGINAL_KEY_MODE` as the override — the same shape as every other field here,
 * so a stack can be pointed at a profile's opposite mode without regenerating a manifest. An
 * override that names neither mode is refused rather than ignored: a typo there would otherwise
 * silently publish under the mode the seller did not choose.
 */
function keyMode(value: unknown, profile: string): KeyMode {
  const named = text(value, "");
  if (named === "") return keyModeFor(profile);
  if (named !== "Ckd" && named !== "RoomSealed") {
    throw new Error(
      `config: MARGINAL_KEY_MODE is "${named}", which is neither Ckd nor RoomSealed (SDD §3.12.7).`,
    );
  }
  return named;
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
  const profile = text(
    env.MARGINAL_PROFILE,
    text(onChain?.profile, text(manifest?.profile, network)),
  );
  return {
    profile,
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
    keyMode: keyMode(env.MARGINAL_KEY_MODE, profile),
  };
}
