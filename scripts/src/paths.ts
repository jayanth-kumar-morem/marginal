// Where things live in the repo. Shared by the CLI and the tests, so a path is spelled once.
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The repository root, found from this file's location (`scripts/src`). */
export const repoRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));

export const profilePath = (root: string, name: string) => join(root, "deploy", "profiles", `${name}.toml`);
/** Where `cargo near build` puts `<crate>/<crate>.wasm`. */
export const wasmDir = (root: string) => join(root, "target", "near");
export const manifestPath = (root: string, profile: string) => join(root, "deploy", `manifest.${profile}.json`);
/** Secret keys of the accounts a deploy created. Gitignored. */
export const keysPath = (root: string, profile: string) => join(root, "deploy", ".keys", `${profile}.json`);
