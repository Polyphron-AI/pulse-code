import { APP_DISPLAY_NAME } from "../../branding";
import { useInstallPrompt } from "../../pwa/installPrompt";
import { toastManager } from "../ui/toast";
import { Button } from "../ui/button";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

/**
 * The install affordance for the browser surfaces. Renders nothing where
 * installing is not a thing the user can do — the desktop shell, and browsers
 * that neither defer a prompt nor have a Home Screen menu — so the row never
 * advertises an action that leads nowhere.
 */
export function InstallAppRow() {
  const { availability, promptInstall } = useInstallPrompt();

  if (availability === "unsupported") return null;

  return (
    <SettingsRow
      {...searchableSetting("install-app")}
      description={
        availability === "installed"
          ? `${APP_DISPLAY_NAME} is running as an installed app. It keeps working through a dropped connection and updates itself when you reload.`
          : availability === "manual"
            ? `Add ${APP_DISPLAY_NAME} to your Home Screen from the browser's Share menu. Installing is also what lets Safari deliver notifications.`
            : `Install ${APP_DISPLAY_NAME} as its own app, with no address bar and its own window.`
      }
      status={availability === "manual" ? "Share -> Add to Home Screen" : undefined}
      control={
        availability === "prompt" ? (
          <Button
            size="xs"
            onClick={() => {
              void promptInstall().then((outcome) => {
                if (outcome !== "unavailable") return;
                toastManager.add({
                  type: "error",
                  title: "Could not start the install",
                  description: "Use your browser's install option from the address bar instead.",
                });
              });
            }}
          >
            Install
          </Button>
        ) : availability === "installed" ? (
          <span className="text-xs text-muted-foreground">Installed</span>
        ) : undefined
      }
    />
  );
}
