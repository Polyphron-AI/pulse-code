import { Link } from "@tanstack/react-router";
import { useSettingsScope } from "./SettingsScopeContext";
import { serverEnvironment } from "../../state/server";
import { useEnvironmentQuery } from "../../state/query";

/** Account setup always opens the environment selected in Settings. */
export function CommunicationsSettings() {
  const { scope, environment } = useSettingsScope();
  const environmentId =
    scope.kind !== "all" && scope.kind !== "unavailable" ? scope.environmentId : null;
  const config = useEnvironmentQuery(
    environmentId ? serverEnvironment.configProjection({ environmentId, input: {} }) : null,
  );
  const supported =
    !config.error &&
    config.data?.source === "live" &&
    config.data.config.pulseCapabilities?.communicationsSlackRead === true;
  return (
    <div className="space-y-3 p-3 sm:p-4">
      <p className="text-sm text-muted-foreground">
        Read Slack conversations and save exact message references. Server credentials stay in the
        selected environment. Desktop accounts stay on that computer.
      </p>
      {environmentId ? (
        <>
          <p className="text-sm text-muted-foreground">
            Source: {environment?.environmentId === environmentId ? environment.label : scope.label}
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            {supported ? (
              <Link
                className="underline underline-offset-4"
                to="/workspace"
                search={{
                  space: "communications",
                  environment: environmentId,
                  communicationProvider: "slack",
                  communicationSource: "server",
                }}
              >
                Manage server Slack accounts
              </Link>
            ) : (
              <p>Slack reading is unavailable in this environment.</p>
            )}
            <Link
              className="underline underline-offset-4"
              to="/workspace"
              search={{
                space: "communications",
                environment: environmentId,
                communicationSource: "desktop",
              }}
            >
              Open desktop accounts
            </Link>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Choose one environment in Settings to open its communications accounts.
        </p>
      )}
    </div>
  );
}
