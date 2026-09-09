// @effect-diagnostics nodeBuiltinImport:off globalTimers:off -- Native stdio adapter owns child handles and bounded protocol watchdogs outside Effect.
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";

type WorkerOptions = {
  executable: string;
  dataDir: string;
  args?: string[];
  timeoutMs?: number;
  maxFrameBytes?: number;
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class TalkWorkerClient {
  private child: NodeChildProcess.ChildProcessWithoutNullStreams | undefined;
  private pending = new Map<string, Pending>();
  private input = Buffer.alloc(0);
  private starting: Promise<void> | undefined;
  private closing = false;

  private readonly options: WorkerOptions;
  constructor(options: WorkerOptions) {
    this.options = options;
  }

  get running() {
    return this.child !== undefined;
  }

  private fail(error: Error) {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
  }

  private accept(chunk: Buffer) {
    this.input = Buffer.concat([this.input, chunk]);
    const maximum = this.options.maxFrameBytes ?? 1024 * 1024;
    for (;;) {
      const newline = this.input.indexOf(10);
      if (newline < 0) break;
      if (newline > maximum) return this.protocolFailure();
      const line = this.input.subarray(0, newline).toString("utf8");
      this.input = this.input.subarray(newline + 1);
      let message: unknown;
      try {
        message = JSON.parse(line);
      } catch {
        return this.protocolFailure();
      }
      if (
        typeof message !== "object" ||
        message === null ||
        !("v" in message) ||
        message.v !== 1 ||
        !("id" in message) ||
        typeof message.id !== "string" ||
        !("ok" in message) ||
        typeof message.ok !== "boolean"
      ) {
        return this.protocolFailure();
      }
      const request = this.pending.get(message.id);
      if (!request) continue;
      this.pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.ok && "result" in message) request.resolve(message.result);
      else if (
        !message.ok &&
        "error" in message &&
        typeof message.error === "object" &&
        message.error !== null &&
        "message" in message.error &&
        typeof message.error.message === "string"
      )
        request.reject(new Error(message.error.message));
      else {
        request.reject(new Error("Talk returned an invalid response."));
        return this.protocolFailure();
      }
    }
    if (this.input.length > maximum) this.protocolFailure();
  }

  private protocolFailure() {
    this.fail(new Error("Talk returned an invalid or oversized protocol frame."));
    this.child?.kill();
  }

  private async start() {
    if (this.starting) return this.starting;
    if (this.child) return;
    if (this.closing) throw new Error("Talk is shutting down.");
    this.starting = (async () => {
      this.input = Buffer.alloc(0);
      const child = NodeChildProcess.spawn(
        this.options.executable,
        [...(this.options.args ?? []), "--data-dir", this.options.dataDir],
        { stdio: "pipe", windowsHide: true, shell: false },
      );
      this.child = child;
      child.stdout.on("data", (chunk: Buffer) => this.accept(chunk));
      // Drain diagnostics without exposing model paths or recording content in app logs.
      child.stderr.resume();
      child.on("error", () =>
        this.fail(new Error("Talk could not start. Check the installed native worker.")),
      );
      child.on("close", () => {
        if (this.child === child) this.child = undefined;
        this.fail(new Error("Talk stopped before the operation completed."));
      });
      const hello = await this.send("hello", {}, this.options.timeoutMs ?? 15_000);
      if (
        typeof hello !== "object" ||
        hello === null ||
        !("protocolVersion" in hello) ||
        hello.protocolVersion !== 1
      ) {
        child.kill();
        throw new Error("This Talk worker is incompatible with Pulse.");
      }
    })();
    try {
      await this.starting;
    } finally {
      this.starting = undefined;
    }
  }

  private send(op: string, args: object, timeoutMs: number): Promise<unknown> {
    const child = this.child;
    if (!child || !child.stdin.writable) return Promise.reject(new Error("Talk is unavailable."));
    const id = NodeCrypto.randomUUID();
    const frame = JSON.stringify({ v: 1, id, op, args }) + "\n";
    if (Buffer.byteLength(frame) > (this.options.maxFrameBytes ?? 1024 * 1024))
      return Promise.reject(new Error("Talk request is too large."));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Talk did not respond in time. Check its status before retrying."));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(frame, (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error("The Talk worker connection closed."));
      });
    });
  }

  async request(op: string, args: object = {}): Promise<unknown> {
    if (this.closing) throw new Error("Talk is shutting down.");
    await this.start();
    if (this.closing) throw new Error("Talk is shutting down.");
    const timeout = ["recordings.transcribe", "model.load", "dictation.hold"].includes(op)
      ? 30 * 60_000
      : (this.options.timeoutMs ?? 15_000);
    return this.send(op, args, timeout);
  }

  async close(): Promise<void> {
    this.closing = true;
    const child = this.child;
    if (!child) return;
    const exited = new Promise<void>((resolve) => child.once("close", () => resolve()));
    try {
      await this.send("shutdown", {}, 10_000);
    } catch {
      /* Force-stop only this captured child if it cannot drain. */
    }
    child.stdin.end();
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      exited,
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          child.kill();
          resolve();
        }, 5_000);
      }),
    ]);
    if (timer) clearTimeout(timer);
    this.fail(new Error("Talk has shut down."));
    this.child = undefined;
  }
}
