import type { PullRequestDiffInput, PullRequestDiffResult } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { HttpClient } from "effect/unstable/http";

import { RemoteEnvironmentAuthorization } from "../authorization/service.ts";
import type { PreparedConnection } from "../connection/model.ts";
import { ManagedRelayDpopSigner } from "../relay/managedRelay.ts";
import {
  makeEnvironmentHttpApiUrlBuilder,
  type RemoteEnvironmentRequestError,
} from "../rpc/http.ts";
import { executeAuthenticatedEnvironmentHttpRequest } from "./environmentHttpAuth.ts";

const DEFAULT_PULL_REQUEST_DIFF_TIMEOUT_MS = 60_000;

export const fetchEnvironmentPullRequestDiff = Effect.fn(
  "clientRuntime.state.fetchEnvironmentPullRequestDiff",
)(function* (input: {
  readonly prepared: PreparedConnection;
  readonly diff: PullRequestDiffInput;
  readonly signer: Option.Option<ManagedRelayDpopSigner["Service"]>;
  readonly remoteAuthorization?: Option.Option<RemoteEnvironmentAuthorization["Service"]>;
  readonly timeoutMs?: number;
}) {
  return yield* executeAuthenticatedEnvironmentHttpRequest({
    ...input,
    method: "POST",
    url: (httpBaseUrl) => makeEnvironmentHttpApiUrlBuilder(httpBaseUrl).pullRequests.diff(),
    timeoutMs: input.timeoutMs ?? DEFAULT_PULL_REQUEST_DIFF_TIMEOUT_MS,
    request: ({ client, headers }) => client.pullRequests.diff({ payload: input.diff, headers }),
  });
});

export class PullRequestDiffLoader extends Context.Service<
  PullRequestDiffLoader,
  {
    readonly load: (
      prepared: PreparedConnection,
      input: PullRequestDiffInput,
    ) => Effect.Effect<PullRequestDiffResult, RemoteEnvironmentRequestError>;
  }
>()("@t3tools/client-runtime/state/pullRequestDiffHttp/PullRequestDiffLoader") {}

export const pullRequestDiffLoaderLayer: Layer.Layer<
  PullRequestDiffLoader,
  never,
  HttpClient.HttpClient
> = Layer.effect(
  PullRequestDiffLoader,
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    const signer = yield* Effect.serviceOption(ManagedRelayDpopSigner);
    const remoteAuthorization = yield* Effect.serviceOption(RemoteEnvironmentAuthorization);
    return PullRequestDiffLoader.of({
      load: (prepared, input) =>
        fetchEnvironmentPullRequestDiff({
          prepared,
          diff: input,
          signer,
          remoteAuthorization,
        }).pipe(Effect.provideService(HttpClient.HttpClient, httpClient)),
    });
  }),
);
