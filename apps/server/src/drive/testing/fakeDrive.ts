import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
export const makeFakeDrive = () => {
  const calls: Array<{ url: URL; method: string; body: URLSearchParams }> = [];
  const state = {
    identity: "google-user-1",
    status: 200,
    tokenStatus: 200,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    content: "Synthetic launch brief",
    mimeType: "application/vnd.google-apps.document",
    refreshToken: true,
    tokenCalls: 0,
  };
  const client = HttpClient.make((request, url) =>
    Effect.sync(() => {
      const body = new URLSearchParams(
        request.body._tag === "Uint8Array" ? new TextDecoder().decode(request.body.body) : "",
      );
      calls.push({ url, method: request.method, body });
      let status = state.status;
      let result: unknown;
      if (url.href === "https://oauth2.googleapis.com/token") {
        state.tokenCalls++;
        status = state.tokenStatus;
        result =
          status === 200
            ? {
                access_token: "synthetic-access-secret",
                ...(state.refreshToken ? { refresh_token: "synthetic-refresh-secret" } : {}),
                expires_in: 3600,
                scope: state.scope,
              }
            : { error: "invalid_grant", error_description: "synthetic-refresh-secret" };
      } else if (url.pathname.endsWith("/about"))
        result = {
          user: {
            permissionId: state.identity,
            displayName: "Synthetic user",
            emailAddress: "fixture@example.test",
          },
        };
      else if (url.pathname.endsWith("/export") || url.searchParams.get("alt") === "media")
        return HttpClientResponse.fromWeb(request, new Response(state.content, { status }));
      else if (url.pathname.endsWith("/files"))
        result = {
          files: [{ id: "file-one", name: "Launch brief", mimeType: state.mimeType }],
          nextPageToken: "next",
        };
      else
        result = {
          id: url.pathname.split("/").pop(),
          name: "Launch brief",
          mimeType: state.mimeType,
          modifiedTime: "2026-10-15T12:00:00Z",
          owners: [{ displayName: "Synthetic owner" }],
        };
      return HttpClientResponse.fromWeb(
        request,
        new Response(encodeJson(result), {
          status,
          headers: { "content-type": "application/json" },
        }),
      );
    }),
  );
  return { calls, state, layer: Layer.succeed(HttpClient.HttpClient, client) };
};
