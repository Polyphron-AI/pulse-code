// @effect-diagnostics nodeBuiltinImport:off globalTimers:off - Native process adapter with explicit disposal and bounded protocol requests.
import * as NodeChildProcess from "node:child_process";
import * as NodeReadline from "node:readline";
import { parseVoiceShortcut } from "@t3tools/shared/voiceShortcut";
import { windowsVoiceSource } from "./windowsVoiceSource.ts";

export function voiceVirtualKeys(shortcut: string) {
  const parsed = parseVoiceShortcut(shortcut);
  if (!parsed) throw new Error("Invalid voice shortcut.");
  const keys: number[] = [];
  if (parsed.ctrlKey) keys.push(17);
  if (parsed.shiftKey) keys.push(16);
  if (parsed.altKey) keys.push(18);
  if (parsed.metaKey) keys.push(91);
  if (parsed.key)
    keys.push(
      parsed.key === "space"
        ? 32
        : /^f\d+$/.test(parsed.key)
          ? 111 + Number(parsed.key.slice(1))
          : parsed.key.toUpperCase().charCodeAt(0),
    );
  return keys;
}

export function startWindowsVoice(
  onToggle: (target: string) => void,
  onFailure: (message: string) => void,
) {
  const script = `$ErrorActionPreference='Stop'\nAdd-Type -AssemblyName UIAutomationClient,UIAutomationTypes\nAdd-Type -ReferencedAssemblies @([System.Windows.Automation.AutomationElement].Assembly.Location,[System.Windows.Automation.ControlType].Assembly.Location) -TypeDefinition @'\n${windowsVoiceSource}\n'@\n[PulseVoice]::Run()`;
  const child = NodeChildProcess.spawn(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ],
    { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
  );
  let sequence = 0;
  let closed = false;
  const requests = new Map<
    string,
    {
      resolve: (value: string) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const readiness = Promise.withResolvers<void>();
  void readiness.promise.catch(() => undefined);
  const startupTimer = setTimeout(() => fail("Windows voice helper did not start."), 20_000);
  function fail(message: string) {
    if (closed) return;
    closed = true;
    clearTimeout(startupTimer);
    readiness.reject(new Error(message));
    for (const request of requests.values()) {
      clearTimeout(request.timer);
      request.reject(new Error(message));
    }
    requests.clear();
    child.kill();
    onFailure(message);
  }
  child.on("error", () => fail("Could not start the Windows voice helper."));
  child.on("exit", () =>
    fail("Windows voice capture stopped. Toggle it off and on in Settings to retry."),
  );
  child.stdin.on("error", () => fail("Windows voice helper disconnected."));
  child.stderr.on("data", () => {
    /* The exit event reports startup failure without exposing PowerShell internals. */
  });
  const lines = NodeReadline.createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    const [kind, id = "", value = ""] = line.split("\t");
    if (kind === "ready") {
      clearTimeout(startupTimer);
      readiness.resolve();
      return;
    }
    if (kind === "toggle") {
      onToggle(id);
      return;
    }
    const request = requests.get(id);
    if (!request) return;
    requests.delete(id);
    clearTimeout(request.timer);
    if (kind === "result" && value)
      request.reject(new Error(Buffer.from(value, "base64").toString("utf8")));
    else request.resolve(value);
  });
  async function request(command: string, values: string[] = []) {
    await readiness.promise;
    if (closed) throw new Error("Windows voice capture is unavailable.");
    const id = String(++sequence);
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        requests.delete(id);
        reject(new Error("Windows voice capture did not respond."));
      }, 10_000);
      requests.set(id, { resolve, reject, timer });
      child.stdin.write([command, id, ...values].join("\t") + "\n");
    });
  }
  return {
    configure: (shortcut: string | null) =>
      request("config", [shortcut ? voiceVirtualKeys(shortcut).join(",") : ""]),
    capture: () => request("capture"),
    deliver: (target: string, text: string) =>
      request("deliver", [target, Buffer.from(text, "utf8").toString("base64")]),
    close: () => {
      if (!closed) {
        closed = true;
        clearTimeout(startupTimer);
        readiness.reject(new Error("Voice capture disabled."));
        for (const request of requests.values()) {
          clearTimeout(request.timer);
          request.reject(new Error("Voice capture disabled."));
        }
        requests.clear();
        lines.close();
        child.kill();
      }
    },
  };
}
