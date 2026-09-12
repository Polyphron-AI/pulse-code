import { describe, expect, it } from "@effect/vitest";
import {
  AssistantId,
  EnvironmentId,
  ThreadId,
  assistantThreadOrigin,
  type OrchestrationAssistant,
  type OrchestrationShellSnapshot,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { Atom, AtomRegistry } from "effect/unstable/reactivity";

import { PrimaryConnectionTarget } from "../connection/model.ts";
import {
  assistantAvatarToken,
  assistantDisplayName,
  assistantForEnvironment,
  assistantForThread,
  assistantHasConversation,
  assistantThreadId,
  canResetAssistant,
  createEnvironmentAssistantAtoms,
  type EnvironmentAssistant,
} from "./assistants.ts";

const ENVIRONMENT_ID = EnvironmentId.make("environment-1");
const ASSISTANT_ID = AssistantId.make("assistant-1");
const ASSISTANT_THREAD_ID = ThreadId.make("thread-assistant");

function assistant(overrides: Partial<OrchestrationAssistant> = {}): OrchestrationAssistant {
  return {
    id: ASSISTANT_ID,
    name: "Luna",
    avatar: null,
    modelSelection: null,
    instructions: "",
    threadId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("assistant labels", () => {
  it("falls back to Luna and to the first letter", () => {
    expect(assistantDisplayName(assistant())).toBe("Luna");
    expect(assistantDisplayName(assistant({ name: "   " }))).toBe("Luna");
    expect(assistantDisplayName(null)).toBe("Luna");
    expect(assistantAvatarToken(assistant())).toBe("L");
    expect(assistantAvatarToken(assistant({ avatar: "🌙" }))).toBe("🌙");
  });
});

describe("assistant thread lookup", () => {
  it("prefers the bound id and falls back to the origin", () => {
    const threads = [{ id: ASSISTANT_THREAD_ID, origin: assistantThreadOrigin(ASSISTANT_ID) }];
    expect(assistantThreadId(assistant({ threadId: ASSISTANT_THREAD_ID }), [])).toBe(
      ASSISTANT_THREAD_ID,
    );
    expect(assistantThreadId(assistant(), threads)).toBe(ASSISTANT_THREAD_ID);
    expect(assistantThreadId(assistant(), [])).toBeNull();
    expect(assistantThreadId(null, threads)).toBeNull();
  });

  it("reads the owning assistant off a thread origin", () => {
    expect(assistantForThread({ origin: assistantThreadOrigin(ASSISTANT_ID) })).toBe(ASSISTANT_ID);
    expect(assistantForThread({ origin: "user" })).toBeNull();
    expect(assistantForThread(null)).toBeNull();
  });

  it("shows the empty state and hides reset until a thread exists", () => {
    expect(assistantHasConversation(assistant())).toBe(false);
    expect(canResetAssistant(assistant())).toBe(false);
    expect(canResetAssistant(assistant({ threadId: ASSISTANT_THREAD_ID }))).toBe(true);
  });
});

describe("assistant atoms", () => {
  function harness(assistants: ReadonlyArray<OrchestrationAssistant> | undefined) {
    const snapshot = { assistants } as unknown as OrchestrationShellSnapshot;
    const catalogValueAtom = Atom.make({
      isReady: true,
      entries: new Map([
        [
          ENVIRONMENT_ID,
          {
            target: new PrimaryConnectionTarget({
              environmentId: ENVIRONMENT_ID,
              label: "Environment",
              httpBaseUrl: "https://example.test",
              wsBaseUrl: "wss://example.test",
            }),
            profile: Option.none(),
          },
        ],
      ]),
    });
    const snapshotAtom = Atom.family((_environmentId: EnvironmentId) => Atom.make(snapshot));
    return {
      registry: AtomRegistry.make(),
      atoms: createEnvironmentAssistantAtoms({ catalogValueAtom, snapshotAtom }),
    };
  }

  it("scopes the assistant to its environment", () => {
    const { registry, atoms } = harness([assistant()]);
    const assistants = registry.get(atoms.assistantsAtom);
    expect(assistants.map((entry) => entry.id)).toEqual([ASSISTANT_ID]);
    expect(assistants[0]?.environmentId).toBe(ENVIRONMENT_ID);
    expect(registry.get(atoms.environmentAssistantAtom(ENVIRONMENT_ID))?.id).toBe(ASSISTANT_ID);
  });

  it("treats a snapshot from a pre-assistant server as no assistant", () => {
    const { registry, atoms } = harness(undefined);
    expect(registry.get(atoms.assistantsAtom)).toEqual([]);
    expect(registry.get(atoms.environmentAssistantAtom(ENVIRONMENT_ID))).toBeNull();
  });

  it("looks an assistant up out of a plain list", () => {
    const list = [{ ...assistant(), environmentId: ENVIRONMENT_ID }] as EnvironmentAssistant[];
    expect(assistantForEnvironment(list, ENVIRONMENT_ID)?.id).toBe(ASSISTANT_ID);
    expect(assistantForEnvironment(list, EnvironmentId.make("other"))).toBeNull();
    expect(assistantForEnvironment(list, null)).toBeNull();
  });
});
