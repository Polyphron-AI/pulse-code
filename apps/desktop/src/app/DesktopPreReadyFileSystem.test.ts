import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import * as DesktopPreReadyFileSystem from "./DesktopPreReadyFileSystem.ts";

it.layer(NodeServices.layer)("DesktopPreReadyFileSystem", (it) => {
  it.effect("writes and reads startup files through the synchronous filesystem", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-pre-ready-fs-" });
      const startupFile = path.join(root, "startup", "settings.json");
      const contents = yield* Effect.gen(function* () {
        const startupFs = yield* FileSystem.FileSystem;
        yield* startupFs.makeDirectory(path.dirname(startupFile), { recursive: true });
        yield* startupFs.writeFileString(startupFile, "settings", { flag: "wx" });
        assert.isTrue(yield* startupFs.exists(startupFile));
        return yield* startupFs.readFileString(startupFile);
      }).pipe(Effect.provide(DesktopPreReadyFileSystem.layer));
      assert.equal(contents, "settings");
    }),
  );

  it.effect.skipIf(HostProcessPlatform.defaultValue() === "win32" || process.getuid?.() === 0)(
    "fails instead of treating an unreadable profile as missing",
    () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-pre-ready-fs-" });
        yield* fileSystem.chmod(root, 0o000);
        yield* Effect.addFinalizer(() => fileSystem.chmod(root, 0o700).pipe(Effect.orDie));

        const exit = yield* Effect.exit(
          Effect.flatMap(FileSystem.FileSystem, (startupFs) => startupFs.exists(root)).pipe(
            Effect.provide(DesktopPreReadyFileSystem.layer),
          ),
        );

        assert.isTrue(Exit.isFailure(exit));
      }),
  );
});
