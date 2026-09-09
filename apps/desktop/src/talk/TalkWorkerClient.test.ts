import { describe, it, expect } from "vite-plus/test";
import { TalkWorkerClient } from "./TalkWorkerClient.ts";

const fixture = `
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  while (buffer.includes('\\n')) {
    const split = buffer.indexOf('\\n');
    const q = JSON.parse(buffer.slice(0, split)); buffer = buffer.slice(split + 1);
    if (q.op === 'bad') { process.stdout.write('not json\\n'); continue; }
    if (q.op === 'oversized') { process.stdout.write('x'.repeat(2048)); continue; }
    if (q.op === 'crash') { process.exit(2); }
    if (q.op === 'hang') continue;
    const result = q.op === 'hello' ? {protocolVersion:1} : q.args;
    const reply = JSON.stringify({v:1,id:q.id,ok:true,result})+'\\n';
    process.stdout.write(reply.slice(0, 8)); process.stdout.write(reply.slice(8));
    if (q.op === 'shutdown') process.exit(0);
  }
});`;

function client() {
  return new TalkWorkerClient({
    executable: process.execPath,
    args: ["-e", fixture, "--"],
    dataDir: "isolated-fixture",
    // Allow process startup on busy Windows build hosts.
    timeoutMs: 5000,
    maxFrameBytes: 1024,
  });
}

describe("Talk worker supervision", () => {
  it("stays stopped until requested, correlates concurrent fragmented replies, and drains on close", async () => {
    const worker = client();
    expect(worker.running).toBe(false);
    try {
      expect(
        await Promise.all([
          worker.request("first", { number: 1 }),
          worker.request("second", { number: 2 }),
        ]),
      ).toEqual([{ number: 1 }, { number: 2 }]);
    } finally {
      await worker.close();
    }
    expect(worker.running).toBe(false);
    await expect(worker.request("hello")).rejects.toThrow("shutting down");
  });
  it.each(["bad", "oversized", "crash"])(
    "rejects pending work when worker sends %s",
    async (operation) => {
      const worker = client();
      try {
        await expect(worker.request(operation)).rejects.toThrow();
      } finally {
        await worker.close();
      }
    },
  );
  it("bounds an unresponsive request", async () => {
    const worker = client();
    try {
      await worker.request("hello");
      await expect(worker.request("hang")).rejects.toThrow("did not respond");
    } finally {
      await worker.close();
    }
  }, 15_000);
});
