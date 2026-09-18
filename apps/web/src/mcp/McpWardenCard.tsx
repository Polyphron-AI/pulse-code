import type { EnvironmentId, PulseMcpWardenSettings } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useEffect, useId, useState } from "react";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useEnvironmentQuery } from "../state/query";
import { useAtomCommand } from "../state/use-atom-command";
import { pulseMcpWardenSettings, setPulseMcpWarden, testPulseMcpWarden } from "./mcpState";
import {
  describeWardenError,
  wardenDraftFromSettings,
  wardenInputFromDraft,
} from "./mcpWardenForm";

export function McpWardenCard({
  environmentId,
  disabled,
  onSaved,
}: {
  readonly environmentId: EnvironmentId;
  readonly disabled: boolean;
  /** Credentials pickers re-fetch after the origin or token changes. */
  readonly onSaved: () => void;
}) {
  const fieldPrefix = useId();
  const settings = useEnvironmentQuery(pulseMcpWardenSettings({ environmentId, input: {} }));
  const save = useAtomCommand(setPulseMcpWarden, { reportFailure: false });
  const test = useAtomCommand(testPulseMcpWarden, { reportFailure: false });
  const [draft, setDraft] = useState(() => wardenDraftFromSettings(null));
  const [pending, setPending] = useState<"save" | "clear" | "test" | null>(null);
  const [notice, setNotice] = useState<{
    readonly tone: "ok" | "error";
    readonly text: string;
  } | null>(null);
  const current: PulseMcpWardenSettings | null = settings.data;
  useEffect(() => {
    if (current) setDraft(wardenDraftFromSettings(current));
  }, [current]);

  const run = async (kind: "save" | "clear" | "test", operation: () => Promise<string>) => {
    setPending(kind);
    setNotice(null);
    try {
      setNotice({ tone: "ok", text: await operation() });
    } catch (cause) {
      setNotice({ tone: "error", text: describeWardenError(cause) });
    } finally {
      setPending(null);
    }
  };

  const persist = (clearPat: boolean) =>
    run(clearPat ? "clear" : "save", async () => {
      const result = await save({
        environmentId,
        input: wardenInputFromDraft(draft, current?.patConfigured === true, clearPat),
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      settings.refresh();
      onSaved();
      return clearPat ? "Token cleared." : "Warden settings saved.";
    });

  const patConfigured = current?.patConfigured === true;
  const showPatInput = !patConfigured || draft.replacePat;
  return (
    <section className="space-y-3 rounded-lg border border-border/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Pulse Go Warden</h3>
          <p className="text-[13px] leading-[1.45] text-muted-foreground">
            Release MCP credentials from Pulse Go at send time. The token stays on this environment.
          </p>
        </div>
        {current?.principal ? <Badge variant="outline">{current.principal.name}</Badge> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldPrefix}-origin`}>Pulse Go origin</Label>
          <Input
            id={`${fieldPrefix}-origin`}
            value={draft.origin}
            disabled={disabled || pending !== null}
            placeholder="https://go.example.com"
            onChange={(event) => setDraft({ ...draft, origin: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldPrefix}-pat`}>Personal access token</Label>
          {showPatInput ? (
            <Input
              id={`${fieldPrefix}-pat`}
              type="password"
              value={draft.pat}
              disabled={disabled || pending !== null}
              placeholder="Paste a Pulse Go PAT"
              onChange={(event) => setDraft({ ...draft, pat: event.target.value })}
            />
          ) : (
            <div className="flex items-center gap-2">
              <Badge variant="outline">Configured</Badge>
              <Button
                size="xs"
                variant="outline"
                disabled={disabled || pending !== null}
                onClick={() => setDraft({ ...draft, replacePat: true, pat: "" })}
              >
                Replace
              </Button>
              <Button
                size="xs"
                variant="ghost-muted"
                disabled={disabled || pending !== null}
                onClick={() => void persist(true)}
              >
                {pending === "clear" ? "Clearing…" : "Clear"}
              </Button>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={
            disabled || pending !== null || !draft.origin.trim() || (showPatInput && !draft.pat)
          }
          onClick={() => void persist(false)}
        >
          {pending === "save" ? "Saving…" : "Save"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || pending !== null || !patConfigured || !current?.origin}
          onClick={() =>
            void run("test", async () => {
              const result = await test({ environmentId, input: {} });
              if (result._tag === "Failure") throw squashAtomCommandFailure(result);
              settings.refresh();
              return `Connected as ${result.value.principal.name}.`;
            })
          }
        >
          {pending === "test" ? "Testing…" : "Test connection"}
        </Button>
        {notice ? (
          <p
            className={
              notice.tone === "error"
                ? "text-sm text-error-foreground"
                : "text-sm text-muted-foreground"
            }
          >
            {notice.text}
          </p>
        ) : null}
        {settings.error ? <p className="text-sm text-error-foreground">{settings.error}</p> : null}
      </div>
    </section>
  );
}
