#!/usr/bin/env node
// Entry point for `deploy/scripts/up.sh`. The logic is in cli.ts.
import { runUp } from "./cli.js";

runUp(process.argv.slice(2)).catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});
