import { useState } from "react";
import * as Schema from "effect/Schema";
import {
  McpConnection,
  McpServerId,
  supportsThreadMcp,
  type EnvironmentId,
  type McpServer,
  type ProviderInstanceId,
} from "@t3tools/contracts";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { useAtomCommand } from "../../state/use-atom-command";
import { serverEnvironment } from "../../state/server";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Switch } from "../ui/switch";
import { Dialog, DialogPopup, DialogTitle, DialogDescription } from "../ui/dialog";
import { SettingsSection } from "./settingsLayout";

const decodeConnection = Schema.decodeUnknownSync(McpConnection);
const decodeServerId = Schema.decodeUnknownSync(McpServerId);

export function parseMcpConnection(text: string): McpConnection {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Enter an MCP connection object.");
  let record = parsed as Record<string, unknown>;
  if (record.mcpServers && typeof record.mcpServers === "object") {
    const servers = Object.values(record.mcpServers);
    if (servers.length !== 1) throw new Error("Add one MCP server at a time.");
    const value: unknown = servers[0];
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Enter an MCP connection object.");
    record = value as Record<string, unknown>;
  }
  return decodeConnection({
    ...record,
    type: record.type ?? (record.command ? "stdio" : "http"),
  });
}

export function McpSettingsPanel({
  environmentId,
  readOnly = false,
}: {
  environmentId: EnvironmentId;
  readOnly?: boolean;
}) {
  const settings = useEnvironmentSettings(environmentId);
  const persist = useAtomCommand(serverEnvironment.updateSettings);
  const providers: Record<string, { driver: string; displayName?: string | undefined }> = {
    ...Object.fromEntries(
      Object.keys(settings.providers).map((driver) => [
        driver,
        {
          driver,
          displayName:
            driver === "claudeAgent" ? "Claude" : driver[0]!.toUpperCase() + driver.slice(1),
        },
      ]),
    ),
    ...settings.providerInstances,
  };
  const [editing, setEditing] = useState<string | null>(null);
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [connection, setConnection] = useState("");
  const [defaults, setDefaults] = useState<ReadonlyArray<ProviderInstanceId>>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const openEditor = (key: string, server?: McpServer) => {
    setEditing(key);
    setId(key);
    setName(server?.name ?? "");
    setConnection("");
    setDefaults(server?.defaultProviders ?? []);
    setError(null);
  };
  const save = async (remove = false) => {
    setError(null);
    const key = id.trim();
    let nextServer: McpServer;
    try {
      decodeServerId(key);
      if (!remove && !name.trim()) throw new Error("Name is required.");
      if (editing === "" && settings.mcpServers[key]) throw new Error("Use a unique server ID.");
      const previous = settings.mcpServers[key];
      if (!remove && !connection.trim() && !previous) throw new Error("Connection is required.");
      nextServer = {
        name: name.trim(),
        defaultProviders: defaults,
        ...(connection.trim()
          ? { connection: parseMcpConnection(connection) }
          : previous?.connectionRedacted
            ? { connectionRedacted: true }
            : {}),
      };
    } catch {
      setError(
        "Enter a name, a unique ID using letters, numbers or dashes, and valid connection JSON. Existing connections can be left blank.",
      );
      return;
    }
    const next = { ...settings.mcpServers };
    if (remove) delete next[key];
    else next[key] = nextServer;
    setSaving(true);
    try {
      const result = await persist({
        environmentId,
        input: {
          patch: {
            mcpServers: next,
            ...(remove
              ? {
                  threadMcpOverrides: Object.fromEntries(
                    Object.entries(settings.threadMcpOverrides)
                      .filter(([, choices]) => key in choices)
                      .map(([thread]) => [thread, { [key]: null }]),
                  ),
                }
              : {}),
          },
        },
      });
      if (result._tag === "Failure") {
        setError("Could not save MCP settings. Check the environment connection and try again.");
        return;
      }
      setEditing(null);
      setConnection("");
    } catch {
      setError("Could not save MCP settings. Check the environment connection and try again.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <SettingsSection
      title="MCP connections"
      headerAction={
        <Button size="sm" variant="outline" disabled={readOnly} onClick={() => openEditor("")}>
          Add MCP
        </Button>
      }
    >
      <p className="text-sm text-muted-foreground">
        Save connections here, then turn them on from a thread?s MCP menu. Always available
        connections are enabled by default for the providers you choose.
      </p>
      <div className="divide-y divide-border">
        {Object.entries(settings.mcpServers).map(([key, server]) => (
          <div key={key} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{server.name}</p>
              <p className="text-xs text-muted-foreground">
                {server.defaultProviders.length
                  ? `Always available for ${server.defaultProviders.map((id) => settings.providerInstances[id]?.displayName ?? id).join(", ")}`
                  : "Activate per thread"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={readOnly}
              onClick={() => openEditor(key, server)}
            >
              Edit
            </Button>
          </div>
        ))}
        {!Object.keys(settings.mcpServers).length && (
          <p className="py-3 text-sm text-muted-foreground">No MCP connections yet.</p>
        )}
      </div>
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setEditing(null);
            setConnection("");
          }
        }}
      >
        <DialogPopup className="max-w-lg">
          <DialogTitle>{editing ? "Edit MCP" : "Add MCP"}</DialogTitle>
          <DialogDescription>
            Connections run in the selected environment. Changes apply before the next turn; active
            work continues.
          </DialogDescription>
          <div className="space-y-4 py-4">
            <label className="grid gap-1 text-sm">
              Name
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="TechTraders"
                disabled={saving}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Server ID
              <Input
                value={id}
                onChange={(event) => setId(event.target.value)}
                placeholder="techtraders"
                disabled={saving || Boolean(editing)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Connection JSON
              <Textarea
                value={connection}
                onChange={(event) => setConnection(event.target.value)}
                rows={7}
                spellCheck={false}
                autoComplete="off"
                className="font-mono text-xs"
                placeholder={
                  editing
                    ? "Leave blank to keep the saved connection"
                    : '{"url":"https://example.com/mcp","headers":{"Authorization":"Bearer ..."}}'
                }
                disabled={saving}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Accepts an HTTP URL and headers, or a command, args and env. You can paste a
              single-server mcpServers config. Saved credentials are hidden.
            </p>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">Always available</legend>
              {Object.entries(providers)
                .filter(([, provider]) => supportsThreadMcp(provider.driver))
                .map(([key, provider]) => (
                  <label key={key} className="flex items-center justify-between gap-3 text-sm">
                    <span>{provider.displayName ?? key}</span>
                    <Switch
                      disabled={saving}
                      checked={defaults.some((value) => value === key)}
                      onCheckedChange={(checked) =>
                        setDefaults(
                          checked
                            ? [...defaults, key as ProviderInstanceId]
                            : defaults.filter((value) => value !== key),
                        )
                      }
                    />
                  </label>
                ))}
            </fieldset>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              {editing && (
                <Button variant="destructive" disabled={saving} onClick={() => void save(true)}>
                  Remove MCP
                </Button>
              )}
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => {
                  setEditing(null);
                  setConnection("");
                }}
              >
                Cancel
              </Button>
              <Button disabled={saving} onClick={() => void save()}>
                {saving ? "Saving?" : "Save MCP"}
              </Button>
            </div>
          </div>
        </DialogPopup>
      </Dialog>
    </SettingsSection>
  );
}
