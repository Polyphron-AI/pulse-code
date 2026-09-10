import { Link } from "@tanstack/react-router";
import { useClientSettings, useUpdateClientSettings } from "../../hooks/useSettings";
import { SettingsRow, SettingsSection } from "../settings/settingsLayout";
import { Switch } from "../ui/switch";
import { searchableSetting } from "../settings/settingsSearch";

export function MailAlphaSetting() {
  const enabled = useClientSettings((settings) => settings.mailAlphaEnabled);
  const update = useUpdateClientSettings();
  return (
    <SettingsSection id="mail" title="Mail · Alpha">
      <SettingsRow
        {...searchableSetting("mail-alpha")}
        description="Try the IMAP mailbox and SMTP composer. Mail is independent of your Stable or Nightly update track. Hiding it keeps accounts and saved drafts."
      >
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => update({ mailAlphaEnabled: checked })}
          aria-label="Show Mail alpha"
        />
      </SettingsRow>
      {enabled && (
        <Link className="text-sm text-primary underline underline-offset-4" to="/mail">
          Open Mail and connect an account
        </Link>
      )}
    </SettingsSection>
  );
}
