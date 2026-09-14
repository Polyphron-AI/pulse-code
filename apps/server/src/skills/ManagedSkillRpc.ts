import { PulseSkillsError, type PulseSkillMutation } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schedule from "effect/Schedule";
import * as ServerConfig from "../config.ts";
import { ManagedSkillLibrary } from "./ManagedSkillLibrary.ts";
import { githubRequest, resolveGitHubSkillUrl } from "./ManagedSkillStore.ts";

/** One registry writer per environment, shared by all authenticated connections. */
export class ManagedSkills extends Context.Service<ManagedSkills, ManagedSkillLibrary>()(
  "t3/skills/ManagedSkillRpc/ManagedSkills",
) {}

export const layer = Layer.effect(
  ManagedSkills,
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    const path = yield* Path.Path;
    const library = new ManagedSkillLibrary(path.join(config.stateDir, "pulse", "skills"));
    yield* Effect.tryPromise(() => library.syncKeepUpdated()).pipe(
      Effect.ignoreCause({ log: true }),
      Effect.repeat(Schedule.spaced("1 hour")),
      Effect.forkScoped,
    );
    return library;
  }),
);

export function managedSkillHandlers(library: ManagedSkillLibrary) {
  const failure = () =>
    new PulseSkillsError({
      message: "Managed skill operation failed. Check the source and skill content, then retry.",
    });
  return {
    list: () => Effect.tryPromise({ try: () => library.list(), catch: failure }),
    mutate: (input: PulseSkillMutation) =>
      Effect.tryPromise({
        try: async (signal) => {
          switch (input.operation) {
            case "import-upload":
              await library.importUpload({ ...input, signal });
              break;
            case "import-github":
              await library.importGitHub({ ...input, signal });
              break;
            case "link-github":
              await library.linkGitHub({
                id: input.id,
                source: input.source,
                signal,
                ...(input.updatePolicy ? { updatePolicy: input.updatePolicy } : {}),
              });
              break;
            case "set-policy":
              await library.setUpdatePolicy({ id: input.id, updatePolicy: input.policy, signal });
              break;
            case "sync":
              await library.sync({ id: input.id, signal });
              break;
            case "remove":
              await library.remove({ id: input.id, signal });
              break;
          }
          return library.list();
        },
        catch: failure,
      }),
    resolveGitHub: ({ url }: { readonly url: string }) =>
      Effect.tryPromise({ try: () => resolveGitHubSkillUrl(url, githubRequest), catch: failure }),
  };
}
