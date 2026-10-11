// @effect-diagnostics nodeBuiltinImport:off globalTimers:off -- The native OAuth callback owns a short-lived Node HTTP listener outside the Effect runtime.
import * as NodeCrypto from "node:crypto";
import * as NodeHttp from "node:http";
import type { OfficeAccount } from "@t3tools/contracts";
import { OfficeError, object, responseJson, string } from "./OfficeErrors.ts";

export interface OfficeOAuthConfiguration {
  googleClientId?: string | undefined;
  googleClientSecret?: string | undefined;
  microsoftClientId?: string | undefined;
  microsoftTenant?: string | undefined;
}
export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}
export interface OAuthAuthorization extends OAuthTokens {
  email: string;
}
export interface OAuthInput {
  provider: "google" | "microsoft";
  capabilities: OfficeAccount["capabilities"];
  configuration: OfficeOAuthConfiguration;
  openExternal: (url: string) => Promise<void>;
  fetch: typeof globalThis.fetch;
  signal: AbortSignal;
  now: () => number;
}

export function oauthEndpoints(provider: OAuthInput["provider"], config: OfficeOAuthConfiguration) {
  if (provider === "google") {
    if (!config.googleClientId?.trim())
      throw new OfficeError(
        "setup_required",
        "Google account connection requires a configured desktop OAuth client ID.",
      );
    return {
      clientId: config.googleClientId.trim(),
      authorize: "https://accounts.google.com/o/oauth2/v2/auth",
      token: "https://oauth2.googleapis.com/token",
    };
  }
  if (!config.microsoftClientId?.trim())
    throw new OfficeError(
      "setup_required",
      "Microsoft account connection requires a configured public OAuth client ID.",
    );
  const tenant = config.microsoftTenant?.trim() || "common";
  if (!/^[a-zA-Z0-9.-]+$/.test(tenant))
    throw new OfficeError("setup_required", "The Microsoft OAuth tenant configuration is invalid.");
  return {
    clientId: config.microsoftClientId.trim(),
    authorize: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    token: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
  };
}

export function oauthScopes(
  provider: OAuthInput["provider"],
  capabilities: OfficeAccount["capabilities"],
): string {
  if (provider === "microsoft") {
    if (capabilities.includes("calendar"))
      throw new OfficeError(
        "unsupported",
        "Calendar currently supports Google accounts. Connect Microsoft for email.",
      );
    return "openid profile email offline_access User.Read Mail.Read";
  }
  return [
    "openid",
    "email",
    ...(capabilities.includes("mail") ? ["https://www.googleapis.com/auth/gmail.readonly"] : []),
    ...(capabilities.includes("calendar")
      ? ["https://www.googleapis.com/auth/calendar.readonly"]
      : []),
  ].join(" ");
}

function tokens(
  value: Record<string, unknown>,
  now: number,
  previousRefreshToken = "",
): OAuthTokens {
  const accessToken = string(value.access_token);
  const refreshToken = string(value.refresh_token) || previousRefreshToken;
  if (!accessToken || !refreshToken)
    throw new OfficeError(
      "authentication",
      "The provider did not grant persistent access. Reconnect and allow offline access.",
    );
  return {
    accessToken,
    refreshToken,
    expiresAt: now + (typeof value.expires_in === "number" ? value.expires_in : 3600) * 1000,
  };
}

async function exchange(
  input: OAuthInput,
  parameters: URLSearchParams,
): Promise<Record<string, unknown>> {
  const endpoints = oauthEndpoints(input.provider, input.configuration);
  parameters.set("client_id", endpoints.clientId);
  if (input.provider === "google" && input.configuration.googleClientSecret)
    parameters.set("client_secret", input.configuration.googleClientSecret);
  const response = await input.fetch(endpoints.token, {
    method: "POST",
    body: parameters,
    signal: AbortSignal.any([input.signal, AbortSignal.timeout(30_000)]),
  });
  if (!response.ok)
    throw new OfficeError(
      "authentication",
      "Account authorization expired or was declined. Reconnect the account.",
    );
  return object(await response.json());
}

export async function refreshOfficeOAuth(
  input: OAuthInput,
  refreshToken: string,
): Promise<OAuthTokens> {
  return tokens(
    await exchange(
      input,
      new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    ),
    input.now(),
    refreshToken,
  );
}

/** Listens only during interactive sign-in and never opens an embedded login browser. */
export async function authorizeOfficeOAuth(input: OAuthInput): Promise<OAuthAuthorization> {
  const endpoints = oauthEndpoints(input.provider, input.configuration);
  const scope = oauthScopes(input.provider, input.capabilities);
  const verifier = NodeCrypto.randomBytes(32).toString("base64url");
  const state = NodeCrypto.randomBytes(32).toString("base64url");
  const callbackPath = "/office/oauth/callback";
  let resolveCode: (code: string) => void = () => {};
  let rejectCode: (error: Error) => void = () => {};
  const codePromise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  // Attach before opening the browser so immediate cancellation cannot reject unobserved.
  void codePromise.catch(() => {});
  const server = NodeHttp.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    if (request.method !== "GET" || url.pathname !== callbackPath) {
      response.writeHead(404).end("Not found");
      return;
    }
    if (url.searchParams.get("state") !== state) {
      response.writeHead(400).end("Invalid authorization state");
      return;
    }
    if (url.searchParams.has("error")) {
      response.end("Connection was cancelled. You can return to Pulse.");
      rejectCode(new OfficeError("cancelled", "Account connection was cancelled."));
      return;
    }
    const code = url.searchParams.get("code");
    if (!code) {
      response.writeHead(400).end("Missing authorization code");
      return;
    }
    response.end("Authorization received. Return to Pulse to finish connecting.");
    resolveCode(code);
  });
  const abort = () => rejectCode(new OfficeError("cancelled", "Account connection was cancelled."));
  input.signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(
    () =>
      rejectCode(
        new OfficeError("cancelled", "Account connection timed out. Try connecting again."),
      ),
    180_000,
  );
  try {
    if (input.signal.aborted)
      throw new OfficeError("cancelled", "Account connection was cancelled.");
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw new OfficeError("network", "Unable to start the local account callback.");
    const redirectUri = `http://127.0.0.1:${address.port}${callbackPath}`;
    const authorizationUrl = new URL(endpoints.authorize);
    authorizationUrl.search = new URLSearchParams({
      client_id: endpoints.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope,
      state,
      code_challenge: NodeCrypto.createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      ...(input.provider === "google"
        ? { access_type: "offline", prompt: "consent" }
        : { prompt: "select_account" }),
    }).toString();
    await input.openExternal(authorizationUrl.href);
    const code = await codePromise;
    const granted = await exchange(
      input,
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
    );
    if (typeof granted.scope === "string") {
      const scopes = new Set(
        granted.scope
          .split(" ")
          .map((entry) =>
            input.provider === "microsoft"
              ? entry.replace("https://graph.microsoft.com/", "")
              : entry,
          ),
      );
      const required = scope
        .split(" ")
        .filter((entry) => entry.includes("googleapis.com") || entry === "Mail.Read");
      if (required.some((entry) => !scopes.has(entry)))
        throw new OfficeError(
          "authentication",
          "The requested mailbox or calendar permissions were not granted.",
        );
    }
    const result = tokens(granted, input.now());
    const profile = await responseJson(
      await input.fetch(
        input.provider === "google"
          ? "https://openidconnect.googleapis.com/v1/userinfo"
          : "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName",
        {
          headers: { Authorization: `Bearer ${result.accessToken}` },
          signal: AbortSignal.any([input.signal, AbortSignal.timeout(30_000)]),
        },
      ),
    );
    const email =
      string(profile.email) || string(profile.mail) || string(profile.userPrincipalName);
    if (!email)
      throw new OfficeError(
        "authentication",
        "The provider did not identify the connected account.",
      );
    return { ...result, email };
  } finally {
    clearTimeout(timeout);
    input.signal.removeEventListener("abort", abort);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
