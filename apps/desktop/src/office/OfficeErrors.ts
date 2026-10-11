import type { OfficeResult } from "@t3tools/contracts";

type Failure = Extract<OfficeResult, { ok: false }>;
export class OfficeError extends Error {
  readonly code: Failure["error"]["code"];
  constructor(code: Failure["error"]["code"], message: string) {
    super(message);
    this.name = "OfficeError";
    this.code = code;
  }
}

export function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}
export function items(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Provider error bodies can contain account data; expose only fixed diagnostic messages. */
export async function responseJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new OfficeError(
        "authentication",
        "Mailbox or calendar access was denied. Reconnect the account and check its permissions.",
      );
    }
    throw new OfficeError(
      "network",
      `The provider request failed (HTTP ${response.status}). Try again later.`,
    );
  }
  return object(await response.json());
}
