import type { PulseMcpConnection, PulseMcpConnectionInput } from "@t3tools/contracts";

export type ValueDraft = {
  readonly key: string;
  readonly kind: "literal" | "secret";
  readonly value: string;
  readonly configuredSecret: boolean;
  readonly replaceSecret: boolean;
};

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
  args: "",
  cwd: "",
  values: [],
});

export function draftFromConnection(connection: PulseMcpConnection): ConnectionDraft {
  const values = Object.entries(
    connection.config.transport === "http" ? connection.config.headers : connection.config.env,
  ).map(([key, entry]): ValueDraft =>
    entry.type === "secret"
      ? { key, kind: "secret", value: "", configuredSecret: true, replaceSecret: false }
      : {
          key,
          kind: "literal",
          value: entry.value,
          configuredSecret: false,
          replaceSecret: false,
        },
  );
  return {
    id: connection.id,
    name: connection.name,
    transport: connection.config.transport,
    url: connection.config.transport === "http" ? connection.config.url : "",
    command: connection.config.transport === "stdio" ? connection.config.command : "",
    args: connection.config.transport === "stdio" ? connection.config.args.join("\n") : "",
    cwd: connection.config.transport === "stdio" ? (connection.config.cwd ?? "") : "",
    values,
  };
}

export function connectionInputFromDraft(draft: ConnectionDraft): PulseMcpConnectionInput {
  const values = Object.fromEntries(
    draft.values
      .filter(({ key }) => key.trim().length > 0)
      .map(({ key, kind, value, configuredSecret, replaceSecret }) => [
        key.trim(),
        kind === "literal"
          ? { type: "literal" as const, value }
          : configuredSecret && !replaceSecret
            ? { type: "retain-secret" as const }
            : { type: "secret" as const, value },
      ]),
  );
  const base = { id: draft.id.trim(), name: draft.name.trim() };
  if (draft.transport === "http") {
    return { ...base, config: { transport: "http", url: draft.url.trim(), headers: values } };
  }
  return {
    ...base,
    config: {
      transport: "stdio",
      command: draft.command.trim(),
      args: draft.args
        .split("\n")
        .map((arg) => arg.trim())
        .filter(Boolean),
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
  const keys = draft.values.map(({ key }) => key.trim()).filter(Boolean);
  if (new Set(keys).size !== keys.length) return "Header or environment names must be unique.";
  if (draft.values.some((value) => !value.key.trim())) return "Remove empty rows before saving.";
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
