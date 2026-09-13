import type { PulseMcpConnection, PulseMcpConnectionInput } from "@t3tools/contracts";
import {
  AlertCircleIcon,
  GlobeIcon,
  PencilIcon,
  PlusIcon,
  TerminalIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import {
  connectionInputFromDraft,
  draftFromConnection,
  emptyConnectionDraft,
  type ConnectionDraft,
  type ValueDraft,
  validateConnectionDraft,
} from "./mcpForm";

type Result = { readonly ok: true } | { readonly ok: false; readonly error: string };

export function McpConnectionsPanel({
  environmentKey,
  connections,
  disabled = false,
  upsert,
  remove,
}: {
  readonly environmentKey: string;
  readonly connections: ReadonlyArray<PulseMcpConnection>;
  readonly disabled?: boolean;
  readonly upsert: (environmentKey: string, input: PulseMcpConnectionInput) => Promise<void>;
  readonly remove: (environmentKey: string, id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState<PulseMcpConnection | "new" | null>(null);
  const [removing, setRemoving] = useState<PulseMcpConnection | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const environmentRef = useRef(environmentKey);
  if (environmentRef.current !== environmentKey) {
    environmentRef.current = environmentKey;
    generation.current += 1;
  }
  useEffect(() => {
    generation.current += 1;
    setEditing(null);
    setRemoving(null);
    setPending(false);
    setError(null);
  }, [disabled, environmentKey]);

  const run = async (operation: () => Promise<void>): Promise<Result> => {
    if (disabled) return { ok: false, error: "MCP connections are read-only." };
    const capturedEnvironment = environmentKey;
    const capturedGeneration = generation.current;
    setPending(true);
    setError(null);
    try {
      await operation();
      if (
        capturedEnvironment !== environmentRef.current ||
        capturedGeneration !== generation.current
      ) {
        return { ok: false, error: "The environment changed before this operation finished." };
      }
      return { ok: true };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The MCP connection change failed.";
      if (
        capturedEnvironment === environmentRef.current &&
        capturedGeneration === generation.current
      )
        setError(message);
      return { ok: false, error: message };
    } finally {
      if (
        capturedEnvironment === environmentRef.current &&
        capturedGeneration === generation.current
      )
        setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl space-y-1">
          <h2 className="text-base font-semibold tracking-[-0.01em]">MCP connections</h2>
          <p className="text-[13px] leading-[1.45] text-muted-foreground">
            Store connection details on this environment. Saving here does not apply a connection to
            a provider or run any tool.
          </p>
        </div>
        <Button size="sm" disabled={disabled || pending} onClick={() => setEditing("new")}>
          <PlusIcon />
          Add connection
        </Button>
      </div>
      {disabled ? (
        <p className="text-xs text-muted-foreground">
          You can view these connections, but this session cannot change them.
        </p>
      ) : null}
      {error ? (
        <Alert variant="error">
          <AlertCircleIcon />
          <AlertTitle>Connection change failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {connections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-5 py-8 text-center">
          <p className="text-sm font-medium">No managed MCP connections</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Add an HTTP endpoint or a command that runs on this environment.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60 bg-card/40">
          {connections.map((connection) => (
            <div
              key={connection.id}
              className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {connection.config.transport === "http" ? (
                    <GlobeIcon className="size-4 text-muted-foreground" />
                  ) : (
                    <TerminalIcon className="size-4 text-muted-foreground" />
                  )}
                  <p className="truncate text-sm font-medium">{connection.name}</p>
                  <Badge variant="outline">{connection.config.transport}</Badge>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {connection.id} ·{" "}
                  {connection.config.transport === "http"
                    ? connection.config.url
                    : connection.config.command}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  size="icon-xs"
                  variant="ghost-muted"
                  aria-label={`Edit ${connection.name}`}
                  disabled={disabled || pending}
                  onClick={() => setEditing(connection)}
                >
                  <PencilIcon />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost-muted"
                  aria-label={`Remove ${connection.name}`}
                  disabled={disabled || pending}
                  onClick={() => setRemoving(connection)}
                >
                  <Trash2Icon />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <ConnectionDialog
        key={`${environmentKey}:${editing === "new" ? "new" : (editing?.id ?? "closed")}`}
        target={editing}
        disabled={disabled || pending}
        existingIds={connections.map(({ id }) => id)}
        onClose={() => setEditing(null)}
        onSave={(input) => run(() => upsert(environmentKey, input))}
      />
      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove {removing?.name}?</DialogTitle>
            <DialogDescription>
              This removes its saved configuration and credentials from this environment.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={disabled || pending || !removing}
              onClick={() => {
                if (!removing) return;
                const target = removing;
                void run(() => remove(environmentKey, target.id)).then((result) => {
                  if (result.ok) setRemoving(null);
                });
              }}
            >
              Remove connection
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
}

function ConnectionDialog({
  target,
  disabled,
  existingIds,
  onClose,
  onSave,
}: {
  readonly target: PulseMcpConnection | "new" | null;
  readonly disabled: boolean;
  readonly existingIds: ReadonlyArray<string>;
  readonly onClose: () => void;
  readonly onSave: (input: PulseMcpConnectionInput) => Promise<Result>;
}) {
  const [draft, setDraft] = useState<ConnectionDraft>(() =>
    target && target !== "new" ? draftFromConnection(target) : emptyConnectionDraft(),
  );
  const [error, setError] = useState<string | null>(null);
  const fieldPrefix = useId();
  const set = <K extends keyof ConnectionDraft>(key: K, value: ConnectionDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => {
    const issue = validateConnectionDraft(draft);
    if (issue) return setError(issue);
    if (target === "new" && existingIds.includes(draft.id.trim())) {
      return setError("A connection with this ID already exists. Edit the existing connection.");
    }
    setError(null);
    const result = await onSave(connectionInputFromDraft(draft));
    if (result.ok) onClose();
    else setError(result.error);
  };
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogPopup className="max-h-[min(42rem,calc(100dvh-2rem))] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {target === "new" ? "Add MCP connection" : "Edit MCP connection"}
          </DialogTitle>
          <DialogDescription>
            Commands run on the selected environment, not on this browser device. This form never
            tests or starts the connection.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ID" htmlFor={`${fieldPrefix}-id`}>
              <Input
                id={`${fieldPrefix}-id`}
                value={draft.id}
                disabled={disabled || target !== "new"}
                onChange={(event) => set("id", event.target.value)}
              />
            </Field>
            <Field label="Name" htmlFor={`${fieldPrefix}-name`}>
              <Input
                id={`${fieldPrefix}-name`}
                value={draft.name}
                disabled={disabled}
                onChange={(event) => set("name", event.target.value)}
              />
            </Field>
          </div>
          <Field label="Transport" htmlFor={`${fieldPrefix}-transport`}>
            <Select
              value={draft.transport}
              disabled={disabled || target !== "new"}
              onValueChange={(value) => value && set("transport", value as "http" | "stdio")}
            >
              <SelectTrigger id={`${fieldPrefix}-transport`} className="w-full">
                <SelectValue>{draft.transport === "http" ? "HTTP" : "stdio"}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                <SelectItem value="http">HTTP</SelectItem>
                <SelectItem value="stdio">stdio</SelectItem>
              </SelectPopup>
            </Select>
          </Field>
          {draft.transport === "http" ? (
            <Field label="URL" htmlFor={`${fieldPrefix}-url`}>
              <Input
                id={`${fieldPrefix}-url`}
                type="url"
                value={draft.url}
                disabled={disabled}
                placeholder="https://example.com/mcp"
                onChange={(event) => set("url", event.target.value)}
              />
            </Field>
          ) : (
            <>
              <Field label="Command" htmlFor={`${fieldPrefix}-command`}>
                <Input
                  id={`${fieldPrefix}-command`}
                  value={draft.command}
                  disabled={disabled}
                  placeholder="npx"
                  onChange={(event) => set("command", event.target.value)}
                />
              </Field>
              <Field
                label="Arguments"
                hint='JSON string array, for example ["-y", "server"]'
                htmlFor={`${fieldPrefix}-args`}
              >
                <Textarea
                  id={`${fieldPrefix}-args`}
                  value={draft.args}
                  disabled={disabled}
                  onChange={(event) => set("args", event.target.value)}
                />
              </Field>
              <Field label="Working directory" hint="Optional" htmlFor={`${fieldPrefix}-cwd`}>
                <Input
                  id={`${fieldPrefix}-cwd`}
                  value={draft.cwd}
                  disabled={disabled}
                  onChange={(event) => set("cwd", event.target.value)}
                />
              </Field>
            </>
          )}
          <ValuesEditor
            label={draft.transport === "http" ? "Headers" : "Environment variables"}
            values={draft.values}
            disabled={disabled}
            onChange={(values) => set("values", values)}
          />
          {error ? <p className="text-sm text-error-foreground">{error}</p> : null}
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" disabled={disabled} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={disabled} onClick={() => void save()}>
            Save connection
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly htmlFor: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ValuesEditor({
  label,
  values,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly values: ReadonlyArray<ValueDraft>;
  readonly disabled: boolean;
  readonly onChange: (values: ReadonlyArray<ValueDraft>) => void;
}) {
  const update = (index: number, change: Partial<ValueDraft>) =>
    onChange(
      values.map((value, candidate) => (candidate === index ? { ...value, ...change } : value)),
    );
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button
          size="xs"
          variant="outline"
          disabled={disabled}
          onClick={() =>
            onChange([
              ...values,
              {
                key: "",
                kind: "literal",
                value: "",
                configuredSecret: false,
                replaceSecret: false,
              },
            ])
          }
        >
          Add row
        </Button>
      </div>
      {values.map((value, index) => (
        <div
          key={index}
          className="grid gap-2 rounded-lg border border-border/60 p-2 sm:grid-cols-[1fr_8rem_1fr_auto]"
        >
          <Input
            aria-label={`${label} name ${index + 1}`}
            value={value.key}
            disabled={disabled}
            placeholder="Name"
            onChange={(event) => update(index, { key: event.target.value })}
          />
          <Select
            value={value.kind}
            disabled={disabled || value.configuredSecret}
            onValueChange={(kind) =>
              kind && update(index, { kind: kind as "literal" | "secret", value: "" })
            }
          >
            <SelectTrigger>
              <SelectValue>{value.kind === "secret" ? "Secret" : "Plain text"}</SelectValue>
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value="literal">Plain text</SelectItem>
              <SelectItem value="secret">Secret</SelectItem>
            </SelectPopup>
          </Select>
          {value.kind === "secret" && value.configuredSecret && !value.replaceSecret ? (
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => update(index, { replaceSecret: true, value: "" })}
            >
              Replace secret
            </Button>
          ) : (
            <Input
              aria-label={`${label} value ${index + 1}`}
              type={value.kind === "secret" ? "password" : "text"}
              value={value.value}
              disabled={disabled}
              placeholder={value.kind === "secret" ? "Secret value" : "Value"}
              onChange={(event) => update(index, { value: event.target.value })}
            />
          )}
          <Button
            size="icon-xs"
            variant="ghost-muted"
            disabled={disabled}
            aria-label={`Remove ${label.toLowerCase()} row ${index + 1}`}
            onClick={() => onChange(values.filter((_, candidate) => candidate !== index))}
          >
            <Trash2Icon />
          </Button>
        </div>
      ))}
    </div>
  );
}
