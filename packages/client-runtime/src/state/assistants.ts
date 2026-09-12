import {
  DEFAULT_ASSISTANT_NAME,
  assistantIdFromThreadOrigin,
  assistantThreadOrigin,
  type AssistantId,
  type EnvironmentId,
  type OrchestrationAssistant,
  type OrchestrationShellSnapshot,
  type ThreadId,
} from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  type CreateAssistantInput,
  type ResetAssistantInput,
  type SendAssistantMessageInput,
  type UpdateAssistantInput,
  createAssistant,
  resetAssistant,
  sendAssistantMessage,
  updateAssistant,
} from "../operations/commands.ts";
import type { EnvironmentCatalogState } from "./connections.ts";
import { createAtomCommandScheduler, createEnvironmentCommand } from "./runtime.ts";

export type {
  CreateAssistantInput,
  ResetAssistantInput,
  SendAssistantMessageInput,
  UpdateAssistantInput,
} from "../operations/commands.ts";

/**
 * The assistant ships to users as Luna. Everything in this module says
 * assistant; only the labels below are user-visible copy.
 *
 * There is one assistant per environment, so most selectors here answer "the
 * assistant for this environment" rather than taking an id.
 */
export interface EnvironmentAssistant extends OrchestrationAssistant {
  readonly environmentId: EnvironmentId;
}

/** The panel entry's label. Falls back to Luna for a record with a blank name. */
export function assistantDisplayName(
  assistant: Pick<OrchestrationAssistant, "name"> | null | undefined,
): string {
  const name = assistant?.name?.trim() ?? "";
  return name.length > 0 ? name : DEFAULT_ASSISTANT_NAME;
}

/** Emoji or short token, else the first character of the name. */
export function assistantAvatarToken(
  assistant: Pick<OrchestrationAssistant, "name" | "avatar"> | null | undefined,
): string {
  const avatar = assistant?.avatar?.trim() ?? "";
  if (avatar.length > 0) return avatar;
  return [...assistantDisplayName(assistant)][0] ?? DEFAULT_ASSISTANT_NAME[0]!;
}

interface AssistantThreadLike {
  readonly id: ThreadId;
  readonly origin?: string | null | undefined;
}

/** The assistant that owns a thread, for badging it outside the panel. */
export function assistantForThread(
  thread: Pick<AssistantThreadLike, "origin"> | null | undefined,
): AssistantId | null {
  const origin = thread?.origin;
  if (typeof origin !== "string" || origin.length === 0) return null;
  return assistantIdFromThreadOrigin(origin);
}

/**
 * The thread the panel should render. The bound id is authoritative; the
 * origin scan is the fallback for a shell that has the thread but has not yet
 * seen the bind.
 */
export function assistantThreadId<T extends AssistantThreadLike>(
  assistant: Pick<OrchestrationAssistant, "id" | "threadId"> | null | undefined,
  threads: ReadonlyArray<T>,
): ThreadId | null {
  if (!assistant) return null;
  if (assistant.threadId !== null) return assistant.threadId;
  const origin = assistantThreadOrigin(assistant.id);
  return threads.find((thread) => thread.origin === origin)?.id ?? null;
}

/** Whether the panel shows the empty state instead of a conversation. */
export function assistantHasConversation(
  assistant: Pick<OrchestrationAssistant, "threadId"> | null | undefined,
): boolean {
  return (assistant?.threadId ?? null) !== null;
}

/** Reset only means something once there is a thread to archive. */
export function canResetAssistant(
  assistant: Pick<OrchestrationAssistant, "threadId"> | null | undefined,
): boolean {
  return assistantHasConversation(assistant);
}

const EMPTY_ASSISTANTS: ReadonlyArray<OrchestrationAssistant> = Object.freeze([]);

export function createEnvironmentAssistantAtoms(input: {
  readonly catalogValueAtom: Atom.Atom<EnvironmentCatalogState>;
  readonly snapshotAtom: (
    environmentId: EnvironmentId,
  ) => Atom.Atom<OrchestrationShellSnapshot | null>;
}) {
  const environmentAssistantAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make(
      (get): OrchestrationAssistant | null =>
        (get(input.snapshotAtom(environmentId))?.assistants ?? EMPTY_ASSISTANTS)[0] ?? null,
    ).pipe(Atom.withLabel(`environment-assistant:${environmentId}`)),
  );

  let previous: ReadonlyArray<EnvironmentAssistant> = [];
  const assistantsAtom = Atom.make((get) => {
    const next: EnvironmentAssistant[] = [];
    for (const environmentId of get(input.catalogValueAtom).entries.keys()) {
      const assistant = get(environmentAssistantAtom(environmentId));
      if (assistant !== null) next.push({ ...assistant, environmentId });
    }
    // Each entry is rebuilt, so reference equality never holds; compare the
    // cheap identity fields instead.
    if (
      previous.length === next.length &&
      previous.every(
        (assistant, index) =>
          assistant.id === next[index]?.id &&
          assistant.updatedAt === next[index]?.updatedAt &&
          assistant.environmentId === next[index]?.environmentId,
      )
    ) {
      return previous;
    }
    previous = next;
    return next;
  }).pipe(Atom.withLabel("environment-assistants"));

  return { environmentAssistantAtom, assistantsAtom };
}

/** Pure lookup, for callers holding a list rather than an atom. */
export function assistantForEnvironment(
  assistants: ReadonlyArray<EnvironmentAssistant>,
  environmentId: EnvironmentId | null,
): EnvironmentAssistant | null {
  if (environmentId === null) return null;
  return assistants.find((assistant) => assistant.environmentId === environmentId) ?? null;
}

export function createAssistantEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | Crypto.Crypto | R, E>,
) {
  const scheduler = createAtomCommandScheduler();
  const concurrency = {
    mode: "serial" as const,
    key: ({ environmentId, input }: { environmentId: string; input: { assistantId: string } }) =>
      JSON.stringify([environmentId, input.assistantId]),
  };
  return {
    create: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:assistant:create",
      execute: (input: CreateAssistantInput) => createAssistant(input),
      scheduler,
      concurrency,
    }),
    update: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:assistant:update",
      execute: (input: UpdateAssistantInput) => updateAssistant(input),
      scheduler,
      concurrency,
    }),
    reset: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:assistant:reset",
      execute: (input: ResetAssistantInput) => resetAssistant(input),
      scheduler,
      concurrency,
    }),
    message: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:assistant:message",
      execute: (input: SendAssistantMessageInput) => sendAssistantMessage(input),
      scheduler,
      concurrency,
    }),
  };
}

export { DEFAULT_ASSISTANT_NAME, assistantThreadOrigin };
export type { OrchestrationAssistant };
