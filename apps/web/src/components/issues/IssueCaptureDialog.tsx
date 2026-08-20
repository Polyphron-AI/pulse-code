import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  IssueCaptureMedia,
  IssueCaptureResult,
  IssueSeverity,
  PreviewAnnotationPayload,
  ProjectId,
} from "@t3tools/contracts";
import {
  CameraIcon,
  CircleAlertIcon,
  CircleDotIcon,
  FileVideoIcon,
  LoaderCircleIcon,
  PaperclipIcon,
} from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { issueEnvironment } from "~/state/issues";
import { useAtomCommand } from "~/state/use-atom-command";

import { ISSUE_SEVERITIES, ISSUE_SEVERITY_PRESENTATION } from "./issuePresentation";

export function issueCaptureOrigin(pageUrl: string): string | null {
  try {
    const url = new URL(pageUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

export function annotationCaptureMetadata(annotation: PreviewAnnotationPayload | null): unknown {
  if (!annotation) return undefined;
  return {
    annotation: {
      ...annotation,
      screenshot: annotation.screenshot
        ? {
            width: annotation.screenshot.width,
            height: annotation.screenshot.height,
            cropRect: annotation.screenshot.cropRect,
          }
        : null,
    },
  };
}

function mediaLabel(media: IssueCaptureMedia): string {
  if (media.kind === "video") return "Preview recording";
  if (media.source === "data-url") return "Annotated screenshot";
  return "Preview screenshot";
}

export function IssueCaptureDialog({
  open,
  onOpenChange,
  environmentId,
  projectId,
  pageUrl,
  pageTitle,
  annotation,
  initialMedia,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  environmentId: EnvironmentId;
  projectId: ProjectId;
  pageUrl: string;
  pageTitle: string | null;
  annotation: PreviewAnnotationPayload | null;
  initialMedia: readonly IssueCaptureMedia[];
  onCreated: (result: IssueCaptureResult) => void;
}) {
  const [title, setTitle] = useState(
    () => annotation?.comment.trim() || pageTitle || "Preview issue",
  );
  const [description, setDescription] = useState(() => annotation?.comment ?? "");
  const [severity, setSeverity] = useState<IssueSeverity>("medium");
  const [labels, setLabels] = useState("");
  const [media, setMedia] = useState<readonly IssueCaptureMedia[]>(initialMedia);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; requiredOrigin?: string } | null>(null);
  const capture = useAtomCommand(issueEnvironment.capture, { reportFailure: false });
  const origin = issueCaptureOrigin(pageUrl);

  const submit = async () => {
    if (pending || !origin || !title.trim()) return;
    setPending(true);
    setError(null);
    const result = await capture({
      environmentId,
      input: {
        projectId,
        origin,
        title: title.trim(),
        description,
        severity,
        kind: annotation ? "annotation" : "preview",
        pageUrl,
        ...(pageTitle ? { pageTitle } : {}),
        environment: {
          userAgent: typeof navigator === "undefined" ? null : navigator.userAgent,
          viewport:
            typeof window === "undefined"
              ? null
              : {
                  width: window.innerWidth,
                  height: window.innerHeight,
                  pixelRatio: window.devicePixelRatio,
                },
        },
        pageMetadata: annotationCaptureMetadata(annotation),
        ...(media.length > 0 ? { media: [...media] } : {}),
        ...(labels.trim()
          ? {
              labels: labels
                .split(",")
                .map((label) => label.trim())
                .filter(Boolean),
            }
          : {}),
      },
    });
    setPending(false);
    if (result._tag === "Failure") {
      const failure = squashAtomCommandFailure(result);
      const message =
        failure &&
        typeof failure === "object" &&
        "detail" in failure &&
        typeof failure.detail === "string"
          ? failure.detail
          : failure instanceof Error
            ? failure.message
            : "Pulse could not file this Issue.";
      const requiredOrigin =
        failure &&
        typeof failure === "object" &&
        "requiredOrigin" in failure &&
        typeof failure.requiredOrigin === "string"
          ? failure.requiredOrigin
          : undefined;
      setError({ message, ...(requiredOrigin ? { requiredOrigin } : {}) });
      return;
    }
    onCreated(result.value);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={pending ? undefined : onOpenChange}>
      <DialogPopup className="max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CircleDotIcon className="size-5 text-orange-500" /> File issue
          </DialogTitle>
          <DialogDescription>
            Review what Pulse Code will send. The Report is captured in Pulse and its Issue opens
            here as a native tab.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          {!origin ? (
            <Alert variant="error">
              <CircleAlertIcon />
              <AlertTitle>This page has no reportable origin</AlertTitle>
              <AlertDescription>
                Open an HTTP or HTTPS page before filing an Issue.
              </AlertDescription>
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="error">
              <CircleAlertIcon />
              <AlertTitle>Issue not filed — your evidence is still here</AlertTitle>
              <AlertDescription>
                <span>{error.message}</span>
                {error.requiredOrigin ? (
                  <code className="w-fit rounded bg-background/70 px-1.5 py-0.5 text-xs">
                    Allow origin: {error.requiredOrigin}
                  </code>
                ) : null}
                <span>
                  Update Pulse or the project origin policy, then retry this same capture.
                </span>
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              Title
              <Input
                nativeInput
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
                maxLength={500}
                autoFocus
              />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              Severity
              <Select
                value={severity}
                onValueChange={(value) => setSeverity(value as IssueSeverity)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{ISSUE_SEVERITY_PRESENTATION[severity].label}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  {ISSUE_SEVERITIES.map((candidate) => (
                    <SelectItem key={candidate} value={candidate}>
                      {ISSUE_SEVERITY_PRESENTATION[candidate].label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </label>
          </div>
          <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
            Description
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.currentTarget.value)}
              placeholder="What happened, what did you expect, and how can it be reproduced?"
              className="min-h-28"
            />
          </label>
          <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
            Labels
            <Input
              nativeInput
              value={labels}
              onChange={(event) => setLabels(event.currentTarget.value)}
              placeholder="frontend, regression (comma-separated)"
            />
          </label>
          <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
            <div className="flex items-center gap-2 text-xs font-medium">
              <PaperclipIcon className="size-3.5 text-muted-foreground" /> Evidence
              <span className="ms-auto text-muted-foreground">{media.length} media</span>
            </div>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">{pageUrl}</p>
            {annotation ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Annotation metadata · {annotation.elements.length} elements ·{" "}
                {annotation.regions.length} regions · {annotation.strokes.length} strokes
              </p>
            ) : null}
            {media.length > 0 ? (
              <div className="mt-2 space-y-1.5">
                {media.map((item) => (
                  <div
                    key={item.kind}
                    className="flex items-center gap-2 rounded-lg bg-background/70 px-2.5 py-2 text-xs"
                  >
                    {item.kind === "video" ? (
                      <FileVideoIcon className="size-3.5" />
                    ) : (
                      <CameraIcon className="size-3.5" />
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {mediaLabel(item)} · {item.fileName}
                    </span>
                    <Button
                      size="xs"
                      variant="ghost-muted"
                      onClick={() =>
                        setMedia((current) => current.filter((entry) => entry !== item))
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                No media attached. Page and environment metadata will still be captured.
              </p>
            )}
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending || !origin || !title.trim()} onClick={() => void submit()}>
            {pending ? <LoaderCircleIcon className="animate-spin" /> : <CircleDotIcon />}
            {pending ? "Filing…" : error ? "Retry filing" : "File issue"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
