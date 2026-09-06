import { EnvironmentId, type ExecutionEnvironmentDescriptor } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Layer from "effect/Layer";
import { Atom } from "effect/unstable/reactivity";
import type { EnvironmentRegistry } from "../connection/registry.ts";
import { createMailEnvironmentAtoms, supportsMail } from "./mail.ts";

describe("mail environment boundaries", () => {
  it("requires advertised support even on clients that expose the alpha view", () => {
    const descriptor: ExecutionEnvironmentDescriptor = {
      environmentId: EnvironmentId.make("a"),
      label: "A",
      serverVersion: "1",
      platform: { os: "windows", arch: "x64" },
      capabilities: { repositoryIdentity: true },
    };
    expect(supportsMail(descriptor)).toBe(false);
    expect(
      supportsMail({ ...descriptor, capabilities: { ...descriptor.capabilities, mail: true } }),
    ).toBe(true);
  });
  it("isolates equal account and message identifiers across environments and UID validity changes", () => {
    const runtime = Atom.runtime(Layer.empty) as unknown as Atom.AtomRuntime<
      EnvironmentRegistry,
      never
    >;
    const mail = createMailEnvironmentAtoms(runtime);
    const a = EnvironmentId.make("a");
    const b = EnvironmentId.make("b");
    const input = { accountId: "same", folder: "INBOX", uidValidity: "1", uid: 1 };
    expect(
      mail.getPeopleContext({ environmentId: a, input: { accountId: "same", ref: input } }),
    ).not.toBe(
      mail.getPeopleContext({ environmentId: b, input: { accountId: "same", ref: input } }),
    );
    expect(mail.readMessage({ environmentId: a, input })).toBe(
      mail.readMessage({ environmentId: a, input: { ...input } }),
    );
    expect(mail.readMessage({ environmentId: a, input })).not.toBe(
      mail.readMessage({ environmentId: b, input }),
    );
    expect(mail.readMessage({ environmentId: a, input })).not.toBe(
      mail.readMessage({ environmentId: a, input: { ...input, uidValidity: "2" } }),
    );
    expect(mail.listDrafts({ environmentId: a, input: {} })).not.toBe(
      mail.listDrafts({ environmentId: b, input: {} }),
    );
  });
});
