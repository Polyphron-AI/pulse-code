import * as NodePath from "@effect/platform-node/NodePath";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { resolveUserDataPath } from "./DesktopUserData.ts";

it.effect.each([false, true])(
  "selects the Pulse profile without accessing official T3 state (development: %s)",
  (isDevelopment) =>
    Effect.gen(function* () {
      const profile = yield* resolveUserDataPath({
        appDataDirectory: "/profiles",
        isDevelopment,
      });
      assert.equal(profile, isDevelopment ? "/profiles/pulsenext-dev" : "/profiles/pulsenext");
    }).pipe(
      Effect.provideService(
        FileSystem.FileSystem,
        FileSystem.makeNoop({
          exists: () => Effect.die("must not inspect T3 profiles"),
          readFileString: () => Effect.die("must not read T3 state"),
          makeDirectory: () => Effect.die("must not create migration directories"),
          writeFileString: () => Effect.die("must not migrate T3 state"),
        }),
      ),
      Effect.provide(NodePath.layerPosix),
    ),
);
