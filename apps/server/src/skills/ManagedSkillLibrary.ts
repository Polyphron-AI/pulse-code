// @effect-diagnostics nodeBuiltinImport:off - Environment-local registry around immutable managed skill files.
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import {
  ManagedSkillStore,
  type GitHubSkillSource,
  type ManagedSkillCatalogDescriptor,
  type ManagedSkillRecord,
  type ManagedSkillUpdatePolicy,
  type SkillUploadFile,
} from "./ManagedSkillStore.ts";

interface RegistryEntry {
  readonly record: ManagedSkillRecord;
  readonly revisions: ReadonlyArray<ManagedSkillRecord>;
}

interface Registry {
  readonly version: 1;
  readonly skills: ReadonlyArray<RegistryEntry>;
}

export interface ManagedSkillSelection {
  readonly id: string;
  readonly revision?: string;
}

export interface ManagedSkillLibraryOptions {
  readonly store?: ManagedSkillStore;
}

const EMPTY_REGISTRY: Registry = { version: 1, skills: [] };
const REVISION_PATTERN = /^[a-f0-9]{64}$/;
const ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

function throwIfAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}

function parseRecord(value: unknown, expectedId?: string): ManagedSkillRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Managed skill registry record is invalid.");
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    !ID_PATTERN.test(record.id) ||
    (expectedId !== undefined && record.id !== expectedId) ||
    typeof record.name !== "string" ||
    !record.name ||
    record.name.length > 120 ||
    typeof record.description !== "string" ||
    !record.description ||
    record.description.length > 2000 ||
    typeof record.revision !== "string" ||
    !REVISION_PATTERN.test(record.revision) ||
    (record.updatePolicy !== "pinned" && record.updatePolicy !== "keep-updated") ||
    typeof record.updatedAt !== "string" ||
    !record.updatedAt ||
    typeof record.checkedAt !== "string" ||
    !record.checkedAt ||
    (record.error !== undefined && typeof record.error !== "string") ||
    (record.resolvedCommit !== undefined &&
      (typeof record.resolvedCommit !== "string" ||
        !/^[a-f0-9]{40}$/.test(record.resolvedCommit))) ||
    !record.invocation ||
    typeof record.invocation !== "object" ||
    Array.isArray(record.invocation)
  ) {
    throw new Error("Managed skill registry record is invalid.");
  }
  const invocation = record.invocation as Record<string, unknown>;
  if (
    (invocation.userInvocationOnly !== undefined && invocation.userInvocationOnly !== true) ||
    (invocation.userInvocable !== undefined && invocation.userInvocable !== false)
  ) {
    throw new Error("Managed skill registry invocation restrictions are invalid.");
  }
  if (!record.source || typeof record.source !== "object" || Array.isArray(record.source)) {
    throw new Error("Managed skill registry source is invalid.");
  }
  const source = record.source as Record<string, unknown>;
  if (
    !(
      (source.type === "upload" && Object.keys(source).length === 1) ||
      (source.type === "github" &&
        typeof source.repository === "string" &&
        /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source.repository) &&
        typeof source.ref === "string" &&
        typeof source.directory === "string")
    ) ||
    (record.updatePolicy === "keep-updated" && source.type !== "github")
  ) {
    throw new Error("Managed skill registry source is invalid.");
  }
  return record as unknown as ManagedSkillRecord;
}

function parseRegistry(contents: string): Registry {
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Error("Managed skill registry contains invalid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Managed skill registry is invalid.");
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1 || !Array.isArray(candidate.skills)) {
    throw new Error("Managed skill registry version is not supported.");
  }
  const ids = new Set<string>();
  const skills = candidate.skills.map((item): RegistryEntry => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Managed skill registry entry is invalid.");
    }
    const entry = item as Record<string, unknown>;
    const record = parseRecord(entry.record);
    if (ids.has(record.id)) {
      throw new Error("Managed skill registry contains an invalid or duplicate id.");
    }
    if (!Array.isArray(entry.revisions)) {
      throw new Error("Managed skill registry revision history is invalid.");
    }
    const revisions = entry.revisions.map((revision) => parseRecord(revision, record.id));
    if (!revisions.some((revision) => revision.revision === record.revision)) {
      throw new Error("Managed skill registry does not trust its active revision.");
    }
    ids.add(record.id);
    return {
      record,
      revisions: revisions.filter(
        (revision, index) =>
          revisions.findIndex((candidate) => candidate.revision === revision.revision) === index,
      ),
    };
  });
  return { version: 1, skills };
}

export class ManagedSkillLibrary {
  readonly root: string;
  readonly store: ManagedSkillStore;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(root: string, options: ManagedSkillLibraryOptions = {}) {
    this.root = NodePath.resolve(root);
    this.store = options.store ?? new ManagedSkillStore(NodePath.join(this.root, "revisions"));
  }

  async list(): Promise<ReadonlyArray<ManagedSkillRecord>> {
    const registry = await this.readRegistry();
    return registry.skills.map((entry) => entry.record);
  }

  importUpload(input: {
    readonly id: string;
    readonly files: ReadonlyArray<SkillUploadFile>;
    readonly signal?: AbortSignal;
  }): Promise<ManagedSkillRecord> {
    return this.mutate(input.signal, async (registry) => {
      const previous = registry.skills.find((entry) => entry.record.id === input.id);
      const record = await this.store.importUpload(input.id, input.files, previous?.record);
      return this.replace(registry, previous, record);
    });
  }

  importGitHub(input: {
    readonly id: string;
    readonly source: GitHubSkillSource;
    readonly updatePolicy?: ManagedSkillUpdatePolicy;
    readonly signal?: AbortSignal;
  }): Promise<ManagedSkillRecord> {
    return this.mutate(input.signal, async (registry) => {
      const previous = registry.skills.find((entry) => entry.record.id === input.id);
      const record = await this.store.importGitHub(
        input.id,
        input.source,
        input.updatePolicy,
        previous?.record,
      );
      return this.replace(registry, previous, record);
    });
  }

  linkGitHub(input: {
    readonly id: string;
    readonly source: GitHubSkillSource;
    readonly updatePolicy?: ManagedSkillUpdatePolicy;
    readonly signal?: AbortSignal;
  }): Promise<ManagedSkillRecord> {
    return this.mutate(input.signal, async (registry) => {
      const previous = this.requiredEntry(registry, input.id);
      const record = await this.store.importGitHub(
        input.id,
        input.source,
        input.updatePolicy,
        previous.record,
      );
      return this.replace(registry, previous, record);
    });
  }

  setUpdatePolicy(input: {
    readonly id: string;
    readonly updatePolicy: ManagedSkillUpdatePolicy;
    readonly signal?: AbortSignal;
  }): Promise<ManagedSkillRecord> {
    return this.mutate(input.signal, async (registry) => {
      const previous = this.requiredEntry(registry, input.id);
      const record = this.store.setUpdatePolicy(previous.record, input.updatePolicy);
      return this.replace(registry, previous, record);
    });
  }

  sync(input: { readonly id: string; readonly signal?: AbortSignal }): Promise<ManagedSkillRecord> {
    return this.mutate(input.signal, async (registry) => {
      const previous = this.requiredEntry(registry, input.id);
      const record = await this.store.sync(previous.record);
      return this.replace(registry, previous, record);
    });
  }

  syncKeepUpdated(input: { readonly signal?: AbortSignal } = {}): Promise<ManagedSkillRecord[]> {
    return this.enqueue(async () => {
      throwIfAborted(input.signal);
      let registry = await this.readRegistry();
      const records: ManagedSkillRecord[] = [];
      for (const entry of registry.skills) {
        throwIfAborted(input.signal);
        if (entry.record.updatePolicy !== "keep-updated") continue;
        const record = await this.store.sync(entry.record);
        registry = this.replace(registry, entry, record).registry;
        records.push(record);
      }
      throwIfAborted(input.signal);
      await this.writeRegistry(registry, input.signal);
      return records;
    });
  }

  remove(input: { readonly id: string; readonly signal?: AbortSignal }): Promise<void> {
    return this.enqueue(async () => {
      throwIfAborted(input.signal);
      const registry = await this.readRegistry();
      this.requiredEntry(registry, input.id);
      const next = {
        ...registry,
        skills: registry.skills.filter((entry) => entry.record.id !== input.id),
      };
      throwIfAborted(input.signal);
      await this.writeRegistry(next, input.signal);
    });
  }

  async resolveSelection(
    selections: ReadonlyArray<ManagedSkillSelection>,
  ): Promise<ManagedSkillCatalogDescriptor[]> {
    const registry = await this.readRegistry();
    const ids = new Set<string>();
    const records = selections.map((selection) => {
      if (ids.has(selection.id))
        throw new Error(`Managed skill ${selection.id} is selected twice.`);
      ids.add(selection.id);
      const entry = this.requiredEntry(registry, selection.id);
      const revision = selection.revision ?? entry.record.revision;
      const record = entry.revisions.find((candidate) => candidate.revision === revision);
      if (!record) {
        throw new Error(`Managed skill ${selection.id} does not trust revision ${revision}.`);
      }
      return record;
    });
    return this.store.catalog(records);
  }

  private requiredEntry(registry: Registry, id: string): RegistryEntry {
    const entry = registry.skills.find((candidate) => candidate.record.id === id);
    if (!entry) throw new Error(`Managed skill ${id} was not found.`);
    return entry;
  }

  private replace(
    registry: Registry,
    previous: RegistryEntry | undefined,
    record: ManagedSkillRecord,
  ): { readonly registry: Registry; readonly result: ManagedSkillRecord } {
    const entry = {
      record,
      revisions: [
        ...(previous?.revisions.filter((revision) => revision.revision !== record.revision) ?? []),
        record,
      ],
    };
    return {
      registry: {
        ...registry,
        skills: previous
          ? registry.skills.map((candidate) =>
              candidate.record.id === record.id ? entry : candidate,
            )
          : [...registry.skills, entry],
      },
      result: record,
    };
  }

  private mutate(
    signal: AbortSignal | undefined,
    operation: (registry: Registry) => Promise<{
      readonly registry: Registry;
      readonly result: ManagedSkillRecord;
    }>,
  ): Promise<ManagedSkillRecord> {
    return this.enqueue(async () => {
      throwIfAborted(signal);
      const change = await operation(await this.readRegistry());
      throwIfAborted(signal);
      await this.writeRegistry(change.registry, signal);
      return change.result;
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationTail.then(operation, operation);
    this.mutationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async readRegistry(): Promise<Registry> {
    try {
      return parseRegistry(
        await NodeFSP.readFile(NodePath.join(this.root, "registry.json"), "utf8"),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return EMPTY_REGISTRY;
      throw error;
    }
  }

  private async writeRegistry(registry: Registry, signal?: AbortSignal): Promise<void> {
    await NodeFSP.mkdir(this.root, { recursive: true });
    const destination = NodePath.join(this.root, "registry.json");
    const temporary = NodePath.join(this.root, `.registry-${NodeCrypto.randomUUID()}.tmp`);
    try {
      const handle = await NodeFSP.open(temporary, "wx", 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(registry, null, 2)}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      throwIfAborted(signal);
      await NodeFSP.rename(temporary, destination);
    } finally {
      await NodeFSP.rm(temporary, { force: true });
    }
  }
}
