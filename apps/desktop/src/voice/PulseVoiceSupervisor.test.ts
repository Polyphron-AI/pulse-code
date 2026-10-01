// @effect-diagnostics nodeBuiltinImport:off -- The fake sidecar uses Node streams and emitters.
import * as NodeEvents from "node:events";
import * as NodeReadline from "node:readline";
import * as NodeStream from "node:stream";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { PulseVoiceClient, PulseVoiceError, type PulseVoiceEvent } from "./PulseVoiceClient.ts";
import {
  PulseVoiceSupervisor,
  restartDelayMs,
  type PulseVoiceChild,
  type PulseVoiceSupervisorStatus,
} from "./PulseVoiceSupervisor.ts";

type Request = { id: number; method: string; params?: unknown };

/** An in-memory sidecar. `respond` decides each answer; returning undefined leaves it pending. */
class FakeSidecar extends NodeEvents.EventEmitter {
  readonly stdin = new NodeStream.PassThrough();
  readonly stdout = new NodeStream.PassThrough();
  readonly stderr = new NodeStream.PassThrough();
  readonly pid = 4242;
  exitCode: number | null = null;
  readonly requests: Request[] = [];
  killed = false;

  private readonly respond: (request: Request) => object | undefined;

  constructor(respond: (request: Request) => object | undefined) {
    super();
    this.respond = respond;
    NodeReadline.createInterface({ input: this.stdin }).on("line", (line) => {
      const request = JSON.parse(line) as Request;
      this.requests.push(request);
      const answer = this.respond(request);
      if (answer) this.send({ id: request.id, ...answer });
    });
  }

  send(message: object): void {
    this.stdout.write(`${JSON.stringify(message)}\n`);
  }

  exit(code: number): void {
    if (this.exitCode !== null) return;
    this.exitCode = code;
    this.emit("exit", code, null);
  }

  kill(): boolean {
    this.killed = true;
    this.exit(1);
    return true;
  }
}

const healthy = (request: Request) => {
  if (request.method === "hello")
    return { result: { protocol: 1, version: "0.1.0", platform: "windows" } };
  return { result: {} };
};

function makeSupervisor(respond: (request: Request) => object | undefined = healthy) {
  const children: FakeSidecar[] = [];
  const statuses: PulseVoiceSupervisorStatus["kind"][] = [];
  const events: PulseVoiceEvent[] = [];
  const onStarted = vi.fn(async (_client: PulseVoiceClient) => {});
  let now = 0;
  const supervisor = new PulseVoiceSupervisor({
    spawn: () => {
      const child = new FakeSidecar(respond);
      children.push(child);
      return child as unknown as PulseVoiceChild;
    },
    onStatus: (status) => statuses.push(status.kind),
    onEvent: (event) => events.push(event),
    onStarted,
    now: () => now,
  });
  return {
    supervisor,
    children,
    statuses,
    events,
    onStarted,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("PulseVoiceClient", () => {
  it("correlates out-of-order responses and routes events", async () => {
    const stdin = new NodeStream.PassThrough();
    const stdout = new NodeStream.PassThrough();
    const events: PulseVoiceEvent[] = [];
    const client = new PulseVoiceClient(
      { stdin, stdout, stderr: new NodeStream.PassThrough() },
      { onEvent: (event) => events.push(event) },
    );
    const sent: Request[] = [];
    NodeReadline.createInterface({ input: stdin }).on("line", (line) =>
      sent.push(JSON.parse(line)),
    );

    const status = client.request("status");
    const load = client.request("model.load", { modelDir: "C:/model" });
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toEqual({ id: 2, method: "model.load", params: { modelDir: "C:/model" } });

    stdout.write(`{"event":"hotkey","data":{"phase":"down"}}\n`);
    stdout.write(
      `${JSON.stringify({ id: 2, error: { code: "model-load-failed", message: "bad" } })}\n`,
    );
    stdout.write(
      `${JSON.stringify({ id: 1, result: { modelLoaded: false, modelDir: null, capture: null } })}\n`,
    );

    await expect(load).rejects.toMatchObject({ code: "model-load-failed", message: "bad" });
    await expect(status).resolves.toEqual({ modelLoaded: false, modelDir: null, capture: null });
    expect(events).toEqual([{ event: "hotkey", data: { phase: "down" } }]);
  });

  it("fails pending requests when disposed", async () => {
    const client = new PulseVoiceClient(
      {
        stdin: new NodeStream.PassThrough(),
        stdout: new NodeStream.PassThrough(),
        stderr: new NodeStream.PassThrough(),
      },
      { onEvent: () => {} },
    );
    const pending = client.request("dictation.stop");
    client.dispose();
    await expect(pending).rejects.toBeInstanceOf(PulseVoiceError);
    await expect(client.request("status")).rejects.toMatchObject({ code: "exited" });
  });
});

describe("PulseVoiceSupervisor", () => {
  it("spawns once for concurrent callers and runs onStarted after hello", async () => {
    const { supervisor, children, onStarted, statuses } = makeSupervisor();
    const [a, b] = await Promise.all([supervisor.ensure(), supervisor.ensure()]);
    expect(a).toBe(b);
    expect(children).toHaveLength(1);
    expect(children[0]!.requests[0]!.method).toBe("hello");
    expect(onStarted).toHaveBeenCalledOnce();
    expect(statuses).toEqual(["starting", "ready"]);
    expect(await supervisor.ensure()).toBe(a);
    expect(children).toHaveLength(1);
  });

  it("refuses a sidecar with another protocol version and does not retry", async () => {
    const { supervisor, children } = makeSupervisor((request) =>
      request.method === "hello"
        ? { result: { protocol: 2, version: "9.0.0", platform: "windows" } }
        : { result: {} },
    );
    await expect(supervisor.ensure()).rejects.toMatchObject({ code: "incompatible" });
    expect(children[0]!.killed).toBe(true);
    expect(supervisor.status.kind).toBe("incompatible");
    await expect(supervisor.ensure()).rejects.toMatchObject({ code: "incompatible" });
    expect(children).toHaveLength(1);
  });

  it("restarts a crashed sidecar with growing backoff while kept alive", async () => {
    vi.useFakeTimers();
    const { supervisor, children, onStarted } = makeSupervisor();
    supervisor.setKeepAlive(true);
    await vi.waitFor(() => expect(supervisor.status.kind).toBe("ready"));

    children[0]!.exit(3);
    expect(supervisor.status.kind).toBe("failed");
    await vi.advanceTimersByTimeAsync(restartDelayMs(1) - 1);
    expect(children).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(supervisor.status.kind).toBe("ready"));
    expect(children).toHaveLength(2);
    expect(onStarted).toHaveBeenCalledTimes(2);

    children[1]!.exit(3);
    await vi.advanceTimersByTimeAsync(restartDelayMs(1));
    expect(children).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(restartDelayMs(2) - restartDelayMs(1));
    await vi.waitFor(() => expect(children).toHaveLength(3));
  });

  it("gives up after repeated crashes and forgets them after a healthy run", async () => {
    vi.useFakeTimers();
    const { supervisor, children, advance } = makeSupervisor();
    supervisor.setKeepAlive(true);
    await vi.waitFor(() => expect(supervisor.status.kind).toBe("ready"));

    // A long healthy run resets the crash count.
    advance(60_000);
    children[0]!.exit(1);
    await vi.advanceTimersByTimeAsync(restartDelayMs(1));
    await vi.waitFor(() => expect(supervisor.status.kind).toBe("ready"));

    // Crashes 2 through 5 restart; the sixth in a row gives up.
    for (let crash = 1; crash <= 4; crash += 1) {
      children.at(-1)!.exit(1);
      await vi.advanceTimersByTimeAsync(restartDelayMs(crash + 1));
      await vi.waitFor(() => expect(supervisor.status.kind).toBe("ready"));
    }
    children.at(-1)!.exit(1);
    expect(supervisor.status).toMatchObject({ kind: "failed" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(supervisor.status.kind).toBe("failed");
    const spawned = children.length;
    // An explicit request still retries.
    await supervisor.ensure();
    expect(children).toHaveLength(spawned + 1);
  });

  it("does not restart when not kept alive and stops on request", async () => {
    vi.useFakeTimers();
    const { supervisor, children } = makeSupervisor();
    await supervisor.ensure();
    children[0]!.exit(1);
    expect(supervisor.status.kind).toBe("stopped");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(children).toHaveLength(1);

    await supervisor.ensure();
    const second = children[1]!;
    second.on("exit", () => {});
    // shutdown answers, then the child exits on its own when stdin closes.
    second.stdin.on("finish", () => second.exit(0));
    await supervisor.stop();
    expect(second.requests.at(-1)!.method).toBe("shutdown");
    expect(second.killed).toBe(false);
    expect(supervisor.status.kind).toBe("stopped");
  });

  it("marks a missing binary without retrying", async () => {
    const { supervisor, children } = makeSupervisor(() => undefined);
    const started = supervisor.ensure();
    const error = Object.assign(new Error("spawn pulse-voice.exe ENOENT"), { code: "ENOENT" });
    children[0]!.emit("error", error);
    await expect(started).rejects.toBeInstanceOf(PulseVoiceError);
    expect(supervisor.status.kind).toBe("missing");
    await expect(supervisor.ensure()).rejects.toMatchObject({ code: "missing" });
  });

  it("fails without restart when onStarted fails", async () => {
    const { supervisor, children, onStarted } = makeSupervisor();
    onStarted.mockRejectedValueOnce(new Error("model files are corrupt"));
    supervisor.setKeepAlive(true);
    await vi.waitFor(() => expect(supervisor.status.kind).toBe("failed"));
    expect(children[0]!.killed).toBe(true);
    expect(children).toHaveLength(1);
    expect(supervisor.status).toMatchObject({ message: expect.stringContaining("corrupt") });
  });
});
