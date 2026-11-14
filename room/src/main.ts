/**
 * The supervisor's entry point: what the image's CMD runs (SDD §3.13, §3.14; E7.2, E7.4, E7.5).
 *
 * It is deliberately thin. Everything it does is one of the pieces above, wired to the real world
 * exactly once: the configuration from the environment, the dstack guest agent on its socket, the
 * chain over JSON-RPC, the operator agent on the host, and a forked worker per job. The keys are
 * generated here rather than inside `boot`, because the signing service the fork answers with has
 * to hold the same key.
 */
import { fileURLToPath } from "node:url";

import { boot, type Room } from "./boot.js";
import { chainClient } from "./chain.js";
import { configEnv, loadConfig } from "./config.js";
import { dstackClient } from "./dstack.js";
import { generateRoomKeys } from "./keys.js";
import { operatorClient } from "./operator.js";
import { forkSpawner } from "./spawn.js";

/** E8's per-job worker, beside this module in the built image. */
export const WORKER_PATH = fileURLToPath(new URL("./worker/main.js", import.meta.url));

/**
 * Brings the room up and returns it, so the caller can stop it. It does not catch: a room that
 * cannot read its configuration or cannot register must not stay up pretending to serve jobs — the
 * CVM restarts it, with new keys and a new attestation.
 */
export async function main(
  env: NodeJS.ProcessEnv = process.env,
  log: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
): Promise<Room> {
  const config = loadConfig(env);
  const keys = generateRoomKeys();
  const operator = operatorClient(config.operatorUrl);
  const onError = (error: Error): void => log(`error ${error.message}`);
  const room = await boot(config, {
    chain: chainClient(config.rpcUrl),
    dstack: dstackClient({ socketPath: config.dstackSocket }),
    operator,
    spawner: forkSpawner({
      workerPath: WORKER_PATH,
      keys,
      operator,
      onError,
      // The worker's whole world: this room's configuration, none of the host's environment.
      env: configEnv(config),
    }),
    keys,
    onError,
  });
  log(`room ${room.roomKeyHex} registered, polling ${config.clearing} every ${config.pollMs} ms`);
  return room;
}
