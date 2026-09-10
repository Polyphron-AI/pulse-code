// @effect-diagnostics nodeBuiltinImport:off - Atomic fsync/rename is the mail persistence boundary.
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import {
  MailAccount,
  MailDraft,
  MailMetadata,
  MailMessageRef,
  MailOperationError,
  MailSendReceipt,
  MailPeopleState,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

const State = Schema.Struct({
  version: Schema.Literal(1),
  enabled: Schema.Boolean,
  accounts: Schema.Array(MailAccount),
  credentialIds: Schema.Record(Schema.String, Schema.String),
  drafts: Schema.Array(MailDraft),
  outbox: Schema.Array(MailSendReceipt),
  metadata: Schema.Record(Schema.String, MailMetadata),
  aliases: Schema.Record(Schema.String, Schema.String),
  references: Schema.Record(Schema.String, MailMessageRef),
  peopleContext: Schema.optional(MailPeopleState),
});
export type MailState = typeof State.Type;
const decodeState = Schema.decodeUnknownSync(State);
export const emptyMailState = (): MailState => ({
  version: 1,
  enabled: false,
  accounts: [],
  credentialIds: {},
  drafts: [],
  outbox: [],
  metadata: {},
  aliases: {},
  references: {},
});

/** One server-lifetime store serializes revision checks and persists before acknowledging writes. */
export class MailStore {
  private tail: Promise<unknown> = Promise.resolve();
  private cached: MailState | undefined;
  private readonly filename: string;
  constructor(filename: string) {
    this.filename = filename;
  }
  private async read(): Promise<MailState> {
    if (this.cached) return this.cached;
    try {
      return decodeState(JSON.parse(await NodeFSP.readFile(this.filename, "utf8")));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return emptyMailState();
      throw new MailOperationError({
        reason: "unavailable",
        detail: "The saved mail state could not be read. It has been preserved for recovery.",
      });
    }
  }
  async transaction<T>(
    run: (state: MailState) => Promise<{ state: MailState; result: T }>,
  ): Promise<T> {
    const operation = this.tail.then(async () => {
      const current = await this.read();
      const { state, result } = await run(current);
      if (state !== current) {
        await NodeFSP.mkdir(NodePath.dirname(this.filename), { recursive: true, mode: 0o700 });
        const temporary = `${this.filename}.${NodeCrypto.randomUUID()}.tmp`;
        await NodeFSP.writeFile(temporary, JSON.stringify(state), { mode: 0o600, flag: "wx" });
        const file = await NodeFSP.open(temporary, "r+");
        try {
          await file.sync();
        } finally {
          await file.close();
        }
        await NodeFSP.rename(temporary, this.filename);
      }
      this.cached = state;
      return result;
    });
    this.tail = operation.catch(() => {});
    return operation;
  }
}
