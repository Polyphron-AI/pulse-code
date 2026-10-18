import { DRIVE_FOLDER_MIME, type DriveBrowseInput, type DriveFile } from "@t3tools/contracts";
import { useId, useMemo, useState, type ReactNode } from "react";
import * as DateTime from "effect/DateTime";
import {
  ChevronRightIcon,
  ChevronDownIcon,
  FolderIcon,
  FileTextIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  ListIcon,
  Grid2X2Icon,
  MoreHorizontalIcon,
  UsersRoundIcon,
} from "lucide-react";
import { Button } from "../ui/button";

export interface ProjectDriveExplorerViewProps {
  readonly files: readonly DriveFile[];
  readonly linkedFileIds: ReadonlySet<string>;
  readonly breadcrumbs: readonly { fileId: string; title: string }[];
  readonly selectedFileId: string | null;
  readonly query: string;
  readonly filters: Pick<DriveBrowseInput, "type" | "owner" | "modifiedAfter" | "modifiedBefore">;
  readonly sort: DriveBrowseInput["sort"];
  readonly direction: DriveBrowseInput["direction"];
  readonly layout: "list" | "grid";
  readonly pending: boolean;
  readonly error: string | null;
  readonly unavailableReason: string | null;
  readonly incomplete: boolean;
  readonly hasMore: boolean;
  readonly sharingText: string;
  readonly canOperate: boolean;
  readonly onQueryChange: (value: string) => void;
  readonly onSearch: () => void;
  readonly onFiltersChange: (filters: ProjectDriveExplorerViewProps["filters"]) => void;
  readonly onSortChange: (
    sort: DriveBrowseInput["sort"],
    direction: DriveBrowseInput["direction"],
  ) => void;
  readonly onLayoutChange: (layout: "list" | "grid") => void;
  readonly onBrowse: (folderId: string) => void;
  readonly onOpen: (fileId: string) => void;
  readonly onFileMenu: (fileId: string) => void;
  readonly onRefresh: () => void;
  readonly onMore: () => void;
  readonly onOpenSettings: () => void;
  readonly picker: null | { onChoose: (fileId: string) => void; onCancel: () => void };
  readonly timeZone?: string;
  readonly locale?: string;
  readonly renderItem?: (file: DriveFile, row: ReactNode) => ReactNode;
  readonly pageLimitReached?: boolean;
}
const control =
  "relative inline-flex min-h-[22px] items-center justify-center gap-1 rounded-md border border-border bg-muted/30 px-1.75 text-2xs font-medium focus-within:outline-2 focus-within:outline-ring pointer-coarse:min-h-11 pointer-coarse:min-w-11";
const typeLabels = {
  folder: "Folders",
  document: "Google Docs",
  spreadsheet: "Google Sheets",
  presentation: "Google Slides",
  other: "Other files",
};
export function ProjectDriveExplorerView(p: ProjectDriveExplorerViewProps) {
  const description = useId();
  const [advanced, setAdvanced] = useState(false);
  const [draft, setDraft] = useState({ owner: "", after: "", before: "" });
  const [filterError, setFilterError] = useState<string | null>(null);
  const hasFilters = Boolean(
    p.query ||
    p.filters.type ||
    p.filters.owner ||
    p.filters.modifiedAfter ||
    p.filters.modifiedBefore,
  );
  const formatter = useMemo(() => {
    const options = { day: "numeric", month: "short" } as const;
    try {
      return new Intl.DateTimeFormat(p.locale, { ...options, timeZone: p.timeZone ?? "UTC" });
    } catch {
      return new Intl.DateTimeFormat(p.locale, { ...options, timeZone: "UTC" });
    }
  }, [p.locale, p.timeZone]);
  const date = (value: string | undefined) => (value ? formatter.format(new Date(value)) : "");
  const changeFilters = (next: {
    [K in keyof ProjectDriveExplorerViewProps["filters"]]?:
      | ProjectDriveExplorerViewProps["filters"][K]
      | undefined;
  }) =>
    p.onFiltersChange({
      ...(next.type ? { type: next.type } : {}),
      ...(next.owner ? { owner: next.owner } : {}),
      ...(next.modifiedAfter ? { modifiedAfter: next.modifiedAfter } : {}),
      ...(next.modifiedBefore ? { modifiedBefore: next.modifiedBefore } : {}),
    });
  const clear = () => {
    p.onQueryChange("");
    p.onFiltersChange({});
  };
  return (
    <section
      aria-label="Project Drive explorer"
      className="min-w-0 pointer-coarse:[&_button]:min-h-11 pointer-coarse:[&_button]:min-w-11 pointer-coarse:[&_input]:min-h-11"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          p.onSearch();
        }}
        className="relative flex h-7 items-center rounded-full pointer-coarse:min-h-11 bg-muted/40"
      >
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute left-3 size-3 text-muted-foreground"
        />
        <input
          type="search"
          aria-label="Search in Drive"
          aria-describedby={description}
          placeholder="Search in Drive"
          maxLength={256}
          value={p.query}
          onChange={(e) => p.onQueryChange(e.target.value)}
          className="h-full min-w-0 flex-1 rounded-full bg-transparent pl-7.25 pr-8 text-3xs outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:text-base"
        />
        <button
          type="button"
          aria-label="Drive filters"
          aria-expanded={advanced}
          onClick={() => {
            try {
              setDraft({
                owner: p.filters.owner && p.filters.owner !== "me" ? p.filters.owner : "",
                after: p.filters.modifiedAfter
                  ? DateTime.formatIsoDate(
                      DateTime.makeZonedUnsafe(p.filters.modifiedAfter, {
                        timeZone: p.timeZone ?? "UTC",
                      }),
                    )
                  : "",
                before: p.filters.modifiedBefore
                  ? DateTime.formatIsoDate(
                      DateTime.makeZonedUnsafe(p.filters.modifiedBefore, {
                        timeZone: p.timeZone ?? "UTC",
                      }),
                    )
                  : "",
              });
              setFilterError(null);
            } catch {
              setFilterError(
                "The workspace time zone is invalid. Choose a valid time zone in Settings.",
              );
            }
            setAdvanced(!advanced);
          }}
          className="absolute right-1 flex size-6 items-center justify-center text-muted-foreground pointer-coarse:min-h-11 pointer-coarse:min-w-11"
        >
          <SlidersHorizontalIcon className="size-3" />
        </button>
      </form>
      <span id={description} className="sr-only">
        Search names in this folder only.
      </span>
      <nav
        aria-label="Drive folder path"
        className="mt-[15px] flex min-h-[25px] min-w-0 items-center gap-2 overflow-x-auto text-2xs"
      >
        <button
          type="button"
          className="shrink-0 font-semibold pointer-coarse:min-h-11"
          onClick={() => p.breadcrumbs[0] && p.onBrowse(p.breadcrumbs[0].fileId)}
        >
          Project Drive
        </button>
        {p.breadcrumbs.map((crumb, index) => (
          <span key={crumb.fileId} className="flex min-w-0 items-center gap-2">
            <ChevronRightIcon
              aria-hidden="true"
              className="size-[9px] shrink-0 text-muted-foreground"
            />
            <button
              type="button"
              aria-label={
                index === p.breadcrumbs.length - 2 ? `Back to ${crumb.title}` : crumb.title
              }
              aria-current={index === p.breadcrumbs.length - 1 ? "page" : undefined}
              onClick={() => p.onBrowse(crumb.fileId)}
              className="max-w-40 truncate pointer-coarse:min-h-11"
            >
              {crumb.title}
            </button>
          </span>
        ))}
      </nav>
      <div className="mt-3 flex items-center gap-1.75">
        <label className={`${control} min-w-[52px]`}>
          <span aria-hidden="true">{p.filters.type ? typeLabels[p.filters.type] : "Type"}</span>
          <ChevronDownIcon aria-hidden="true" className="size-[9px]" />
          <select
            aria-label="Type"
            value={p.filters.type ?? ""}
            onChange={(e) =>
              changeFilters({
                ...p.filters,
                type: (e.target.value as DriveBrowseInput["type"]) || undefined,
              })
            }
            className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0 pointer-coarse:text-base"
          >
            <option value="">Type</option>
            <option value="folder">Folders</option>
            <option value="document">Google Docs</option>
            <option value="spreadsheet">Google Sheets</option>
            <option value="presentation">Google Slides</option>
            <option value="other">Other files</option>
          </select>
        </label>
        <label className={`${control} min-w-[62px]`}>
          <span aria-hidden="true">
            {p.filters.owner === "me" ? "Owned by me" : p.filters.owner ? "Owner email" : "People"}
          </span>
          <ChevronDownIcon aria-hidden="true" className="size-[9px]" />
          <select
            aria-label="People"
            value={p.filters.owner === "me" ? "me" : p.filters.owner ? "email" : ""}
            onChange={(e) => {
              if (e.target.value === "email") setAdvanced(true);
              else changeFilters({ ...p.filters, owner: e.target.value || undefined });
            }}
            className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0 pointer-coarse:text-base"
          >
            <option value="">People</option>
            <option value="me">Owned by connected account</option>
            <option value="email">Owner email</option>
          </select>
        </label>
        <div className="ml-auto flex items-center gap-1">
          {(["list", "grid"] as const).map((layout) => (
            <button
              type="button"
              key={layout}
              aria-label={layout === "list" ? "List view" : "Grid view"}
              aria-pressed={p.layout === layout}
              className={`flex size-4 items-center justify-center pointer-coarse:min-h-11 pointer-coarse:min-w-11 ${p.layout === layout ? "text-primary" : "text-muted-foreground"}`}
              onClick={() => p.onLayoutChange(layout)}
            >
              {layout === "list" ? (
                <ListIcon className="size-3" />
              ) : (
                <Grid2X2Icon className="size-3" />
              )}
            </button>
          ))}
        </div>
      </div>
      {advanced ? (
        <form
          aria-label="Drive filters"
          className="mt-3 space-y-2 rounded-md border border-border p-3 text-xs"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              if (draft.owner && !/^[^\s@,;'"\\]+@[^\s@,;'"\\]+\.[^\s@,;'"\\]+$/.test(draft.owner))
                throw new Error("Enter one owner email.");
              const bound = (day: string) =>
                day
                  ? DateTime.formatIso(
                      DateTime.makeZonedUnsafe(`${day}T00:00:00Z`, {
                        timeZone: p.timeZone ?? "UTC",
                        adjustForTimeZone: true,
                      }),
                    )
                  : undefined;
              const modifiedAfter = bound(draft.after),
                modifiedBefore = bound(draft.before);
              if (modifiedAfter && modifiedBefore && modifiedAfter >= modifiedBefore)
                throw new Error("Use an end date after the start date.");
              changeFilters({
                ...p.filters,
                owner: draft.owner || (p.filters.owner === "me" ? "me" : undefined),
                modifiedAfter,
                modifiedBefore,
              });
              setAdvanced(false);
            } catch (error) {
              setFilterError(error instanceof Error ? error.message : "Use valid filter dates.");
            }
          }}
        >
          <p>People filters by file owner, not sharing access.</p>
          <label className="block">
            Owner email
            <input
              type="email"
              aria-label="Owner email"
              value={draft.owner}
              maxLength={256}
              onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
              className="block w-full min-w-0 rounded border border-input bg-background p-2 pointer-coarse:text-base"
            />
          </label>
          <label className="block">
            Modified on or after
            <input
              aria-label="Modified on or after"
              type="date"
              value={draft.after}
              onChange={(e) => setDraft({ ...draft, after: e.target.value })}
              className="block w-full min-w-0 rounded border border-input bg-background p-2 pointer-coarse:text-base"
            />
          </label>
          <label className="block">
            Modified before
            <input
              aria-label="Modified before"
              type="date"
              value={draft.before}
              onChange={(e) => setDraft({ ...draft, before: e.target.value })}
              className="block w-full min-w-0 rounded border border-input bg-background p-2 pointer-coarse:text-base"
            />
          </label>
          <p>Dates use {p.timeZone ?? "UTC"}.</p>
          {filterError ? (
            <p role="alert" className="break-words text-destructive">
              {filterError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" type="submit">
              Apply filters
            </Button>
            <Button size="sm" variant="outline" type="button" onClick={clear}>
              Reset filters
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setAdvanced(false)}>
              Cancel filters
            </Button>
          </div>
        </form>
      ) : null}
      <div className="mt-[13px] flex h-[27px] pointer-coarse:h-auto pointer-coarse:min-h-11 items-start pt-1 justify-between border-b border-border/50 px-1.5 text-3xs text-muted-foreground">
        <span>
          <button
            type="button"
            aria-label={`Sort by Name${p.sort === "name" ? `, ${p.direction === "asc" ? "ascending" : "descending"}` : ""}`}
            aria-pressed={p.sort === "name"}
            aria-description={
              p.sort === "name"
                ? `Sorted ${p.direction === "asc" ? "ascending" : "descending"}`
                : "Not sorted by name"
            }
            onClick={() =>
              p.onSortChange("name", p.sort === "name" && p.direction === "asc" ? "desc" : "asc")
            }
          >
            Name {p.sort === "name" ? (p.direction === "asc" ? "↑" : "↓") : ""}
          </button>
        </span>
        <span>
          <button
            type="button"
            aria-label={`Sort by Modified${p.sort === "modifiedTime" ? `, ${p.direction === "asc" ? "oldest first" : "newest first"}` : ""}`}
            aria-pressed={p.sort === "modifiedTime"}
            aria-description={
              p.sort === "modifiedTime"
                ? `Sorted ${p.direction === "asc" ? "ascending" : "descending"}`
                : "Not sorted by modified date"
            }
            onClick={() =>
              p.onSortChange(
                "modifiedTime",
                p.sort === "modifiedTime" && p.direction === "asc" ? "desc" : "asc",
              )
            }
          >
            Modified {p.sort === "modifiedTime" ? (p.direction === "asc" ? "↑" : "↓") : ""}
          </button>
        </span>
      </div>
      <ul
        aria-label="Drive files"
        aria-busy={p.pending}
        className={p.layout === "grid" ? "mt-2 grid grid-cols-2 gap-2" : ""}
      >
        {p.files.map((file) => {
          const folder = file.mimeType === DRIVE_FOLDER_MIME;
          const linked = folder && p.linkedFileIds.has(file.id);
          const row = (
            <>
              <button
                type="button"
                aria-label={`${folder ? "Open folder" : "Open file"} ${file.name}`}
                aria-pressed={p.selectedFileId === file.id}
                onClick={() => (folder ? p.onBrowse(file.id) : p.onOpen(file.id))}
                className="flex min-w-0 flex-1 self-stretch items-center gap-2.5 px-2 text-left focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className={linked || !folder ? "text-primary" : "text-muted-foreground"}>
                  {folder ? (
                    <FolderIcon aria-hidden="true" className="size-[15px] shrink-0" />
                  ) : (
                    <FileTextIcon aria-hidden="true" className="size-[18px] shrink-0" />
                  )}
                </span>
                <span className={`truncate text-3xs ${folder ? "font-semibold" : ""}`}>
                  {file.name}
                </span>
                {linked ? <span className="sr-only">Linked to project</span> : null}
              </button>
              <time
                dateTime={file.modifiedTime}
                className="shrink-0 text-3xs text-muted-foreground"
              >
                {date(file.modifiedTime)}
              </time>
            </>
          );
          return (
            <li
              key={file.id}
              data-drive-file-id={file.id}
              className={
                p.layout === "grid"
                  ? "group min-w-0 rounded-md border border-border p-3"
                  : "group min-w-0 border-b border-border/40"
              }
            >
              {p.renderItem ? (
                p.renderItem(
                  file,
                  <div
                    className={`flex min-w-0 flex-1 items-center ${p.layout === "list" ? "h-[42px] pointer-coarse:min-h-11" : "min-h-16 flex-wrap"}`}
                  >
                    {row}
                  </div>,
                )
              ) : (
                <div
                  className={`flex min-w-0 items-center ${p.layout === "list" ? "h-[42px] pointer-coarse:min-h-11" : "min-h-16 flex-wrap"}`}
                >
                  {row}
                  <button
                    aria-label={`Actions for ${file.name}`}
                    type="button"
                    className={`ml-2 flex size-5 items-center justify-center text-muted-foreground pointer-coarse:min-h-11 pointer-coarse:min-w-11 ${!folder ? "opacity-0 group-hover:opacity-100 focus:opacity-100 pointer-coarse:opacity-100" : ""}`}
                    onClick={() => p.onFileMenu(file.id)}
                  >
                    <MoreHorizontalIcon className="size-3" />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {p.pending ? (
        <p role="status" className="mt-3 text-xs text-muted-foreground">
          Loading files...
        </p>
      ) : null}
      {p.unavailableReason ? (
        <div className="mt-3 space-y-2">
          <p
            role={p.unavailableReason === "Loading project Drive folder..." ? "status" : undefined}
            className="break-words text-xs text-muted-foreground"
          >
            {p.unavailableReason}
          </p>
          <Button size="sm" variant="outline" disabled={!p.canOperate} onClick={p.onOpenSettings}>
            Choose folder
          </Button>
          {!p.canOperate ? (
            <p className="text-xs text-muted-foreground">
              You need operate permission to change the project Drive folder.
            </p>
          ) : null}
        </div>
      ) : null}
      {p.error ? (
        <p role="alert" className="mt-3 break-words text-xs text-destructive">
          {p.error}
        </p>
      ) : null}
      {!p.pending && !p.error && !p.unavailableReason && !p.files.length ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {hasFilters ? "No files match these filters." : "This folder is empty."}
        </p>
      ) : null}
      {p.incomplete ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Results may be incomplete. Refresh or open Google Drive.
        </p>
      ) : null}
      {hasFilters || p.hasMore || p.error ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {hasFilters ? (
            <Button size="xs" variant="ghost" onClick={clear}>
              Clear filters
            </Button>
          ) : null}
          {p.hasMore ? (
            <Button size="sm" variant="outline" disabled={p.pending} onClick={p.onMore}>
              {p.pageLimitReached ? "Next page" : "Load more"}
            </Button>
          ) : null}
          {p.error ? (
            <Button size="sm" variant="outline" disabled={p.pending} onClick={p.onRefresh}>
              Retry files
            </Button>
          ) : null}
        </div>
      ) : null}
      <p className="mt-[19px] flex min-h-[22px] items-start leading-3 gap-1.5 text-3xs text-muted-foreground">
        <UsersRoundIcon aria-hidden="true" className="size-3 shrink-0" />
        {p.sharingText}
      </p>
      <div className="mt-1 flex justify-end">
        <button
          type="button"
          aria-label="Refresh files"
          className="text-3xs text-muted-foreground hover:underline pointer-coarse:min-h-11"
          disabled={p.pending || !!p.unavailableReason}
          onClick={p.onRefresh}
        >
          Refresh
        </button>
      </div>
      {p.picker ? (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            disabled={!p.selectedFileId || p.pending || !!p.unavailableReason}
            onClick={() => p.selectedFileId && p.picker?.onChoose(p.selectedFileId)}
          >
            Choose file
          </Button>
          <Button size="sm" variant="ghost" onClick={p.picker.onCancel}>
            Cancel picking
          </Button>
        </div>
      ) : null}
    </section>
  );
}
