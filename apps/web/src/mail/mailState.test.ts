import type { MailAccount, MailProjectAccess, ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  accountUpdateInput,
  buildMailAccountInput,
  EMPTY_MAIL_ACCOUNT_DRAFT,
  mailHealthIsProblem,
  mailHealthLabel,
  setProjectDefault,
  toggleProjectGrant,
} from "./mailState";

const projectId = "project-1" as ProjectId;

const account: MailAccount = {
  id: "acct-1",
  nickname: "Work",
  address: "me@example.com",
  username: "me@example.com",
  imap: { host: "imap.example.com", port: 993 },
  smtp: { host: "smtp.example.com", port: 465 },
  auth: {
    kind: "oauth-microsoft",
    clientId: "client",
    tenant: "common",
    clientSecretConfigured: true,
  },
  allowPrivateNetwork: false,
  appendToSent: true,
  folders: {},
  credentialConfigured: true,
  health: { status: "ok" },
};

const draft = {
  ...EMPTY_MAIL_ACCOUNT_DRAFT,
  nickname: " Work ",
  address: "me@example.com",
  imapHost: "imap.example.com",
  smtpHost: "smtp.example.com",
};

describe("buildMailAccountInput", () => {
  it("builds a password account without credentials", () => {
    expect(buildMailAccountInput(draft)).toEqual({
      input: {
        nickname: "Work",
        address: "me@example.com",
        imap: { host: "imap.example.com", port: 993 },
        smtp: { host: "smtp.example.com", port: 465 },
        auth: { kind: "password" },
        allowPrivateNetwork: false,
      },
    });
  });

  it("requires a client id for OAuth and omits an empty secret", () => {
    expect(buildMailAccountInput({ ...draft, authKind: "oauth-google" })).toEqual({
      error: "Enter the OAuth client ID.",
    });
    const result = buildMailAccountInput({ ...draft, authKind: "oauth-google", clientId: "id" });
    expect("input" in result && result.input.auth).toEqual({
      kind: "oauth-google",
      clientId: "id",
    });
  });

  it("rejects an invalid address", () => {
    expect(buildMailAccountInput({ ...draft, address: "nope" })).toEqual({
      error: "Enter a valid email address.",
    });
  });
});

describe("accountUpdateInput", () => {
  it("keeps the stored client secret by omitting it", () => {
    const input = accountUpdateInput(account, { nickname: "Personal" });
    expect(input.nickname).toBe("Personal");
    expect(input.id).toBe("acct-1");
    expect(input.auth).toEqual({ kind: "oauth-microsoft", clientId: "client", tenant: "common" });
  });

  it("toggles private network access", () => {
    expect(accountUpdateInput(account, { allowPrivateNetwork: true }).allowPrivateNetwork).toBe(
      true,
    );
  });
});

describe("health", () => {
  it("flags missing credentials and failures but not untested accounts", () => {
    expect(mailHealthIsProblem({ ...account, credentialConfigured: false })).toBe(true);
    expect(mailHealthLabel({ ...account, credentialConfigured: false })).toBe("Credentials needed");
    expect(mailHealthIsProblem({ ...account, health: { status: "reauth-required" } })).toBe(true);
    expect(mailHealthIsProblem({ ...account, health: { status: "unknown" } })).toBe(false);
  });
});

describe("project access", () => {
  const access: MailProjectAccess = {
    projectId,
    accountIds: ["acct-1", "acct-2"],
    defaultAccountId: "acct-1",
  };

  it("clears the default when its grant is revoked", () => {
    expect(toggleProjectGrant(access, "acct-1", false)).toEqual({
      projectId,
      accountIds: ["acct-2"],
    });
    expect(toggleProjectGrant(access, "acct-2", false).defaultAccountId).toBe("acct-1");
  });

  it("grants an account when it becomes the default", () => {
    expect(setProjectDefault({ projectId, accountIds: [] }, "acct-3")).toEqual({
      projectId,
      accountIds: ["acct-3"],
      defaultAccountId: "acct-3",
    });
    expect(setProjectDefault(access, null)).toEqual({
      projectId,
      accountIds: ["acct-1", "acct-2"],
    });
  });
});
