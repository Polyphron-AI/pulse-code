import { createFileRoute } from "@tanstack/react-router";
import { MailWorkspace } from "../components/mail/MailWorkspace";
import { parseMailSearch } from "../components/mail/mailNavigation";

export const Route = createFileRoute("/_chat/mail")({
  validateSearch: parseMailSearch,
  component: MailWorkspace,
});
