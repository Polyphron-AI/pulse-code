import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import * as ServerConfig from "../../config.ts";
import * as GitVcsDriver from "../../vcs/GitVcsDriver.ts";
import * as VcsProcess from "../../vcs/VcsProcess.ts";
import { ScheduleHandoffGit } from "../Services/ScheduleHandoffGit.ts";
import { ScheduleHandoffGitLive } from "./ScheduleHandoffGit.ts";

const ServerConfigLayer = ServerConfig.layerTest(process.cwd(), {
  prefix: "schedule-handoff-git-test-",
});

const TestLayer = ScheduleHandoffGitLive.pipe(
  Layer.provideMerge(GitVcsDriver.layer),
  Layer.provideMerge(VcsProcess.layer),
  Layer.provideMerge(ServerConfigLayer),
  Layer.provideMerge(NodeServices.layer),
);

const runGit = (cwd: string, args: ReadonlyArray<string>, allowNonZeroExit = false) =>
  Effect.gen(function* () {
    const git = yield* GitVcsDriver.GitVcsDriver;
    return yield* git.execute({
      operation: "ScheduleHandoffGit.test",
      cwd,
      args,
      allowNonZeroExit,
    });
  });

const writeFile = (cwd: string, relativePath: string, contents: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const absolutePath = path.join(cwd, relativePath);
    yield* fs.makeDirectory(path.dirname(absolutePath), { recursive: true });
    yield* fs.writeFileString(absolutePath, contents);
  });

const initializeRepository = (cwd: string) =>
  Effect.gen(function* () {
    yield* runGit(cwd, ["init"]);
    yield* runGit(cwd, ["config", "user.email", "pulse-test@example.com"]);
    yield* runGit(cwd, ["config", "user.name", "Pulse Test"]);
    yield* writeFile(cwd, "README.md", "Initial project");
    yield* runGit(cwd, ["add", "README.md"]);
    yield* runGit(cwd, ["commit", "-m", "Initial commit"]);
  });

it.layer(TestLayer)("ScheduleHandoffGit", (it) => {
  it.effect("commits only the generated handoff and preserves unrelated staged files", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "schedule-handoff-git-" });
        yield* initializeRepository(root);
        yield* writeFile(root, ".gitignore", "/handoff/");
        yield* runGit(root, ["add", ".gitignore"]);
        yield* runGit(root, ["commit", "-m", "Ignore handoffs"]);
        yield* writeFile(root, "staged.txt", "keep me staged");
        yield* runGit(root, ["add", "staged.txt"]);
        yield* writeFile(root, "handoff/2026-08-25.md", "Scheduled summary");

        const policy = yield* ScheduleHandoffGit;
        yield* policy.apply({
          workspaceRoot: root,
          handoffRelativePath: "handoff/2026-08-25.md",
          handoffPathTemplate: "handoff/{date}.md",
          policy: "commit",
        });

        const committed = yield* runGit(root, ["show", "--name-only", "--pretty=format:", "HEAD"]);
        expect(committed.stdout.trim()).toBe("handoff/2026-08-25.md");
        const staged = yield* runGit(root, ["diff", "--cached", "--name-only"]);
        expect(staged.stdout.trim()).toBe("staged.txt");
        const handoffStatus = yield* runGit(root, [
          "status",
          "--porcelain=v1",
          "--",
          "handoff/2026-08-25.md",
        ]);
        expect(handoffStatus.stdout.trim()).toBe("");
      }),
    ),
  );

  it.effect("commits an idempotent date-shaped .gitignore rule", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "schedule-handoff-ignore-" });
        yield* initializeRepository(root);
        yield* writeFile(root, "handoff/2026-08-25.md", "Ignored summary");

        const policy = yield* ScheduleHandoffGit;
        const input = {
          workspaceRoot: root,
          handoffRelativePath: "handoff/2026-08-25.md",
          handoffPathTemplate: "handoff/{date}.md",
          policy: "ignore" as const,
        };
        yield* policy.apply(input);

        const gitignore = yield* fs.readFileString(path.join(root, ".gitignore"));
        expect(gitignore).toContain("# Pulse Code scheduled chats");
        expect(gitignore).toContain("/handoff/????-??-??.md");
        const committed = yield* runGit(root, ["show", "--name-only", "--pretty=format:", "HEAD"]);
        expect(committed.stdout.trim()).toBe(".gitignore");
        const ignored = yield* runGit(root, ["check-ignore", "handoff/2026-08-25.md"], true);
        expect(ignored.exitCode).toBe(0);

        const before = yield* runGit(root, ["rev-parse", "HEAD"]);
        yield* policy.apply(input);
        const after = yield* runGit(root, ["rev-parse", "HEAD"]);
        expect(after.stdout.trim()).toBe(before.stdout.trim());
      }),
    ),
  );

  it.effect("refuses to absorb existing .gitignore changes", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({
          prefix: "schedule-handoff-dirty-ignore-",
        });
        yield* initializeRepository(root);
        yield* writeFile(root, ".gitignore", "user-rule");

        const policy = yield* ScheduleHandoffGit;
        const error = yield* Effect.flip(
          policy.apply({
            workspaceRoot: root,
            handoffRelativePath: "handoff/2026-08-25.md",
            handoffPathTemplate: "handoff/{date}.md",
            policy: "ignore",
          }),
        );
        expect(error.message).toContain(".gitignore");
        expect(yield* fs.readFileString(path.join(root, ".gitignore"))).toBe("user-rule");
      }),
    ),
  );
});
