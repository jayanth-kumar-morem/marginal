/**
 * The job loop (SDD §3.14, E7.5): poll `get_jobs_for_room`, and fork one worker per job.
 *
 * One process per job, because a worker holds a job's plaintext and its keys in memory and the only
 * way to be sure none of it outlives the job is for the process to exit (§3.18: the forget
 * certificate's `non_persistence_basis` says exactly that). The supervisor never handles the
 * plaintext itself, and it caps how many run at once so one slow job cannot starve the rest.
 */
import type { ChainPort, RoomJob } from "./chain.js";
import { jobsForRoom } from "./chain.js";

/** What starts a worker, so a test can count forks instead of spawning processes. */
export interface WorkerSpawner {
  /** Resolves when the worker for `job` has finished, however it finished. */
  run(job: RoomJob): Promise<void>;
}

export interface SchedulerOptions {
  readonly chain: ChainPort;
  readonly clearing: string;
  readonly roomKeyHex: string;
  readonly spawner: WorkerSpawner;
  readonly maxWorkers: number;
  /** Called with anything that went wrong, instead of throwing: the loop must not stop. */
  readonly onError?: (error: Error) => void;
}

export interface Scheduler {
  /** Polls once: starts workers for the jobs there is room for. Returns how many it started. */
  tick(): Promise<number>;
  /** How many workers are running now. */
  running(): number;
}

export function scheduler(options: SchedulerOptions): Scheduler {
  const { chain, clearing, roomKeyHex, spawner, maxWorkers } = options;
  const onError = options.onError ?? (() => {});
  const inFlight = new Set<number>();

  return {
    running(): number {
      return inFlight.size;
    },
    async tick(): Promise<number> {
      if (inFlight.size >= maxWorkers) return 0;
      let jobs: readonly RoomJob[];
      try {
        jobs = await jobsForRoom(chain, clearing, roomKeyHex);
      } catch (error) {
        onError(error as Error);
        return 0;
      }
      let started = 0;
      for (const job of jobs) {
        if (inFlight.size >= maxWorkers) break;
        // A job already being worked on is not started twice: the view still lists it until the
        // room answers it.
        if (inFlight.has(job.id)) continue;
        inFlight.add(job.id);
        started += 1;
        void spawner
          .run(job)
          .catch((error: unknown) => onError(error as Error))
          .finally(() => inFlight.delete(job.id));
      }
      return started;
    },
  };
}

/**
 * Runs `tick` every `pollMs` until `stop` is called, never overlapping two runs. Nothing here
 * throws: whatever `tick` rejects with is its own business, and the loop goes round again.
 *
 * The job loop and the renewal loop (`boot.ts`) are both this.
 */
export function runLoop(
  tick: () => Promise<unknown>,
  pollMs: number,
  setTimer: (fn: () => void, ms: number) => NodeJS.Timeout = setTimeout,
  clearTimer: (timer: NodeJS.Timeout) => void = clearTimeout,
): { stop(): void } {
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  const schedule = (): void => {
    if (stopped) return;
    timer = setTimer(() => {
      void tick().finally(schedule);
    }, pollMs);
  };
  schedule();
  return {
    stop(): void {
      stopped = true;
      if (timer !== undefined) clearTimer(timer);
    },
  };
}
