// @effect-diagnostics nodeBuiltinImport:off - Disposable filesystem proves identity file custody and deletion.
import { expect, it } from "@effect/vitest";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import { writeWardenCliIdentity, removeWardenCliIdentity } from "./WardenCliIdentity.ts";
import { withWardenCliEnvironment, type McpProviderSessionConfig } from "./McpProviderSession.ts";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";

const decodeIdentity = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ endpoint: Schema.String, authorizationHeader: Schema.String }),
  ),
);

it.effect(
  "writes only the closed CLI identity, atomically, outside the project and removes it",
  () =>
    Effect.gen(function* () {
      const platform = yield* HostProcessPlatform;
      yield* Effect.promise(async () => {
        const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "warden-identity-test-"));
        try {
          const identity = {
            endpoint: "http://127.0.0.1:12345/mcp",
            authorizationHeader: "Bearer SYNTHETIC-CLI-TOKEN",
            ignored: "discard",
          };
          const file = await writeWardenCliIdentity(root, identity);
          expect(NodePath.dirname(file)).toBe(NodePath.join(root, "warden-cli"));
          expect(
            decodeIdentity(await NodeFSP.readFile(file, "utf8"), { onExcessProperty: "error" }),
          ).toEqual({
            endpoint: identity.endpoint,
            authorizationHeader: identity.authorizationHeader,
          });
          expect(await NodeFSP.readdir(NodePath.dirname(file))).toEqual([NodePath.basename(file)]);
          if (platform !== "win32") {
            expect((await NodeFSP.stat(NodePath.dirname(file))).mode & 0o777).toBe(0o700);
            expect((await NodeFSP.stat(file)).mode & 0o777).toBe(0o600);
          }
          await removeWardenCliIdentity(file);
          await expect(NodeFSP.stat(file)).rejects.toMatchObject({ code: "ENOENT" });
          await removeWardenCliIdentity(file);
        } finally {
          await NodeFSP.rm(root, { recursive: true, force: true });
        }
      });
    }),
);

it("fails closed with bounded diagnostics if the handoff directory is not writable", async () => {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "warden-identity-test-"));
  try {
    await NodeFSP.writeFile(NodePath.join(root, "warden-cli"), "occupied");
    await expect(
      writeWardenCliIdentity(root, {
        endpoint: "http://localhost/mcp",
        authorizationHeader: "CANARY",
      }),
    ).rejects.toThrow(/^Warden CLI identity could not be prepared\.$/);
  } finally {
    await NodeFSP.rm(root, { recursive: true, force: true });
  }
});

it("injects only the session identity file and removes inherited identities", () => {
  const session: McpProviderSessionConfig = {
    environmentId: EnvironmentId.make("env"),
    threadId: ThreadId.make("thread"),
    providerSessionId: "session",
    providerInstanceId: ProviderInstanceId.make("codex"),
    endpoint: "http://localhost/mcp",
    authorizationHeader: "Bearer CANARY",
    wardenCliConfigFile: "/protected/session.json",
  };
  expect(
    withWardenCliEnvironment({ KEEP: "kept", PULSE_WARDEN_IDENTITY_FILE: "/foreign" }, session),
  ).toEqual({ KEEP: "kept", PULSE_WARDEN_IDENTITY_FILE: "/protected/session.json" });
  expect(
    withWardenCliEnvironment({ KEEP: "kept", PULSE_WARDEN_IDENTITY_FILE: "/foreign" }, undefined),
  ).toEqual({ KEEP: "kept", PULSE_WARDEN_IDENTITY_FILE: undefined });
});
