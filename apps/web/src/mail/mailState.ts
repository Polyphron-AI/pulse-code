import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import {
  WS_METHODS,
  type MailAccount,
  type MailAccountHealth,
  type MailAccountInput,
  type MailAuthInput,
  type MailProjectAccess,
} from "@t3tools/contracts";

import { connectionAtomRuntime } from "../connection/runtime";

export const pulseMailAccounts = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:pulse-mail:accounts",
  tag: WS_METHODS.pulseMailListAccounts,
  staleTimeMs: 5_000,
  idleTtlMs: 60_000,
});

export const pulseMailProjectAccess = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:pulse-mail:project-access",
  tag: WS_METHODS.pulseMailGetProjectAccess,
  staleTimeMs: 5_000,
  idleTtlMs: 60_000,
});

export const upsertPulseMailAccount = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:pulse-mail:upsert-account",
  tag: WS_METHODS.pulseMailUpsertAccount,
});

export const removePulseMailAccount = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:pulse-mail:remove-account",
  tag: WS_METHODS.pulseMailRemoveAccount,
});

export const disconnectPulseMailAccount = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:pulse-mail:disconnect-account",
  tag: WS_METHODS.pulseMailDisconnectAccount,
});

export const testPulseMailAccount = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:pulse-mail:test-account",
  tag: WS_METHODS.pulseMailTestAccount,
});

export const setPulseMailPassword = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:pulse-mail:set-password",
  tag: WS_METHODS.pulseMailSetPassword,
});

export const startPulseMailOAuth = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:pulse-mail:start-oauth",
  tag: WS_METHODS.pulseMailStartOAuth,
});

export const completePulseMailOAuth = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:pulse-mail:complete-oauth",
  tag: WS_METHODS.pulseMailCompleteOAuth,
});

export const setPulseMailProjectAccess = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:pulse-mail:set-project-access",
  tag: WS_METHODS.pulseMailSetProjectAccess,
});

export type MailAuthKind = MailAuthInput["kind"];

/** Add-account form fields. Secrets live only in this transient state and are never prefilled. */
export interface MailAccountDraft {
  readonly nickname: string;
  readonly address: string;
  readonly username: string;
  readonly imapHost: string;
  readonly imapPort: 993 | 143;
  readonly smtpHost: string;
  readonly smtpPort: 465 | 587;
  readonly authKind: MailAuthKind;
  readonly clientId: string;
  readonly tenant: string;
  readonly clientSecret: string;
  readonly allowPrivateNetwork: boolean;
}

export const EMPTY_MAIL_ACCOUNT_DRAFT: MailAccountDraft = {
  nickname: "",
  address: "",
  username: "",
  imapHost: "",
  imapPort: 993,
  smtpHost: "",
  smtpPort: 465,
  authKind: "password",
  clientId: "",
  tenant: "",
  clientSecret: "",
  allowPrivateNetwork: false,
};

/** Builds a create request, or returns a user-facing reason the draft is incomplete. */
export function buildMailAccountInput(
  draft: MailAccountDraft,
): { readonly input: MailAccountInput } | { readonly error: string } {
  const nickname = draft.nickname.trim();
  const address = draft.address.trim();
  const imapHost = draft.imapHost.trim();
  const smtpHost = draft.smtpHost.trim();
  if (!nickname) return { error: "Enter a nickname." };
  if (!/^[^\s@<>]+@[^\s@<>]+$/.test(address)) return { error: "Enter a valid email address." };
  if (!imapHost || !smtpHost) return { error: "Enter IMAP and SMTP hosts." };
  const clientId = draft.clientId.trim();
  const clientSecret = draft.clientSecret.trim();
  let auth: MailAuthInput;
  if (draft.authKind === "password") {
    auth = { kind: "password" };
  } else {
    if (!clientId) return { error: "Enter the OAuth client ID." };
    const secret = clientSecret ? { clientSecret } : {};
    const tenant = draft.tenant.trim();
    auth =
      draft.authKind === "oauth-google"
        ? { kind: "oauth-google", clientId, ...secret }
        : { kind: "oauth-microsoft", clientId, ...(tenant ? { tenant } : {}), ...secret };
  }
  const username = draft.username.trim();
  return {
    input: {
      nickname,
      address,
      ...(username ? { username } : {}),
      imap: { host: imapHost, port: draft.imapPort },
      smtp: { host: smtpHost, port: draft.smtpPort },
      auth,
      allowPrivateNetwork: draft.allowPrivateNetwork,
    },
  };
}

/**
 * Update request for an existing account. Omitting `clientSecret` keeps the
 * stored secret, so edits never need (or resend) credentials.
 */
export function accountUpdateInput(
  account: MailAccount,
  patch: { readonly nickname?: string; readonly allowPrivateNetwork?: boolean },
): MailAccountInput {
  const auth: MailAuthInput =
    account.auth.kind === "password"
      ? { kind: "password" }
      : account.auth.kind === "oauth-google"
        ? { kind: "oauth-google", clientId: account.auth.clientId }
        : {
            kind: "oauth-microsoft",
            clientId: account.auth.clientId,
            ...(account.auth.tenant ? { tenant: account.auth.tenant } : {}),
          };
  return {
    id: account.id,
    nickname: patch.nickname?.trim() || account.nickname,
    address: account.address,
    username: account.username,
    imap: account.imap,
    smtp: account.smtp,
    auth,
    allowPrivateNetwork: patch.allowPrivateNetwork ?? account.allowPrivateNetwork,
    appendToSent: account.appendToSent,
    folders: account.folders,
  };
}

const HEALTH_LABELS: Record<MailAccountHealth["status"], string> = {
  unknown: "Not tested",
  ok: "Connected",
  "auth-failed": "Sign-in failed",
  "reauth-required": "Re-authentication required",
  unreachable: "Server unreachable",
  error: "Error",
};

export function mailHealthLabel(account: MailAccount): string {
  if (!account.credentialConfigured) return "Credentials needed";
  return HEALTH_LABELS[account.health.status];
}

/** Accounts whose health shows a failure the user can act on with Test again. */
export function mailHealthIsProblem(account: MailAccount): boolean {
  return (
    !account.credentialConfigured ||
    (account.health.status !== "ok" && account.health.status !== "unknown")
  );
}

/** Grants or revokes one account; revoking the default account clears the default. */
export function toggleProjectGrant(
  access: MailProjectAccess,
  accountId: MailAccount["id"],
  granted: boolean,
): MailProjectAccess {
  const accountIds = granted
    ? access.accountIds.includes(accountId)
      ? access.accountIds
      : [...access.accountIds, accountId]
    : access.accountIds.filter((id) => id !== accountId);
  const keepDefault =
    access.defaultAccountId !== undefined && accountIds.includes(access.defaultAccountId);
  return {
    projectId: access.projectId,
    accountIds,
    ...(keepDefault ? { defaultAccountId: access.defaultAccountId } : {}),
  };
}

/** Sets the project default; choosing an ungranted account also grants it. */
export function setProjectDefault(
  access: MailProjectAccess,
  accountId: MailAccount["id"] | null,
): MailProjectAccess {
  if (accountId === null) return { projectId: access.projectId, accountIds: access.accountIds };
  const granted = toggleProjectGrant(access, accountId, true);
  return { ...granted, defaultAccountId: accountId };
}
