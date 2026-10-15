import { createFileRoute } from "@tanstack/react-router";

import { MailAccountsSettingsPanel } from "../mail/MailAccountsSettings";

export const Route = createFileRoute("/settings/email")({
  component: MailAccountsSettingsPanel,
});
