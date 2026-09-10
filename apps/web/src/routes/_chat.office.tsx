import { createFileRoute } from "@tanstack/react-router";
import { OfficeWorkspace } from "../components/office/OfficeWorkspace";

export const Route = createFileRoute("/_chat/office")({
  validateSearch: (search: Record<string, unknown>): { environment?: string | undefined } => ({
    environment:
      typeof search.environment === "string" && search.environment.length <= 512
        ? search.environment
        : undefined,
  }),
  component: OfficeWorkspace,
});
