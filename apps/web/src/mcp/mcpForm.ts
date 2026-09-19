import type { PulseMcpConnection, PulseMcpConnectionInput } from "@t3tools/contracts";

export type ValueDraft = {
  readonly key: string;
  readonly kind: "literal" | "secret" | "warden";
  readonly value: string;
  readonly credentialRef: string;
  readonly configuredSecret: boolean;
  readonly replaceSecret: boolean;
};

export const emptyValueDraft = (): ValueDraft => ({
  key: "",
  kind: "literal",
  value: "",
  credentialRef: "",
  configuredSecret: false,
  replaceSecret: false,
});

export type ConnectionDraft = {
  readonly id: string;
  readonly name: string;
  readonly transport: "http" | "stdio";
  readonly url: string;
  readonly command: string;
  readonly args: string;
  readonly cwd: string;
  readonly values: ReadonlyArray<ValueDraft>;
};

export const emptyConnectionDraft = (): ConnectionDraft => ({
  id: "",
  name: "",
  transport: "http",
  url: "",
  command: "",
  args: "[]",
  cwd: "",
  values: [],
});

export function draftFromConnection(connection: PulseMcpConnection): ConnectionDraft {
  const values = Object.entries(
    connection.config.transport === "http" ? connection.config.headers : connection.config.env,
  ).map(([key, entry]): ValueDraft =>
    entry.type === "secret"
      ? { ...emptyValueDraft(), key, kind: "secret", configuredSecret: true }
      : entry.type === "warden"
        ? { ...emptyValueDraft(), key, kind: "warden", credentialRef: entry.credentialRef }
        : { ...emptyValueDraft(), key, kind: "literal", value: entry.value },
  );
  return {
    id: connection.id,
    name: connection.name,
    transport: connection.config.transport,
    url: connection.config.transport === "http" ? connection.config.url : "",
    command: connection.config.transport === "stdio" ? connection.config.command : "",
    args:
      connection.config.transport === "stdio"
        ? JSON.stringify(connection.config.args, null, 2)
        : "[]",
    cwd: connection.config.transport === "stdio" ? (connection.config.cwd ?? "") : "",
    values,
  };
}

export function connectionWardenRefs(connection: PulseMcpConnection): string[] {
  const values =
    connection.config.transport === "http" ? connection.config.headers : connection.config.env;
  return Object.values(values).flatMap((entry) =>
    entry.type === "warden" ? [entry.credentialRef] : [],
  );
}

export function connectionInputFromDraft(draft: ConnectionDraft): PulseMcpConnectionInput {
  const values = Object.fromEntries(
    draft.values
      .filter(({ key }) => key.trim().length > 0)
      .map(({ key, kind, value, credentialRef, configuredSecret, replaceSecret }) => [
        key.trim(),
        kind === "literal"
          ? { type: "literal" as const, value }
          : kind === "warden"
            ? { type: "warden" as const, credentialRef }
            : configuredSecret && !replaceSecret
              ? { type: "retain-secret" as const }
              : { type: "secret" as const, value },
      ]),
  );
  const base = { id: draft.id.trim(), name: draft.name.trim() };
  if (draft.transport === "http") {
    return { ...base, config: { transport: "http", url: draft.url.trim(), headers: values } };
  }
  const args = JSON.parse(draft.args) as unknown;
  return {
    ...base,
    config: {
      transport: "stdio",
      command: draft.command.trim(),
      args: args as Array<string>,
      ...(draft.cwd.trim() ? { cwd: draft.cwd.trim() } : {}),
      env: values,
    },
  };
}

export function validateConnectionDraft(draft: ConnectionDraft): string | null {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(draft.id.trim())) {
    return "ID must start with a letter and contain only letters, numbers, underscores, or hyphens.";
  }
  if (!draft.name.trim()) return "Name is required.";
  if (draft.transport === "http" && !draft.url.trim()) return "URL is required.";
  if (draft.transport === "stdio" && !draft.command.trim()) return "Command is required.";
  if (draft.transport === "stdio") {
    try {
      const args = JSON.parse(draft.args) as unknown;
      if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
        return "Arguments must be a JSON array of strings.";
      }
    } catch {
      return "Arguments must be a valid JSON array of strings.";
    }
  }
  const keys = draft.values.map(({ key }) => key.trim()).filter(Boolean);
  if (new Set(keys).size !== keys.length) return "Header or environment names must be unique.";
  if (draft.values.some((value) => !value.key.trim())) return "Remove empty rows before saving.";
  if (
    draft.values.some(
      (value) =>
        value.kind === "warden" &&
        !/^urn:pulse:[A-Za-z0-9._-]{1,64}:credential:[A-Za-z0-9._-]{1,64}$/.test(
          value.credentialRef,
        ),
    )
  ) {
    return "Choose a Warden credential for each Warden row.";
  }
  if (
    draft.values.some(
      (value) =>
        value.kind === "secret" && (!value.configuredSecret || value.replaceSecret) && !value.value,
    )
  ) {
    return "Enter a value for each new or replacement secret.";
  }
  return null;
}
