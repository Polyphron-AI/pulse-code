import { assert, describe, it } from "@effect/vitest";
import * as NodePathLayer from "@effect/platform-node/NodePath";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import * as ElectronShell from "../../electron/ElectronShell.ts";
import { revealPath } from "./window.ts";

const revealedPaths: string[] = [];

const layer = Layer.mergeAll(
  NodePathLayer.layer,
  Layer.succeed(ElectronShell.ElectronShell, {
    openExternal: () => Effect.succeed(true),
    revealPath: (path) =>
      Effect.sync(() => {
        revealedPaths.push(path);
        return true;
      }),
    copyText: () => Effect.void,
  }),
);

describe("revealPath", () => {
  it.effect("normalizes and reveals absolute paths", () =>
    Effect.gen(function* () {
      revealedPaths.length = 0;
      const path = yield* Path.Path;
      const absolutePath = path.resolve("workspace", "src", "..", "README.md");

      assert.isTrue(yield* revealPath.handler(absolutePath));
      assert.deepEqual(revealedPaths, [path.normalize(absolutePath)]);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("rejects relative paths", () =>
    Effect.gen(function* () {
      revealedPaths.length = 0;

      assert.isFalse(yield* revealPath.handler("src/index.ts"));
      assert.deepEqual(revealedPaths, []);
    }).pipe(Effect.provide(layer)),
  );
});
