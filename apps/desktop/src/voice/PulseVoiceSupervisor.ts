// @effect-diagnostics globalTimers:off -- Restart backoff and kill watchdogs run at child-process callback boundaries outside Effect fibers.
// @effect-diagnostics globalDate:off -- Uptime is measured in child-process callbacks; tests inject `now`.

import {
  PULSE_VOICE_PROTOCOL,
  PulseVoiceClient,
  PulseVoiceError,
  type PulseVoiceEvent,
  type PulseVoiceStreams,
} from "./PulseVoiceClient.ts";

/** The slice of `ChildProcess` the supervisor uses, so tests can fake it. */
export type PulseVoiceChild = PulseVoiceStreams & {
  readonly pid?: number | undefined;
  readonly exitCode: number | null;
  kill(signal?: NodeJS.Signals): boolean;
  once(event: "exit", listener: (code: number | null, signal: string | null) => void): unknown;
  once(event: "error", listener: (error: NodeJS.ErrnoException) => void): unknown;
};

export type PulseVoiceSupervisorStatus =
  | { readonly kind: "stopped" }
  | { readonly kind: "starting" }
  | { readonly kind: "ready"; readonly version: string }
  /** The binary is not installed. Not retried. */
  | { readonly kind: "missing"; readonly message: string }
  /** The binary speaks another protocol version. Not retried. */
  | { readonly kind: "incompatible"; readonly message: string }
  /** Crashed or failed to start; `ensure` tries again. */
  | { readonly kind: "failed"; readonly message: string };

const RESTART_BASE_DELAY_MS = 1_000;
const RESTART_MAX_DELAY_MS = 30_000;
const MAX_CONSECUTIVE_CRASHES = 5;
// A run this long proves the binary is healthy, so earlier crashes stop counting.
const HEALTHY_UPTIME_MS = 60_000;
const SHUTDOWN_GRACE_MS = 1_500;

export function restartDelayMs(consecutiveCrashes: number): number {
  return Math.min(RESTART_BASE_DELAY_MS * 2 ** (consecutiveCrashes - 1), RESTART_MAX_DELAY_MS);
}

export type PulseVoiceSupervisorOptions = {
  readonly spawn: () => PulseVoiceChild;
  readonly onStatus: (status: PulseVoiceSupervisorStatus) => void;
  readonly onEvent: (event: PulseVoiceEvent) => void;
  /** Runs after `hello` on every (re)start: load the model, install the hotkey. */
  readonly onStarted: (client: PulseVoiceClient) => Promise<void>;
  readonly onLog?: (line: string) => void;
  readonly now?: () => number;
};

/**
 * Owns the single pulse-voice process: spawns it on demand, checks the protocol
 * version, restarts it with backoff while `keepAlive` is set, and kills only the
 * child it spawned.
 */
export class PulseVoiceSupervisor {
  private child: PulseVoiceChild | undefined;
  private client: PulseVoiceClient | undefined;
  private starting: Promise<PulseVoiceClient> | undefined;
  private restartTimer: ReturnType<typeof setTimeout> | undefined;
  private stopping = false;
  private keepAlive = false;
  private consecutiveCrashes = 0;
  private startedAt: number | undefined;
  private currentStatus: PulseVoiceSupervisorStatus = { kind: "stopped" };

  private readonly options: PulseVoiceSupervisorOptions;

  constructor(options: PulseVoiceSupervisorOptions) {
    this.options = options;
  }

  get status(): PulseVoiceSupervisorStatus {
    return this.currentStatus;
  }

  /** The running client, without starting one. */
  get running(): PulseVoiceClient | undefined {
    return this.currentStatus.kind === "ready" ? this.client : undefined;
  }

  /** While set, a crashed process is restarted without waiting for a request. */
  setKeepAlive(keepAlive: boolean): void {
    this.keepAlive = keepAlive;
    if (keepAlive && this.currentStatus.kind === "stopped") void this.ensure().catch(() => {});
  }

  ensure(): Promise<PulseVoiceClient> {
    this.stopping = false;
    if (this.starting) return this.starting;
    if (this.client && this.currentStatus.kind === "ready") return Promise.resolve(this.client);
    const status = this.currentStatus;
    if (status.kind === "missing" || status.kind === "incompatible") {
      return Promise.reject(new PulseVoiceError(status.kind, status.message));
    }
    this.clearRestartTimer();
    const starting = this.start().finally(() => {
      if (this.starting === starting) this.starting = undefined;
    });
    this.starting = starting;
    return starting;
  }

  /** Shut the process down and wait for it to exit. Safe to call repeatedly. */
  async stop(): Promise<void> {
    this.stopping = true;
    this.clearRestartTimer();
    const child = this.child;
    const client = this.client;
    if (!child) {
      this.setStatus({ kind: "stopped" });
      return;
    }
    const exited = new Promise<void>((resolve) => {
      if (child.exitCode !== null) resolve();
      else child.once("exit", () => resolve());
    });
    await Promise.race([client?.request("shutdown").catch(() => {}), delay(SHUTDOWN_GRACE_MS)]);
    child.stdin.end();
    if (child.exitCode === null) {
      await Promise.race([exited, delay(SHUTDOWN_GRACE_MS)]);
    }
    if (child.exitCode === null) child.kill();
    await Promise.race([exited, delay(SHUTDOWN_GRACE_MS)]);
  }

  private async start(): Promise<PulseVoiceClient> {
    this.setStatus({ kind: "starting" });
    let child: PulseVoiceChild;
    try {
      child = this.options.spawn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus({ kind: "failed", message: `Could not start the voice engine: ${message}` });
      throw new PulseVoiceError("failed", message);
    }
    const client = new PulseVoiceClient(child, {
      onEvent: (event) => {
        if (this.child === child) this.options.onEvent(event);
      },
      ...(this.options.onLog ? { onLog: this.options.onLog } : {}),
    });
    this.child = child;
    this.client = client;
    child.once("error", (error) => this.handleExit(child, error));
    child.once("exit", (code, signal) => this.handleExit(child, undefined, code, signal));

    const hello = await client.request("hello");
    if (hello.protocol !== PULSE_VOICE_PROTOCOL) {
      const message = `The voice engine speaks protocol ${hello.protocol}; this app needs ${PULSE_VOICE_PROTOCOL}. Reinstall Pulse Code.`;
      this.stopping = true;
      this.setStatus({ kind: "incompatible", message });
      child.kill();
      throw new PulseVoiceError("incompatible", message);
    }
    try {
      await this.options.onStarted(client);
    } catch (error) {
      // A model that fails to load fails the same way on restart, so stop here.
      if (this.child === child) {
        const message = error instanceof Error ? error.message : String(error);
        this.stopping = true;
        this.setStatus({ kind: "failed", message: `The voice engine could not start: ${message}` });
        child.kill();
      }
      throw error;
    }
    if (this.child !== child) throw new PulseVoiceError("exited", "The voice engine stopped.");
    this.startedAt = this.now();
    this.setStatus({ kind: "ready", version: hello.version });
    return client;
  }

  private handleExit(
    child: PulseVoiceChild,
    error?: NodeJS.ErrnoException,
    code?: number | null,
    signal?: string | null,
  ): void {
    if (this.child !== child) return;
    this.child = undefined;
    this.client?.dispose(
      error ? `The voice engine failed: ${error.message}` : "The voice engine stopped.",
    );
    this.client = undefined;
    if (error?.code === "ENOENT") {
      this.setStatus({ kind: "missing", message: "The voice engine is not installed." });
      return;
    }
    if (this.stopping) {
      const kind = this.currentStatus.kind;
      if (kind !== "incompatible" && kind !== "failed") this.setStatus({ kind: "stopped" });
      return;
    }
    if (this.startedAt !== undefined && this.now() - this.startedAt >= HEALTHY_UPTIME_MS) {
      this.consecutiveCrashes = 0;
    }
    this.startedAt = undefined;
    this.consecutiveCrashes += 1;
    const reason = error?.message ?? `exit code ${code ?? "none"}${signal ? `, ${signal}` : ""}`;
    this.options.onLog?.(`pulse-voice exited (${reason})`);
    if (!this.keepAlive) {
      this.setStatus({ kind: "stopped" });
      return;
    }
    if (this.consecutiveCrashes > MAX_CONSECUTIVE_CRASHES) {
      this.setStatus({
        kind: "failed",
        message: `The voice engine keeps stopping (${reason}). Toggle voice off and on to retry.`,
      });
      return;
    }
    this.setStatus({
      kind: "failed",
      message: `The voice engine stopped (${reason}). Restarting.`,
    });
    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined;
      if (this.keepAlive && !this.stopping) void this.ensure().catch(() => {});
    }, restartDelayMs(this.consecutiveCrashes));
    this.restartTimer.unref?.();
  }

  /** Forget earlier crashes, for an explicit user retry. */
  resetCrashes(): void {
    this.consecutiveCrashes = 0;
  }

  private clearRestartTimer(): void {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = undefined;
  }

  private setStatus(status: PulseVoiceSupervisorStatus): void {
    this.currentStatus = status;
    this.options.onStatus(status);
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}
