/**
 * Loading the configuration on the server (E13.1).
 *
 * The deploy manifest is gitignored and written per run, so it is read from disk at request time,
 * never imported. This file is the only place in the app that touches the filesystem, and it is
 * server-only: a client component that imported it would fail to build, which is the point.
 */
import { readFileSync } from "node:fs";

import { configFrom, type Manifest, type WebConfig } from "./config";

/** Reads the manifest at `path`, or returns undefined if there is none to read. */
export function readManifest(path: string | undefined): Manifest | undefined {
  if (path === undefined || path === "") return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Manifest;
  } catch {
    // A missing or unreadable manifest is not fatal: the environment may carry everything.
    return undefined;
  }
}

/** The configuration for this process. */
export function loadConfig(env: Record<string, string | undefined> = process.env): WebConfig {
  return configFrom(env, readManifest(env.MARGINAL_MANIFEST));
}
