import type { IssueReport } from "@t3tools/contracts";
import {
  AudioLinesIcon,
  BracesIcon,
  CameraIcon,
  CircleAlertIcon,
  Globe2Icon,
  ListTreeIcon,
  MonitorIcon,
  NetworkIcon,
  TerminalSquareIcon,
  VideoIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "~/components/ui/badge";

import { compactUnknown, issueSeverityLabel } from "./issuePresentation";

function EvidenceSection({
  icon,
  title,
  count,
  children,
}: {
  icon: ReactNode;
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/60 bg-card/30">
      <div className="flex h-9 items-center gap-2 border-b border-border/50 px-3 text-xs font-medium">
        <span className="text-muted-foreground [&>svg]:size-3.5">{icon}</span>
        {title}
        {count !== undefined ? (
          <span className="ms-auto tabular-nums text-muted-foreground">{count}</span>
        ) : null}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function StructuredEntries({ entries }: { entries: readonly unknown[] }) {
  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground">Nothing captured.</p>;
  }
  const occurrences = new Map<string, number>();
  const keyedEntries = entries.map((entry) => {
    const value = compactUnknown(entry);
    const occurrence = occurrences.get(value) ?? 0;
    occurrences.set(value, occurrence + 1);
    return { key: `${stableEvidenceHash(value)}:${occurrence}`, value };
  });
  return (
    <div className="space-y-2">
      {keyedEntries.map((entry) => (
        <pre
          key={entry.key}
          className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/45 p-2.5 font-mono text-[11px] leading-relaxed"
        >
          {entry.value}
        </pre>
      ))}
    </div>
  );
}

function stableEvidenceHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

export function IssueEvidence({ report }: { report: IssueReport }) {
  const screenshot = report.annotatedScreenshotUrl ?? report.screenshotUrl;
  const mediaCount = [screenshot, report.audioUrl, report.videoUrl].filter(Boolean).length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">{report.kind || "Report"}</Badge>
        <Badge variant="outline">{issueSeverityLabel(report.severity)}</Badge>
        {report.status ? <Badge variant="info">{report.status.replaceAll("_", " ")}</Badge> : null}
        {report.duplicateOfId ? (
          <Badge variant="warning">Duplicate of {report.duplicateOfId}</Badge>
        ) : null}
      </div>

      {mediaCount > 0 ? (
        <EvidenceSection icon={<CameraIcon />} title="Captured media" count={mediaCount}>
          <div className="grid gap-3 @lg/issue-detail:grid-cols-2">
            {screenshot ? (
              <a href={screenshot} target="_blank" rel="noreferrer" className="group block">
                <img
                  src={screenshot}
                  alt="Captured report screenshot"
                  className="max-h-[30rem] w-full rounded-lg border border-border/60 object-contain group-hover:border-ring/50"
                />
              </a>
            ) : null}
            {report.videoUrl ? (
              <div className="rounded-lg border border-border/60 bg-muted/20 p-2">
                <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <VideoIcon className="size-3.5" /> Video
                </p>
                <video src={report.videoUrl} controls className="max-h-80 w-full rounded-md" />
              </div>
            ) : null}
            {report.audioUrl ? (
              <div className="rounded-lg border border-border/60 bg-muted/20 p-2 @lg/issue-detail:col-span-2">
                <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <AudioLinesIcon className="size-3.5" /> Audio
                </p>
                <audio src={report.audioUrl} controls className="w-full" />
              </div>
            ) : null}
          </div>
        </EvidenceSection>
      ) : null}

      {report.description ? (
        <EvidenceSection icon={<MonitorIcon />} title="Description">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{report.description}</p>
        </EvidenceSection>
      ) : null}

      <div className="grid gap-3 @xl/issue-detail:grid-cols-2">
        <EvidenceSection
          icon={<CircleAlertIcon />}
          title="Errors and stack traces"
          count={report.errors.length}
        >
          <StructuredEntries entries={report.errors} />
        </EvidenceSection>
        <EvidenceSection
          icon={<TerminalSquareIcon />}
          title="Console"
          count={report.consoleEntries.length}
        >
          <StructuredEntries entries={report.consoleEntries} />
        </EvidenceSection>
        <EvidenceSection
          icon={<NetworkIcon />}
          title="Network"
          count={report.networkEntries.length}
        >
          <StructuredEntries entries={report.networkEntries} />
        </EvidenceSection>
        <EvidenceSection
          icon={<ListTreeIcon />}
          title="Breadcrumbs"
          count={report.breadcrumbs.length}
        >
          <StructuredEntries entries={report.breadcrumbs} />
        </EvidenceSection>
      </div>

      <div className="grid gap-3 @xl/issue-detail:grid-cols-2">
        <EvidenceSection icon={<Globe2Icon />} title="Environment">
          <pre className="overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">
            {compactUnknown(report.environment)}
          </pre>
        </EvidenceSection>
        <EvidenceSection icon={<BracesIcon />} title="Page and backend context">
          <pre className="overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">
            {compactUnknown({ page: report.pageMetadata, backend: report.backendContext })}
          </pre>
        </EvidenceSection>
      </div>
    </div>
  );
}
