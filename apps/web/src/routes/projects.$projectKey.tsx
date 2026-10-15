import { parseScopedProjectKey } from "@t3tools/client-runtime/environment";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectKey")({
  beforeLoad: async ({ context, params }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
    const ref = parseScopedProjectKey(params.projectKey);
    throw redirect({
      to: "/workspace",
      search: {
        space: "projects",
        project: ref?.projectId ?? params.projectKey,
        ...(ref ? { environment: ref.environmentId } : {}),
      },
      replace: true,
    });
  },
});
