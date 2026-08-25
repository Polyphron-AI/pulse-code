import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import { writeFileStringAtomically } from "../../atomicWrite.ts";
import { GitVcsDriver } from "../../vcs/GitVcsDriver.ts";
import {
  ScheduleHandoffGit,
  ScheduleHandoffGitError,
  type ScheduleHandoffGitInput,
} from "../Services/ScheduleHandoffGit.ts";

const PULSE_COMMIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "Pulse Code",
  GIT_AUTHOR_EMAIL: "t3code@users.noreply.github.com",
  GIT_COMMITTER_NAME: "Pulse Code",
  GIT_COMMITTER_EMAIL: "t3code@users.noreply.github.com",
};

export const ScheduleHandoffGitLive = Layer.effect(
  ScheduleHandoffGit,
  Effect.gen(function* () {
    const git = yield* GitVcsDriver;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const newline = String.fromCharCode(10);

    const fail = (workspaceRoot: string, detail: string, cause?: unknown) =>
      new ScheduleHandoffGitError({
        workspaceRoot,
        detail,
        ...(cause === undefined ? {} : { cause }),
      });

    const execute = (workspaceRoot: string, args: ReadonlyArray<string>, operation: string) =>
      git
        .execute({
          operation,
          cwd: workspaceRoot,
          args,
        })
        .pipe(
          Effect.mapError((cause) =>
            fail(workspaceRoot, "Git command failed while applying the policy.", cause),
          ),
        );

    const resolveRepository = (input: ScheduleHandoffGitInput) =>
      Effect.gen(function* () {
        const result = yield* execute(
          input.workspaceRoot,
          ["rev-parse", "--show-toplevel"],
          "ScheduleHandoffGit.resolveRepository",
        );
        const repositoryRoot = result.stdout.trim();
        if (repositoryRoot.length === 0) {
          return yield* fail(input.workspaceRoot, "Git did not return a repository root.");
        }
        const absoluteHandoff = path.resolve(input.workspaceRoot, input.handoffRelativePath);
        const repositoryRelativePath = path.relative(repositoryRoot, absoluteHandoff);
        if (
          repositoryRelativePath.length === 0 ||
          repositoryRelativePath === ".." ||
          repositoryRelativePath.startsWith(`..${path.sep}`) ||
          path.isAbsolute(repositoryRelativePath)
        ) {
          return yield* fail(
            input.workspaceRoot,
            "The handoff path resolves outside the project repository.",
          );
        }
        return {
          repositoryRoot,
          repositoryRelativePath: repositoryRelativePath.split(path.sep).join("/"),
        };
      });

    const commitOnlyPath = (
      workspaceRoot: string,
      repositoryRoot: string,
      repositoryRelativePath: string,
      subject: string,
    ) =>
      Effect.gen(function* () {
        const head = yield* git
          .execute({
            operation: "ScheduleHandoffGit.verifyHead",
            cwd: repositoryRoot,
            args: ["rev-parse", "--verify", "HEAD"],
            allowNonZeroExit: true,
          })
          .pipe(
            Effect.mapError((cause) =>
              fail(workspaceRoot, "Failed to inspect the repository HEAD.", cause),
            ),
          );
        if (head.exitCode !== 0) {
          return yield* fail(
            workspaceRoot,
            "The project needs an initial Git commit before Pulse Code can commit handoffs.",
          );
        }

        const staged = yield* execute(
          repositoryRoot,
          ["diff", "--cached", "--name-only", "--", repositoryRelativePath],
          "ScheduleHandoffGit.checkStagedPath",
        );
        if (staged.stdout.trim().length > 0) {
          return yield* fail(
            workspaceRoot,
            `Refusing to replace an already-staged '${repositoryRelativePath}'.`,
          );
        }

        const resetPath = git
          .execute({
            operation: "ScheduleHandoffGit.resetFailedPath",
            cwd: repositoryRoot,
            args: ["reset", "--", repositoryRelativePath],
            allowNonZeroExit: true,
          })
          .pipe(Effect.ignore);

        yield* Effect.gen(function* () {
          yield* execute(
            repositoryRoot,
            ["--literal-pathspecs", "add", "-A", "--", repositoryRelativePath],
            "ScheduleHandoffGit.stagePath",
          );
          const changed = yield* git
            .execute({
              operation: "ScheduleHandoffGit.checkPathChanged",
              cwd: repositoryRoot,
              args: ["diff", "--cached", "--quiet", "HEAD", "--", repositoryRelativePath],
              allowNonZeroExit: true,
            })
            .pipe(
              Effect.mapError((cause) =>
                fail(workspaceRoot, "Failed to inspect the staged handoff.", cause),
              ),
            );
          if (changed.exitCode === 0) return;
          if (changed.exitCode !== 1) {
            return yield* fail(
              workspaceRoot,
              `Could not inspect staged handoff '${repositoryRelativePath}'.`,
            );
          }
          yield* git
            .execute({
              operation: "ScheduleHandoffGit.commitPath",
              cwd: repositoryRoot,
              args: [
                "--literal-pathspecs",
                "commit",
                "--only",
                "-m",
                subject,
                "--",
                repositoryRelativePath,
              ],
              env: PULSE_COMMIT_ENV,
            })
            .pipe(
              Effect.mapError((cause) =>
                fail(workspaceRoot, `Failed to commit '${repositoryRelativePath}'.`, cause),
              ),
            );
        }).pipe(Effect.onError(() => resetPath));
      });

    const ensureIgnored = (input: ScheduleHandoffGitInput, repositoryRoot: string) =>
      Effect.gen(function* () {
        const gitignoreStatus = yield* execute(
          repositoryRoot,
          ["status", "--porcelain=v1", "--", ".gitignore"],
          "ScheduleHandoffGit.checkGitignore",
        );
        if (gitignoreStatus.stdout.trim().length > 0) {
          return yield* fail(
            input.workspaceRoot,
            "Refusing to modify .gitignore because it already has uncommitted changes.",
          );
        }

        const templateAbsolute = path.resolve(input.workspaceRoot, input.handoffPathTemplate);
        const templateRelative = path.relative(repositoryRoot, templateAbsolute);
        if (
          templateRelative.length === 0 ||
          templateRelative === ".." ||
          templateRelative.startsWith(`..${path.sep}`) ||
          path.isAbsolute(templateRelative)
        ) {
          return yield* fail(
            input.workspaceRoot,
            "The handoff template resolves outside the project repository.",
          );
        }
        const rule = `/${templateRelative
          .split(path.sep)
          .join("/")
          .replaceAll("{date}", "????-??-??")}`;
        const gitignorePath = path.join(repositoryRoot, ".gitignore");
        const exists = yield* fs
          .exists(gitignorePath)
          .pipe(
            Effect.mapError((cause) =>
              fail(input.workspaceRoot, "Failed to inspect .gitignore.", cause),
            ),
          );
        const current = exists
          ? yield* fs
              .readFileString(gitignorePath)
              .pipe(
                Effect.mapError((cause) =>
                  fail(input.workspaceRoot, "Failed to read .gitignore.", cause),
                ),
              )
          : "";
        if (current.split(newline).some((line) => line.trimEnd() === rule)) return;

        const separator = current.length === 0 || current.endsWith(newline) ? "" : newline;
        const marker = current.includes("# Pulse Code scheduled chats")
          ? ""
          : `# Pulse Code scheduled chats${newline}`;
        const contents = `${current}${separator}${marker}${rule}${newline}`;
        yield* writeFileStringAtomically({ filePath: gitignorePath, contents }).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
          Effect.mapError((cause) =>
            fail(input.workspaceRoot, "Failed to update .gitignore.", cause),
          ),
        );
        yield* commitOnlyPath(
          input.workspaceRoot,
          repositoryRoot,
          ".gitignore",
          "chore: ignore scheduled chat handoffs",
        );
      });

    return {
      apply: (input: ScheduleHandoffGitInput) =>
        Effect.gen(function* () {
          const repository = yield* resolveRepository(input);
          if (input.policy === "ignore") {
            yield* ensureIgnored(input, repository.repositoryRoot);
            return;
          }
          yield* commitOnlyPath(
            input.workspaceRoot,
            repository.repositoryRoot,
            repository.repositoryRelativePath,
            "docs: update scheduled chat handoff",
          );
        }),
    };
  }),
);
