import { assert, it } from "@effect/vitest";
import {
  DEFAULT_SERVER_SETTINGS,
  type ServerSettings,
  UsageLimitSourceId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import { BackgroundPolicy } from "../background/BackgroundPolicy.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import { make } from "./UsageLimitSources.ts";

it.effect("reads only enabled configured hubs and drops removed sources", () =>
  Effect.gen(function* () {
    const id = UsageLimitSourceId.make("configured");
    const disabled = UsageLimitSourceId.make("disabled");
    let settings: ServerSettings = {
      ...DEFAULT_SERVER_SETTINGS,
      usageLimitSources: {
        [id]: {
          kind: "cliproxy",
          url: "https://quota.example",
          managementKey: "test-key",
          enabled: true,
        },
        [disabled]: {
          kind: "cliproxy",
          url: "https://disabled.example",
          managementKey: "disabled-key",
          enabled: false,
        },
      },
    };
    const requests: string[] = [];
    const sources = yield* make.pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.mock(ServerSettingsService)({
            getSettings: Effect.sync(() => settings),
            streamChanges: Stream.empty,
          }),
          Layer.mock(BackgroundPolicy)({ shouldRunScopeWork: () => Effect.succeed(false) }),
        ),
      ),
      Effect.provideService(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          Effect.sync(() => {
            requests.push(request.url);
            assert.equal(request.headers.authorization, "Bearer test-key");
            return HttpClientResponse.fromWeb(request, Response.json({ accounts: {} }));
          }),
        ),
      ),
    );
    yield* sources.refresh;
    assert.isAbove(requests.length, 0);
    assert.isTrue(
      requests.every((url) => url === "https://quota.example/v0/management/quota-scheduler/status"),
    );
    assert.deepEqual(
      (yield* sources.current).map((source) => source.id),
      [id],
    );
    settings = { ...settings, usageLimitSources: {} };
    yield* sources.refresh;
    assert.deepEqual(yield* sources.current, []);
  }).pipe(Effect.scoped),
);

it.effect("reports missing credentials without making a request", () =>
  Effect.gen(function* () {
    const id = UsageLimitSourceId.make("missing-key");
    const sources = yield* make.pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.mock(ServerSettingsService)({
            getSettings: Effect.succeed({
              ...DEFAULT_SERVER_SETTINGS,
              usageLimitSources: {
                [id]: {
                  kind: "cliproxy",
                  url: "https://quota.example",
                  managementKey: "",
                  enabled: true,
                },
              },
            }),
            streamChanges: Stream.empty,
          }),
          Layer.mock(BackgroundPolicy)({ shouldRunScopeWork: () => Effect.succeed(false) }),
        ),
      ),
      Effect.provideService(
        HttpClient.HttpClient,
        HttpClient.make(() => Effect.die("Unexpected quota request")),
      ),
    );
    yield* sources.refresh;
    assert.equal((yield* sources.current)[0]?.error, "No management key configured.");
  }).pipe(Effect.scoped),
);
